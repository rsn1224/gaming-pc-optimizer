use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use super::profiles::{load_profiles, save_profiles, GameProfile};

// ── Config storage ────────────────────────────────────────────────────────────

fn config_path() -> PathBuf {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    PathBuf::from(appdata)
        .join("gaming-pc-optimizer")
        .join("config.json")
}

#[derive(Serialize, Deserialize, Default)]
struct AppConfig {
    #[serde(default)]
    ai_api_key: String,
}

fn load_config() -> AppConfig {
    let path = config_path();
    if !path.exists() {
        return AppConfig::default();
    }
    let raw = std::fs::read_to_string(&path).unwrap_or_default();
    serde_json::from_str(&raw).unwrap_or_default()
}

fn save_config(cfg: &AppConfig) -> Result<(), String> {
    let path = config_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_ai_api_key() -> String {
    load_config().ai_api_key
}

#[tauri::command]
pub fn set_ai_api_key(key: String) -> Result<(), String> {
    let mut cfg = load_config();
    cfg.ai_api_key = key;
    save_config(&cfg)
}

// ── Shared Claude API helper ──────────────────────────────────────────────────

async fn call_claude_api(
    api_key: &str,
    prompt: &str,
    max_tokens: u32,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}]
    });

    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("API リクエスト失敗: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("API エラー {}: {}", status, text));
    }

    let resp_json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("レスポンスパース失敗: {}", e))?;

    let content_text = resp_json["content"][0]["text"]
        .as_str()
        .ok_or("レスポンス形式が不正です")?
        .to_string();

    Ok(content_text)
}

fn extract_json_array(text: &str) -> &str {
    let text = text.trim();
    if let (Some(start), Some(end)) = (text.find('['), text.rfind(']')) {
        &text[start..=end]
    } else {
        text
    }
}

fn extract_json_object(text: &str) -> &str {
    let text = text.trim();
    if let (Some(start), Some(end)) = (text.find('{'), text.rfind('}')) {
        &text[start..=end]
    } else {
        text
    }
}

// ── Game profile AI recommendations ──────────────────────────────────────────

/// AI response item — only the fields Claude is asked to fill.
#[derive(Deserialize)]
struct AiUpdate {
    id: String,
    #[serde(default)]
    recommended_mode: Option<String>,
    #[serde(default)]
    recommended_reason: Option<String>,
    #[serde(default)]
    kill_bloatware: Option<bool>,
    #[serde(default)]
    power_plan: Option<String>,
    #[serde(default)]
    windows_preset: Option<String>,
    #[serde(default)]
    storage_mode: Option<String>,
    #[serde(default)]
    network_mode: Option<String>,
    #[serde(default)]
    dns_preset: Option<String>,
}

#[tauri::command]
pub async fn generate_ai_recommendations() -> Result<Vec<GameProfile>, String> {
    let api_key = load_config().ai_api_key;
    if api_key.is_empty() {
        return Err(
            "Anthropic API キーが設定されていません。設定ページで入力してください。".to_string(),
        );
    }

    let context = super::profiles::export_profiles_context()?;

    let profiles_snapshot = load_profiles();
    let draft_count = profiles_snapshot
        .iter()
        .filter(|p| {
            !p.kill_bloatware
                && p.power_plan == "none"
                && p.windows_preset == "none"
                && p.storage_mode == "none"
                && p.network_mode == "none"
                && p.dns_preset == "none"
        })
        .count();
    if draft_count == 0 {
        return Err(
            "ドラフトプロファイルがありません。設定未完了のプロファイルを先に追加してください。"
                .to_string(),
        );
    }

    let prompt = format!(
        r#"あなたはゲーミングPC最適化の専門家です。以下のJSONは対象PCとゲームプロファイルのスナップショットです。

{}

`is_draft: true` の全プロファイルについて最適化設定を提案してください。
JSONのみを返してください（説明・マークダウン不要）：

[
  {{
    "id": "既存のID（変更しない）",
    "recommended_mode": "competitive" | "balanced" | "quality",
    "recommended_reason": "50文字以内の日本語で推薦理由",
    "kill_bloatware": true または false,
    "power_plan": "none" | "ultimate" | "high_performance",
    "windows_preset": "none" | "gaming" | "default",
    "storage_mode": "none" | "light" | "deep",
    "network_mode": "none" | "gaming",
    "dns_preset": "none" | "google" | "cloudflare" | "opendns" | "dhcp"
  }}
]

ドラフトが0件なら [] を返してください。"#,
        context
    );

    let content_text = call_claude_api(&api_key, &prompt, 4096).await?;

    let json_str = extract_json_array(&content_text);
    let updates: Vec<AiUpdate> = serde_json::from_str(json_str)
        .map_err(|e| format!("AIレスポンスのJSON解析失敗: {}\n内容: {}", e, json_str))?;

    let mut profiles = load_profiles();
    for upd in &updates {
        if let Some(p) = profiles.iter_mut().find(|p| p.id == upd.id) {
            if let Some(v) = &upd.recommended_mode {
                p.recommended_mode = Some(v.clone());
            }
            if let Some(v) = &upd.recommended_reason {
                p.recommended_reason = Some(v.clone());
            }
            if let Some(v) = upd.kill_bloatware {
                p.kill_bloatware = v;
            }
            if let Some(v) = &upd.power_plan {
                p.power_plan = v.clone();
            }
            if let Some(v) = &upd.windows_preset {
                p.windows_preset = v.clone();
            }
            if let Some(v) = &upd.storage_mode {
                p.storage_mode = v.clone();
            }
            if let Some(v) = &upd.network_mode {
                p.network_mode = v.clone();
            }
            if let Some(v) = &upd.dns_preset {
                p.dns_preset = v.clone();
            }
        }
    }

    save_profiles(&profiles)?;
    Ok(profiles)
}

// ── Update priorities AI ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiUpdatePriority {
    pub id: String,
    pub priority: String, // "critical" | "recommended" | "optional" | "skip"
    pub reason: String,
}

#[tauri::command]
pub async fn get_ai_update_priorities() -> Result<Vec<AiUpdatePriority>, String> {
    let api_key = load_config().ai_api_key;
    if api_key.is_empty() {
        return Err("Anthropic API キーが設定されていません。".to_string());
    }

    let context = super::updates::export_updates_context().await?;

    let prompt = format!(
        r#"あなたはPC管理の専門家です。以下はWindowsマシンで利用可能なアプリアップデートとドライバー情報です。

{}

各アプリのアップデートに優先度を付けてください。JSONのみを返してください（説明不要）：

[
  {{
    "id": "winget package id（app_updatesのidフィールドと一致させること）",
    "priority": "critical" | "recommended" | "optional" | "skip",
    "reason": "30文字以内の日本語の理由"
  }}
]

優先度の基準：
- critical: セキュリティ修正・重大なバグ修正を含む
- recommended: パフォーマンス改善・安定性向上
- optional: マイナーアップデート・UI変更のみ
- skip: ゲーミング環境に不要・既知の問題あり・ゲームに悪影響の可能性"#,
        context
    );

    let content_text = call_claude_api(&api_key, &prompt, 2048).await?;
    let json_str = extract_json_array(&content_text);
    serde_json::from_str::<Vec<AiUpdatePriority>>(json_str)
        .map_err(|e| format!("AIレスポンスの解析失敗: {}", e))
}

// ── Hardware mode AI ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiHardwareMode {
    pub mode: String, // "performance" | "balanced" | "efficiency"
    pub reason: String,
    pub suggested_power_limit_percent: f32, // fraction of default (e.g. 1.0, 0.8, 0.65)
}

#[tauri::command]
pub async fn get_ai_hardware_mode() -> Result<AiHardwareMode, String> {
    let api_key = load_config().ai_api_key;
    if api_key.is_empty() {
        return Err("Anthropic API キーが設定されていません。".to_string());
    }

    // Gather GPU status (graceful if non-NVIDIA)
    let gpu_status = tokio::task::spawn_blocking(super::hardware::fetch_gpu_status_sync)
        .await
        .unwrap_or(Err("GPU情報なし".to_string()))
        .unwrap_or_default();

    let context = serde_json::json!({ "gpus": gpu_status });

    let prompt = format!(
        r#"あなたはゲーミングPC最適化の専門家です。以下はPCのGPUハードウェア状態です。

{}

現在の状態に最適なGPU動作モードを推奨してください。JSONのみを返してください（説明不要）：

{{
  "mode": "performance" | "balanced" | "efficiency",
  "reason": "50文字以内の日本語の理由",
  "suggested_power_limit_percent": 0.0から1.0の数値（デフォルト電力に対する割合、あくまで目安。アプリ側ではmodeに対応した固定比を使用します）
}}

モードの定義：
- performance: ゲーミング・高負荷作業向け（電力 1.0 = 制限なし）
- balanced: 日常使用向け（電力 0.8 = 20%削減）
- efficiency: 発熱抑制・省電力優先（電力 0.65 = 35%削減）

gpus配列に複数GPUが含まれる場合でも、推奨モードはGPU #0（インデックス0）を前提に決めてください。
GPUデータが無い場合は balanced を推奨してください。"#,
        serde_json::to_string_pretty(&context).unwrap_or_default()
    );

    let content_text = call_claude_api(&api_key, &prompt, 512).await?;
    let json_str = extract_json_object(&content_text);
    serde_json::from_str::<AiHardwareMode>(json_str)
        .map_err(|e| format!("AIレスポンスの解析失敗: {}", e))
}

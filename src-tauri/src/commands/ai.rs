use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use super::profiles::{load_profiles, save_profiles, GameProfile};

// ── V2: ImpactLevel ───────────────────────────────────────────────────────────
//
// 全 AI Recommendation に共通の影響度フィールド。
// #[serde(default)] で既存レスポンスとの後方互換を維持する。

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum ImpactLevel {
    Low,
    #[default]
    Medium,
    High,
    Critical,
}

// ── Keyring constants ─────────────────────────────────────────────────────────

const KEYRING_SERVICE: &str = "gaming-pc-optimizer";
const KEYRING_USER: &str = "anthropic_api_key";

fn keyring_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| format!("認証情報マネージャーへのアクセスに失敗しました: {}", e))
}

// ── Legacy plaintext config (migration only) ──────────────────────────────────
// Used solely to read the old plaintext key and migrate it to the keyring.
// No new data is ever written to this struct.

fn legacy_config_path() -> PathBuf {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    PathBuf::from(appdata)
        .join("gaming-pc-optimizer")
        .join("config.json")
}

#[derive(Serialize, Deserialize, Default)]
struct LegacyConfig {
    #[serde(default)]
    ai_api_key: String,
}

/// Read-only: retrieve the old plaintext key from config.json if it exists.
fn read_legacy_key() -> Option<String> {
    let path = legacy_config_path();
    if !path.exists() {
        return None;
    }
    let raw = std::fs::read_to_string(&path).ok()?;
    let cfg: LegacyConfig = serde_json::from_str(&raw).ok()?;
    if cfg.ai_api_key.is_empty() {
        None
    } else {
        Some(cfg.ai_api_key)
    }
}

/// Erase the plaintext key from config.json after successful migration.
fn erase_legacy_key() {
    let path = legacy_config_path();
    if !path.exists() {
        return;
    }
    if let Ok(raw) = std::fs::read_to_string(&path) {
        if let Ok(mut val) = serde_json::from_str::<serde_json::Value>(&raw) {
            if let Some(obj) = val.as_object_mut() {
                obj.remove("ai_api_key");
                if let Ok(clean) = serde_json::to_string_pretty(&val) {
                    std::fs::write(&path, clean).ok();
                }
            }
        }
    }
}

// ── Public Tauri commands ─────────────────────────────────────────────────────

/// Retrieve the API key from Windows Credential Manager.
/// Falls back to legacy config.json once for automatic migration.
#[tauri::command]
pub fn get_ai_api_key() -> String {
    // 1. Primary: Windows Credential Manager
    if let Ok(entry) = keyring_entry() {
        match entry.get_password() {
            Ok(key) if !key.is_empty() => return key,
            _ => {}
        }
    }

    // 2. Migration: read old plaintext key, move it to keyring, clean up file
    if let Some(legacy_key) = read_legacy_key() {
        if let Ok(entry) = keyring_entry() {
            if entry.set_password(&legacy_key).is_ok() {
                erase_legacy_key();
            }
        }
        return legacy_key;
    }

    String::new()
}

/// Persist the API key in Windows Credential Manager.
/// Passing an empty string deletes the stored credential.
#[tauri::command]
pub fn set_ai_api_key(key: String) -> Result<(), String> {
    let entry = keyring_entry()?;

    if key.is_empty() {
        // Delete — ignore NoEntry error (idempotent)
        entry.delete_credential().ok();
    } else {
        entry
            .set_password(&key)
            .map_err(|e| format!("APIキーの保存に失敗しました: {}", e))?;
    }

    // Clean up any legacy plaintext key that might still be on disk
    erase_legacy_key();

    Ok(())
}

/// Internal helper used by AI commands — returns Err with a user-friendly
/// Japanese message when the key is missing.
fn load_api_key() -> Result<String, String> {
    let key = get_ai_api_key();
    if key.is_empty() {
        Err("Anthropic API キーが設定されていません。設定ページで入力してください。".to_string())
    } else {
        Ok(key)
    }
}

// ── Shared Claude API helper ──────────────────────────────────────────────────

async fn call_claude_api(api_key: &str, prompt: &str, max_tokens: u32) -> Result<String, String> {
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
    recommended_confidence: Option<u8>,
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
    let api_key = load_api_key()?;

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
    "recommended_confidence": 0〜100の整数（100=確信、0=推測。プロファイル情報が少ない場合は低めに設定）,
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
            if let Some(v) = upd.recommended_confidence {
                p.recommended_confidence = Some(v);
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
    /// AI confidence 0–100
    #[serde(default)]
    pub confidence: u8,
    /// 影響度 (V2)
    #[serde(default)]
    pub impact: ImpactLevel,
}

#[tauri::command]
pub async fn get_ai_update_priorities() -> Result<Vec<AiUpdatePriority>, String> {
    let api_key = load_api_key()?;

    let context = super::updates::export_updates_context().await?;

    let prompt = format!(
        r#"あなたはPC管理の専門家です。以下はWindowsマシンで利用可能なアプリアップデートとドライバー情報です。

{}

各アプリのアップデートに優先度を付けてください。JSONのみを返してください（説明不要）：

[
  {{
    "id": "winget package id（app_updatesのidフィールドと一致させること）",
    "priority": "critical" | "recommended" | "optional" | "skip",
    "reason": "30文字以内の日本語の理由",
    "confidence": 0〜100の整数（100=確信。アプリの性質が不明な場合は低めに設定）,
    "impact": "low" | "medium" | "high" | "critical"
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

// ── Windows settings AI ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiWindowsRecommendation {
    pub preset_id: String, // "default" | "gaming" | "balanced"
    pub explanation: String,
    #[serde(default)]
    pub confidence: u8,
    /// 影響度 (V2)
    #[serde(default)]
    pub impact: ImpactLevel,
}

#[tauri::command]
pub async fn get_ai_windows_recommendation() -> Result<AiWindowsRecommendation, String> {
    let api_key = load_api_key()?;

    let context =
        tokio::task::spawn_blocking(super::windows_settings::export_windows_settings_context)
            .await
            .map_err(|e| format!("コンテキスト取得エラー: {}", e))??;

    let prompt = format!(
        r#"あなたはゲーミングPC最適化の専門家です。以下のJSONはWindowsPCの視覚効果・Game DVR・メニュー遅延等の現在設定と利用可能なプリセット一覧です。

{}

オンラインゲームのパフォーマンスを最大化するために最適なプリセットを1つ選んでください。
JSONのみを返してください（説明・マークダウン不要）：

{{
  "preset_id": "default" | "gaming" | "balanced",
  "impact": "low" | "medium" | "high" | "critical",
  "explanation": "なぜこのプリセットを選んだかの理由（日本語・1〜2文）",
  "confidence": 0〜100の整数（100=確信。現在設定が明確であれば高く、情報が不十分なら低めに）
}}"#,
        context
    );

    let content_text = call_claude_api(&api_key, &prompt, 256).await?;
    let json_str = extract_json_object(&content_text);
    serde_json::from_str::<AiWindowsRecommendation>(json_str)
        .map_err(|e| format!("AIレスポンスの解析失敗: {}", e))
}

// ── Storage AI ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiStorageItem {
    pub id: String,
    pub recommend: bool,
    pub reason: String,
}

#[tauri::command]
pub async fn get_ai_storage_recommendation() -> Result<Vec<AiStorageItem>, String> {
    let api_key = load_api_key()?;

    let categories = tokio::task::spawn_blocking(super::storage::scan_storage)
        .await
        .map_err(|e| format!("スキャンエラー: {}", e))?;

    if categories.is_empty() {
        return Ok(vec![]);
    }

    let context = serde_json::to_string_pretty(&categories)
        .map_err(|e| format!("シリアライズ失敗: {}", e))?;

    let prompt = format!(
        r#"あなたはPCストレージ最適化の専門家です。以下はWindowsPCの一時ファイル・キャッシュカテゴリとサイズです。

{}

ゲーミングPC向けに、安全に削除できるカテゴリを選定してください。
JSONのみを返してください（説明不要）：

[
  {{
    "id": "カテゴリID（変更しない）",
    "recommend": true または false,
    "reason": "20文字以内の日本語の理由"
  }}
]

基準：
- accessible が false または size_mb が 0 のものは recommend: false
- ブラウザキャッシュ・一時ファイル・サムネイルキャッシュは recommend: true
- ゲームやシステムに必要なデータは recommend: false"#,
        context
    );

    let content_text = call_claude_api(&api_key, &prompt, 1024).await?;
    let json_str = extract_json_array(&content_text);
    serde_json::from_str::<Vec<AiStorageItem>>(json_str)
        .map_err(|e| format!("AIレスポンスの解析失敗: {}", e))
}

// ── Network recommendation AI ─────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiNetworkRecommendation {
    pub adapter_name: String,
    pub dns_preset: String, // "google" | "cloudflare" | "opendns" | "current"
    pub explanation: String,
    pub apply_network_gaming: bool,
    #[serde(default)]
    pub confidence: u8,
    /// 影響度 (V2)
    #[serde(default)]
    pub impact: ImpactLevel,
}

#[tauri::command]
pub async fn get_ai_network_recommendation(
    adapter_name: String,
) -> Result<AiNetworkRecommendation, String> {
    let api_key = load_api_key()?;

    // export_network_advisor_context runs ping (blocking I/O) — use spawn_blocking
    let context = tokio::task::spawn_blocking({
        let name = adapter_name.clone();
        move || super::network::export_network_advisor_context(name)
    })
    .await
    .map_err(|e| format!("コンテキスト取得エラー: {}", e))??;

    let prompt = format!(
        r#"あなたはオンラインゲームに詳しいネットワークエンジニアです。
以下のJSONはこのPCのネットワーク設定と、主要DNSに対するPingテスト結果です。

{}

オンラインゲーム（FPS等）のプレイ時に最もレイテンシが低く安定するDNSプリセットとネットワーク設定を1つ提案してください。

考慮点:
- 平均レイテンシ（avg_ms）、ジッター（max_ms - min_ms）、パケットロス（packet_loss）を考慮する
- packet_loss が 0 でないDNSは避ける
- apply_network_gaming を true にするとNetworkThrottlingIndex等のレジストリを最適値に変更する（管理者権限が必要）

JSONのみを返してください（説明・マークダウン不要）：

{{
  "adapter_name": "<上記JSONのadapter.nameをそのまま使用>",
  "dns_preset": "google" | "cloudflare" | "opendns" | "current",
  "apply_network_gaming": true または false,
  "explanation": "なぜこのDNSと設定を選んだかの理由（日本語・2〜3文）",
  "confidence": 0〜100の整数（100=確信。Pingデータが揃っていれば高く、データ不足なら低めに）
}}"#,
        context
    );

    let content_text = call_claude_api(&api_key, &prompt, 512).await?;
    let json_str = extract_json_object(&content_text);
    serde_json::from_str::<AiNetworkRecommendation>(json_str)
        .map_err(|e| format!("AIレスポンスの解析失敗: {}", e))
}

// ── Hardware mode AI ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiHardwareMode {
    pub mode: String, // "performance" | "balanced" | "efficiency"
    pub reason: String,
    pub suggested_power_limit_percent: f32, // fraction of default (e.g. 1.0, 0.8, 0.65)
    #[serde(default)]
    pub confidence: u8,
    /// 影響度 (V2)
    #[serde(default)]
    pub impact: ImpactLevel,
}

#[tauri::command]
pub async fn get_ai_hardware_mode() -> Result<AiHardwareMode, String> {
    let api_key = load_api_key()?;

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
  "suggested_power_limit_percent": 0.0から1.0の数値（デフォルト電力に対する割合、あくまで目安。アプリ側ではmodeに対応した固定比を使用します）,
  "confidence": 0〜100の整数（100=確信。GPU情報が揃っていれば高く、GPUデータがない場合は低めに）,
  "impact": "low" | "medium" | "high" | "critical"
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

// ── Game Settings Advisor ─────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct GameSettingItem {
    pub category: String,
    pub recommended: String,
    pub reason: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GameSettingsAdvice {
    pub game_name: String,
    /// "最高" | "高" | "中" | "低"
    pub overall_preset: String,
    /// "144+" | "60+" | "30以上"
    pub target_fps: String,
    pub settings: Vec<GameSettingItem>,
    pub notes: String,
    pub confidence: u8,
}

#[tauri::command]
pub async fn get_game_settings_advice(game_name: String) -> Result<GameSettingsAdvice, String> {
    let api_key = load_api_key()?;

    // Gather system specs
    let (gpu_name, vram_mb) = {
        let gpus = super::system_info::get_gpu_info();
        let first = gpus.into_iter().next();
        (
            first
                .as_ref()
                .map(|g| g.name.clone())
                .unwrap_or_else(|| "不明".to_string()),
            first.map(|g| g.vram_total_mb as u64).unwrap_or(0),
        )
    };
    let (cpu_name, cpu_cores, ram_gb) = tokio::task::spawn_blocking(|| {
        use sysinfo::{CpuRefreshKind, MemoryRefreshKind, RefreshKind, System};
        let mut sys = System::new_with_specifics(
            RefreshKind::nothing()
                .with_cpu(CpuRefreshKind::nothing())
                .with_memory(MemoryRefreshKind::everything()),
        );
        sys.refresh_cpu_list(CpuRefreshKind::nothing());
        sys.refresh_memory();
        let cpu = sys
            .cpus()
            .first()
            .map(|c| c.brand().to_string())
            .unwrap_or_else(|| "不明".to_string());
        let cores = sys.cpus().len();
        let ram = sys.total_memory() / 1024 / 1024 / 1024;
        (cpu, cores, ram)
    })
    .await
    .map_err(|e| e.to_string())?;

    let prompt = format!(
        r#"あなたはPCゲームの最適化専門家です。以下のシステムスペックに基づいて「{game}」の推奨グラフィック設定をJSONのみで回答してください（マークダウン・説明文不要）。

システムスペック:
- GPU: {gpu} (VRAM: {vram} MB)
- CPU: {cpu} ({cores} コア)
- RAM: {ram} GB

以下の形式で回答してください:
{{
  "game_name": "{game}",
  "overall_preset": "最高" または "高" または "中" または "低",
  "target_fps": "144+" または "60+" または "30以上",
  "settings": [
    {{ "category": "解像度", "recommended": "1920x1080", "reason": "..." }},
    {{ "category": "グラフィックプリセット", "recommended": "高", "reason": "..." }},
    {{ "category": "シャドウ品質", "recommended": "中", "reason": "..." }},
    {{ "category": "アンチエイリアス", "recommended": "TAA", "reason": "..." }},
    {{ "category": "テクスチャ品質", "recommended": "高", "reason": "..." }},
    {{ "category": "レンダースケール", "recommended": "100%", "reason": "..." }},
    {{ "category": "垂直同期", "recommended": "オフ", "reason": "..." }}
  ],
  "notes": "全体的な注意点や追加アドバイス（100文字以内）",
  "confidence": 75
}}"#,
        game = game_name,
        gpu = gpu_name,
        vram = vram_mb,
        cpu = cpu_name,
        cores = cpu_cores,
        ram = ram_gb,
    );

    let content_text = call_claude_api(&api_key, &prompt, 1024).await?;
    let json_str = extract_json_object(&content_text);
    let advice: GameSettingsAdvice = serde_json::from_str(json_str)
        .map_err(|e| format!("AIレスポンスの解析失敗: {}\n内容: {}", e, json_str))?;

    Ok(advice)
}

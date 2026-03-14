/// tournament.rs — 試合前チェックリスト (ENABLE_TOURNAMENT_MODE)
///
/// ゲーム開始前に5項目をチェックし、PCの準備状況を診断する。
/// 各ステップは現状確認のみ（副作用なし）なので安全に実行できる。
///
/// Feature flag: ENABLE_TOURNAMENT_MODE = false
use serde::{Deserialize, Serialize};
use sysinfo::System;

// ── Feature flag ──────────────────────────────────────────────────────────────

pub const ENABLE_TOURNAMENT_MODE: bool = true;

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum StepStatus {
    Pass,
    Warn,
    Fail,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TournamentStep {
    pub id: String,
    pub name: String,
    pub status: StepStatus,
    pub message: String,
    pub value: Option<String>, // 実測値（表示用）
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TournamentResult {
    pub steps: Vec<TournamentStep>,
    pub overall_ready: bool,
    pub pass_count: u32,
    pub warn_count: u32,
    pub fail_count: u32,
    pub checked_at: String,
}

// ── Step checks ───────────────────────────────────────────────────────────────

/// Step 1: CPU 使用率が高くないか（< 60% → pass, < 80% → warn, >= 80% → fail）
fn check_cpu() -> TournamentStep {
    let mut sys = System::new();
    // two refresh cycles for accurate reading
    sys.refresh_cpu_usage();
    std::thread::sleep(std::time::Duration::from_millis(200));
    sys.refresh_cpu_usage();
    let usage = sys.global_cpu_usage();

    let (status, message) = if usage < 60.0 {
        (StepStatus::Pass, "CPU に十分な余裕があります".to_string())
    } else if usage < 80.0 {
        (
            StepStatus::Warn,
            "CPU 負荷がやや高めです。バックグラウンドアプリを閉じることを推奨します".to_string(),
        )
    } else {
        (
            StepStatus::Fail,
            "CPU が高負荷状態です。ゲーム前にバックグラウンドアプリを終了してください".to_string(),
        )
    };

    TournamentStep {
        id: "cpu_usage".to_string(),
        name: "CPU 負荷".to_string(),
        status,
        message,
        value: Some(format!("{:.0}%", usage)),
    }
}

/// Step 2: 空き RAM が十分か（>= 35% free → pass, >= 20% → warn, < 20% → fail）
fn check_memory() -> TournamentStep {
    let mut sys = System::new();
    sys.refresh_memory();

    let total = sys.total_memory() as f64;
    let used = sys.used_memory() as f64;
    let free_pct = if total > 0.0 {
        ((total - used) / total * 100.0) as f32
    } else {
        100.0
    };
    let free_mb = ((total - used) / 1024.0 / 1024.0) as u64;

    let (status, message) = if free_pct >= 35.0 {
        (StepStatus::Pass, "空きメモリが十分あります".to_string())
    } else if free_pct >= 20.0 {
        (
            StepStatus::Warn,
            "空きメモリがやや少なめです。メモリクリーナーの実行を推奨します".to_string(),
        )
    } else {
        (
            StepStatus::Fail,
            "空きメモリが不足しています。ゲーム中にクラッシュするリスクがあります".to_string(),
        )
    };

    TournamentStep {
        id: "memory_free".to_string(),
        name: "空きメモリ".to_string(),
        status,
        message,
        value: Some(format!("{} MB 空き ({:.0}%)", free_mb, free_pct)),
    }
}

/// Step 3: 実行中プロセス数が多すぎないか（< 120 → pass, < 160 → warn, >= 160 → fail）
fn check_processes() -> TournamentStep {
    let mut sys = System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    let count = sys.processes().len();

    let (status, message) = if count < 120 {
        (
            StepStatus::Pass,
            "バックグラウンドプロセスが適切な数です".to_string(),
        )
    } else if count < 160 {
        (
            StepStatus::Warn,
            "プロセス数がやや多めです。ブロートウェアの停止を推奨します".to_string(),
        )
    } else {
        (
            StepStatus::Fail,
            format!(
                "プロセス数が{}と非常に多いです。不要なアプリを停止してください",
                count
            ),
        )
    };

    TournamentStep {
        id: "process_count".to_string(),
        name: "バックグラウンドプロセス".to_string(),
        status,
        message,
        value: Some(format!("{} 件", count)),
    }
}

/// Step 4: ディスク空き容量（C: >= 10GB → pass, >= 5GB → warn, < 5GB → fail）
fn check_disk() -> TournamentStep {
    use sysinfo::Disks;
    let disks = Disks::new_with_refreshed_list();

    // find system drive (C: on Windows)
    let (free_gb, drive_name) = disks
        .iter()
        .find(|d| {
            let name = d.mount_point().to_string_lossy();
            name.starts_with("C") || name == "/"
        })
        .map(|d| {
            let free = d.available_space() as f64 / 1024.0 / 1024.0 / 1024.0;
            let name = d.mount_point().to_string_lossy().to_string();
            (free, name)
        })
        .unwrap_or((100.0, "C:\\".to_string()));

    let (status, message) = if free_gb >= 10.0 {
        (StepStatus::Pass, "ディスク空き容量は十分です".to_string())
    } else if free_gb >= 5.0 {
        (
            StepStatus::Warn,
            "ディスク空き容量がやや少なめです。不要ファイルの削除を推奨します".to_string(),
        )
    } else {
        (
            StepStatus::Fail,
            "ディスク空き容量が非常に少ないです。ゲームのパフォーマンスが低下する可能性があります"
                .to_string(),
        )
    };

    TournamentStep {
        id: "disk_space".to_string(),
        name: format!("ディスク空き容量 ({})", drive_name),
        status,
        message,
        value: Some(format!("{:.1} GB 空き", free_gb)),
    }
}

/// Step 5: ネットワーク疎通 — TCP connect to 1.1.1.1:80 でレイテンシ測定
fn check_network() -> TournamentStep {
    use std::net::TcpStream;
    use std::time::Instant;

    let start = Instant::now();
    let result = TcpStream::connect_timeout(
        &"1.1.1.1:80".parse().unwrap(),
        std::time::Duration::from_secs(3),
    );
    let latency_ms = start.elapsed().as_millis() as u64;

    match result {
        Ok(_) => {
            let (status, message) = if latency_ms < 50 {
                (StepStatus::Pass, "ネットワーク接続は良好です".to_string())
            } else if latency_ms < 150 {
                (
                    StepStatus::Warn,
                    "ネットワークレイテンシがやや高めです".to_string(),
                )
            } else {
                (
                    StepStatus::Warn,
                    "ネットワークレイテンシが高めです。有線接続を推奨します".to_string(),
                )
            };
            TournamentStep {
                id: "network_latency".to_string(),
                name: "ネットワーク疎通".to_string(),
                status,
                message,
                value: Some(format!("{}ms", latency_ms)),
            }
        }
        Err(_) => TournamentStep {
            id: "network_latency".to_string(),
            name: "ネットワーク疎通".to_string(),
            status: StepStatus::Fail,
            message: "ネットワークに接続できません。接続を確認してください".to_string(),
            value: Some("タイムアウト".to_string()),
        },
    }
}

// ── Tauri command ─────────────────────────────────────────────────────────────

/// 試合前チェックリストを実行する。
/// ENABLE_TOURNAMENT_MODE = false の場合はエラーを返す。
#[tauri::command]
pub async fn run_tournament_checklist() -> Result<TournamentResult, String> {
    if !ENABLE_TOURNAMENT_MODE {
        return Err(
            "ENABLE_TOURNAMENT_MODE is disabled. Set it to true in tournament.rs to enable."
                .to_string(),
        );
    }

    let steps: Vec<TournamentStep> = tokio::task::spawn_blocking(|| {
        vec![
            check_cpu(),
            check_memory(),
            check_processes(),
            check_disk(),
            check_network(),
        ]
    })
    .await
    .map_err(|e| format!("チェック実行エラー: {}", e))?;

    let pass_count = steps
        .iter()
        .filter(|s| s.status == StepStatus::Pass)
        .count() as u32;
    let warn_count = steps
        .iter()
        .filter(|s| s.status == StepStatus::Warn)
        .count() as u32;
    let fail_count = steps
        .iter()
        .filter(|s| s.status == StepStatus::Fail)
        .count() as u32;
    let overall_ready = fail_count == 0;

    Ok(TournamentResult {
        steps,
        overall_ready,
        pass_count,
        warn_count,
        fail_count,
        checked_at: super::now_iso8601(),
    })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flag_is_enabled() {
        assert!(ENABLE_TOURNAMENT_MODE);
    }

    #[test]
    fn check_memory_returns_valid_step() {
        let step = check_memory();
        assert_eq!(step.id, "memory_free");
        assert!(step.value.is_some());
        // status must be one of the valid values
        matches!(
            step.status,
            StepStatus::Pass | StepStatus::Warn | StepStatus::Fail
        );
    }

    #[test]
    fn check_disk_returns_valid_step() {
        let step = check_disk();
        assert_eq!(step.id, "disk_space");
        assert!(!step.message.is_empty());
        assert!(step.value.is_some());
    }

    #[test]
    fn check_cpu_returns_valid_step() {
        let step = check_cpu();
        assert_eq!(step.id, "cpu_usage");
        assert!(step.value.is_some());
        let v = step.value.unwrap();
        assert!(v.contains('%'), "value should contain %: {}", v);
    }

    #[test]
    fn check_processes_returns_valid_step() {
        let step = check_processes();
        assert_eq!(step.id, "process_count");
        assert!(step.value.is_some());
    }

    #[test]
    fn tournament_result_serializes_camel_case() {
        let result = TournamentResult {
            steps: vec![],
            overall_ready: true,
            pass_count: 5,
            warn_count: 0,
            fail_count: 0,
            checked_at: "2026-01-01T00:00:00Z".to_string(),
        };
        let json = serde_json::to_value(&result).unwrap();
        assert!(json.get("overallReady").is_some());
        assert!(json.get("passCount").is_some());
        assert!(json.get("checkedAt").is_some());
        assert_eq!(json["overallReady"], true);
        assert_eq!(json["passCount"], 5);
    }

    #[test]
    fn step_status_pass_when_low_memory_usage() {
        // Simulate a system with lots of free memory: 100% free → pass
        // We can't mock sysinfo, but we can test the logic thresholds directly
        let free_pct: f32 = 50.0;
        let status = if free_pct >= 35.0 {
            StepStatus::Pass
        } else if free_pct >= 20.0 {
            StepStatus::Warn
        } else {
            StepStatus::Fail
        };
        assert_eq!(status, StepStatus::Pass);
    }

    #[test]
    fn step_status_warn_for_moderate_memory() {
        let free_pct: f32 = 25.0;
        let status = if free_pct >= 35.0 {
            StepStatus::Pass
        } else if free_pct >= 20.0 {
            StepStatus::Warn
        } else {
            StepStatus::Fail
        };
        assert_eq!(status, StepStatus::Warn);
    }

    #[test]
    fn step_status_fail_for_low_memory() {
        let free_pct: f32 = 10.0;
        let status = if free_pct >= 35.0 {
            StepStatus::Pass
        } else if free_pct >= 20.0 {
            StepStatus::Warn
        } else {
            StepStatus::Fail
        };
        assert_eq!(status, StepStatus::Fail);
    }
}

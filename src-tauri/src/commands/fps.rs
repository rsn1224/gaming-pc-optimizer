use serde::{Deserialize, Serialize};
use sysinfo::{ProcessesToUpdate, System};

#[derive(Serialize, Deserialize, Clone)]
pub struct FpsEstimate {
    pub estimated_fps: u32,
    pub game_process: String,
    pub cpu_percent: f32,
    pub is_detecting: bool,
}

/// System processes to ignore when searching for a "game" process.
const SYSTEM_PROCS: &[&str] = &[
    "system",
    "registry",
    "smss.exe",
    "csrss.exe",
    "wininit.exe",
    "winlogon.exe",
    "services.exe",
    "lsass.exe",
    "svchost.exe",
    "dwm.exe",
    "fontdrvhost.exe",
    "sihost.exe",
    "taskhostw.exe",
    "explorer.exe",
    "searchindexer.exe",
    "spoolsv.exe",
    "msiexec.exe",
    "conhost.exe",
    "cmd.exe",
    "powershell.exe",
    "nvidia-smi.exe",
    "gaming-pc-optimizer.exe",
    "gaming_pc_optimizer.exe",
    "webviewhost.exe",
    "msedgewebview2.exe",
    "runtimebroker.exe",
    "textinputhost.exe",
    "ctfmon.exe",
    "audiodg.exe",
    "wuauclt.exe",
    "antimalware",
    "mssense.exe",
    "microsoftedge",
    "code.exe",
    "cargo.exe",
    "rustc.exe",
    "node.exe",
    "npm.cmd",
    "git.exe",
];

fn is_system_proc(name: &str) -> bool {
    let lower = name.to_lowercase();
    SYSTEM_PROCS.iter().any(|s| lower.contains(s))
}

/// Rough FPS heuristic from a process CPU percentage.
/// High CPU activity in a game typically correlates with rendering load.
fn estimate_fps_from_cpu(cpu_percent: f32) -> u32 {
    if cpu_percent <= 0.0 {
        return 0;
    }
    // Heuristic: games at 60fps tend to sit around 15-40% CPU per core.
    // We map 0–100% CPU to a rough FPS range of 0–165.
    let raw = (cpu_percent * 1.65).round() as u32;
    raw.clamp(1, 300)
}

#[tauri::command]
pub async fn get_fps_estimate() -> Result<FpsEstimate, String> {
    tokio::task::spawn_blocking(|| {
        let mut sys = System::new_all();
        sys.refresh_processes(ProcessesToUpdate::All, true);

        // Find the highest-CPU non-system process
        let top = sys
            .processes()
            .values()
            .filter(|p| !is_system_proc(&p.name().to_string_lossy()))
            .max_by(|a, b| {
                a.cpu_usage()
                    .partial_cmp(&b.cpu_usage())
                    .unwrap_or(std::cmp::Ordering::Equal)
            });

        match top {
            Some(proc) if proc.cpu_usage() > 0.5 => {
                let cpu = proc.cpu_usage();
                let fps = estimate_fps_from_cpu(cpu);
                Ok(FpsEstimate {
                    estimated_fps: fps,
                    game_process: proc.name().to_string_lossy().to_string(),
                    cpu_percent: cpu,
                    is_detecting: true,
                })
            }
            Some(proc) => Ok(FpsEstimate {
                estimated_fps: 0,
                game_process: proc.name().to_string_lossy().to_string(),
                cpu_percent: proc.cpu_usage(),
                is_detecting: false,
            }),
            None => Ok(FpsEstimate {
                estimated_fps: 0,
                game_process: String::new(),
                cpu_percent: 0.0,
                is_detecting: false,
            }),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

use serde::{Deserialize, Serialize};
use sysinfo::{ProcessesToUpdate, System};

#[derive(Serialize, Deserialize, Clone)]
pub struct ProcessAffinityInfo {
    pub pid: u32,
    pub name: String,
    pub affinity_mask: u64,
    pub cpu_count: u32,
    pub using_all_cores: bool,
}

// Windows API FFI
#[link(name = "kernel32")]
extern "system" {
    fn OpenProcess(dw_desired_access: u32, b_inherit_handle: i32, dw_process_id: u32) -> *mut std::ffi::c_void;
    fn SetProcessAffinityMask(h_process: *mut std::ffi::c_void, dw_process_affinity_mask: usize) -> i32;
    fn GetProcessAffinityMask(
        h_process: *mut std::ffi::c_void,
        lp_process_affinity_mask: *mut usize,
        lp_system_affinity_mask: *mut usize,
    ) -> i32;
    fn CloseHandle(h_object: *mut std::ffi::c_void) -> i32;
    fn GetActiveProcessorCount(group: u16) -> u32;
}

const ALL_PROCESSOR_GROUPS: u16 = 0xFFFF;
const PROCESS_QUERY_INFORMATION: u32 = 0x0400;
const PROCESS_SET_INFORMATION: u32 = 0x0200;

fn get_cpu_count() -> u32 {
    let count = unsafe { GetActiveProcessorCount(ALL_PROCESSOR_GROUPS) };
    if count == 0 { 1 } else { count }
}

fn get_affinity_mask_for_pid(pid: u32) -> Option<u64> {
    let handle = unsafe { OpenProcess(PROCESS_QUERY_INFORMATION, 0, pid) };
    if handle.is_null() {
        return None;
    }
    let mut process_mask: usize = 0;
    let mut system_mask: usize = 0;
    let result = unsafe {
        GetProcessAffinityMask(handle, &mut process_mask, &mut system_mask)
    };
    unsafe { CloseHandle(handle) };
    if result == 0 {
        None
    } else {
        Some(process_mask as u64)
    }
}

#[tauri::command]
pub fn get_process_affinities() -> Result<Vec<ProcessAffinityInfo>, String> {
    let mut sys = System::new_all();
    sys.refresh_processes(ProcessesToUpdate::All, true);

    let cpu_count = get_cpu_count();
    let all_cores_mask: u64 = if cpu_count >= 64 {
        u64::MAX
    } else {
        (1u64 << cpu_count) - 1
    };

    let mut processes: Vec<(u32, String, f32, u64)> = sys
        .processes()
        .iter()
        .filter(|(pid, _)| pid.as_u32() >= 100)
        .filter_map(|(pid, proc)| {
            let pid_u32 = pid.as_u32();
            let mask = get_affinity_mask_for_pid(pid_u32)?;
            Some((
                pid_u32,
                proc.name().to_string_lossy().to_string(),
                proc.cpu_usage(),
                mask,
            ))
        })
        .collect();

    // Sort by CPU usage descending, take top 20
    processes.sort_by(|a, b| b.2.partial_cmp(&a.2).unwrap_or(std::cmp::Ordering::Equal));
    processes.truncate(20);

    let result = processes
        .into_iter()
        .map(|(pid, name, _, affinity_mask)| {
            let using_all_cores = (affinity_mask & all_cores_mask) == all_cores_mask;
            ProcessAffinityInfo {
                pid,
                name,
                affinity_mask,
                cpu_count,
                using_all_cores,
            }
        })
        .collect();

    Ok(result)
}

#[tauri::command]
pub fn set_process_affinity(pid: u32, affinity_mask: u64) -> Result<(), String> {
    let handle = unsafe {
        OpenProcess(PROCESS_SET_INFORMATION | PROCESS_QUERY_INFORMATION, 0, pid)
    };
    if handle.is_null() {
        return Err(format!("プロセス {} を開けません（権限不足の可能性）", pid));
    }
    let result = unsafe { SetProcessAffinityMask(handle, affinity_mask as usize) };
    unsafe { CloseHandle(handle) };
    if result == 0 {
        Err(format!("CPUアフィニティの設定に失敗しました (PID: {})", pid))
    } else {
        Ok(())
    }
}

#[tauri::command]
pub fn reset_process_affinity(pid: u32) -> Result<(), String> {
    let cpu_count = get_cpu_count();
    let all_cores_mask: u64 = if cpu_count >= 64 {
        u64::MAX
    } else {
        (1u64 << cpu_count) - 1
    };
    set_process_affinity(pid, all_cores_mask)
}

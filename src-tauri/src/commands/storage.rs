use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StorageCategory {
    pub id: String,
    pub name: String,
    pub description: String,
    pub size_mb: f64,
    pub file_count: u64,
    pub path: String,
    pub accessible: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CleanResult {
    pub freed_mb: f64,
    pub cleaned_count: u64,
    pub error_count: u64,
}

// ── helpers ────────────────────────────────────────────────────────────────

fn env_path(var: &str) -> Option<PathBuf> {
    std::env::var(var).ok().map(PathBuf::from)
}

/// Recursively sum size + file count under `path`. Silently skips
/// entries that cannot be read (permission errors, locked files, etc.).
fn scan_dir(path: &Path) -> (u64, u64) {
    let mut bytes = 0u64;
    let mut count = 0u64;
    scan_recursive(path, &mut bytes, &mut count);
    (bytes, count)
}

fn scan_recursive(path: &Path, bytes: &mut u64, count: &mut u64) {
    let Ok(entries) = std::fs::read_dir(path) else {
        return;
    };
    for entry in entries.flatten() {
        let p = entry.path();
        if p.is_symlink() {
            continue;
        }
        if p.is_dir() {
            scan_recursive(&p, bytes, count);
        } else if p.is_file() {
            if let Ok(meta) = entry.metadata() {
                *bytes += meta.len();
                *count += 1;
            }
        }
    }
}

fn bytes_to_mb(b: u64) -> f64 {
    b as f64 / 1024.0 / 1024.0
}

/// Collect all Firefox `cache2` directories (one per profile).
fn find_firefox_cache_dirs(local_app: &Option<PathBuf>) -> Vec<PathBuf> {
    let Some(la) = local_app else {
        return vec![];
    };
    let profiles_dir = la.join("Mozilla\\Firefox\\Profiles");
    std::fs::read_dir(&profiles_dir)
        .ok()
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| e.path().is_dir())
        .map(|e| e.path().join("cache2"))
        .filter(|p| p.exists())
        .collect()
}

fn make_category_multi_path(
    id: &str,
    name: &str,
    description: &str,
    paths: Vec<PathBuf>,
) -> StorageCategory {
    if paths.is_empty() {
        return StorageCategory {
            id: id.to_string(),
            name: name.to_string(),
            description: description.to_string(),
            size_mb: 0.0,
            file_count: 0,
            path: String::new(),
            accessible: false,
        };
    }
    let (bytes, count) = paths.iter().fold((0u64, 0u64), |(b, c), p| {
        let (pb, pc) = scan_dir(p);
        (b + pb, c + pc)
    });
    StorageCategory {
        id: id.to_string(),
        name: name.to_string(),
        description: description.to_string(),
        size_mb: bytes_to_mb(bytes),
        file_count: count,
        // Store first path for reference; cleaning re-discovers all dirs
        path: paths[0].to_string_lossy().to_string(),
        accessible: true,
    }
}

fn make_category(
    id: &str,
    name: &str,
    description: &str,
    path: Option<PathBuf>,
) -> StorageCategory {
    match path {
        Some(p) if p.exists() => {
            let (bytes, count) = scan_dir(&p);
            StorageCategory {
                id: id.to_string(),
                name: name.to_string(),
                description: description.to_string(),
                size_mb: bytes_to_mb(bytes),
                file_count: count,
                path: p.to_string_lossy().to_string(),
                accessible: true,
            }
        }
        Some(p) => StorageCategory {
            id: id.to_string(),
            name: name.to_string(),
            description: description.to_string(),
            size_mb: 0.0,
            file_count: 0,
            path: p.to_string_lossy().to_string(),
            accessible: false,
        },
        None => StorageCategory {
            id: id.to_string(),
            name: name.to_string(),
            description: description.to_string(),
            size_mb: 0.0,
            file_count: 0,
            path: String::new(),
            accessible: false,
        },
    }
}

// ── commands ───────────────────────────────────────────────────────────────

#[tauri::command]
pub fn scan_storage() -> Vec<StorageCategory> {
    let local_app = env_path("LOCALAPPDATA");
    let temp = env_path("TEMP");

    vec![
        // User TEMP
        make_category(
            "user_temp",
            "ユーザー一時ファイル",
            "%TEMP% フォルダー内のキャッシュ・インストーラー残骸",
            temp,
        ),
        // Windows Temp
        make_category(
            "win_temp",
            "Windows 一時ファイル",
            "C:\\Windows\\Temp 内のシステム一時ファイル",
            Some(PathBuf::from(r"C:\Windows\Temp")),
        ),
        // Chrome cache
        make_category(
            "chrome_cache",
            "Chrome キャッシュ",
            "Google Chrome のウェブキャッシュ",
            local_app.as_ref().map(|p| {
                p.join("Google\\Chrome\\User Data\\Default\\Cache")
            }),
        ),
        // Edge cache
        make_category(
            "edge_cache",
            "Edge キャッシュ",
            "Microsoft Edge のウェブキャッシュ",
            local_app.as_ref().map(|p| {
                p.join("Microsoft\\Edge\\User Data\\Default\\Cache")
            }),
        ),
        // Windows Update download cache
        make_category(
            "windows_update",
            "Windows Update キャッシュ",
            "適用済みの Windows Update ダウンロードファイル",
            Some(PathBuf::from(r"C:\Windows\SoftwareDistribution\Download")),
        ),
        // Thumbnail cache
        make_category(
            "thumbnails",
            "サムネイルキャッシュ",
            "エクスプローラーのサムネイルデータベース",
            local_app.as_ref().map(|p| {
                p.join("Microsoft\\Windows\\Explorer")
            }),
        ),
        // NVIDIA DX shader cache
        make_category(
            "nvidia_dx_cache",
            "NVIDIA シェーダーキャッシュ (DX)",
            "NVIDIA DirectX シェーダーコンパイルキャッシュ",
            local_app.as_ref().map(|p| p.join("NVIDIA\\DXCache")),
        ),
        // NVIDIA GL cache
        make_category(
            "nvidia_gl_cache",
            "NVIDIA シェーダーキャッシュ (GL)",
            "NVIDIA OpenGL シェーダーキャッシュ",
            local_app.as_ref().map(|p| p.join("NVIDIA\\GLCache")),
        ),
        // AMD DX shader cache
        make_category(
            "amd_dx_cache",
            "AMD シェーダーキャッシュ",
            "AMD DirectX シェーダーコンパイルキャッシュ",
            local_app.as_ref().map(|p| p.join("AMD\\DxCache")),
        ),
        // DirectX shader cache (D3DSCache)
        make_category(
            "dx_shader_cache",
            "DirectX シェーダーキャッシュ",
            "DirectX コンパイル済みシェーダーキャッシュ",
            local_app.as_ref().map(|p| p.join("D3DSCache")),
        ),
        // Firefox cache (all profiles)
        make_category_multi_path(
            "firefox_cache",
            "Firefox キャッシュ",
            "Mozilla Firefox の全プロファイルウェブキャッシュ",
            find_firefox_cache_dirs(&local_app),
        ),
        // Windows Error Reporting
        make_category(
            "wer_reports",
            "Windows エラーレポート",
            "クラッシュレポートのキュー (WER\\ReportQueue)",
            local_app.as_ref().map(|p| p.join("Microsoft\\Windows\\WER\\ReportQueue")),
        ),
        // Windows Prefetch
        make_category(
            "prefetch",
            "Windows Prefetch",
            "プリフェッチファイル (C:\\Windows\\Prefetch)",
            Some(PathBuf::from(r"C:\Windows\Prefetch")),
        ),
    ]
}

/// Delete contents of a directory without removing the directory itself.
/// Returns (freed_bytes, error_count).
fn clean_dir_contents(path: &Path) -> (u64, u64) {
    let mut freed = 0u64;
    let mut errors = 0u64;
    let Ok(entries) = std::fs::read_dir(path) else {
        return (0, 1);
    };
    for entry in entries.flatten() {
        let p = entry.path();
        if p.is_symlink() || !p.exists() {
            continue;
        }
        if p.is_file() {
            // Capture size before deletion
            let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
            match std::fs::remove_file(&p) {
                Ok(_) => freed += size,
                Err(_) => errors += 1,
            }
        } else if p.is_dir() {
            // Try atomic removal first; fall back to recursive content wipe
            if std::fs::remove_dir_all(&p).is_err() {
                let (sub_freed, sub_err) = clean_dir_contents(&p);
                freed += sub_freed;
                errors += sub_err;
            }
        }
    }
    (freed, errors)
}

/// For thumbnail cache: only delete *.db files in the Explorer folder.
fn clean_thumbnail_dbs(path: &Path) -> (u64, u64) {
    let mut freed = 0u64;
    let mut errors = 0u64;
    let Ok(entries) = std::fs::read_dir(path) else {
        return (0, 1);
    };
    for entry in entries.flatten() {
        let p = entry.path();
        let is_db = p
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case("db"))
            .unwrap_or(false);
        if is_db {
            let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
            match std::fs::remove_file(&p) {
                Ok(_) => freed += size,
                Err(_) => errors += 1,
            }
        }
    }
    (freed, errors)
}

#[tauri::command]
pub fn clean_storage(ids: Vec<String>) -> CleanResult {
    // Rebuild the category list to get paths
    let categories = scan_storage();

    let mut total_freed = 0u64;
    let mut cleaned_count = 0u64;
    let mut error_count = 0u64;

    for cat in &categories {
        if !ids.contains(&cat.id) || !cat.accessible || cat.path.is_empty() {
            continue;
        }
        let path = PathBuf::from(&cat.path);
        if !path.exists() {
            continue;
        }

        let (freed, errs) = if cat.id == "thumbnails" {
            clean_thumbnail_dbs(&path)
        } else if cat.id == "firefox_cache" {
            // Re-discover all profile caches so we clean every profile, not just the first
            let local_app = env_path("LOCALAPPDATA");
            let cache_dirs = find_firefox_cache_dirs(&local_app);
            cache_dirs.iter().fold((0u64, 0u64), |(fb, fe), cp| {
                let (b, e) = clean_dir_contents(cp);
                (fb + b, fe + e)
            })
        } else {
            clean_dir_contents(&path)
        };

        total_freed += freed;
        error_count += errs;
        if freed > 0 {
            cleaned_count += 1;
        }
    }

    let result = CleanResult {
        freed_mb: bytes_to_mb(total_freed),
        cleaned_count,
        error_count,
    };
    super::log_observation(
        "clean_storage",
        serde_json::json!({
            "ids": ids,
            "freed_mb": result.freed_mb,
            "cleaned_count": result.cleaned_count,
            "error_count": result.error_count,
        }),
    );
    result
}

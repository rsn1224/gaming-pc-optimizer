use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct BenchmarkResult {
    pub cpu_score: u32,
    pub memory_score: u32,
    pub disk_score: u32,
    pub total_score: u32,
    pub cpu_ms: u64,
    pub memory_ms: u64,
    pub disk_ms: u64,
}

fn bench_cpu() -> (u32, u64) {
    // Count primes up to 80_000 using trial division
    let start = std::time::Instant::now();
    let mut count = 0u32;
    for n in 2u32..=80_000 {
        let is_prime = (2..=((n as f64).sqrt() as u32 + 1)).all(|d| n % d != 0);
        if is_prime {
            count += 1;
        }
    }
    // prevent optimizer from eliminating the loop
    let elapsed = start.elapsed().as_millis() as u64;
    let _ = count;
    // Reference: ~400 ms on typical PC → score 1000
    let score = ((400_000u64) / elapsed.max(1)).min(3000) as u32;
    (score, elapsed)
}

fn bench_memory() -> (u32, u64) {
    // Allocate 64 MB, fill with pattern, checksum
    let start = std::time::Instant::now();
    let size = 64 * 1024 * 1024usize;
    let mut v: Vec<u8> = vec![0u8; size];
    for (i, b) in v.iter_mut().enumerate() {
        *b = (i % 251) as u8;
    }
    let _sum: u64 = v.iter().map(|&b| b as u64).sum();
    let elapsed = start.elapsed().as_millis() as u64;
    // Reference: ~80 ms on typical PC → score 1000
    let score = ((80_000u64) / elapsed.max(1)).min(3000) as u32;
    (score, elapsed)
}

fn bench_disk() -> (u32, u64) {
    use std::io::Write;
    let path = std::env::temp_dir().join("gpo_bench.tmp");
    let data = vec![0xABu8; 10 * 1024 * 1024]; // 10 MB
    let start = std::time::Instant::now();
    if let Ok(mut f) = std::fs::File::create(&path) {
        f.write_all(&data).ok();
        f.sync_all().ok();
    }
    let _read = std::fs::read(&path);
    std::fs::remove_file(&path).ok();
    let elapsed = start.elapsed().as_millis() as u64;
    // Reference: ~300 ms on typical PC → score 1000
    let score = ((300_000u64) / elapsed.max(1)).min(3000) as u32;
    (score, elapsed)
}

#[tauri::command]
pub async fn run_benchmark() -> Result<BenchmarkResult, String> {
    tokio::task::spawn_blocking(|| {
        let (cpu_score, cpu_ms) = bench_cpu();
        let (memory_score, memory_ms) = bench_memory();
        let (disk_score, disk_ms) = bench_disk();
        // Weighted: CPU 40%, Memory 30%, Disk 30%
        let total_score = (cpu_score * 4 + memory_score * 3 + disk_score * 3) / 10;
        BenchmarkResult {
            cpu_score,
            memory_score,
            disk_score,
            total_score,
            cpu_ms,
            memory_ms,
            disk_ms,
        }
    })
    .await
    .map_err(|e| e.to_string())
}

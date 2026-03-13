// ── Process knowledge base types ──────────────────────────────────────────────

/**
 * safe_to_kill: ゲーム中に停止してもほぼ問題なし
 * caution:      使い方次第で停止を避けるべきケースあり
 * keep:         システム機能に関わる・停止非推奨
 */
export type ProcessRiskLevel = "safe_to_kill" | "caution" | "keep";

export interface ProcessAnnotation {
  exe_name: string;           // "OneDrive.exe" など（大文字小文字一致）
  display_name: string;       // 「OneDrive 同期クライアント」など人間向けの名称
  description: string;        // 何のアプリか / 何をしているかの説明（日本語）
  risk_level: ProcessRiskLevel;
  recommended_action: string; // 「ゲーム中は停止推奨」などの一言
}

/** ProcessInfo に知識ベース注釈を付与した拡張型 */
export interface AnnotatedProcess extends ProcessInfo {
  annotation?: ProcessAnnotation;
}

// ─────────────────────────────────────────────────────────────────────────────

export interface GpuInfo {
  name: string;
  driver_version: string;
  vram_total_mb: number;
  vram_used_mb: number;
}

export interface SystemInfo {
  cpu_usage: number;
  cpu_name: string;
  cpu_cores: number;
  memory_total_mb: number;
  memory_used_mb: number;
  memory_percent: number;
  os_name: string;
  os_version: string;
}

export interface ProcessInfo {
  pid: number;
  name: string;
  memory_mb: number;
  cpu_percent: number;
}

export interface KillResult {
  killed: string[];
  skipped: string[];
  freed_memory_mb: number;
}

export type OptimizationStatus = "idle" | "running" | "success" | "error";

export interface WindowsPreset {
  id: string;           // "default" | "gaming" | user-defined id
  label: string;        // UI表示名（「標準」「ゲーミング」「Apex用」など）
  description: string;  // 自然言語での意図（ユーザー記述 or AI整形）
  settings: WindowsSettings;
  explanation?: string; // 適用時に表示する差分解説（AIが生成、任意）
}

export interface WindowsSettings {
  visual_fx: number;       // 0=auto, 1=best appearance, 2=best performance, 3=custom
  transparency: boolean;
  game_dvr: boolean;
  menu_show_delay: number; // ms (0–400)
  animate_windows: boolean;
}

export interface StorageCategory {
  id: string;
  name: string;
  description: string;
  size_mb: number;
  file_count: number;
  path: string;
  accessible: boolean;
}

export interface CleanResult {
  freed_mb: number;
  cleaned_count: number;
  error_count: number;
}

export interface NetworkSettings {
  throttling_disabled: boolean;
  system_responsiveness: number; // 0=best, 20=default
  nagle_disabled: boolean;
}

export interface AdapterInfo {
  name: string;
  primary_dns: string;
  secondary_dns: string;
}

export interface PingResult {
  host: string;
  times_ms: number[];
  avg_ms: number;
  min_ms: number;
  max_ms: number;
  packet_loss: number;
  success: boolean;
}

export type DnsPreset = "google" | "cloudflare" | "opendns" | "dhcp";

export interface DnsPingSummary {
  preset: string; // "google" | "cloudflare" | "opendns" | "current"
  primary: string;
  secondary: string | null;
  ping: PingResult;
}

export interface NetworkRecommendation {
  adapter_name: string;
  dns_preset: DnsPreset | "current";
  explanation: string;
  apply_network_gaming: boolean;
}

export interface DiscoveredGame {
  app_id: string;
  name: string;
  install_dir: string;
  exe_path: string | null;
}

export interface GameProfile {
  id: string;
  name: string;
  exe_path: string;
  tags: string[];
  kill_bloatware: boolean;
  power_plan: "none" | "ultimate" | "high_performance";
  windows_preset: "none" | "gaming" | "default";
  storage_mode: "none" | "light" | "deep";
  network_mode: "none" | "gaming";
  dns_preset: "none" | "google" | "cloudflare" | "opendns" | "dhcp";
  // Phase 8: AI-set metadata (optional — missing in old profiles.json)
  // NOTE: future game_id?: string goes here when 1-game:N-profiles is needed
  recommended_mode?: "competitive" | "balanced" | "quality";
  recommended_reason?: string;
  launcher?: string; // "steam" | "epic" | "battlenet" | "custom"
}

export interface AppUpdate {
  id: string;
  name: string;
  current_version: string;
  available_version: string;
  source: string;
}

export interface AiUpdatePriority {
  id: string;
  priority: "critical" | "recommended" | "optional" | "skip";
  reason: string;
}

export interface DriverInfo {
  device_name: string;
  provider: string;
  driver_version: string;
  driver_date: string;
  device_class: string;
}

export interface GpuStatus {
  name: string;
  vram_total_mb: number;
  vram_used_mb: number;
  temperature_c: number;
  power_draw_w: number;
  power_limit_w: number;
  power_limit_default_w: number;
  fan_speed_percent: number;
  utilization_percent: number;
  driver_version: string;
}

export interface AiHardwareMode {
  mode: "performance" | "balanced" | "efficiency";
  reason: string;
  suggested_power_limit_percent: number;
}

export interface AiWindowsRecommendation {
  preset_id: string; // "default" | "gaming" | "balanced"
  explanation: string;
}

export interface AiStorageItem {
  id: string;
  recommend: boolean;
  reason: string;
}

export type ActivePage = "dashboard" | "gamemode" | "windows" | "storage" | "network" | "profiles" | "games" | "settings" | "updates" | "hardware";

// export_profiles_context response shape
export interface ProfilesContextProfile {
  id: string;
  name: string;
  exe_path: string;
  tags: string[];
  is_draft: boolean;
  settings: {
    kill_bloatware: boolean;
    power_plan: string;
    windows_preset: string;
    storage_mode: string;
    network_mode: string;
    dns_preset: string;
  };
}

export interface ProfilesContext {
  schema_version: string;
  generated_at: string;
  available_options: {
    power_plan: string[];
    windows_preset: string[];
    storage_mode: string[];
    network_mode: string[];
    dns_preset: string[];
  };
  system: {
    cpu_name: string;
    cpu_cores: number;
    memory_total_mb: number;
    os_name: string;
    os_version: string;
  };
  gpu: { name: string; vram_total_mb: number }[];
  profiles: ProfilesContextProfile[];
}

// ── All-in-one optimizer ────────────────────────────────────────────────────

export interface AllOptimizationResult {
  process_killed: number;
  process_freed_mb: number;
  power_plan_set: boolean;
  windows_applied: boolean;
  network_applied: boolean;
  errors: string[];
}

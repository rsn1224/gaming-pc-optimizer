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
  exe_path: string;
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
  confidence: number; // 0–100
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
  recommended_confidence?: number; // 0–100
  launcher?: string; // "steam" | "epic" | "battlenet" | "custom"
  steam_app_id?: string;
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
  confidence: number; // 0–100
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

export interface MotherboardInfo {
  manufacturer: string;
  product: string;
  serial_number: string;
  version: string;
}

export interface CpuDetailedInfo {
  name: string;
  manufacturer: string;
  socket: string;
  max_clock_mhz: number;
  cores: number;
  logical_processors: number;
  l2_cache_kb: number;
  l3_cache_kb: number;
  architecture: string;
}

export interface AiHardwareMode {
  mode: "performance" | "balanced" | "efficiency";
  reason: string;
  suggested_power_limit_percent: number;
  confidence: number; // 0–100
}

export interface AiWindowsRecommendation {
  preset_id: string; // "default" | "gaming" | "balanced"
  explanation: string;
  confidence: number; // 0–100
}

export interface AiStorageItem {
  id: string;
  recommend: boolean;
  reason: string;
}

export type ActivePage =
  // ── [Phase C/D] 新規ページ（ENABLE_HOME_HUB flag で有効化） ──────────────
  | "home"          // HomeHub（Dashboard + DashboardV2 統合、司令塔）
  | "optimize"      // OptimizeHub（GameMode 改称）
  // ── 既存ページ（後方互換維持） ─────────────────────────────────────────────
  | "dashboard" | "dashboardv2" | "gamemode"
  | "presets" | "process" | "windows" | "storage" | "network"
  | "games" | "profiles" | "gamelog" | "advisor" | "gameintegrity"
  | "hardware" | "benchmark"
  | "startup" | "scheduler" | "uninstaller" | "updates" | "rollback"
  | "notifications" | "settings";

/**
 * ActionStatus — UI アクション状態の統一型
 *
 * NetworkDiagnosticsPanel, NetworkSettingsPanel, NetworkOptimizer,
 * WindowsSettings などで個別定義されていたものを共通化。
 */
export type ActionStatus = "idle" | "running" | "success" | "error";

export interface AppearanceSettings {
  accent_color: string;
  font_size: string;
  sidebar_compact: boolean;
  animations_enabled: boolean;
}

export interface ErrorEntry {
  id: string;
  timestamp: number;
  command: string;
  error_message: string;
  context: string;
}

export interface BandwidthSnapshot {
  timestamp: number;
  download_kbps: number;
  upload_kbps: number;
  total_received_mb: number;
  total_sent_mb: number;
  active_interface: string;
}

export interface FpsEstimate {
  estimated_fps: number;
  game_process: string;
  cpu_percent: number;
  is_detecting: boolean;
}

export interface DiskInfo {
  caption: string;
  status: string;
  media_type: string;
  size_gb: number;
  serial: string;
  health_score: number;
}

export interface DiskHealthReport {
  disks: DiskInfo[];
  smart_available: boolean;
  overall_health: string;
  recommendations: string[];
}

export interface ScheduleConfig {
  enabled: boolean;
  trigger: string;
  time: string;
  day_of_week: number;
  preset: string;
  run_as_admin: boolean;
}

export interface ScheduledTask {
  name: string;
  next_run: string;
  last_run: string;
  status: string;
  enabled: boolean;
}

export interface PowerPlanInfo {
  guid: string;
  name: string;
  is_active: boolean;
}

export interface StartupEntry {
  name: string;
  command: string;
  source: string;
  enabled: boolean;
}

export interface TempSnapshot {
  timestamp: number;
  gpu_temp_c: number;
  cpu_temp_c: number;
}

// ── Rollback Center (Phase 1) ────────────────────────────────────────────────

export type RiskLevel = "safe" | "caution" | "advanced";
export type SessionMode = "real" | "sim";
export type SessionStatus = "applied" | "restored" | "partial_restore" | "failed";

export interface ChangeRecord {
  category: string;
  target: string;
  before: unknown;
  after: unknown;
  risk_level: RiskLevel;
  applied: boolean;
}

export interface SystemSnapshot {
  power_plan_guid: string | null;
  windows_settings: unknown | null;
  network_settings: unknown | null;
  captured_at: string;
}

export interface SessionMetrics {
  process_count: number;
  memory_used_mb: number;
  memory_total_mb: number;
  memory_percent: number;
  captured_at: string;
}

export interface OptimizationSession {
  id: string;
  started_at: string;
  ended_at: string | null;
  profile_id: string | null;
  mode: SessionMode;
  status: SessionStatus;
  snapshot: SystemSnapshot;
  changes: ChangeRecord[];
  summary: unknown | null;
  metrics_before: SessionMetrics | null;
  metrics_after: SessionMetrics | null;
}

export interface PreviewChange {
  category: string;
  target: string;
  current_value: unknown;
  new_value: unknown;
  risk_level: RiskLevel;
  will_apply: boolean;
  description: string;
}

export interface SimulationResult {
  changes: PreviewChange[];
  safe_count: number;
  caution_count: number;
  advanced_count: number;
  session_id: string;
}

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

// ── Presets (Phase 3-2) ──────────────────────────────────────────────────────

export type PresetKind = "esports" | "streaming" | "quiet";

export interface PresetInfo {
  id: PresetKind;
  name: string;
  description: string;
  tags: string[];
  risk_level: RiskLevel;
  steps: string[];
}

export interface PresetResult {
  preset: string;
  process_killed: number;
  process_freed_mb: number;
  power_plan_set: boolean;
  windows_applied: boolean;
  network_applied: boolean;
  errors: string[];
}

// ── Session statistics ────────────────────────────────────────────────────────

export interface SessionStats {
  total_sessions: number;
  total_processes_killed: number;
  total_memory_freed_mb: number;
  best_memory_freed_mb: number;
  last_session_at: string | null;
}

// ── Optimization Score ────────────────────────────────────────────────────────

export interface OptimizationScore {
  /** Weighted overall score: process×30 + power×20 + windows×25 + network×25 */
  overall: number;
  /** 100 minus the fraction of known bloatware currently running */
  process: number;
  /** 100 if a high-performance power plan is active, else 0 */
  power: number;
  /** Sub-score based on game_dvr, visual_fx, transparency, menu delay */
  windows: number;
  /** Sub-score based on throttling, Nagle, system responsiveness */
  network: number;
  /** Number of bloatware processes currently running */
  bloatware_running: number;
}

// ── Score History ─────────────────────────────────────────────────────────────

export interface ScoreSnapshot {
  /** Unix epoch seconds */
  timestamp: number;
  overall: number;
  process: number;
  power: number;
  windows: number;
  network: number;
}

// ── Game Settings Advisor ─────────────────────────────────────────────────────

export interface GameSettingItem {
  category: string;
  recommended: string;
  reason: string;
}

export interface GameSettingsAdvice {
  game_name: string;
  /** "最高" | "高" | "中" | "低" */
  overall_preset: string;
  /** "144+" | "60+" | "30以上" */
  target_fps: string;
  settings: GameSettingItem[];
  notes: string;
  confidence: number;
}

// ── Event Log ──────────────────────────────────────────────────────────────────

export interface EventEntry {
  id: string;
  timestamp: number;
  event_type: string;
  title: string;
  detail: string;
  icon_kind: string;
}

// ── Benchmark ─────────────────────────────────────────────────────────────────

export interface BenchmarkResult {
  cpu_score: number;
  memory_score: number;
  disk_score: number;
  total_score: number;
  cpu_ms: number;
  memory_ms: number;
  disk_ms: number;
}

// ── Clipboard Optimizer ──────────────────────────────────────────────────────

export interface ClipboardStatus {
  has_content: boolean;
  content_type: string; // "text" | "image" | "files" | "empty" | "unknown"
  size_estimate_kb: number;
  temp_files_mb: number;
  temp_file_count: number;
}

export interface ClipboardCleanResult {
  clipboard_cleared: boolean;
  temp_freed_mb: number;
  files_removed: number;
}

// ── Game Performance Log ─────────────────────────────────────────────────────

export interface GameSession {
  id: string;
  game_name: string;
  profile_id: string;
  started_at: number;
  ended_at: number | null;
  duration_minutes: number | null;
  score_before: number | null;
  score_after: number | null;
  memory_freed_mb: number;
}

export interface GameStats {
  game_name: string;
  total_sessions: number;
  total_hours: number;
  avg_score: number;
  last_played: number;
}

// ── Memory Cleaner ────────────────────────────────────────────────────────────

export interface MemoryCleanResult {
  freed_mb: number;
  before_used_mb: number;
  after_used_mb: number;
  before_percent: number;
  after_percent: number;
  method: string;
}

// ── GPU Power Limit ───────────────────────────────────────────────────────────

export interface GpuPowerLimit {
  current_w: number;
  default_w: number;
  min_w: number;
  max_w: number;
}

// ── Hotkey Config ─────────────────────────────────────────────────────────────

export interface HotkeyConfig {
  toggle_game_mode: string;
  open_app: string;
  quick_clean: string;
  toggle_overlay: string;
}

// ── Registry Optimizer ───────────────────────────────────────────────────────

export interface RegTweak {
  id: string;
  name: string;
  description: string;
  category: string;
  risk_level: RiskLevel;
  current_value: string;
  recommended_value: string;
  is_applied: boolean;
  hive: string;
  key_path: string;
  value_name: string;
  value_type: string;
  value_data: string;
}

export interface RegTweakResult {
  applied: string[];
  failed: string[];
}

// ── CPU Affinity ─────────────────────────────────────────────────────────────

export interface ProcessAffinityInfo {
  pid: number;
  name: string;
  affinity_mask: number;
  cpu_count: number;
  using_all_cores: boolean;
}

// ── App Uninstaller ──────────────────────────────────────────────────────────

export interface InstalledApp {
  display_name: string;
  publisher: string;
  install_date: string;
  display_version: string;
  install_location: string;
  size_mb: number;
  uninstall_string: string;
  quiet_uninstall: string;
  registry_key: string;
  is_system: boolean;
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

// ── Update Check ─────────────────────────────────────────────────────────────

export interface UpdateInfo {
  current_version: string;
  latest_version: string;
  release_url: string;
  release_notes: string;
  has_update: boolean;
  checked_at: number;
}

// ── V2: Optimization Graph ────────────────────────────────────────────────────

export type OptimizationCategory =
  | "process"
  | "power"
  | "windows"
  | "network"
  | "storage"
  | "registry";

export interface OptimizationNode {
  id: string;
  name: string;
  description: string;
  category: OptimizationCategory;
  /** 推定スコア改善量 (0–100 相対値) */
  estimated_impact: number;
  requires_admin: boolean;
  reversible: boolean;
}

export type EdgeType = "requires" | "conflicts" | "suggests";

export interface OptimizationEdge {
  from: string;
  to: string;
  edge_type: EdgeType;
}

export interface OptimizationGraph {
  nodes: OptimizationNode[];
  edges: OptimizationEdge[];
}

export interface ConflictInfo {
  node_a: string;
  node_b: string;
  reason: string;
}

export interface ApplyPlan {
  /** 依存解決済みの適用順 */
  order: string[];
  /** 競合のため除外されたペア */
  conflicts: ConflictInfo[];
  /** SUGGESTS で追加推奨されたノード */
  suggestions: string[];
}

// ── V2: Policy Engine ─────────────────────────────────────────────────────────

export type TriggerKind =
  | "on_game_start"
  | "on_schedule"
  | "on_score_below"
  | "on_manual";

export interface PolicyTrigger {
  kind: TriggerKind;
  /** on_score_below: 閾値 (0–100) */
  threshold?: number;
  /** on_schedule: cron 式 */
  cron?: string;
}

export type PolicyActionKind =
  | "apply_preset"
  | "kill_bloatware"
  | "set_power_plan"
  | "apply_graph_nodes";

export interface PolicyAction {
  kind: PolicyActionKind;
  /** apply_preset の preset_id, set_power_plan の plan name など */
  params: Record<string, string>;
}

export interface Policy {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  trigger: PolicyTrigger;
  action: PolicyAction;
  last_fired_at: string | null;
  fire_count: number;
}

// ── V2: Safety Kernel ─────────────────────────────────────────────────────────

/** Safety Kernel が遷移するフェーズ */
export type SafeApplyPhase =
  | "idle"
  | "prechecking"
  | "applying"
  | "verifying"
  | "done"
  | "rolled_back";

export interface PreCheckResult {
  passed: boolean;
  blockers: string[];
  warnings: string[];
  on_battery: boolean;
  is_admin: boolean;
  free_disk_mb: number;
}

export interface VerifyResult {
  passed: boolean;
  score_after: number;
  score_delta: number;
  confirmed_changes: string[];
  unconfirmed_changes: string[];
  recommend_rollback: boolean;
}

// ── V2: Audit Log ─────────────────────────────────────────────────────────────

export type AuditActor = "user" | "policy_engine" | "safety_kernel" | "watcher";

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actor: AuditActor;
  /** 実行したアクションの識別子 */
  action: string;
  /** "success" | "failure" | "skipped" */
  result: string;
  detail: Record<string, unknown>;
  session_id: string | null;
}

// ── V2: Telemetry ─────────────────────────────────────────────────────────────

export type TelemetryPhase = "before" | "t1_30s" | "t2_5min";

export interface TelemetryRecord {
  id: number | null;
  session_id: string;
  phase: TelemetryPhase;
  timestamp: string;
  score_overall: number;
  score_process: number;
  score_power: number;
  score_windows: number;
  score_network: number;
  memory_used_mb: number;
  memory_percent: number;
  cpu_usage: number;
  process_count: number;
}

// ── Profile Share ─────────────────────────────────────────────────────────────

export interface SharedProfile {
  schema: string;
  exported_at: string;
  profile: GameProfile;
  system_hint: string;
}

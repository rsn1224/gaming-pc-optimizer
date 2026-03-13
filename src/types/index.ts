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
}

export type ActivePage = "dashboard" | "gamemode" | "windows" | "storage" | "network" | "profiles" | "settings";

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

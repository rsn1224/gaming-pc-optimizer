import { useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSystemStore } from "@/stores/useSystemStore";
import type { SystemInfo } from "@/types";

export function useSystemInfo(intervalMs = 3000) {
  const setSystemInfo = useSystemStore((s) => s.setSystemInfo);

  const fetchInfo = useCallback(async () => {
    try {
      const info = await invoke<SystemInfo>("get_system_info");
      setSystemInfo(info);
    } catch (e) {
      console.error("Failed to get system info:", e);
    }
  }, [setSystemInfo]);

  useEffect(() => {
    fetchInfo();
    const id = setInterval(fetchInfo, intervalMs);
    return () => clearInterval(id);
  }, [fetchInfo, intervalMs]);
}

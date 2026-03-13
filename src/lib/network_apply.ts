import { invoke } from "@tauri-apps/api/core";
import type { NetworkRecommendation, NetworkSettings, AdapterInfo } from "@/types";

/**
 * Apply a NetworkRecommendation returned by AI.
 * Optionally calls onUpdate with the refreshed state so the parent UI can sync.
 */
export async function applyNetworkRecommendation(
  rec: NetworkRecommendation,
  onUpdate?: (settings: NetworkSettings, adapters: AdapterInfo[]) => void,
): Promise<void> {
  if (rec.apply_network_gaming) {
    await invoke("apply_network_gaming");
  }

  if (rec.dns_preset !== "current") {
    await invoke("set_adapter_dns", {
      adapterName: rec.adapter_name,
      preset: rec.dns_preset,
    });
  }

  if (onUpdate) {
    const [settings, adapters] = await Promise.all([
      invoke<NetworkSettings>("get_network_settings"),
      invoke<AdapterInfo[]>("get_network_adapters"),
    ]);
    onUpdate(settings, adapters);
  }
}

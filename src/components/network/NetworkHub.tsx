import { useState } from "react";
import { TabBar } from "@/components/ui/TabBar";
import { NetworkOptimizer } from "@/components/optimization/NetworkOptimizer";
import { BandwidthMonitor } from "./BandwidthMonitor";
import { NetworkSettingsPanel } from "./NetworkSettingsPanel";
import { NetworkDiagnosticsPanel } from "./NetworkDiagnosticsPanel";

import { ENABLE_NETWORK_TAB_SPLIT } from "@/config/features";

// ── Tab definitions ───────────────────────────────────────────────────────────

const TABS_DEFAULT = [
  { id: "network",   label: "ネットワーク最適化" },
  { id: "bandwidth", label: "帯域モニター" },
];

const TABS_SPLIT = [
  { id: "settings",     label: "設定変更" },
  { id: "diagnostics",  label: "診断" },
  { id: "bandwidth",    label: "帯域モニター" },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function NetworkHub() {
  const tabs = ENABLE_NETWORK_TAB_SPLIT ? TABS_SPLIT : TABS_DEFAULT;
  const [tab, setTab] = useState(tabs[0].id);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <h1 className="text-lg font-semibold text-white">ネットワーク</h1>
      </div>
      <TabBar tabs={tabs} activeTab={tab} onChange={setTab} />
      <div className="flex-1 overflow-y-auto relative">
        {/* [NETWORK_TAB_SPLIT = false] — 従来の単一コンポーネント */}
        {!ENABLE_NETWORK_TAB_SPLIT && tab === "network"    && <NetworkOptimizer />}
        {!ENABLE_NETWORK_TAB_SPLIT && tab === "bandwidth"  && <BandwidthMonitor />}

        {/* [NETWORK_TAB_SPLIT = true] — 責務分離タブ */}
        {ENABLE_NETWORK_TAB_SPLIT  && tab === "settings"    && <NetworkSettingsPanel />}
        {ENABLE_NETWORK_TAB_SPLIT  && tab === "diagnostics" && <NetworkDiagnosticsPanel />}
        {ENABLE_NETWORK_TAB_SPLIT  && tab === "bandwidth"   && <BandwidthMonitor />}
      </div>
    </div>
  );
}

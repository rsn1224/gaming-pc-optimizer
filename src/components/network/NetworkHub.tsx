import { useState } from "react";
import { TabBar } from "@/components/ui/TabBar";
import { NetworkOptimizer } from "@/components/optimization/NetworkOptimizer";
import { BandwidthMonitor } from "./BandwidthMonitor";
import { NetworkSettingsPanel } from "./NetworkSettingsPanel";
import { NetworkDiagnosticsPanel } from "./NetworkDiagnosticsPanel";
import { Wifi } from "lucide-react";

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
      <div className="shrink-0 px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0">
          <Wifi size={15} className="text-orange-400" />
        </div>
        <div>
          <h1 className="text-[13px] font-bold uppercase tracking-[0.15em] text-white/85">ネットワーク</h1>
          <p className="text-[10px] text-white/35 uppercase tracking-wider">最適化 · 帯域モニター</p>
        </div>
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

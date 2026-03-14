import { useState } from "react";
import { TabBar } from "@/components/ui/TabBar";
import { NetworkOptimizer } from "@/components/optimization/NetworkOptimizer";
import { BandwidthMonitor } from "./BandwidthMonitor";

const TABS = [
  { id: "network", label: "ネットワーク最適化" },
  { id: "bandwidth", label: "帯域モニター" },
];

export function NetworkHub() {
  const [tab, setTab] = useState("network");
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <h1 className="text-lg font-semibold text-white">ネットワーク</h1>
      </div>
      <TabBar tabs={TABS} activeTab={tab} onChange={setTab} />
      <div className="flex-1 overflow-hidden relative">
        {tab === "network" && <NetworkOptimizer />}
        {tab === "bandwidth" && <BandwidthMonitor />}
      </div>
    </div>
  );
}

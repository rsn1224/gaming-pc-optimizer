import { useState } from "react";
import { TabBar } from "@/components/ui/TabBar";
import { WindowsSettings } from "./WindowsSettings";
import { RegistryOptimizer } from "./RegistryOptimizer";
import { RollbackEntryPoint } from "@/components/ui/RollbackEntryPoint";

const TABS = [
  { id: "windows", label: "Windows設定" },
  { id: "registry", label: "レジストリ最適化" },
];

export function WindowsOptimization() {
  const [tab, setTab] = useState("windows");
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <h1 className="text-lg font-semibold text-white">Windows最適化</h1>
        <RollbackEntryPoint compact />
      </div>
      <TabBar tabs={TABS} activeTab={tab} onChange={setTab} />
      <div className="flex-1 overflow-y-auto relative">
        {tab === "windows" && <WindowsSettings />}
        {tab === "registry" && <RegistryOptimizer />}
      </div>
    </div>
  );
}

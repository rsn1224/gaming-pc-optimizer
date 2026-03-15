import { useState } from "react";
import { TabBar } from "@/components/ui/TabBar";
import { WindowsSettings } from "./WindowsSettings";
import { RegistryOptimizer } from "./RegistryOptimizer";
import { RollbackEntryPoint } from "@/components/ui/RollbackEntryPoint";
import { Monitor } from "lucide-react";

const TABS = [
  { id: "windows", label: "Windows設定" },
  { id: "registry", label: "レジストリ最適化" },
];

export function WindowsOptimization() {
  const [tab, setTab] = useState("windows");
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0">
          <Monitor size={15} className="text-orange-400" />
        </div>
        <div className="flex-1">
          <h1 className="text-[13px] font-bold uppercase tracking-[0.15em] text-white/85">Windows最適化</h1>
          <p className="text-[10px] text-white/35 uppercase tracking-wider">システム設定 · レジストリ</p>
        </div>
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

import { useState } from "react";
import { TabBar } from "@/components/ui/TabBar";
import { ProcessAnalysis } from "./ProcessAnalysis";
import { MemoryCleaner } from "./MemoryCleaner";
import { CpuAffinity } from "./CpuAffinity";

const TABS = [
  { id: "process", label: "プロセス分析" },
  { id: "memorycleaner", label: "メモリクリーナー" },
  { id: "cpuaffinity", label: "CPUアフィニティ" },
];

export function ProcessManager() {
  const [tab, setTab] = useState("process");
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <h1 className="text-lg font-semibold text-white">プロセス管理</h1>
      </div>
      <TabBar tabs={TABS} activeTab={tab} onChange={setTab} />
      <div className="flex-1 overflow-y-auto relative">
        {tab === "process" && <ProcessAnalysis />}
        {tab === "memorycleaner" && <MemoryCleaner />}
        {tab === "cpuaffinity" && <CpuAffinity />}
      </div>
    </div>
  );
}

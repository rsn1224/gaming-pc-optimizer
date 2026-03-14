import { useState } from "react";
import { TabBar } from "@/components/ui/TabBar";
import { Hardware } from "./Hardware";
import { TempMonitor } from "./TempMonitor";
import { DiskHealth } from "./DiskHealth";
import { GpuSettings } from "./GpuSettings";
import { FpsMonitor } from "@/components/fps/FpsMonitor";

const TABS = [
  { id: "hardware", label: "概要" },
  { id: "tempmonitor", label: "温度モニター" },
  { id: "diskhealth", label: "ディスク健全性" },
  { id: "gpusettings", label: "GPU設定" },
  { id: "fps", label: "FPSモニター" },
];

export function HardwareHub() {
  const [tab, setTab] = useState("hardware");
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <h1 className="text-lg font-semibold text-white">ハードウェア</h1>
      </div>
      <TabBar tabs={TABS} activeTab={tab} onChange={setTab} />
      <div className="flex-1 overflow-hidden relative">
        {tab === "hardware" && <Hardware />}
        {tab === "tempmonitor" && <TempMonitor />}
        {tab === "diskhealth" && <DiskHealth />}
        {tab === "gpusettings" && <GpuSettings />}
        {tab === "fps" && <FpsMonitor />}
      </div>
    </div>
  );
}

import { useState } from "react";
import { TabBar } from "@/components/ui/TabBar";
import { StorageCleanup } from "./StorageCleanup";
import { ClipboardOptimizer } from "./ClipboardOptimizer";

const TABS = [
  { id: "storage", label: "ストレージクリーン" },
  { id: "clipboard", label: "クリップボード最適化" },
];

export function StorageManager() {
  const [tab, setTab] = useState("storage");
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <h1 className="text-lg font-semibold text-white">ストレージ</h1>
      </div>
      <TabBar tabs={TABS} activeTab={tab} onChange={setTab} />
      <div className="flex-1 overflow-hidden relative">
        {tab === "storage" && <StorageCleanup />}
        {tab === "clipboard" && <ClipboardOptimizer />}
      </div>
    </div>
  );
}

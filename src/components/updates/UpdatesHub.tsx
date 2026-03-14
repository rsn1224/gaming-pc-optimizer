import { useState } from "react";
import { TabBar } from "@/components/ui/TabBar";
import { Updates } from "./Updates";
import { UpdateChecker } from "@/components/settings/UpdateChecker";

const TABS = [
  { id: "updates", label: "ドライバー更新" },
  { id: "updatecheck", label: "アプリ更新確認" },
];

export function UpdatesHub() {
  const [tab, setTab] = useState("updates");
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <h1 className="text-lg font-semibold text-white">アップデート</h1>
      </div>
      <TabBar tabs={TABS} activeTab={tab} onChange={setTab} />
      <div className="flex-1 overflow-hidden relative">
        {tab === "updates" && <Updates />}
        {tab === "updatecheck" && <UpdateChecker />}
      </div>
    </div>
  );
}

import { useState } from "react";
import { TabBar } from "@/components/ui/TabBar";
import { Updates } from "./Updates";
import { UpdateChecker } from "@/components/settings/UpdateChecker";
import { Shield } from "lucide-react";

const TABS = [
  { id: "updates", label: "ドライバー更新" },
  { id: "updatecheck", label: "アプリ更新確認" },
];

export function UpdatesHub() {
  const [tab, setTab] = useState("updates");
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0">
          <Shield size={15} className="text-orange-400" />
        </div>
        <div>
          <h1 className="text-[13px] font-bold uppercase tracking-[0.15em] text-white/85">アップデート</h1>
          <p className="text-[10px] text-white/35 uppercase tracking-wider">ドライバー · アプリ</p>
        </div>
      </div>
      <TabBar tabs={TABS} activeTab={tab} onChange={setTab} />
      <div className="flex-1 overflow-y-auto relative">
        {tab === "updates" && <Updates />}
        {tab === "updatecheck" && <UpdateChecker />}
      </div>
    </div>
  );
}

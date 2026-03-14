import { useState } from "react";
import { TabBar } from "@/components/ui/TabBar";
import { Profiles } from "./Profiles";
import { ProfileShare } from "./ProfileShare";

const TABS = [
  { id: "profiles", label: "プロファイル管理" },
  { id: "profileshare", label: "共有・インポート" },
];

export function ProfilesHub() {
  const [tab, setTab] = useState("profiles");
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <h1 className="text-lg font-semibold text-white">プロファイル</h1>
      </div>
      <TabBar tabs={TABS} activeTab={tab} onChange={setTab} />
      <div className="flex-1 overflow-hidden relative">
        {tab === "profiles" && <Profiles />}
        {tab === "profileshare" && <ProfileShare />}
      </div>
    </div>
  );
}

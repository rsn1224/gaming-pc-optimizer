import { useState, useCallback } from "react";
import { Sparkles } from "lucide-react";
import { TabBar } from "@/components/ui/TabBar";
import { Profiles } from "./Profiles";
import { ProfileShare } from "./ProfileShare";
import { AiProfileGenerator } from "./AiProfileGenerator";
import type { GameProfile } from "@/types";

// S9-02: AI Profile Generator feature flag
const ENABLE_AI_PROFILE_GENERATOR = true;

const TABS = [
  { id: "profiles", label: "プロファイル管理" },
  { id: "profileshare", label: "共有・インポート" },
];

export function ProfilesHub() {
  const [tab, setTab] = useState("profiles");
  const [showAiGenerator, setShowAiGenerator] = useState(false);
  // Bump key to force Profiles to re-fetch after AI save
  const [profilesKey, setProfilesKey] = useState(0);

  const handleAiSaved = useCallback((_profile: GameProfile) => {
    setProfilesKey(k => k + 1);
  }, []);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <h1 className="text-lg font-semibold text-white">プロファイル</h1>
        {ENABLE_AI_PROFILE_GENERATOR && (
          <button
            type="button"
            onClick={() => setShowAiGenerator(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gradient-to-r from-violet-500/80 to-cyan-500/80 hover:from-violet-500 hover:to-cyan-500 text-white rounded-lg transition-all active:scale-[0.97]"
          >
            <Sparkles size={12} />
            AI で生成
          </button>
        )}
      </div>
      <TabBar tabs={TABS} activeTab={tab} onChange={setTab} />
      <div className="flex-1 overflow-hidden relative">
        {tab === "profiles" && <Profiles key={profilesKey} />}
        {tab === "profileshare" && <ProfileShare />}
      </div>

      {ENABLE_AI_PROFILE_GENERATOR && showAiGenerator && (
        <AiProfileGenerator
          onClose={() => setShowAiGenerator(false)}
          onSaved={handleAiSaved}
        />
      )}
    </div>
  );
}

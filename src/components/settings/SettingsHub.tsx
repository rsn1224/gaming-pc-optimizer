import { useState } from "react";
import { TabBar } from "@/components/ui/TabBar";
import { Settings as SettingsIcon } from "lucide-react";
import { Settings } from "./Settings";
import { ThemeSettings } from "./ThemeSettings";
import { HotkeySettings } from "./HotkeySettings";
import { OsdSettings } from "./OsdSettings";
import { BackupRestore } from "./BackupRestore";
import { PerformanceReport } from "./PerformanceReport";
import { CrashReport } from "./CrashReport";
import { AuditLogTab, ENABLE_AUDIT_LOG } from "./AuditLogTab";
import { AboutPage } from "@/components/about/AboutPage";

const BASE_TABS = [
  { id: "settings", label: "一般" },
  { id: "theme", label: "外観" },
  { id: "hotkeys", label: "ホットキー" },
  { id: "osd", label: "OSD" },
  { id: "backup", label: "バックアップ" },
  { id: "report", label: "レポート" },
  { id: "about", label: "About" },
];

const TABS = ENABLE_AUDIT_LOG
  ? [...BASE_TABS.slice(0, -1), { id: "audit", label: "監査ログ" }, BASE_TABS[BASE_TABS.length - 1]]
  : BASE_TABS;

export function SettingsHub() {
  const [tab, setTab] = useState("settings");
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0">
          <SettingsIcon size={15} className="text-orange-400" />
        </div>
        <div>
          <h1 className="text-[13px] font-bold uppercase tracking-[0.15em] text-white/85">設定</h1>
          <p className="text-[10px] text-white/35 uppercase tracking-wider">外観 · AI · ホットキー · OSD</p>
        </div>
      </div>
      <TabBar tabs={TABS} activeTab={tab} onChange={setTab} />
      <div className="flex-1 overflow-y-auto relative">
        {tab === "settings" && <Settings />}
        {tab === "theme" && <ThemeSettings />}
        {tab === "hotkeys" && <HotkeySettings />}
        {tab === "osd" && <OsdSettings />}
        {tab === "backup" && <BackupRestore />}
        {tab === "report" && (
          <div className="h-full overflow-y-auto">
            <PerformanceReport />
            <CrashReport />
          </div>
        )}
        {tab === "audit" && ENABLE_AUDIT_LOG && <AuditLogTab />}
        {tab === "about" && <AboutPage />}
      </div>
    </div>
  );
}

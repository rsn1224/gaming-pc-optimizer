import { useState } from "react";
import { TabBar } from "@/components/ui/TabBar";
import { Settings } from "./Settings";
import { ThemeSettings } from "./ThemeSettings";
import { HotkeySettings } from "./HotkeySettings";
import { OsdSettings } from "./OsdSettings";
import { BackupRestore } from "./BackupRestore";
import { PerformanceReport } from "./PerformanceReport";
import { CrashReport } from "./CrashReport";
import { AuditLogTab, ENABLE_AUDIT_LOG } from "./AuditLogTab";

const BASE_TABS = [
  { id: "settings", label: "一般" },
  { id: "theme", label: "外観" },
  { id: "hotkeys", label: "ホットキー" },
  { id: "osd", label: "OSD" },
  { id: "backup", label: "バックアップ" },
  { id: "report", label: "レポート" },
];

const TABS = ENABLE_AUDIT_LOG
  ? [...BASE_TABS, { id: "audit", label: "監査ログ" }]
  : BASE_TABS;

export function SettingsHub() {
  const [tab, setTab] = useState("settings");
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <h1 className="text-lg font-semibold text-white">設定</h1>
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
      </div>
    </div>
  );
}

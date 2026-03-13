import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { LayoutDashboard, Gamepad2, Monitor, HardDrive, Wifi, BookMarked, Library, Settings as SettingsIcon, Shield, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/useAppStore";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { GameMode } from "@/components/optimization/GameMode";
import { WindowsSettings } from "@/components/optimization/WindowsSettings";
import { StorageCleanup } from "@/components/optimization/StorageCleanup";
import { NetworkOptimizer } from "@/components/optimization/NetworkOptimizer";
import { Profiles } from "@/components/profiles/Profiles";
import { GamesLibrary } from "@/components/games/GamesLibrary";
import { Settings } from "@/components/settings/Settings";
import { Updates } from "@/components/updates/Updates";
import { Hardware } from "@/components/hardware/Hardware";
import type { ActivePage } from "@/types";

interface NavItem {
  id: ActivePage;
  icon: React.ReactNode;
  label: string;
  phase?: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", icon: <LayoutDashboard size={17} />, label: "ダッシュボード" },
  { id: "games",     icon: <Library size={17} />,         label: "My Games" },
  { id: "gamemode",  icon: <Gamepad2 size={17} />,        label: "ゲームモード" },
  { id: "windows",   icon: <Monitor size={17} />,         label: "Windows設定" },
  { id: "storage",   icon: <HardDrive size={17} />,       label: "ストレージ" },
  { id: "network",   icon: <Wifi size={17} />,            label: "ネットワーク" },
  { id: "profiles",  icon: <BookMarked size={17} />,      label: "プロファイル", phase: "詳細" },
  { id: "updates",   icon: <Shield size={17} />,          label: "アップデート" },
  { id: "hardware",  icon: <Cpu size={17} />,             label: "ハードウェア" },
  { id: "settings",  icon: <SettingsIcon size={17} />,    label: "設定" },
];

function PageContent({ page }: { page: ActivePage }) {
  switch (page) {
    case "dashboard":
      return <Dashboard />;
    case "gamemode":
      return <GameMode />;
    case "windows":
      return <WindowsSettings />;
    case "storage":
      return <StorageCleanup />;
    case "network":
      return <NetworkOptimizer />;
    case "profiles":
      return <Profiles />;
    case "games":
      return <GamesLibrary />;
    case "updates":
      return <Updates />;
    case "hardware":
      return <Hardware />;
    case "settings":
      return <Settings />;
  }
}

export default function App() {
  const {
    activePage,
    setActivePage,
    gameModeActive,
    activeProfileId,
    setActiveProfileId,
    setAutoOptimize,
  } = useAppStore();

  // Listen for Rust-side events (watcher applies/restores, tray toggle)
  useEffect(() => {
    const u1 = listen<string | null>("active_profile_changed", (e) =>
      setActiveProfileId(e.payload ?? null)
    );
    const u2 = listen<boolean>("auto_optimize_changed", (e) =>
      setAutoOptimize(e.payload)
    );
    return () => {
      u1.then((fn) => fn());
      u2.then((fn) => fn());
    };
  }, [setActiveProfileId, setAutoOptimize]);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 flex flex-col shrink-0 border-r border-white/[0.06] bg-sidebar sidebar-dots relative">
        {/* Top gradient accent line */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent" />

        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-[15px] relative">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500/30 to-emerald-500/15 border border-cyan-500/40 flex items-center justify-center shadow-[0_0_12px_rgba(34,211,238,0.2)]">
            <Gamepad2 size={16} className="text-cyan-400" />
          </div>
          <div>
            <p className="text-[13px] font-bold leading-none tracking-tight text-white">Gaming</p>
            <p className="text-[9px] text-cyan-400/60 leading-none mt-1 tracking-[0.15em] uppercase">PC Optimizer</p>
          </div>
        </div>

        {/* Gradient divider */}
        <div className="section-divider mx-3" />

        {/* Nav */}
        <nav className="flex-1 p-2 pt-2.5 flex flex-col gap-0.5 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = activePage === item.id;
            return (
              <button
                type="button"
                key={item.id}
                onClick={() => setActivePage(item.id)}
                className={cn(
                  "relative w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all text-left overflow-hidden",
                  isActive
                    ? "nav-active nav-active-bg text-cyan-200"
                    : "text-muted-foreground hover:text-slate-200 hover:bg-white/[0.04]"
                )}
              >
                <span className={cn(
                  "shrink-0 transition-colors",
                  isActive ? "text-cyan-400 drop-shadow-[0_0_6px_rgba(34,211,238,0.6)]" : "text-muted-foreground/70"
                )}>
                  {item.icon}
                </span>
                <span className="flex-1 truncate">{item.label}</span>
                {item.phase && !isActive && (
                  <span className="text-[9px] text-muted-foreground/40 bg-white/[0.04] border border-white/[0.06] px-1.5 py-0.5 rounded-md">
                    {item.phase}
                  </span>
                )}
                {item.id === "gamemode" && gameModeActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 shadow-[0_0_6px_rgba(34,197,94,0.8)]" />
                )}
                {item.id === "profiles" && activeProfileId && (
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0 shadow-[0_0_6px_rgba(34,211,238,0.8)]" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Gradient divider */}
        <div className="section-divider mx-3" />

        {/* Footer */}
        <div className="px-4 py-3.5">
          <div className="flex items-center gap-2">
            <div className="relative w-1.5 h-1.5">
              <span className="absolute inset-0 rounded-full bg-cyan-400 animate-ping opacity-60" />
              <span className="relative w-1.5 h-1.5 rounded-full bg-cyan-400 block" />
            </div>
            <p className="text-[10px] text-muted-foreground/50 tracking-widest uppercase">v1.0.0 · AI搭載</p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden content-glow relative">
        <PageContent page={activePage} />
      </main>
    </div>
  );
}

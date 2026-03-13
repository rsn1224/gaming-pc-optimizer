import { LayoutDashboard, Gamepad2, Monitor, HardDrive, Wifi, Settings as SettingsIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/useAppStore";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { GameMode } from "@/components/optimization/GameMode";
import { WindowsSettings } from "@/components/optimization/WindowsSettings";
import { StorageCleanup } from "@/components/optimization/StorageCleanup";
import { NetworkOptimizer } from "@/components/optimization/NetworkOptimizer";
import { Settings } from "@/components/settings/Settings";
import type { ActivePage } from "@/types";

interface NavItem {
  id: ActivePage;
  icon: React.ReactNode;
  label: string;
  phase?: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", icon: <LayoutDashboard size={18} />, label: "ダッシュボード" },
  { id: "gamemode", icon: <Gamepad2 size={18} />, label: "ゲームモード" },
  { id: "windows", icon: <Monitor size={18} />, label: "Windows設定" },
  { id: "storage", icon: <HardDrive size={18} />, label: "ストレージ" },
  { id: "network", icon: <Wifi size={18} />, label: "ネットワーク" },
  { id: "settings", icon: <SettingsIcon size={18} />, label: "設定" },
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
    case "settings":
      return <Settings />;
  }
}

export default function App() {
  const { activePage, setActivePage, gameModeActive } = useAppStore();

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 border-r border-border flex flex-col shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-border">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
            <Gamepad2 size={16} className="text-cyan-400" />
          </div>
          <div>
            <p className="text-sm font-bold leading-none">Gaming</p>
            <p className="text-[10px] text-muted-foreground leading-none mt-0.5">PC Optimizer</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2 flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActivePage(item.id)}
                className={cn(
                  "relative w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-all text-left",
                  isActive
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}
              >
                {item.icon}
                <span className="flex-1">{item.label}</span>
                {item.phase && !isActive && (
                  <span className="text-[9px] text-muted-foreground/60 bg-secondary px-1.5 py-0.5 rounded">
                    {item.phase}
                  </span>
                )}
                {item.id === "gamemode" && gameModeActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border">
          <p className="text-[10px] text-muted-foreground">v0.1.0 · Phase 1 MVP</p>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        <PageContent page={activePage} />
      </main>
    </div>
  );
}

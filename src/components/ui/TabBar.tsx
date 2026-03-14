import { cn } from "@/lib/utils";

interface Tab {
  id: string;
  label: string;
}

interface TabBarProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (id: string) => void;
}

export function TabBar({ tabs, activeTab, onChange }: TabBarProps) {
  return (
    <div className="flex gap-1 px-6 py-2 border-b border-white/[0.06] bg-background/50">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn(
            "px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all",
            activeTab === tab.id
              ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
              : "text-muted-foreground hover:text-slate-200 hover:bg-white/[0.04]"
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

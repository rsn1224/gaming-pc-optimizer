import { motion } from "framer-motion";
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
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              "relative px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors",
              isActive ? "text-orange-400" : "text-muted-foreground hover:text-white/75 hover:bg-white/[0.04]"
            )}
          >
            {isActive && (
              <motion.div
                layoutId="tabbar-active"
                className="absolute inset-0 rounded-lg bg-orange-500/[0.10] border border-orange-500/25"
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
              />
            )}
            <span className="relative z-10">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

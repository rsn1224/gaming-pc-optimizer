import { Search, X } from "lucide-react";

interface GameFiltersProps {
  search: string;
  onSearchChange: (v: string) => void;
  selectedTag: string | null;
  onTagChange: (t: string | null) => void;
  selectedMode: string | null;
  onModeChange: (m: string | null) => void;
  allTags: string[];
  hasAnyMode: boolean;
}

const MODE_LABELS: Record<string, string> = {
  competitive: "Competitive",
  balanced: "Balanced",
  quality: "Quality",
};

export function GameFilters({
  search,
  onSearchChange,
  selectedTag,
  onTagChange,
  selectedMode,
  onModeChange,
  allTags,
  hasAnyMode,
}: GameFiltersProps) {
  const hasFilter = search || selectedTag || selectedMode;

  return (
    <div className="flex flex-col gap-2">
      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          className="w-full bg-secondary border border-border rounded-md pl-8 pr-3 py-2 text-sm outline-none focus:border-primary/60 placeholder:text-muted-foreground"
          placeholder="ゲーム名で検索…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="検索をクリア"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Tag + Mode chips */}
      {(allTags.length > 0 || hasAnyMode) && (
        <div className="flex flex-wrap gap-1.5">
          {/* Tag filters */}
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => onTagChange(selectedTag === tag ? null : tag)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                selectedTag === tag
                  ? "bg-primary/20 text-primary border-primary/40"
                  : "bg-secondary border-border text-muted-foreground hover:text-foreground hover:border-primary/20"
              }`}
            >
              {tag}
            </button>
          ))}

          {/* Mode filters */}
          {Object.entries(MODE_LABELS).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => onModeChange(selectedMode === mode ? null : mode)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                selectedMode === mode
                  ? "bg-primary/20 text-primary border-primary/40"
                  : "bg-secondary border-border text-muted-foreground hover:text-foreground hover:border-primary/20"
              }`}
            >
              {label}
            </button>
          ))}

          {/* Clear all */}
          {hasFilter && (
            <button
              type="button"
              onClick={() => { onSearchChange(""); onTagChange(null); onModeChange(null); }}
              className="text-xs px-2.5 py-1 rounded-full border border-border text-muted-foreground hover:text-red-400 hover:border-red-400/30 transition-colors"
            >
              クリア
            </button>
          )}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "@/stores/useToastStore";
import { cn } from "@/lib/utils";
import { FileSearch, RefreshCw, CheckCircle2, ExternalLink, Search } from "lucide-react";

interface SteamGame {
  app_id: string;
  name: string;
  source: string;
}

interface VerifyStatus {
  [appId: string]: "idle" | "verifying" | "done";
}

export function GameIntegrity() {
  const [games, setGames] = useState<SteamGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState<VerifyStatus>({});
  const [search, setSearch] = useState("");
  const [scanned, setScanned] = useState(false);

  const loadGames = async () => {
    setLoading(true);
    try {
      const result = await invoke<SteamGame[]>("get_steam_games_for_verify");
      setGames(result);
      setScanned(true);
      if (result.length === 0) {
        toast.info("Steamゲームが見つかりませんでした");
      }
    } catch (e) {
      toast.error(`スキャン失敗: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGames();
  }, []);

  const handleVerify = async (game: SteamGame) => {
    setVerifyStatus((prev) => ({ ...prev, [game.app_id]: "verifying" }));
    try {
      await invoke("verify_game_files", {
        appId: game.app_id,
        gameName: game.name,
      });
      toast.success(`検証開始: ${game.name} のファイル検証をSteamで開始しました`);
      setVerifyStatus((prev) => ({ ...prev, [game.app_id]: "done" }));
    } catch (e) {
      toast.error(`検証失敗: ${String(e)}`);
      setVerifyStatus((prev) => ({ ...prev, [game.app_id]: "idle" }));
    }
  };

  const filtered = games.filter((g) =>
    g.name.toLowerCase().includes(search.toLowerCase()) ||
    g.app_id.includes(search)
  );

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <FileSearch size={18} className="text-cyan-400" />
          <h1 className="text-lg font-semibold text-white">ゲームファイル整合性チェック</h1>
          {scanned && (
            <span className="text-xs text-muted-foreground bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 rounded-md">
              {games.length} 件
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={loadGames}
          disabled={loading}
          title="再読み込み"
          className="p-2 rounded-lg text-muted-foreground hover:text-white hover:bg-white/[0.05] transition-all"
        >
          <RefreshCw size={15} className={cn(loading && "animate-spin")} />
        </button>
      </div>

      {/* Info banner */}
      <div className="mx-6 mt-4 px-4 py-2.5 bg-cyan-500/10 border border-cyan-500/20 rounded-xl text-cyan-300 text-xs">
        Steamが起動し、ファイル検証が開始されます。検証の進行状況はSteamクライアントで確認してください。
      </div>

      {/* Search */}
      <div className="px-6 pt-4">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ゲーム名 / App IDで検索..."
            className="w-full pl-9 pr-4 py-2 bg-white/[0.04] border border-white/[0.12] rounded-xl text-sm text-white placeholder:text-muted-foreground/60 focus:outline-none focus:border-cyan-500/40 transition-colors"
          />
        </div>
      </div>

      {/* Game list */}
      <div className="flex-1 overflow-y-auto p-6 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            Steamゲームをスキャン中...
          </div>
        ) : !scanned ? (
          <div className="flex flex-col items-center justify-center h-40 gap-4">
            <p className="text-muted-foreground text-sm">
              ボタンをクリックしてSteamゲームをスキャンします
            </p>
            <button
              type="button"
              onClick={loadGames}
              className="px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/30 rounded-xl text-cyan-300 text-sm font-medium transition-all"
            >
              スキャン開始
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            {search ? "検索結果がありません" : "Steamゲームが見つかりませんでした"}
          </div>
        ) : (
          filtered.map((game) => {
            const status = verifyStatus[game.app_id] ?? "idle";
            return (
              <div
                key={game.app_id}
                className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 flex items-center gap-4"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{game.name}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[11px] text-muted-foreground font-mono">
                      App ID: {game.app_id}
                    </span>
                    {game.source === "profile" && (
                      <span className="text-[10px] bg-cyan-500/15 text-cyan-400 border border-cyan-500/25 px-1.5 py-0.5 rounded">
                        プロファイル
                      </span>
                    )}
                    {game.source === "steam_acf" && (
                      <span className="text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 px-1.5 py-0.5 rounded">
                        Steam
                      </span>
                    )}
                  </div>
                </div>

                {status === "done" ? (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                    <CheckCircle2 size={14} />
                    <span>開始済み</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleVerify(game)}
                    disabled={status === "verifying"}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/30 rounded-xl text-cyan-300 text-xs font-medium transition-all disabled:opacity-50"
                  >
                    <ExternalLink size={12} />
                    {status === "verifying" ? "起動中..." : "ファイルを検証"}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

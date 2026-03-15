/**
 * GamesHub — Myゲーム + パフォーマンスログ + ファイル検証 統合ページ
 * 統合効果: ゲームごとの統計サマリー + 未検証ゲームの警告
 *           ライブラリ・ログ・検証を1ページで横断
 */
import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { TabBar } from "@/components/ui/TabBar";
import { GamesLibrary } from "./GamesLibrary";
import { GamePerformanceLog } from "./GamePerformanceLog";
import { GameIntegrity } from "./GameIntegrity";
import type { GameStats } from "@/types";
import { Library, FileSearch, Clock, TrendingUp, Gamepad2 } from "lucide-react";

const TABS = [
  { id: "library", label: "ライブラリ" },
  { id: "log", label: "パフォーマンスログ" },
  { id: "integrity", label: "ファイル検証" },
];

interface SteamGameBasic {
  app_id: number;
  name: string;
}

export function GamesHub() {
  const [tab, setTab] = useState("library");
  const [stats, setStats] = useState<GameStats[]>([]);
  const [steamGames, setSteamGames] = useState<SteamGameBasic[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [s, g] = await Promise.all([
      invoke<GameStats[]>("get_game_stats").catch(() => [] as GameStats[]),
      invoke<SteamGameBasic[]>("get_steam_games_for_verify").catch(() => [] as SteamGameBasic[]),
    ]);
    setStats(s as GameStats[]);
    setSteamGames(g as SteamGameBasic[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalHours = stats.reduce((acc, s) => acc + s.total_hours, 0);
  const avgScore = stats.length > 0
    ? Math.round(stats.reduce((acc, s) => acc + s.avg_score, 0) / stats.length)
    : 0;
  const topGame = [...stats].sort((a, b) => b.total_hours - a.total_hours)[0];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── FM26 Page Header ── */}
      <div className="shrink-0 px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0">
          <Gamepad2 size={15} className="text-orange-400" />
        </div>
        <div>
          <h1 className="text-[13px] font-bold uppercase tracking-[0.15em] text-white/85">Myゲーム</h1>
          <p className="text-[10px] text-white/35 uppercase tracking-wider">ライブラリ · ログ · ファイル検証</p>
        </div>
      </div>
      {/* ── Insight Panel ── */}
      {!loading && (stats.length > 0 || steamGames.length > 0) && (
        <div className="shrink-0 mx-4 mb-1 bg-[#141414] border border-white/[0.10] rounded-xl px-4 py-3 flex items-center gap-4 flex-wrap">
          {/* Library count */}
          <div className="flex items-center gap-2">
            <Library size={13} className="text-cyan-400" />
            <div>
              <p className="text-[10px] text-muted-foreground/50">ゲーム数</p>
              <p className="text-sm font-bold text-white">{steamGames.length}<span className="text-[10px] font-normal text-muted-foreground/50 ml-1">本</span></p>
            </div>
          </div>

          {stats.length > 0 && (
            <>
              <div className="w-px h-8 bg-white/[0.06]" />

              {/* Total play time */}
              <div className="flex items-center gap-2">
                <Clock size={13} className="text-violet-400" />
                <div>
                  <p className="text-[10px] text-muted-foreground/50">総プレイ時間</p>
                  <p className="text-sm font-bold text-white">{totalHours.toFixed(1)}<span className="text-[10px] font-normal text-muted-foreground/50 ml-1">時間</span></p>
                </div>
              </div>

              <div className="w-px h-8 bg-white/[0.06]" />

              {/* Avg score */}
              <div className="flex items-center gap-2">
                <TrendingUp size={13} className="text-emerald-400" />
                <div>
                  <p className="text-[10px] text-muted-foreground/50">平均スコア</p>
                  <p className="text-sm font-bold text-emerald-400">{avgScore}</p>
                </div>
              </div>

              {topGame && (
                <>
                  <div className="w-px h-8 bg-white/[0.06]" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-muted-foreground/50">最多プレイ</p>
                    <p className="text-xs font-medium text-white truncate">{topGame.game_name}</p>
                    <p className="text-[10px] text-muted-foreground/50">{topGame.total_sessions} セッション</p>
                  </div>
                </>
              )}
            </>
          )}

          {/* Verification CTA if steam games exist */}
          {steamGames.length > 0 && (
            <>
              <div className="w-px h-8 bg-white/[0.06]" />
              <button
                type="button"
                onClick={() => setTab("integrity")}
                className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-white/[0.04] border border-white/[0.08] text-muted-foreground hover:text-white hover:bg-white/[0.07] transition-colors"
              >
                <FileSearch size={11} />
                ファイル検証 ({steamGames.length})
              </button>
            </>
          )}
        </div>
      )}

      {/* Tabs */}
      <TabBar tabs={TABS} activeTab={tab} onChange={setTab} />
      <div className="flex-1 overflow-hidden">
        {tab === "library" && <GamesLibrary />}
        {tab === "log" && <GamePerformanceLog />}
        {tab === "integrity" && <GameIntegrity />}
      </div>
    </div>
  );
}

/**
 * NetworkDiagnosticsPanel — 診断専用パネル
 *
 * 責務: DNS 速度自動テスト / AI 推奨 / Ping テスト
 * 設定変更 (TCP/IP / DNS 切替) は NetworkSettingsPanel に分離。
 *
 * [NETWORK_TAB_SPLIT] ENABLE_NETWORK_TAB_SPLIT = true のときのみ NetworkHub から使用される。
 */

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Activity,
  Brain,
  CheckCircle2,
  Copy,
  Loader2,
  XCircle,
  Zap,
} from "lucide-react";
import { motion } from "framer-motion";
import type { ActionStatus, NetworkSettings, AdapterInfo, PingResult, DnsPingSummary, NetworkRecommendation } from "@/types";
import { ConfidenceBadge } from "@/components/ui/ConfidenceBadge";
import { StatusBanner } from "@/components/ui/StatusBanner";
import { applyNetworkRecommendation } from "@/lib/network_apply";

function PingBar({ ms, max }: { ms: number; max: number }) {
  const pct = max > 0 ? Math.min((ms / max) * 100, 100) : 0;
  const color = ms < 30 ? "bg-green-500" : ms < 80 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct.toFixed(1)}%` }} />
      </div>
      <span className={`text-xs font-mono w-14 text-right ${ms < 30 ? "text-green-400" : ms < 80 ? "text-yellow-400" : "text-red-400"}`}>
        {ms.toFixed(0)} ms
      </span>
    </div>
  );
}

// ── DNS Auto Test + AI ─────────────────────────────────────────────────────

const PRESET_LABEL: Record<string, string> = {
  google: "Google",
  cloudflare: "Cloudflare",
  opendns: "OpenDNS",
  current: "現在のDNS",
};

function DnsAutoTestSection({
  selectedAdapter,
  onNetworkUpdate,
}: {
  selectedAdapter: string;
  onNetworkUpdate: (settings: NetworkSettings, adapters: AdapterInfo[]) => void;
}) {
  const [results, setResults] = useState<DnsPingSummary[]>([]);
  const [isTesting, setIsTesting] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied">("idle");
  const [recJson, setRecJson] = useState("");
  const [parsedRec, setParsedRec] = useState<NetworkRecommendation | null>(null);
  const [parseError, setParseError] = useState("");
  const [applyStatus, setApplyStatus] = useState<ActionStatus>("idle");
  const [applyMsg, setApplyMsg] = useState("");
  const [bestApplyStatus, setBestApplyStatus] = useState<"idle" | "applying" | "done" | "error">("idle");

  const runTest = async () => {
    if (!selectedAdapter || isTesting) return;
    setIsTesting(true);
    setResults([]);
    try {
      const summaries = await invoke<DnsPingSummary[]>("auto_test_dns", { adapterName: selectedAdapter });
      setResults(summaries);
    } catch (e) {
      console.error(e);
    } finally {
      setIsTesting(false);
    }
  };

  const handleAiRecommend = async () => {
    if (!selectedAdapter || isAiLoading) return;
    setIsAiLoading(true);
    setParsedRec(null);
    setRecJson("");
    setParseError("");
    setApplyStatus("idle");
    setApplyMsg("");
    try {
      const rec = await invoke<NetworkRecommendation>("get_ai_network_recommendation", {
        adapterName: selectedAdapter,
      });
      setParsedRec(rec);
    } catch (e) {
      setParseError(String(e));
    } finally {
      setIsAiLoading(false);
    }
  };

  const copyContext = async () => {
    if (!selectedAdapter) return;
    try {
      const json = await invoke<string>("export_network_advisor_context", { adapterName: selectedAdapter });
      await navigator.clipboard.writeText(json);
      setCopyStatus("copied");
      setTimeout(() => setCopyStatus("idle"), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleJsonChange = (val: string) => {
    setRecJson(val);
    setParseError("");
    setParsedRec(null);
    if (!val.trim()) return;
    try {
      const parsed = JSON.parse(val);
      if (typeof parsed.adapter_name !== "string" || typeof parsed.dns_preset !== "string") {
        setParseError("フィールドが不正です（adapter_name と dns_preset が必須）");
        return;
      }
      setParsedRec(parsed as NetworkRecommendation);
    } catch {
      setParseError("JSON の解析に失敗しました");
    }
  };

  const applyRec = async () => {
    if (!parsedRec) return;
    setApplyStatus("running");
    setApplyMsg("");
    try {
      await applyNetworkRecommendation(parsedRec, onNetworkUpdate);
      setApplyStatus("success");
      setApplyMsg(
        `${parsedRec.dns_preset} DNS${parsedRec.apply_network_gaming ? " + TCP/IP 最適化" : ""} を適用しました`,
      );
    } catch (e) {
      setApplyStatus("error");
      setApplyMsg(String(e));
    }
  };

  const bestPreset =
    results.length > 0
      ? results
          .filter((r) => r.ping.success && r.ping.packet_loss === 0)
          .sort((a, b) => a.ping.avg_ms - b.ping.avg_ms)[0]?.preset ?? null
      : null;

  const applyBestDns = async () => {
    if (!bestPreset || !selectedAdapter || bestApplyStatus === "applying") return;
    setBestApplyStatus("applying");
    try {
      await invoke("set_adapter_dns", { adapterName: selectedAdapter, preset: bestPreset });
      const [settings, adapters] = await Promise.all([
        invoke<NetworkSettings>("get_network_settings"),
        invoke<AdapterInfo[]>("get_network_adapters"),
      ]);
      onNetworkUpdate(settings, adapters);
      setBestApplyStatus("done");
    } catch {
      setBestApplyStatus("error");
    }
  };

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain size={16} className="text-muted-foreground" />
          <span className="text-sm font-semibold">DNS 自動テスト &amp; AI推奨</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={runTest}
            disabled={!selectedAdapter || isTesting || isAiLoading}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-md transition-all
              ${isTesting ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300" : "bg-secondary border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground"}
              disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {isTesting ? <Loader2 size={12} className="animate-spin" /> : <Activity size={12} />}
            {isTesting ? "テスト中..." : "DNS自動テスト"}
          </button>
          <button
            type="button"
            onClick={handleAiRecommend}
            disabled={!selectedAdapter || isTesting || isAiLoading}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-md transition-all
              ${isAiLoading ? "bg-purple-500/20 border-purple-500/50 text-purple-300" : "bg-purple-500/10 border-purple-500/30 text-purple-400 hover:bg-purple-500/20"}
              disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {isAiLoading ? <Loader2 size={12} className="animate-spin" /> : <Brain size={12} />}
            {isAiLoading ? "AI分析中..." : "AIに推奨してもらう"}
          </button>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-3">
        {results.length === 0 && !isTesting && !isAiLoading && !parsedRec && (
          <p className="text-xs text-muted-foreground">
            「AIに推奨してもらう」でDNSテスト＋AI分析を自動実行します。「DNS自動テスト」で生データを確認してから手動でClaudeに聞くこともできます。
          </p>
        )}

        {parseError && !isTesting && !isAiLoading && results.length === 0 && (
          <p className="text-xs text-destructive flex items-center gap-1">
            <XCircle size={11} /> {parseError}
          </p>
        )}

        {isTesting && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 size={12} className="animate-spin" />
            主要DNSにPing送信中... しばらくお待ちください
          </div>
        )}

        {isAiLoading && (
          <div className="flex items-center gap-2 text-xs text-purple-400">
            <Loader2 size={12} className="animate-spin" />
            DNSテスト実行中 → Claude AI が分析中... しばらくお待ちください
          </div>
        )}

        {parsedRec && !isAiLoading && results.length === 0 && (
          <p className="text-xs text-green-400 flex items-center gap-1.5">
            <CheckCircle2 size={12} />
            AI分析完了 — 下の推奨設定を確認して適用してください
          </p>
        )}

        {results.length > 0 && (
          <>
            <div className="overflow-hidden rounded-md border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="text-left px-3 py-2 text-muted-foreground font-medium">DNS</th>
                    <th className="text-left px-3 py-2 text-muted-foreground font-medium">アドレス</th>
                    <th className="text-right px-3 py-2 text-muted-foreground font-medium">平均</th>
                    <th className="text-right px-3 py-2 text-muted-foreground font-medium">最小</th>
                    <th className="text-right px-3 py-2 text-muted-foreground font-medium">最大</th>
                    <th className="text-right px-3 py-2 text-muted-foreground font-medium">損失</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {results.map((r) => {
                    const isBest = r.preset === bestPreset;
                    return (
                      <tr key={r.preset} className={isBest ? "bg-green-500/5" : ""}>
                        <td className="px-3 py-2 font-medium">
                          <div className="flex items-center gap-1.5">
                            {isBest && <CheckCircle2 size={11} className="text-green-400 shrink-0" />}
                            <span className={isBest ? "text-green-400" : "text-foreground"}>
                              {PRESET_LABEL[r.preset] ?? r.preset}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2 font-mono text-muted-foreground">{r.primary}</td>
                        {r.ping.success ? (
                          <>
                            <td className="px-3 py-2 text-right font-mono text-cyan-400">{r.ping.avg_ms.toFixed(0)}ms</td>
                            <td className="px-3 py-2 text-right font-mono text-green-400">{r.ping.min_ms.toFixed(0)}ms</td>
                            <td className="px-3 py-2 text-right font-mono text-yellow-400">{r.ping.max_ms.toFixed(0)}ms</td>
                            <td className={`px-3 py-2 text-right font-mono ${r.ping.packet_loss > 0 ? "text-red-400" : "text-muted-foreground"}`}>
                              {r.ping.packet_loss}%
                            </td>
                          </>
                        ) : (
                          <td colSpan={4} className="px-3 py-2 text-right">
                            <span className="text-destructive flex items-center justify-end gap-1">
                              <XCircle size={11} /> 応答なし
                            </span>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {bestPreset && (
              <div className="flex items-center gap-3">
                <p className="text-xs text-green-400 flex items-center gap-1.5 flex-1">
                  <CheckCircle2 size={12} />
                  最速DNS: <span className="font-semibold">{PRESET_LABEL[bestPreset] ?? bestPreset}</span>
                  <span className="text-muted-foreground">（低遅延・パケットロスなし）</span>
                </p>
                <button
                  type="button"
                  onClick={applyBestDns}
                  disabled={bestApplyStatus === "applying"}
                  className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium border rounded-md transition-all shrink-0
                    ${bestApplyStatus === "done" ? "bg-green-500/10 border-green-500/30 text-green-400"
                      : bestApplyStatus === "error" ? "bg-destructive/10 border-destructive/30 text-destructive"
                      : "bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20 disabled:opacity-40"
                    }`}
                >
                  {bestApplyStatus === "applying" ? <Loader2 size={10} className="animate-spin" />
                    : bestApplyStatus === "done" ? <CheckCircle2 size={10} />
                    : <Zap size={10} />}
                  {bestApplyStatus === "done" ? "適用済み" : bestApplyStatus === "error" ? "失敗" : "このDNSを適用"}
                </button>
              </div>
            )}

            <div className="flex flex-col gap-2 pt-2 border-t border-border">
              <p className="text-xs text-muted-foreground">
                コンテキストをコピーして Claude に貼り付けると、最適な DNS / ネットワーク設定を JSON で提案してもらえます。
              </p>
              <button
                type="button"
                onClick={copyContext}
                className="flex items-center gap-1.5 px-3 py-2 bg-secondary border border-border rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-all self-start"
              >
                {copyStatus === "copied" ? <CheckCircle2 size={12} className="text-green-400" /> : <Copy size={12} />}
                {copyStatus === "copied" ? "コピーしました！" : "AIコンテキストをコピー"}
              </button>
            </div>

            <div className="flex flex-col gap-2 pt-2 border-t border-border">
              <p className="text-xs text-muted-foreground font-medium">AI推奨 JSON を貼り付けて適用</p>
              <textarea
                value={recJson}
                onChange={(e) => handleJsonChange(e.target.value)}
                placeholder='{"adapter_name": "...", "dns_preset": "cloudflare", "apply_network_gaming": true, "explanation": "..."}'
                rows={4}
                aria-label="AI推奨JSONを入力"
                className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-xs font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary resize-y"
              />
              {parseError && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <XCircle size={11} /> {parseError}
                </p>
              )}
              {parsedRec && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-blue-500/10 border border-blue-500/30 rounded-md p-3 flex flex-col gap-2"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs text-blue-300 font-semibold flex items-center gap-1.5">
                      <Brain size={12} /> AI推奨
                    </p>
                    {parsedRec.confidence > 0 && <ConfidenceBadge confidence={parsedRec.confidence} />}
                  </div>
                  <p className="text-xs text-foreground">{parsedRec.explanation}</p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>DNS: <span className="text-foreground font-semibold">{parsedRec.dns_preset}</span></span>
                    <span>TCP/IP最適化: <span className="text-foreground font-semibold">{parsedRec.apply_network_gaming ? "あり" : "なし"}</span></span>
                  </div>
                  <StatusBanner status={applyStatus} message={applyMsg} />
                  <button
                    type="button"
                    onClick={applyRec}
                    disabled={applyStatus === "running"}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all self-start
                      ${applyStatus === "running"
                        ? "bg-primary/20 text-primary/60 cursor-not-allowed border border-primary/20"
                        : "bg-primary text-primary-foreground hover:brightness-110 active:scale-[0.98] border border-primary/20"
                      }`}
                  >
                    {applyStatus === "running" ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                    この設定を適用
                  </button>
                </motion.div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── PingSection ────────────────────────────────────────────────────────────

const PING_TARGETS = [
  { label: "Cloudflare", host: "1.1.1.1" },
  { label: "Google",     host: "8.8.8.8" },
  { label: "国内 (Yahoo)", host: "182.22.25.252" },
];

function PingSection() {
  const [pingResults, setPingResults] = useState<PingResult[]>([]);
  const [pingingHost, setPingingHost] = useState<string | null>(null);
  const [customHost, setCustomHost] = useState("");

  const runPing = async (host: string) => {
    if (!host.trim() || pingingHost !== null) return;
    setPingingHost(host);
    try {
      const result = await invoke<PingResult>("ping_host", { host });
      setPingResults((prev) => {
        const filtered = prev.filter((r) => r.host !== host);
        return [result, ...filtered].slice(0, 5);
      });
    } catch (e) {
      console.error(e);
    } finally {
      setPingingHost(null);
    }
  };

  const maxPingMs = Math.max(...pingResults.flatMap((r) => r.times_ms), 1);

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Activity size={16} className="text-muted-foreground" />
        <span className="text-sm font-semibold">Ping テスト</span>
      </div>

      <div className="p-4 flex flex-col gap-3">
        <div className="flex gap-2 flex-wrap">
          {PING_TARGETS.map((t) => (
            <button
              type="button"
              key={t.host}
              onClick={() => runPing(t.host)}
              disabled={pingingHost !== null}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-md transition-all
                ${pingingHost === t.host
                  ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300"
                  : "bg-secondary border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground"
                }
                disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {pingingHost === t.host ? <Loader2 size={12} className="animate-spin" /> : <Activity size={12} />}
              {t.label} ({t.host})
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={customHost}
            onChange={(e) => setCustomHost(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runPing(customHost)}
            placeholder="カスタムホスト (例: example.com)"
            className="flex-1 bg-secondary border border-border rounded-md px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={() => runPing(customHost)}
            disabled={!customHost.trim() || pingingHost !== null}
            className="px-4 py-2 bg-secondary border border-border rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Ping
          </button>
        </div>

        {pingResults.length > 0 && (
          <div className="flex flex-col gap-3 mt-1">
            {pingResults.map((r) => (
              <div key={r.host} className="bg-secondary/50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium font-mono">{r.host}</span>
                  {r.success ? (
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>最小 <span className="text-green-400 font-mono">{r.min_ms.toFixed(0)}ms</span></span>
                      <span>平均 <span className="text-cyan-400 font-mono">{r.avg_ms.toFixed(0)}ms</span></span>
                      <span>最大 <span className="text-yellow-400 font-mono">{r.max_ms.toFixed(0)}ms</span></span>
                      {r.packet_loss > 0 && <span className="text-red-400">損失 {r.packet_loss}%</span>}
                    </div>
                  ) : (
                    <span className="text-xs text-destructive flex items-center gap-1">
                      <XCircle size={12} />応答なし
                    </span>
                  )}
                </div>
                {r.success && r.times_ms.length > 0 && (
                  <div className="flex flex-col gap-1">
                    {r.times_ms.map((ms, i) => (
                      <PingBar key={i} ms={ms} max={maxPingMs} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────

export function NetworkDiagnosticsPanel() {
  // Own adapter state — independent from NetworkSettingsPanel
  const [adapters, setAdapters] = useState<AdapterInfo[]>([]);
  const [selectedAdapter, setSelectedAdapter] = useState<string>("");

  useEffect(() => {
    invoke<AdapterInfo[]>("get_network_adapters")
      .then((list) => {
        setAdapters(list);
        if (list.length > 0) setSelectedAdapter(list[0].name);
      })
      .catch(console.error);
  }, []);

  const handleNetworkUpdate = (_settings: NetworkSettings, newAdapters: AdapterInfo[]) => {
    setAdapters(newAdapters);
  };

  return (
    <div className="p-6 flex flex-col gap-6 h-full overflow-y-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold">ネットワーク診断</h2>
          <p className="text-xs text-muted-foreground">DNS 速度テスト・AI 推奨・Ping 計測（変更は行いません）</p>
        </div>
        {adapters.length > 0 && (
          <select
            aria-label="診断対象アダプターを選択"
            value={selectedAdapter}
            onChange={(e) => setSelectedAdapter(e.target.value)}
            className="bg-secondary border border-border rounded-md px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary"
          >
            {adapters.map((a) => (
              <option key={a.name} value={a.name}>{a.name}</option>
            ))}
          </select>
        )}
      </div>

      <DnsAutoTestSection
        selectedAdapter={selectedAdapter}
        onNetworkUpdate={handleNetworkUpdate}
      />

      <PingSection />
    </div>
  );
}

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Wifi,
  Zap,
  RotateCcw,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Activity,
  Brain,
  Copy,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { NetworkSettings, AdapterInfo, PingResult, DnsPreset, DnsPingSummary, NetworkRecommendation } from "@/types";
import { Toggle } from "@/components/ui/toggle";
import { applyNetworkRecommendation } from "@/lib/network_apply";

// ── DNS preset definitions ──────────────────────────────────────────────────

const DNS_PRESETS: {
  id: DnsPreset;
  label: string;
  primary: string;
  secondary: string;
  color: string;
}[] = [
  { id: "cloudflare", label: "Cloudflare", primary: "1.1.1.1", secondary: "1.0.0.1", color: "text-orange-400" },
  { id: "google", label: "Google", primary: "8.8.8.8", secondary: "8.8.4.4", color: "text-blue-400" },
  { id: "opendns", label: "OpenDNS", primary: "208.67.222.222", secondary: "208.67.220.220", color: "text-purple-400" },
  { id: "dhcp", label: "自動 (DHCP)", primary: "—", secondary: "—", color: "text-muted-foreground" },
];

// ── Ping bar ────────────────────────────────────────────────────────────────

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

// ── StatusMessage ────────────────────────────────────────────────────────────

type ActionStatus = "idle" | "running" | "success" | "error";

function StatusMessage({ status, message }: { status: ActionStatus; message: string }) {
  return (
    <AnimatePresence>
      {status !== "idle" && message && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={`flex items-start gap-2 px-3 py-2 rounded-md text-xs border ${
            status === "success"
              ? "bg-green-500/10 border-green-500/30 text-green-400"
              : status === "error"
              ? "bg-destructive/10 border-destructive/30 text-destructive"
              : "bg-secondary border-border text-muted-foreground"
          }`}
        >
          {status === "success" && <CheckCircle2 size={13} className="shrink-0 mt-0.5" />}
          {status === "error" && <XCircle size={13} className="shrink-0 mt-0.5" />}
          {status === "running" && <Loader2 size={13} className="animate-spin shrink-0 mt-0.5" />}
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── TcpSection ───────────────────────────────────────────────────────────────

function TcpSection({
  settings,
  status,
  message,
  onApply,
  onRestore,
}: {
  settings: NetworkSettings | null;
  status: ActionStatus;
  message: string;
  onApply: () => void;
  onRestore: () => void;
}) {
  const isBusy = status === "running";
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap size={16} className="text-muted-foreground" />
          <span className="text-sm font-semibold">TCP/IP 最適化</span>
        </div>
        <span className="text-[10px] text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 px-2 py-0.5 rounded flex items-center gap-1">
          <AlertCircle size={10} />
          管理者権限が必要
        </span>
      </div>

      {settings ? (
        <div className="divide-y divide-border/50">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-medium">ネットワークスロットリング無効化</p>
              <p className="text-xs text-muted-foreground">
                NetworkThrottlingIndex = 0xFFFFFFFF (マルチメディア帯域制限を解除)
              </p>
            </div>
            <Toggle checked={settings.throttling_disabled} />
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-medium">SystemResponsiveness</p>
              <p className="text-xs text-muted-foreground">
                現在: {settings.system_responsiveness}
                {settings.system_responsiveness === 0 ? " (最大パフォーマンス)" : " (デフォルト: 20)"}
              </p>
            </div>
            <Toggle checked={settings.system_responsiveness === 0} />
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-medium">Nagle アルゴリズム無効化</p>
              <p className="text-xs text-muted-foreground">
                TCPNoDelay — 小パケットの遅延バッファリングを無効化
              </p>
            </div>
            <Toggle checked={settings.nagle_disabled} />
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground">
          <Loader2 size={14} className="animate-spin" />
          <span className="text-sm">読み込み中...</span>
        </div>
      )}

      <div className="px-4 pb-4 flex flex-col gap-2">
        <StatusMessage status={status} message={message} />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onApply}
            disabled={isBusy || !settings}
            className={`flex-1 py-2.5 rounded-md font-medium text-sm flex items-center justify-center gap-2 transition-all
              ${isBusy || !settings
                ? "bg-primary/20 text-primary/60 cursor-not-allowed border border-primary/20"
                : "bg-primary text-primary-foreground hover:brightness-110 active:scale-[0.98] border border-primary/20"
              }`}
          >
            {isBusy ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
            最適化を適用
          </button>
          <button
            type="button"
            onClick={onRestore}
            disabled={isBusy || !settings}
            className={`px-4 py-2.5 rounded-md font-medium text-sm flex items-center gap-2 border transition-all
              ${isBusy || !settings
                ? "opacity-40 cursor-not-allowed border-border text-muted-foreground"
                : "border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground"
              }`}
          >
            <RotateCcw size={14} />
            復元
          </button>
        </div>
      </div>
    </div>
  );
}

// ── DnsSection ───────────────────────────────────────────────────────────────

function DnsSection({
  adapters,
  selectedAdapter,
  onSelectAdapter,
  status,
  message,
  onApplyDns,
}: {
  adapters: AdapterInfo[];
  selectedAdapter: string;
  onSelectAdapter: (name: string) => void;
  status: ActionStatus;
  message: string;
  onApplyDns: (preset: DnsPreset) => void;
}) {
  const currentAdapter = adapters.find((a) => a.name === selectedAdapter);
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-muted-foreground" />
          <span className="text-sm font-semibold">DNS 設定</span>
        </div>
        <span className="text-[10px] text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 px-2 py-0.5 rounded flex items-center gap-1">
          <AlertCircle size={10} />
          管理者権限が必要
        </span>
      </div>

      <div className="p-4 flex flex-col gap-3">
        {adapters.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="adapter-select" className="text-xs text-muted-foreground font-medium">アダプター</label>
            <select
              id="adapter-select"
              aria-label="ネットワークアダプターを選択"
              value={selectedAdapter}
              onChange={(e) => onSelectAdapter(e.target.value)}
              className="bg-secondary border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
            >
              {adapters.map((a) => (
                <option key={a.name} value={a.name}>{a.name}</option>
              ))}
            </select>
            {currentAdapter && (
              <p className="text-xs text-muted-foreground">
                現在の DNS:{" "}
                <span className="text-foreground font-mono">
                  {currentAdapter.primary_dns || "自動"}
                  {currentAdapter.secondary_dns ? ` / ${currentAdapter.secondary_dns}` : ""}
                </span>
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">アダプターが検出されませんでした</p>
        )}

        <div className="grid grid-cols-2 gap-2">
          {DNS_PRESETS.map((preset) => (
            <button
              type="button"
              key={preset.id}
              onClick={() => onApplyDns(preset.id)}
              disabled={status === "running" || !selectedAdapter}
              className="flex flex-col items-start px-3 py-2.5 bg-secondary hover:bg-secondary/70 border border-border hover:border-muted-foreground rounded-md transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className={`text-xs font-semibold ${preset.color}`}>{preset.label}</span>
              <span className="text-[10px] text-muted-foreground font-mono mt-0.5">
                {preset.primary}{preset.secondary !== "—" ? ` / ${preset.secondary}` : ""}
              </span>
            </button>
          ))}
        </div>

        <StatusMessage status={status} message={message} />
      </div>
    </div>
  );
}

// ── DnsAutoTestSection ───────────────────────────────────────────────────────

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

  // Best = success, zero packet loss, lowest avg_ms
  const bestPreset =
    results.length > 0
      ? results
          .filter((r) => r.ping.success && r.ping.packet_loss === 0)
          .sort((a, b) => a.ping.avg_ms - b.ping.avg_ms)[0]?.preset ?? null
      : null;

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {/* Header */}
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
              ${isTesting
                ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300"
                : "bg-secondary border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground"
              }
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
              ${isAiLoading
                ? "bg-purple-500/20 border-purple-500/50 text-purple-300"
                : "bg-purple-500/10 border-purple-500/30 text-purple-400 hover:bg-purple-500/20 hover:border-purple-500/50"
              }
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
            {/* Results table */}
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
              <p className="text-xs text-green-400 flex items-center gap-1.5">
                <CheckCircle2 size={12} />
                最速DNS: <span className="font-semibold">{PRESET_LABEL[bestPreset] ?? bestPreset}</span>（低遅延・パケットロスなし）
              </p>
            )}

            {/* Copy context */}
            <div className="flex flex-col gap-2 pt-2 border-t border-border">
              <p className="text-xs text-muted-foreground">
                コンテキストをコピーして Claude に貼り付けると、最適な DNS / ネットワーク設定を JSON で提案してもらえます。
              </p>
              <button
                type="button"
                onClick={copyContext}
                className="flex items-center gap-1.5 px-3 py-2 bg-secondary border border-border rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-all self-start"
              >
                {copyStatus === "copied" ? (
                  <CheckCircle2 size={12} className="text-green-400" />
                ) : (
                  <Copy size={12} />
                )}
                {copyStatus === "copied" ? "コピーしました！" : "AIコンテキストをコピー"}
              </button>
            </div>

            {/* Paste recommendation JSON */}
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
                  <p className="text-xs text-blue-300 font-semibold flex items-center gap-1.5">
                    <Brain size={12} /> AI推奨
                  </p>
                  <p className="text-xs text-foreground">{parsedRec.explanation}</p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>DNS: <span className="text-foreground font-semibold">{parsedRec.dns_preset}</span></span>
                    <span>TCP/IP最適化: <span className="text-foreground font-semibold">{parsedRec.apply_network_gaming ? "あり" : "なし"}</span></span>
                  </div>
                  <StatusMessage status={applyStatus} message={applyMsg} />
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

// ── PingSection ───────────────────────────────────────────────────────────────

const PING_TARGETS = [
  { label: "Cloudflare", host: "1.1.1.1" },
  { label: "Google", host: "8.8.8.8" },
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
              {pingingHost === t.host
                ? <Loader2 size={12} className="animate-spin" />
                : <Activity size={12} />}
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

// ── Main ────────────────────────────────────────────────────────────────────

export function NetworkOptimizer() {
  const [settings, setSettings] = useState<NetworkSettings | null>(null);
  const [adapters, setAdapters] = useState<AdapterInfo[]>([]);
  const [selectedAdapter, setSelectedAdapter] = useState<string>("");
  const [dnsStatus, setDnsStatus] = useState<ActionStatus>("idle");
  const [dnsMsg, setDnsMsg] = useState("");
  const [netStatus, setNetStatus] = useState<ActionStatus>("idle");
  const [netMsg, setNetMsg] = useState("");

  useEffect(() => {
    invoke<NetworkSettings>("get_network_settings").then(setSettings).catch(console.error);
    invoke<AdapterInfo[]>("get_network_adapters")
      .then((list) => {
        setAdapters(list);
        if (list.length > 0) setSelectedAdapter(list[0].name);
      })
      .catch(console.error);
  }, []);

  const applyGaming = async () => {
    setNetStatus("running");
    setNetMsg("");
    try {
      const result = await invoke<NetworkSettings>("apply_network_gaming");
      setSettings(result);
      setNetStatus("success");
      setNetMsg("ネットワーク最適化を適用しました（再起動後に有効）");
    } catch (e) {
      setNetStatus("error");
      setNetMsg(String(e));
    }
  };

  const restoreNetwork = async () => {
    setNetStatus("running");
    setNetMsg("");
    try {
      const result = await invoke<NetworkSettings>("restore_network_settings");
      setSettings(result);
      setNetStatus("success");
      setNetMsg("デフォルト設定に戻しました");
    } catch (e) {
      setNetStatus("error");
      setNetMsg(String(e));
    }
  };

  const handleNetworkUpdate = (newSettings: NetworkSettings, newAdapters: AdapterInfo[]) => {
    setSettings(newSettings);
    setAdapters(newAdapters);
  };

  const applyDns = async (preset: DnsPreset) => {
    if (!selectedAdapter) return;
    setDnsStatus("running");
    setDnsMsg("");
    try {
      await invoke("set_adapter_dns", { adapterName: selectedAdapter, preset });
      const list = await invoke<AdapterInfo[]>("get_network_adapters");
      setAdapters(list);
      setDnsStatus("success");
      const p = DNS_PRESETS.find((d) => d.id === preset);
      setDnsMsg(
        preset === "dhcp"
          ? `${selectedAdapter} を自動 (DHCP) に設定しました`
          : `${selectedAdapter} の DNS を ${p?.label} に設定しました`
      );
    } catch (e) {
      setDnsStatus("error");
      setDnsMsg(String(e));
    }
  };

  return (
    <div className="p-6 flex flex-col gap-6 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <Wifi className="text-blue-400" size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold">ネットワーク最適化</h1>
          <p className="text-sm text-muted-foreground">スロットリング無効化・DNS設定・Ping計測</p>
        </div>
      </div>

      <TcpSection
        settings={settings}
        status={netStatus}
        message={netMsg}
        onApply={applyGaming}
        onRestore={restoreNetwork}
      />

      <DnsSection
        adapters={adapters}
        selectedAdapter={selectedAdapter}
        onSelectAdapter={setSelectedAdapter}
        status={dnsStatus}
        message={dnsMsg}
        onApplyDns={applyDns}
      />

      <DnsAutoTestSection
        selectedAdapter={selectedAdapter}
        onNetworkUpdate={handleNetworkUpdate}
      />

      <PingSection />
    </div>
  );
}

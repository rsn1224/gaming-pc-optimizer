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
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { NetworkSettings, AdapterInfo, PingResult, DnsPreset } from "@/types";
import { Toggle } from "@/components/ui/toggle";

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

      <PingSection />
    </div>
  );
}

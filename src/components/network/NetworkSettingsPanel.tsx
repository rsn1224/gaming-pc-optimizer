/**
 * NetworkSettingsPanel — 設定変更専用パネル
 *
 * 責務: TCP/IP 最適化の適用/復元 + DNS アダプター設定
 * 診断 (Ping / DNS 速度テスト / AI 推奨) は NetworkDiagnosticsPanel に分離。
 *
 * [NETWORK_TAB_SPLIT] ENABLE_NETWORK_TAB_SPLIT = true のときのみ NetworkHub から使用される。
 * ENABLE_NETWORK_TAB_SPLIT = false の場合は従来の NetworkOptimizer が使われるため
 * このファイルは一切影響を受けない。
 */

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Wifi,
  Zap,
  RotateCcw,
  Loader2,
  AlertCircle,
  Activity,
} from "lucide-react";
import type { ActionStatus, NetworkSettings, AdapterInfo, DnsPreset } from "@/types";
import { Toggle } from "@/components/ui/toggle";
import { StatusBanner } from "@/components/ui/StatusBanner";

// ── DNS preset definitions ─────────────────────────────────────────────────

const DNS_PRESETS: {
  id: DnsPreset;
  label: string;
  primary: string;
  secondary: string;
  color: string;
}[] = [
  { id: "cloudflare", label: "Cloudflare", primary: "1.1.1.1",           secondary: "1.0.0.1",           color: "text-orange-400" },
  { id: "google",     label: "Google",     primary: "8.8.8.8",            secondary: "8.8.4.4",            color: "text-blue-400" },
  { id: "opendns",    label: "OpenDNS",    primary: "208.67.222.222",      secondary: "208.67.220.220",     color: "text-purple-400" },
  { id: "dhcp",       label: "自動 (DHCP)", primary: "—",                  secondary: "—",                  color: "text-muted-foreground" },
];

// ── TcpSection ─────────────────────────────────────────────────────────────

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
          {/* 変更前値の並列表示 */}
          <div className="px-4 py-2 bg-secondary/30">
            <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mb-1">現在の設定</p>
            <div className="flex gap-4 text-[11px] text-muted-foreground">
              <span>スロットリング: <span className={settings.throttling_disabled ? "text-green-400" : "text-amber-400"}>{settings.throttling_disabled ? "無効化済" : "有効"}</span></span>
              <span>SystemResponsiveness: <span className={settings.system_responsiveness === 0 ? "text-green-400" : "text-amber-400"}>{settings.system_responsiveness}</span></span>
              <span>Nagle: <span className={settings.nagle_disabled ? "text-green-400" : "text-amber-400"}>{settings.nagle_disabled ? "無効化済" : "有効"}</span></span>
            </div>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-medium">ネットワークスロットリング無効化</p>
              <p className="text-xs text-muted-foreground">NetworkThrottlingIndex = 0xFFFFFFFF</p>
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
              <p className="text-xs text-muted-foreground">TCPNoDelay — 小パケットの遅延バッファリングを無効化</p>
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
        <StatusBanner status={status} message={message} />
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

// ── DnsSection ─────────────────────────────────────────────────────────────

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
            <label htmlFor="adapter-select-settings" className="text-xs text-muted-foreground font-medium">アダプター</label>
            <select
              id="adapter-select-settings"
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

        <StatusBanner status={status} message={message} />
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────

export function NetworkSettingsPanel() {
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
      <div className="flex items-center gap-3">
        <div className="p-2 bg-gradient-to-br from-blue-500/20 to-cyan-500/10 border border-blue-500/30 rounded-xl">
          <Wifi className="text-blue-400" size={20} />
        </div>
        <div>
          <h2 className="text-lg font-bold">ネットワーク設定変更</h2>
          <p className="text-xs text-muted-foreground">TCP/IP 最適化・DNS 変更（変更前値は上段に表示）</p>
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
    </div>
  );
}

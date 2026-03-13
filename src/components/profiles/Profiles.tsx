import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { BookMarked, Plus, Pencil, Trash2, Play, X, Tag, Loader2, Zap, FilePlus, Sparkles } from "lucide-react";
import { useAppStore } from "@/stores/useAppStore";
import type { GameProfile } from "@/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyProfile(): Omit<GameProfile, "id"> {
  return {
    name: "",
    exe_path: "",
    tags: [],
    kill_bloatware: false,
    power_plan: "none",
    windows_preset: "none",
    storage_mode: "none",
    network_mode: "none",
    dns_preset: "none",
  };
}

const POWER_LABELS: Record<GameProfile["power_plan"], string> = {
  none: "変更なし",
  ultimate: "Ultimate Performance",
  high_performance: "高パフォーマンス",
};

const STORAGE_LABELS: Record<GameProfile["storage_mode"], string> = {
  none: "スキップ",
  light: "ライト（Temp のみ）",
  deep: "ディープ（全カテゴリ）",
};

const inputCls = "bg-white/[0.04] border border-white/[0.10] rounded-lg px-3 py-2 text-sm outline-none focus:border-cyan-500/50 transition-colors";
const selectCls = `${inputCls} w-full cursor-pointer`;

// ── Modal ─────────────────────────────────────────────────────────────────────

interface ModalProps {
  initial: Partial<GameProfile>;
  onSave: (p: GameProfile) => void;
  onClose: () => void;
}

function ProfileModal({ initial, onSave, onClose }: ModalProps) {
  const isNew = !initial.id;
  const [form, setForm] = useState<Omit<GameProfile, "id">>({
    ...emptyProfile(),
    ...initial,
  });
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !form.tags.includes(t)) set("tags", [...form.tags, t]);
    setTagInput("");
  };

  const removeTag = (t: string) => set("tags", form.tags.filter((x) => x !== t));

  const handleSave = async () => {
    if (!form.name.trim()) { setErr("プロファイル名は必須です"); return; }
    setSaving(true);
    setErr("");
    try {
      const profile: GameProfile = {
        id: initial.id ?? crypto.randomUUID(),
        ...form,
        name: form.name.trim(),
      };
      await invoke("save_profile", { profile });
      onSave(profile);
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#05080c] border border-white/[0.10] rounded-2xl w-full max-w-lg mx-4 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <h2 className="font-semibold text-base">
            {isNew ? "プロファイルを作成" : "プロファイルを編集"}
          </h2>
          <button type="button" onClick={onClose} aria-label="閉じる" className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wider">プロファイル名 *</label>
            <input
              className={inputCls + " w-full"}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="例: Apex Legends"
            />
          </div>

          {/* EXE path */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wider">実行ファイルパス（任意）</label>
            <input
              className={inputCls + " w-full font-mono"}
              value={form.exe_path}
              onChange={(e) => set("exe_path", e.target.value)}
              placeholder="C:\Program Files\..."
            />
          </div>

          {/* Tags */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wider">タグ</label>
            <div className="flex gap-2">
              <input
                className={inputCls + " flex-1"}
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                placeholder="FPS, Battle Royale ..."
              />
              <button
                type="button"
                onClick={addTag}
                className="px-3 py-2 rounded-lg bg-white/5 border border-white/[0.10] text-sm hover:bg-white/10 transition-colors"
              >
                追加
              </button>
            </div>
            {form.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {form.tags.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 text-xs bg-cyan-500/10 text-cyan-400 border border-cyan-500/25 rounded-full px-2.5 py-0.5">
                    {t}
                    <button type="button" onClick={() => removeTag(t)} aria-label={`タグ「${t}」を削除`} className="hover:text-red-400 transition-colors">
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <hr className="border-white/[0.06]" />

          {/* Kill bloatware */}
          <div className="flex items-center justify-between">
            <span className="text-sm">ブロートウェア停止</span>
            <button
              type="button"
              onClick={() => set("kill_bloatware", !form.kill_bloatware)}
              aria-label={`ブロートウェア停止: ${form.kill_bloatware ? "有効" : "無効"}`}
              className={`w-10 h-5 rounded-full transition-colors ${form.kill_bloatware ? "bg-cyan-500" : "bg-white/10"}`}
            >
              <span className={`block w-4 h-4 rounded-full bg-white shadow mx-0.5 transition-transform ${form.kill_bloatware ? "translate-x-5" : ""}`} />
            </button>
          </div>

          {/* Power plan */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="sel-power" className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wider">電源プラン</label>
            <select
              id="sel-power"
              className={selectCls}
              value={form.power_plan}
              onChange={(e) => set("power_plan", e.target.value as GameProfile["power_plan"])}
            >
              {(Object.keys(POWER_LABELS) as GameProfile["power_plan"][]).map((k) => (
                <option key={k} value={k} className="bg-card">{POWER_LABELS[k]}</option>
              ))}
            </select>
          </div>

          {/* Windows preset */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="sel-windows" className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wider">Windows設定プリセット</label>
            <select
              id="sel-windows"
              className={selectCls}
              value={form.windows_preset}
              onChange={(e) => set("windows_preset", e.target.value as GameProfile["windows_preset"])}
            >
              <option value="none" className="bg-card">変更なし</option>
              <option value="gaming" className="bg-card">ゲーミング最適化</option>
              <option value="default" className="bg-card">デフォルトに復元</option>
            </select>
          </div>

          {/* Storage mode */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="sel-storage" className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wider">ストレージクリーン</label>
            <select
              id="sel-storage"
              className={selectCls}
              value={form.storage_mode}
              onChange={(e) => set("storage_mode", e.target.value as GameProfile["storage_mode"])}
            >
              {(Object.keys(STORAGE_LABELS) as GameProfile["storage_mode"][]).map((k) => (
                <option key={k} value={k} className="bg-card">{STORAGE_LABELS[k]}</option>
              ))}
            </select>
          </div>

          {/* Network mode */}
          <div className="flex items-center justify-between">
            <span className="text-sm">ネットワーク最適化</span>
            <button
              type="button"
              onClick={() => set("network_mode", form.network_mode === "gaming" ? "none" : "gaming")}
              aria-label={`ネットワーク最適化: ${form.network_mode === "gaming" ? "有効" : "無効"}`}
              className={`w-10 h-5 rounded-full transition-colors ${form.network_mode === "gaming" ? "bg-cyan-500" : "bg-white/10"}`}
            >
              <span className={`block w-4 h-4 rounded-full bg-white shadow mx-0.5 transition-transform ${form.network_mode === "gaming" ? "translate-x-5" : ""}`} />
            </button>
          </div>

          {/* DNS */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="sel-dns" className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wider">DNS プリセット</label>
            <select
              id="sel-dns"
              className={selectCls}
              value={form.dns_preset}
              onChange={(e) => set("dns_preset", e.target.value as GameProfile["dns_preset"])}
            >
              <option value="none" className="bg-card">変更なし</option>
              <option value="google" className="bg-card">Google (8.8.8.8)</option>
              <option value="cloudflare" className="bg-card">Cloudflare (1.1.1.1)</option>
              <option value="opendns" className="bg-card">OpenDNS (208.67.222.222)</option>
              <option value="dhcp" className="bg-card">DHCP（自動取得）</option>
            </select>
          </div>

          {err && <p className="text-xs text-red-400">{err}</p>}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-white/[0.06]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm bg-white/5 border border-white/[0.10] hover:bg-white/10 transition-colors"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 font-semibold hover:brightness-110 disabled:opacity-50 flex items-center gap-2 active:scale-[0.97] transition-all"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {isNew ? "作成" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Profile card ──────────────────────────────────────────────────────────────

interface CardProps {
  profile: GameProfile;
  onEdit: () => void;
  onDelete: () => void;
  onApply: () => void;
  applying: boolean;
  isActive: boolean;
}

function ProfileCard({ profile, onEdit, onDelete, onApply, applying, isActive }: CardProps) {
  const badges: string[] = [];
  if (profile.kill_bloatware) badges.push("ブロートウェア停止");
  if (profile.power_plan !== "none") badges.push(POWER_LABELS[profile.power_plan]);
  if (profile.windows_preset !== "none") badges.push("Windows" + (profile.windows_preset === "gaming" ? "最適化" : "復元"));
  if (profile.storage_mode !== "none") badges.push("ストレージ " + profile.storage_mode);
  if (profile.network_mode === "gaming") badges.push("ネット最適化");
  if (profile.dns_preset !== "none") badges.push("DNS:" + profile.dns_preset);
  const isDraft = badges.length === 0 && !profile.kill_bloatware;

  return (
    <div className={`bg-[#05080c] border rounded-xl p-4 flex flex-col gap-3 transition-all ${
      isActive
        ? "border-cyan-500/50 shadow-[0_0_0_1px_rgba(34,211,238,0.25)]"
        : "border-white/[0.08] hover:border-cyan-500/30 hover:shadow-[0_0_0_1px_rgba(34,211,238,0.15)]"
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm leading-tight truncate">{profile.name}</p>
            {isActive && (
              <span className="inline-flex items-center gap-1 text-[10px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded-full px-2 py-0.5 shrink-0">
                <Zap size={9} />
                適用中
              </span>
            )}
            {isDraft && !isActive && (
              <span className="inline-flex items-center gap-1 text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-full px-2 py-0.5 shrink-0">
                下書き
              </span>
            )}
          </div>
          {profile.exe_path && (
            <p className="text-xs text-muted-foreground/60 font-mono truncate mt-0.5">{profile.exe_path}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onEdit}
            className="p-1.5 rounded-lg hover:bg-white/[0.06] text-muted-foreground hover:text-foreground transition-colors"
            title="編集"
          >
            <Pencil size={13} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
            title="削除"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Tags */}
      {profile.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {profile.tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 text-[10px] bg-white/5 border border-white/[0.08] rounded-full px-2 py-0.5 text-muted-foreground">
              <Tag size={9} />
              {t}
            </span>
          ))}
        </div>
      )}

      {/* Optimization badges */}
      {badges.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {badges.map((b) => (
            <span key={b} className="text-[10px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded px-1.5 py-0.5">
              {b}
            </span>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={onApply}
        disabled={applying}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-cyan-500/20 to-emerald-500/20 text-cyan-300 border border-cyan-500/25 hover:from-cyan-500/30 hover:to-emerald-500/30 hover:border-cyan-500/40 disabled:opacity-50 transition-all active:scale-[0.97]"
      >
        {applying ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
        {applying ? "適用中…" : "このプロファイルを適用"}
      </button>
    </div>
  );
}

// ── Quick-draft modal ─────────────────────────────────────────────────────────

interface QuickDraftProps {
  onSave: (p: GameProfile) => void;
  onClose: () => void;
}

function QuickDraftModal({ onSave, onClose }: QuickDraftProps) {
  const [name, setName] = useState("");
  const [exePath, setExePath] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const handleSave = async () => {
    if (!name.trim()) { setErr("プロファイル名は必須です"); return; }
    setSaving(true);
    setErr("");
    try {
      const profile: GameProfile = {
        id: crypto.randomUUID(),
        name: name.trim(),
        exe_path: exePath.trim(),
        tags: [],
        kill_bloatware: false,
        power_plan: "none",
        windows_preset: "none",
        storage_mode: "none",
        network_mode: "none",
        dns_preset: "none",
      };
      await invoke("save_profile", { profile });
      onSave(profile);
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#05080c] border border-white/[0.10] rounded-2xl w-full max-w-sm mx-4 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <h2 className="font-semibold text-base">ドラフトとして追加</h2>
          <button type="button" onClick={onClose} aria-label="閉じる" className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <p className="text-xs text-muted-foreground/70">名前と実行ファイルだけ登録し、設定は後で編集できます。</p>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wider">プロファイル名 *</label>
            <input
              className={inputCls + " w-full"}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              placeholder="例: Apex Legends"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wider">実行ファイルパス（任意）</label>
            <input
              className={inputCls + " w-full font-mono"}
              value={exePath}
              onChange={(e) => setExePath(e.target.value)}
              placeholder="r5apex.exe"
            />
          </div>
          {err && <p className="text-xs text-red-400">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-white/[0.06]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm bg-white/5 border border-white/[0.10] hover:bg-white/10 transition-colors"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 font-semibold hover:brightness-110 disabled:opacity-50 flex items-center gap-2 active:scale-[0.97] transition-all"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            追加
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function Profiles() {
  const { activeProfileId, editingProfileId, setEditingProfileId } = useAppStore();
  const [profiles, setProfiles] = useState<GameProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<Partial<GameProfile> | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [applyLog, setApplyLog] = useState<{ id: string; log: string; ok: boolean } | null>(null);
  const [quickDraft, setQuickDraft] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiLog, setAiLog] = useState<{ msg: string; ok: boolean } | null>(null);

  const reload = async () => {
    try {
      const list = await invoke<GameProfile[]>("list_profiles");
      setProfiles(list);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  // Auto-open modal when navigating from My Games via editingProfileId
  useEffect(() => {
    if (!editingProfileId || profiles.length === 0 || modal !== null) return;
    const p = profiles.find((x) => x.id === editingProfileId);
    if (p) {
      setModal(p);
      setEditingProfileId(null);
    }
  }, [profiles, editingProfileId]); // modal intentionally excluded to avoid re-runs

  const handleDelete = async (id: string) => {
    if (!confirm("このプロファイルを削除しますか？")) return;
    try {
      await invoke("delete_profile", { id });
      setProfiles((p) => p.filter((x) => x.id !== id));
    } catch (e) {
      alert("削除失敗: " + e);
    }
  };

  const handleApply = async (id: string) => {
    setApplyingId(id);
    setApplyLog(null);
    try {
      const log = await invoke<string>("apply_profile", { id });
      setApplyLog({ id, log, ok: true });
    } catch (e) {
      setApplyLog({ id, log: String(e), ok: false });
    } finally {
      setApplyingId(null);
    }
  };

  const handleSave = (p: GameProfile) => {
    setProfiles((prev) => {
      const idx = prev.findIndex((x) => x.id === p.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = p;
        return next;
      }
      return [...prev, p];
    });
    setModal(null);
  };

  const handleAiGenerate = async () => {
    setAiGenerating(true);
    setAiLog(null);
    try {
      const updated = await invoke<GameProfile[]>("generate_ai_recommendations");
      setProfiles(updated);
      const filled = updated.filter((p) => p.recommended_mode).length;
      setAiLog({ msg: `${filled} 件のプロファイルにAI推薦を適用しました`, ok: true });
    } catch (e) {
      setAiLog({ msg: String(e), ok: false });
    } finally {
      setAiGenerating(false);
    }
  };

  return (
    <div className="p-5 flex flex-col gap-5 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-cyan-500/20 to-emerald-500/10 border border-cyan-500/30 rounded-xl shadow-[0_0_12px_rgba(34,211,238,0.1)]">
            <BookMarked className="text-cyan-400" size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">プロファイル</h1>
            <p className="text-xs text-muted-foreground mt-0.5">ゲームごとの最適化設定を保存・適用</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAiGenerate}
            disabled={aiGenerating}
            title="ドラフトプロファイルの設定をAIで自動補完"
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-400 text-sm font-medium hover:bg-purple-500/20 disabled:opacity-50 transition-colors"
          >
            {aiGenerating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            AI推薦を生成
          </button>
          <button
            type="button"
            onClick={() => setQuickDraft(true)}
            title="ドラフトとして追加（名前とEXEのみ）"
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/[0.10] text-sm font-medium hover:bg-white/10 hover:text-foreground transition-colors text-muted-foreground"
          >
            <FilePlus size={14} />
            ドラフト追加
          </button>
          <button
            type="button"
            onClick={() => setModal({})}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 text-sm font-bold hover:brightness-110 transition-all active:scale-[0.97]"
          >
            <Plus size={14} />
            新規作成
          </button>
        </div>
      </div>

      {/* Apply log */}
      {applyLog && (
        <div className={`rounded-xl border p-4 text-sm ${applyLog.ok ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400" : "bg-red-500/10 border-red-500/25 text-red-400"}`}>
          <div className="flex justify-between items-start gap-2">
            <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed">{applyLog.log}</pre>
            <button type="button" onClick={() => setApplyLog(null)} aria-label="閉じる" className="shrink-0 hover:opacity-70">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* AI log */}
      {aiLog && (
        <div className={`rounded-xl border px-4 py-3 text-sm flex items-start justify-between gap-2 ${
          aiLog.ok ? "bg-purple-500/10 border-purple-500/25 text-purple-300" : "bg-red-500/10 border-red-500/25 text-red-400"
        }`}>
          <span>{aiLog.msg}</span>
          <button type="button" onClick={() => setAiLog(null)} aria-label="閉じる" className="shrink-0 hover:opacity-70">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center flex-1 text-muted-foreground gap-2">
          <Loader2 size={16} className="animate-spin text-cyan-400" />
          <span className="text-sm">読み込み中…</span>
        </div>
      ) : profiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 text-muted-foreground">
          <BookMarked size={40} strokeWidth={1} className="text-muted-foreground/30" />
          <p className="text-sm">プロファイルがありません</p>
          <button
            type="button"
            onClick={() => setModal({})}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 text-sm font-bold hover:brightness-110 transition-all active:scale-[0.97]"
          >
            <Plus size={14} />
            最初のプロファイルを作成
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {profiles.map((p) => (
            <ProfileCard
              key={p.id}
              profile={p}
              onEdit={() => setModal(p)}
              onDelete={() => handleDelete(p.id)}
              onApply={() => handleApply(p.id)}
              applying={applyingId === p.id}
              isActive={activeProfileId === p.id}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {modal !== null && (
        <ProfileModal
          initial={modal}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
      {quickDraft && (
        <QuickDraftModal
          onSave={(p) => { handleSave(p); setQuickDraft(false); }}
          onClose={() => setQuickDraft(false)}
        />
      )}
    </div>
  );
}

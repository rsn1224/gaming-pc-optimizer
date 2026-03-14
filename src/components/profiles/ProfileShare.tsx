import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Share2, Download, Upload, Package } from "lucide-react";
import { toast } from "@/stores/useToastStore";
import type { GameProfile } from "@/types";

function downloadFile(content: string, filename: string, mimeType = "application/json") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ProfileShare() {
  const [profiles, setProfiles] = useState<GameProfile[]>([]);
  const [importing, setImporting] = useState(false);
  const [exportingAll, setExportingAll] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    invoke<GameProfile[]>("list_profiles")
      .then(setProfiles)
      .catch(() => {});
  }, []);

  const handleExport = async (profile: GameProfile) => {
    setExportingId(profile.id);
    try {
      const json = await invoke<string>("export_profile_share", {
        profileId: profile.id,
      });
      const safeName = profile.name.replace(/[^a-zA-Z0-9_\-]/g, "_");
      downloadFile(json, `profile-${safeName}.json`);
      toast.success(`プロファイル "${profile.name}" をエクスポートしました`);
    } catch (e) {
      toast.error(`エクスポート失敗: ${e}`);
    } finally {
      setExportingId(null);
    }
  };

  const handleExportAll = async () => {
    setExportingAll(true);
    try {
      const json = await invoke<string>("export_all_profiles_share");
      downloadFile(json, "all-profiles-bundle.json");
      toast.success("全プロファイルをエクスポートしました");
    } catch (e) {
      toast.error(`エクスポート失敗: ${e}`);
    } finally {
      setExportingAll(false);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const profileName = await invoke<string>("import_profile_share", {
        json: text,
      });
      toast.success(`プロファイル "${profileName}" をインポートしました`);
      // Refresh profiles list
      const updated = await invoke<GameProfile[]>("list_profiles");
      setProfiles(updated);
    } catch (e) {
      toast.error(`インポート失敗: ${e}`);
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <Share2 size={17} className="text-cyan-400" />
          <h1 className="text-lg font-semibold text-white">プロファイル共有</h1>
        </div>
        <button
          type="button"
          onClick={handleExportAll}
          disabled={exportingAll || profiles.length === 0}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 transition-colors disabled:opacity-50"
        >
          <Package size={13} />
          {exportingAll ? "エクスポート中..." : "全プロファイルをエクスポート"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Format explanation */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
          <p className="text-sm font-medium text-white mb-2">共有フォーマットについて</p>
          <p className="text-xs text-white/50 leading-relaxed">
            プロファイルは <code className="text-cyan-400 bg-white/[0.05] px-1 rounded">gaming-pc-optimizer-profile-v1</code> スキーマの JSON ファイルとしてエクスポートされます。
            他のユーザーはこのファイルをインポートして同じ設定を即座に適用できます。
          </p>
        </div>

        {/* Profile list for export */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
          <p className="text-sm font-medium text-white mb-3">プロファイル一覧</p>
          {profiles.length === 0 ? (
            <p className="text-xs text-white/40">プロファイルがありません</p>
          ) : (
            <div className="space-y-2">
              {profiles.map((profile) => (
                <div
                  key={profile.id}
                  className="flex items-center justify-between py-2 px-3 rounded-xl bg-white/[0.03] border border-white/[0.04]"
                >
                  <div>
                    <p className="text-sm font-medium text-white">{profile.name}</p>
                    <p className="text-[11px] text-white/40 mt-0.5">
                      {profile.exe_path || "パス未設定"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleExport(profile)}
                    disabled={exportingId === profile.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.04] border border-white/[0.12] text-white/70 hover:text-white hover:bg-white/[0.08] transition-colors disabled:opacity-50"
                  >
                    <Download size={12} />
                    {exportingId === profile.id ? "処理中..." : "エクスポート"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Import section */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
          <p className="text-sm font-medium text-white mb-3">プロファイルをインポート</p>
          <p className="text-xs text-white/40 mb-3">
            他のユーザーからエクスポートされた JSON ファイルを選択してインポートします。
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImportFile}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-white/[0.04] border border-white/[0.12] text-white/70 hover:text-white hover:bg-white/[0.08] transition-colors disabled:opacity-50"
          >
            <Upload size={14} />
            {importing ? "インポート中..." : "JSONファイルを選択"}
          </button>
        </div>
      </div>
    </div>
  );
}

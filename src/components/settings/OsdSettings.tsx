import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Monitor } from "lucide-react";
import { toast } from "@/stores/useToastStore";

export function OsdSettings() {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    invoke<boolean>("is_osd_visible")
      .then(setVisible)
      .catch(() => {});
  }, []);

  const toggle = async () => {
    setLoading(true);
    try {
      if (visible) {
        await invoke("hide_osd_window");
        setVisible(false);
        toast.success("OSDを非表示にしました");
      } else {
        await invoke("show_osd_window");
        setVisible(true);
        toast.success("OSDを表示しました");
      }
    } catch (e) {
      toast.error(`OSD操作失敗: ${e}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <Monitor size={17} className="text-cyan-400" />
          <h1 className="text-lg font-semibold text-white">OSDウィジェット</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Description */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-white mb-1">
            On-Screen Display (OSD)
          </h2>
          <p className="text-xs text-white/50 leading-relaxed">
            画面上に常時表示されるフローティングウィジェットです。CPU・RAM・GPU温度・FPS・帯域幅をリアルタイムで確認できます。
            ドラッグで位置を変更できます。
          </p>
        </div>

        {/* Toggle */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">OSDウィジェット</p>
            <p className="text-xs text-white/40 mt-0.5">
              現在:{" "}
              <span className={visible ? "text-cyan-400" : "text-white/30"}>
                {visible ? "表示中" : "非表示"}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={toggle}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 transition-colors disabled:opacity-50"
          >
            {loading ? "処理中..." : visible ? "OSDを非表示" : "OSDを表示"}
          </button>
        </div>

        {/* Preview */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
          <p className="text-sm font-medium text-white mb-3">プレビュー</p>
          <div className="inline-block w-[220px] rounded-xl border border-white/10 bg-black/60 p-3">
            <p className="text-[10px] text-white/40 uppercase tracking-widest mb-2">
              Gaming PC Optimizer
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {[
                ["CPU", "45.2%"],
                ["RAM", "62.1%"],
                ["GPU°", "72°C"],
                ["FPS", "144"],
                ["DL", "1024 KB/s"],
                ["UL", "256 KB/s"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-[10px] text-white/50">{label}</span>
                  <span className="text-[11px] font-mono text-cyan-400">
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
          <p className="text-sm font-medium text-white mb-2">表示内容</p>
          <ul className="space-y-1">
            {[
              "CPU 使用率 (%)",
              "RAM 使用率 (%)",
              "GPU 温度 (°C)",
              "FPS 推定値",
              "ダウンロード速度 (KB/s)",
              "アップロード速度 (KB/s)",
            ].map((item) => (
              <li key={item} className="flex items-center gap-2 text-xs text-white/50">
                <span className="w-1 h-1 rounded-full bg-cyan-400/60 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

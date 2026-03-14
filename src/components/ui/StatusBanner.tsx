/**
 * StatusBanner — アクション結果の共通インラインバナー
 *
 * NetworkDiagnosticsPanel / NetworkSettingsPanel / NetworkOptimizer で
 * それぞれローカル定義されていた `StatusMessage` コンポーネントを共通化。
 *
 * [Phase C] UI/IA 再編 Phase C で導入。
 * 既存の StatusMessage はこのコンポーネントに置き換え可能（同一シグネチャ）。
 */

import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { ActionStatus } from "@/types";

interface StatusBannerProps {
  status: ActionStatus;
  message: string;
}

export function StatusBanner({ status, message }: StatusBannerProps) {
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
          {status === "error"   && <XCircle      size={13} className="shrink-0 mt-0.5" />}
          {status === "running" && <Loader2      size={13} className="animate-spin shrink-0 mt-0.5" />}
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

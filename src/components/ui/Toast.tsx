import { X, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useToastStore, type ToastType } from "@/stores/useToastStore";
import { cn } from "@/lib/utils";

const STYLES: Record<ToastType, { border: string; icon: React.ReactNode }> = {
  error: {
    border: "border-red-500/40",
    icon: <AlertCircle size={15} className="text-red-400 shrink-0 mt-0.5" />,
  },
  success: {
    border: "border-emerald-500/40",
    icon: <CheckCircle2 size={15} className="text-emerald-400 shrink-0 mt-0.5" />,
  },
  info: {
    border: "border-cyan-500/40",
    icon: <Info size={15} className="text-cyan-400 shrink-0 mt-0.5" />,
  },
};

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const { border, icon } = STYLES[t.type];
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 40, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.95 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className={cn(
                "flex items-start gap-2.5 bg-[#05080c] border rounded-xl px-3.5 py-3",
                "shadow-[0_4px_24px_rgba(0,0,0,0.6)] text-[13px] text-slate-200",
                border
              )}
            >
              {icon}
              <p className="flex-1 leading-snug">{t.message}</p>
              <button
                type="button"
                onClick={() => removeToast(t.id)}
                className="text-muted-foreground/50 hover:text-slate-300 transition-colors shrink-0"
              >
                <X size={13} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

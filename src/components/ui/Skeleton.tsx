import { cn } from "@/lib/utils";

/** ベーススケルトン — シマーアニメーション */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("skeleton-shimmer rounded-lg", className)} />
  );
}

/** カード型スケルトン */
export function SkeletonCard({ rows = 2 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2.5">
      <Skeleton className="h-4 w-2/3" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-3 w-full" />
      ))}
    </div>
  );
}

/** バー型スケルトン */
export function SkeletonBar({ label = true }: { label?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <Skeleton className="h-2.5 w-1/4" />}
      <Skeleton className="h-1.5 w-full rounded-full" />
    </div>
  );
}

/** インサイトパネル用スケルトン */
export function SkeletonInsight() {
  return (
    <div className="shrink-0 mx-4 mt-3 mb-1 panel-hud px-4 py-3 flex items-center gap-4">
      <Skeleton className="h-8 w-8 rounded-lg" />
      <div className="flex flex-col gap-1.5 flex-1">
        <Skeleton className="h-2 w-1/4" />
        <Skeleton className="h-5 w-1/2" />
      </div>
      <Skeleton className="h-7 w-24 rounded-lg" />
    </div>
  );
}

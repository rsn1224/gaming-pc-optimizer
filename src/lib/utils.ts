import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMemory(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb.toFixed(0)} MB`;
}

export function getUsageColor(percent: number): string {
  if (percent < 50) return "text-green-400";
  if (percent < 80) return "text-yellow-400";
  return "text-red-400";
}

export function getUsageBarColor(percent: number): string {
  if (percent < 50) return "bg-green-500";
  if (percent < 80) return "bg-yellow-500";
  return "bg-red-500";
}

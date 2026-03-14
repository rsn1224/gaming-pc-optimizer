// ── Hardware vendor logo utilities ────────────────────────────────────────────
// Logos are bundled SVGs in /public/icons/ — no network requests.

type Vendor = "nvidia" | "amd" | "intel" | null;

function detectGpuVendor(name: string | undefined | null): Vendor {
  if (!name) return null;
  const n = name.toLowerCase();
  if (n.includes("nvidia") || n.includes("geforce") || n.includes("rtx") || n.includes("gtx") || n.includes("quadro")) return "nvidia";
  if (n.includes("amd") || n.includes("radeon") || n.includes("rx ") || n.includes("vega")) return "amd";
  if (n.includes("intel") || n.includes("arc") || n.includes("iris") || n.includes("uhd")) return "intel";
  return null;
}

function detectCpuVendor(name: string | undefined | null): Vendor {
  if (!name) return null;
  const n = name.toLowerCase();
  // AMD first — "12-Core Processor" also contains "core", so check AMD before Intel
  if (n.includes("amd") || n.includes("ryzen") || n.includes("threadripper") || n.includes("epyc") || n.includes("authenticamd")) return "amd";
  // "core" removed — too generic (AMD CPUs include "8-Core Processor" etc.)
  if (n.includes("intel") || n.includes("genuineintel") || n.includes("xeon") || n.includes("celeron") || n.includes("pentium")) return "intel";
  return null;
}

const VENDOR_LOGO: Record<NonNullable<Vendor>, string> = {
  nvidia: "/icons/brand-nvidia.svg",
  amd:    "/icons/brand-amd.svg",
  intel:  "/icons/brand-intel.svg",
};

/** Icon container CSS classes, keyed by vendor — brand-tinted background */
export const VENDOR_ICON_BOX: Record<NonNullable<Vendor>, string> = {
  nvidia: "bg-[#76B900]/15 border-[#76B900]/30 shadow-[0_0_10px_rgba(118,185,0,0.15)]",
  amd:    "bg-red-500/15 border-red-500/30 shadow-[0_0_10px_rgba(237,28,36,0.15)]",
  intel:  "bg-blue-500/15 border-blue-500/30 shadow-[0_0_10px_rgba(0,113,197,0.15)]",
};

export const DEFAULT_ICON_BOX =
  "bg-gradient-to-br from-cyan-500/20 to-blue-500/10 border-cyan-500/25 shadow-[0_0_10px_rgba(34,211,238,0.1)]";

// ── Motherboard vendor ────────────────────────────────────────────────────────

export type MbVendor = "asus" | "gigabyte" | "msi" | "asrock" | "evga" | "biostar";

export const MB_VENDOR_CONFIG: Record<MbVendor, { label: string; abbr: string; box: string; text: string }> = {
  asus:     { label: "ASUS",     abbr: "AS", box: "bg-[#4FA0D1]/15 border-[#4FA0D1]/30", text: "text-[#4FA0D1]" },
  gigabyte: { label: "Gigabyte", abbr: "GB", box: "bg-red-500/15 border-red-500/30",      text: "text-red-400" },
  msi:      { label: "MSI",      abbr: "MS", box: "bg-rose-600/15 border-rose-600/30",    text: "text-rose-400" },
  asrock:   { label: "ASRock",   abbr: "AR", box: "bg-blue-600/15 border-blue-600/30",    text: "text-blue-400" },
  evga:     { label: "EVGA",     abbr: "EV", box: "bg-cyan-500/15 border-cyan-500/30",    text: "text-cyan-400" },
  biostar:  { label: "Biostar",  abbr: "BI", box: "bg-amber-500/15 border-amber-500/30",  text: "text-amber-400" },
};

export function detectMbVendor(manufacturer: string | undefined | null): MbVendor | null {
  if (!manufacturer) return null;
  const m = manufacturer.toLowerCase();
  if (m.includes("asus"))     return "asus";
  if (m.includes("gigabyte")) return "gigabyte";
  if (m.includes("msi") || m.includes("micro-star")) return "msi";
  if (m.includes("asrock"))   return "asrock";
  if (m.includes("evga"))     return "evga";
  if (m.includes("biostar"))  return "biostar";
  return null;
}

export function getGpuVendorLogo(name: string | undefined | null): { src: string; vendor: NonNullable<Vendor> } | null {
  const vendor = detectGpuVendor(name);
  if (!vendor) return null;
  return { src: VENDOR_LOGO[vendor], vendor };
}

export function getCpuVendorLogo(name: string | undefined | null): { src: string; vendor: NonNullable<Vendor> } | null {
  const vendor = detectCpuVendor(name);
  if (!vendor) return null;
  return { src: VENDOR_LOGO[vendor], vendor };
}

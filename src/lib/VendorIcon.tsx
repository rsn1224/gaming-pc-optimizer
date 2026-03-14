// ── Inline SVG vendor logo components ────────────────────────────────────────
// No external file loading — always renders reliably in Tauri webview.

import type { MbVendor } from "@/lib/hardwareIcons";

export type VendorKey = "nvidia" | "amd" | "intel";

interface Props {
  vendor: VendorKey;
  className?: string;
}

export function VendorIcon({ vendor, className = "w-4 h-4" }: Props) {
  if (vendor === "nvidia") {
    return (
      <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden>
        {/* N letterform — two verticals + diagonal */}
        <path fill="#76B900" d="M4 4v16h3V9l10 11h3V4h-3v11L7 4z" />
      </svg>
    );
  }
  if (vendor === "amd") {
    return (
      <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden>
        {/* Right-pointing arrow mark */}
        <path fill="#ED1C24" d="M3 12L13 4v5h8v6h-8v5z" />
      </svg>
    );
  }
  // intel
  return (
    <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <circle cx="12" cy="5" r="2" fill="#0071C5" />
      <rect x="10" y="9" width="4" height="12" rx="2" fill="#0071C5" />
    </svg>
  );
}

// ── Motherboard brand icon ────────────────────────────────────────────────────
// Shows a stylized circuit-board chip with 2-letter abbreviation.

const MB_COLORS: Record<MbVendor, string> = {
  asus:     "#4FA0D1",
  gigabyte: "#E31B23",
  msi:      "#C8102E",
  asrock:   "#3B6EBF",
  evga:     "#31A1EC",
  biostar:  "#F59E0B",
};

const MB_ABBR: Record<MbVendor, string> = {
  asus:     "AS",
  gigabyte: "GB",
  msi:      "MS",
  asrock:   "AR",
  evga:     "EV",
  biostar:  "BI",
};

interface MbProps {
  vendor: MbVendor;
  className?: string;
}

export function MbVendorIcon({ vendor, className = "w-4 h-4" }: MbProps) {
  const color = MB_COLORS[vendor];
  const abbr = MB_ABBR[vendor];
  return (
    <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden>
      {/* PCB chip outline */}
      <rect x="5" y="5" width="14" height="14" rx="2" fill="none" stroke={color} strokeWidth="1.5" />
      {/* Pin stubs */}
      <line x1="8"  y1="5"  x2="8"  y2="3"  stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="12" y1="5"  x2="12" y2="3"  stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="16" y1="5"  x2="16" y2="3"  stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="8"  y1="19" x2="8"  y2="21" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="12" y1="19" x2="12" y2="21" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="16" y1="19" x2="16" y2="21" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      {/* Abbreviation */}
      <text
        x="12" y="15.5"
        textAnchor="middle"
        fontSize="7"
        fontWeight="bold"
        fontFamily="system-ui, sans-serif"
        fill={color}
      >
        {abbr}
      </text>
    </svg>
  );
}

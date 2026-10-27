import type { CSSProperties, ReactNode } from "react";
import { clsx } from "clsx";

// Hand-built SVG artwork for the public site. Style rules: 1.75px ink outline,
// flat accent fill printed slightly off-register (like a two-colour risograph),
// no gradients. Everything is decorative (aria-hidden) unless stated.

export type DeptKey = "gst" | "income-tax" | "tds" | "audit" | "accounts" | "registrations" | "roc" | "payroll" | "msme" | "other";

export function deptKey(name: string): DeptKey {
  const n = name.toLowerCase();
  if (n.includes("gst")) return "gst";
  if (n.includes("income")) return "income-tax";
  if (n.includes("tds")) return "tds";
  if (n.includes("audit")) return "audit";
  if (n.includes("account")) return "accounts";
  if (n.includes("registration") || n.includes("certificate")) return "registrations";
  if (n.includes("roc")) return "roc";
  if (n.includes("esi") || n.includes("epf") || n.includes("pf")) return "payroll";
  if (n.includes("msme")) return "msme";
  return "other";
}

/** Accent per department: [fill, soft background, readable text]. */
export const DEPT_TONE: Record<DeptKey, { fill: string; soft: string; text: string }> = {
  gst: { fill: "#d9531f", soft: "#f6dfd3", text: "#a8380f" },
  "income-tax": { fill: "#3a6ea5", soft: "#dde7f3", text: "#244f80" },
  tds: { fill: "#e3a21a", soft: "#fbeccb", text: "#8a5a00" },
  audit: { fill: "#2f6b4f", soft: "#dcece2", text: "#245640" },
  accounts: { fill: "#1f8a8a", soft: "#d7eeec", text: "#166a6a" },
  registrations: { fill: "#9b5a3c", soft: "#f0e2d8", text: "#7a4128" },
  roc: { fill: "#5b6b82", soft: "#e2e6ec", text: "#3f4c60" },
  payroll: { fill: "#c2457a", soft: "#f6dde7", text: "#9a2f5d" },
  msme: { fill: "#6f8f2a", soft: "#e7efd5", text: "#4f6a17" },
  other: { fill: "#5d6470", soft: "#efede8", text: "#3f4650" },
};

const ink = { fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** Department illustration, 64×64. */
export function DeptIcon({ name, className, style }: { name: string; className?: string; style?: CSSProperties }) {
  const k = deptKey(name);
  const f = DEPT_TONE[k].fill;
  return (
    <svg viewBox="0 0 64 64" className={clsx("text-ink", className)} style={style} aria-hidden>
      {k === "gst" && (
        <>
          <rect x="17" y="13" width="32" height="40" rx="3" fill={f} opacity=".9" />
          <path {...ink} d="M14 10h26l8 8v36H14z M40 10v8h8" />
          <path {...ink} d="M20 26h20M20 32h20M20 38h12" />
          <circle {...ink} cx="42" cy="44" r="6" />
          <path {...ink} d="M39.5 44l2 2 3.5-4" />
        </>
      )}
      {k === "income-tax" && (
        <>
          <path d="M14 50h38V28L33 16 14 28z" fill={f} opacity=".9" transform="translate(3 3)" />
          <path {...ink} d="M12 48h40M14 48V28l18-12 18 12v20" />
          <path {...ink} d="M22 48V32M32 48V32M42 48V32M18 28h28" />
          <path {...ink} d="M27 22h10" />
        </>
      )}
      {k === "tds" && (
        <>
          <circle cx="35" cy="35" r="17" fill={f} opacity=".9" />
          <circle {...ink} cx="32" cy="32" r="17" />
          <path {...ink} d="M32 15v17l11 6" />
          <path {...ink} d="M25 22h9M25 26h9M25 22c6 0 6 8 0 8l9 9" />
        </>
      )}
      {k === "audit" && (
        <>
          <circle cx="31" cy="31" r="13" fill={f} opacity=".9" />
          <circle {...ink} cx="28" cy="28" r="13" />
          <path {...ink} d="M37.5 37.5L50 50" strokeWidth={3.5} />
          <path {...ink} d="M22 28l4 4 8-9" />
        </>
      )}
      {k === "accounts" && (
        <>
          <rect x="16" y="15" width="34" height="38" rx="3" fill={f} opacity=".9" />
          <rect {...ink} x="13" y="12" width="34" height="38" rx="3" />
          <path {...ink} d="M21 12v38M26 21h15M26 27h15M26 33h15M26 39h9" />
          <path {...ink} d="M41 46l9-9 3 3-9 9h-3z" />
        </>
      )}
      {k === "registrations" && (
        <>
          <rect x="13" y="19" width="40" height="28" rx="3" fill={f} opacity=".9" />
          <rect {...ink} x="10" y="16" width="40" height="28" rx="3" />
          <circle {...ink} cx="21" cy="28" r="5" />
          <path {...ink} d="M15 38c2-3 10-3 12 0M32 25h12M32 30h12M32 35h7" />
          <path {...ink} d="M44 44l4 10 2-4 4 1-4-9" />
        </>
      )}
      {k === "roc" && (
        <>
          <rect x="15" y="21" width="36" height="30" rx="2" fill={f} opacity=".9" />
          <path {...ink} d="M12 18h36v30H12zM12 26h36M20 18v-5h20v5" />
          <path {...ink} d="M20 34h10M20 40h16" />
        </>
      )}
      {k === "payroll" && (
        <>
          <circle cx="27" cy="27" r="8" fill={f} opacity=".9" />
          <path d="M14 51c0-10 6-15 13-15s13 5 13 15z" fill={f} opacity=".9" />
          <circle {...ink} cx="24" cy="24" r="8" />
          <path {...ink} d="M11 48c0-10 6-15 13-15s13 5 13 15" />
          <path {...ink} d="M42 22h10M42 28h10M42 34h6" />
        </>
      )}
      {k === "msme" && (
        <>
          <path d="M14 52V30l12 8V30l12 8V22h12v30z" fill={f} opacity=".9" transform="translate(3 2)" />
          <path {...ink} d="M12 50V28l12 8v-8l12 8V20h12v30zM8 50h46" />
        </>
      )}
      {k === "other" && (
        <>
          <rect x="16" y="16" width="34" height="34" rx="4" fill={f} opacity=".9" />
          <rect {...ink} x="13" y="13" width="34" height="34" rx="4" />
          <path {...ink} d="M22 30h16M30 22v16" />
        </>
      )}
    </svg>
  );
}

/** Circular rubber stamp with ink texture. */
export function Stamp({ top, bottom, center, sub, color = "#c8441c", className, style, id = "s" }: {
  top: string; bottom: string; center: string; sub?: string; color?: string; className?: string; style?: CSSProperties; id?: string;
}) {
  return (
    <svg viewBox="0 0 200 200" className={className} style={style} aria-hidden>
      <defs>
        <filter id={`${id}-rough`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" />
          <feDisplacementMap in="SourceGraphic" scale="3" />
        </filter>
        <mask id={`${id}-wear`}>
          <rect width="200" height="200" fill="#fff" />
          <filter id={`${id}-speck`}><feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="1" seed="3" /><feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -9 4.2" /></filter>
          <rect width="200" height="200" filter={`url(#${id}-speck)`} />
        </mask>
        <path id={`${id}-arc-top`} d="M30 100a70 70 0 0 1 140 0" />
        <path id={`${id}-arc-bot`} d="M24 100a76 76 0 0 0 152 0" />
      </defs>
      <g filter={`url(#${id}-rough)`} mask={`url(#${id}-wear)`} fill={color} stroke={color}>
        <circle cx="100" cy="100" r="94" fill="none" strokeWidth="5" />
        <circle cx="100" cy="100" r="84" fill="none" strokeWidth="1.5" />
        <circle cx="100" cy="100" r="52" fill="none" strokeWidth="1.5" />
        <text fontFamily="var(--font-geist-mono), monospace" fontSize="15" fontWeight="700" letterSpacing="3" stroke="none">
          <textPath href={`#${id}-arc-top`} startOffset="50%" textAnchor="middle">{top}</textPath>
        </text>
        <text fontFamily="var(--font-geist-mono), monospace" fontSize="13" fontWeight="700" letterSpacing="3" stroke="none">
          <textPath href={`#${id}-arc-bot`} startOffset="50%" textAnchor="middle" dominantBaseline="hanging">{bottom}</textPath>
        </text>
        <text x="100" y={sub ? 104 : 110} textAnchor="middle" fontFamily="var(--font-instrument), serif" fontSize="30" stroke="none">{center}</text>
        {sub && <text x="100" y="124" textAnchor="middle" fontFamily="var(--font-geist-mono), monospace" fontSize="10" fontWeight="700" letterSpacing="2" stroke="none">{sub}</text>}
        <path d="M18 100h10M172 100h10" strokeWidth="2" />
      </g>
    </svg>
  );
}

/** Hand-drawn underline that draws itself. Put inside a relatively positioned inline element. */
export function Scribble({ className, delay = 900, color = "currentColor" }: { className?: string; delay?: number; color?: string }) {
  return (
    <svg viewBox="0 0 300 24" preserveAspectRatio="none" className={clsx("pointer-events-none absolute -bottom-2 left-0 h-[0.4em] w-full", className)} aria-hidden>
      <path className="pub-draw" pathLength={1} style={{ "--d": `${delay}ms` } as CSSProperties}
        d="M4 16c40-8 90-11 140-9 52 2 98 5 150-2M30 20c60-5 140-6 236-3" fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}

/** Loose hand-drawn arrow, for annotations. */
export function DoodleArrow({ className, flip }: { className?: string; flip?: boolean }) {
  return (
    <svg viewBox="0 0 120 80" className={className} style={flip ? { transform: "scaleX(-1)" } : undefined} aria-hidden>
      <path className="pub-draw" pathLength={1} style={{ "--d": "1500ms" } as CSSProperties} d="M8 10c18 42 52 58 96 52" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path className="pub-draw" pathLength={1} style={{ "--d": "2300ms" } as CSSProperties} d="M90 50l15 12-17 8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Paperclip({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 64" className={className} aria-hidden>
      <path d="M17 18v30a6 6 0 0 1-12 0V12a4 4 0 0 1 8 0v34a2 2 0 0 1-4 0V18" fill="none" stroke="#8b8f97" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

/** A small eight-point mark used as a separator (Indian jaali-inspired). */
export function Star({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M12 1l2.6 6.3L21 4.9l-2.4 6.4L23 12l-4.4 0.7L21 19.1l-6.4-2.4L12 23l-2.6-6.3L3 19.1l2.4-6.4L1 12l4.4-0.7L3 4.9l6.4 2.4z" fill="currentColor" />
    </svg>
  );
}

/**
 * Stylised (not to scale) map of the office's surroundings in Naraina Industrial
 * Area Phase-I, with the landmark from the firm's letterhead.
 */
export function OfficeMap({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 260" className={className} role="img" aria-label="Illustrated map: the office at B-191, Phase-I, Naraina Industrial Area, near Bikanerwala Sweets">
      <rect width="400" height="260" fill="#ece6d8" />
      <g fill="#e2dacb">
        {[0, 1, 2, 3].map((r) => [0, 1, 2, 3, 4].map((c) => <rect key={`${r}-${c}`} x={14 + c * 78} y={12 + r * 62} width="64" height="46" rx="4" />))}
      </g>
      <g stroke="#f5f1e8" strokeWidth="12" fill="none">
        <path d="M0 66h400M0 128h400M0 190h400M85 0v260M163 0v260M241 0v260M319 0v260" />
      </g>
      <path d="M-10 236C80 220 150 250 230 232s120-28 190-18" stroke="#fff" strokeWidth="18" fill="none" />
      <path d="M-10 236C80 220 150 250 230 232s120-28 190-18" stroke="#e3a21a" strokeWidth="2" strokeDasharray="10 8" fill="none" />
      <text x="20" y="226" fontFamily="var(--font-geist-mono), monospace" fontSize="9" fill="#8a5a00">RING ROAD SIDE</text>
      <rect x="174" y="76" width="56" height="42" rx="4" fill="#dcece2" stroke="#2f6b4f" strokeWidth="1.2" />
      <text x="202" y="101" textAnchor="middle" fontFamily="var(--font-geist-mono), monospace" fontSize="8" fill="#245640">PHASE-I</text>
      <g transform="translate(262 140)">
        <rect width="52" height="26" rx="3" fill="#fbeccb" stroke="#8a5a00" strokeWidth="1" />
        <text x="26" y="11" textAnchor="middle" fontFamily="var(--font-geist-mono), monospace" fontSize="6.5" fill="#8a5a00">BIKANERWALA</text>
        <text x="26" y="20" textAnchor="middle" fontFamily="var(--font-geist-mono), monospace" fontSize="6.5" fill="#8a5a00">SWEETS</text>
      </g>
      <path d="M248 112c4 12 10 20 18 28" stroke="#0f1d33" strokeWidth="1.5" strokeDasharray="3 4" fill="none" />
      <g transform="translate(236 104)">
        <circle className="pub-ring" r="10" fill="#d9531f" opacity=".5" />
        <g className="pub-pin">
          <path d="M0 0c-9-12-14-18-14-25a14 14 0 0 1 28 0c0 7-5 13-14 25z" fill="#d9531f" stroke="#0f1d33" strokeWidth="1.5" />
          <circle cy="-25" r="5" fill="#f5f1e8" />
        </g>
      </g>
      <g transform="translate(150 22)">
        <rect width="104" height="22" rx="11" fill="#0f1d33" />
        <text x="52" y="15" textAnchor="middle" fontFamily="var(--font-geist-mono), monospace" fontSize="9.5" fill="#f5f1e8">B-191 · 2nd floor</text>
      </g>
      <g transform="translate(372 30)" fontFamily="var(--font-geist-mono), monospace" fontSize="9" fill="#5d6470">
        <path d="M0 10V-6M-5 0l5-7 5 7" stroke="#5d6470" strokeWidth="1.4" fill="none" />
        <text x="0" y="22" textAnchor="middle">N</text>
      </g>
    </svg>
  );
}

/** Illustrated ledger sheet used in the hero and auth panels. Figures are illustrative. */
export function LedgerCard({ className, children }: { className?: string; children?: ReactNode }) {
  const rows: [string, string, string][] = [
    ["01 Oct", "Opening balance", "4,82,150"],
    ["03 Oct", "Sales — Inv. 1142", "1,26,400"],
    ["07 Oct", "TDS deposit", "18,240"],
    ["11 Oct", "GSTR-1 filed", "—"],
    ["20 Oct", "GSTR-3B · tax paid", "42,980"],
  ];
  return (
    <div className={clsx("pub-ledger overflow-hidden rounded-[10px] border border-ink/15 shadow-[0_30px_60px_-30px_rgb(15_29_51/.45)]", className)} style={{ "--margin": "52px" } as CSSProperties}>
      <div className="flex items-center justify-between border-b border-ink/10 bg-night px-4 py-2.5 text-paper">
        <span className="font-mono text-[11px] opacity-80">LEDGER · FY 2026-27</span>
        <span className="flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="size-1.5 rounded-full bg-paper/40" />)}</span>
      </div>
      <div className="px-4 pb-3 pt-1 font-mono text-[11.5px] leading-8 text-ink/80">
        {rows.map(([d, t, a], i) => (
          <div key={d} className="grid grid-cols-[42px_1fr_auto] gap-3" style={{ animation: `pub-in 700ms var(--ease-out-expo) ${500 + i * 120}ms both` }}>
            <span className="text-muted">{d}</span>
            <span className="truncate">{t}</span>
            <span className="tabular-nums">{a}</span>
          </div>
        ))}
        <div className="mt-1 grid grid-cols-[42px_1fr_auto] gap-3 border-t-[3px] border-double border-ink/40 pt-0.5 font-semibold text-ink">
          <span />
          <span>Balanced</span>
          <span className="text-ledger">✓</span>
        </div>
      </div>
      {children}
    </div>
  );
}

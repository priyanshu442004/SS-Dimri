// Small two-colour illustrations for empty states (decorative). Same style as the
// public site: 1.75px ink outline, flat accent fill printed slightly off-register.

export type EmptyKind = "inbox" | "tasks" | "clients" | "documents" | "calendar" | "search" | "people" | "chart" | "done";

const ink = { fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export function EmptyArt({ kind = "inbox", className = "h-20 w-24" }: { kind?: EmptyKind; className?: string }) {
  return (
    <svg viewBox="0 0 96 80" className={`text-ink ${className}`} aria-hidden>
      <ellipse cx="48" cy="72" rx="30" ry="3" fill="#1b1f24" opacity=".06" />
      {kind === "inbox" && (
        <>
          <path d="M20 40l8-22h40l8 22v22H20z" fill="#fbeccb" transform="translate(3 3)" />
          <path {...ink} d="M18 40l8-22h40l8 22v22H18zM18 40h18l4 8h16l4-8h18" />
        </>
      )}
      {kind === "tasks" && (
        <>
          <rect x="27" y="13" width="44" height="54" rx="4" fill="#dcece2" />
          <rect {...ink} x="24" y="10" width="44" height="54" rx="4" />
          <path {...ink} d="M32 24l3 3 6-6M46 24h14M32 38l3 3 6-6M46 38h14M33 52h6M46 52h10" />
        </>
      )}
      {kind === "clients" && (
        <>
          <path d="M22 64V30l16-10 16 10v34z M54 64V38h22v26z" fill="#dde7f3" transform="translate(3 3)" />
          <path {...ink} d="M20 62V28l16-10 16 10v34M52 62V36h22v26M14 62h66M28 34h4M40 34h4M28 44h4M40 44h4M60 44h6M60 52h6" />
        </>
      )}
      {kind === "documents" && (
        <>
          <path d="M30 14h26l10 10v40H30z" fill="#f6dfd3" transform="translate(3 3)" />
          <path {...ink} d="M28 12h26l10 10v40H28zM54 12v10h10M35 32h22M35 40h22M35 48h14" />
          <path {...ink} d="M22 20v46h32" opacity=".5" />
        </>
      )}
      {kind === "calendar" && (
        <>
          <rect x="23" y="19" width="50" height="46" rx="5" fill="#fbeccb" />
          <rect {...ink} x="20" y="16" width="50" height="46" rx="5" />
          <path {...ink} d="M20 28h50M32 10v10M58 10v10" />
          <circle cx="45" cy="45" r="5" fill="#d9531f" />
        </>
      )}
      {kind === "search" && (
        <>
          <circle cx="45" cy="37" r="17" fill="#dde7f3" />
          <circle {...ink} cx="42" cy="34" r="17" />
          <path {...ink} d="M54.5 46.5L68 60" strokeWidth={3.5} />
          <path {...ink} d="M36 34h12" />
        </>
      )}
      {kind === "people" && (
        <>
          <circle cx="39" cy="31" r="9" fill="#f6dde7" />
          <path d="M23 64c0-11 7-17 16-17s16 6 16 17z" fill="#f6dde7" />
          <circle {...ink} cx="36" cy="28" r="9" />
          <path {...ink} d="M20 62c0-11 7-17 16-17s16 6 16 17M58 30a7 7 0 1 1 0 14M62 50c6 2 10 6 10 12" />
        </>
      )}
      {kind === "chart" && (
        <>
          <path d="M24 60V44h10v16zM40 60V30h10v30zM56 60V38h10v22z" fill="#dcece2" transform="translate(3 2)" />
          <path {...ink} d="M16 62h64M22 60V44h10v16zM38 60V30h10v30zM54 60V38h10v22z" />
        </>
      )}
      {kind === "done" && (
        <>
          <circle cx="51" cy="39" r="22" fill="#dcece2" />
          <circle {...ink} cx="48" cy="36" r="22" />
          <path {...ink} d="M38 36l7 7 13-14" strokeWidth={2.5} />
        </>
      )}
    </svg>
  );
}

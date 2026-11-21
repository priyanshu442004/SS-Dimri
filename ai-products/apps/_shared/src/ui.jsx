// Shared UI for the Workflow Automation product websites.
import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, Link } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { kb, dateTime } from "./format";

export const EASE = [0.16, 1, 0.3, 1];
export const rise = (i = 0) => ({ initial: { y: 12 }, animate: { y: 0 }, transition: { delay: 0.05 * i, duration: 0.6, ease: EASE } });

// ------------------------------------------------------------------ icons
const P = {
  overview: <><rect x="3" y="3" width="6" height="6" rx="1.5" /><rect x="11" y="3" width="6" height="6" rx="1.5" /><rect x="3" y="11" width="6" height="6" rx="1.5" /><rect x="11" y="11" width="6" height="6" rx="1.5" /></>,
  plus: <path d="M10 4v12M4 10h12" />,
  history: <><path d="M3.5 10a6.5 6.5 0 1 0 2-4.7L3.5 7.3" /><path d="M3.5 3.5v3.8h3.8M10 6.5V10l2.5 1.5" /></>,
  help: <><circle cx="10" cy="10" r="7" /><path d="M8 8a2 2 0 1 1 2.8 1.8c-.5.3-.8.7-.8 1.2v.5M10 14h.01" /></>,
  settings: <><circle cx="10" cy="10" r="2.5" /><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" /></>,
  chat: <path d="M4 4.5h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H9l-3.5 3v-3H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z" />,
  download: <path d="M10 3.5v9M6.5 9 10 12.5 13.5 9M4 16h12" />,
  mail: <><rect x="2.5" y="4.5" width="15" height="11" rx="1.5" /><path d="m3 5.5 7 5 7-5" /></>,
  file: <><path d="M5.5 2.5h6l3.5 3.5v11.5h-9.5z" /><path d="M11.5 2.5V6H15" /></>,
  back: <path d="M12.5 4.5 7 10l5.5 5.5" />,
  arrow: <path d="M4 10h12M11 5l5 5-5 5" />,
  upload: <path d="M10 13V3.5M6.5 7 10 3.5 13.5 7M4 16h12" />,
  check: <path d="M4.5 10.5 8 14l7.5-8" />,
  x: <path d="M5 5l10 10M15 5 5 15" />,
  bank: <path d="M3.5 7h11l-3-3M16.5 13h-11l3 3" />,
  cfo: <><path d="M3 16.5h14" /><path d="M5 13.5v-3M8.5 13.5V8M12 13.5V9.5M15.5 13.5V5" /><path d="M4.5 7.5 8.5 4.5l3.5 2.5 4-3.5" /></>,
  invoice: <><path d="M5 2.5h10v15l-2-1.3-1.7 1.3-1.6-1.3-1.7 1.3L6.3 16.2 5 17.5z" /><path d="M8 6.5h4M8 9.5h4" /></>,
  menu: <path d="M3 6h14M3 10h14M3 14h9" />,
  external: <path d="M8 4.5H4.5v11h11V12M11 3.5h5.5V9M16.5 3.5 9 11" />,
  ai: <><path d="M10 2.5 11.6 7 16 8.5 11.6 10 10 14.5 8.4 10 4 8.5 8.4 7z" /><path d="M15.5 13.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" /></>,
  gst: <><rect x="3" y="3" width="14" height="14" rx="2.5" /><path d="M6.5 7.5h3M6.5 10.5h3M6.5 13.5h2" /><path d="m11.5 11 1.5 1.5 3-3.5" /></>,
  ledger: <><rect x="3" y="2.5" width="14" height="15" rx="2" /><path d="M6.5 6.5h7M6.5 9.5h7M6.5 12.5h4" /></>,
  tds: <><path d="M5 2.5h7l3.5 3.5v11.5H5z" /><path d="M12 2.5V6h3.5" /><path d="M8 10.5h4.5M8 13.5h3" /><circle cx="8.5" cy="7" r=".6" fill="currentColor" /></>,
  vendor: <><path d="M3 6.5h6M3 10h6M3 13.5h6" /><path d="M11 6.5h6M11 10h6M11 13.5h4" /><path d="M10 4v12" strokeDasharray="1.5 2" /></>,
  customer: <><circle cx="7" cy="6.5" r="2.5" /><path d="M2.5 16c.4-2.6 2.2-4 4.5-4s4.1 1.4 4.5 4" /><path d="M13 7.5h4.5M13 10.5h4.5M13 13.5h3" /></>,
  payroll: <><rect x="2.5" y="4.5" width="15" height="11" rx="2" /><circle cx="7" cy="9" r="1.8" /><path d="M4.5 13.2c.4-1.3 1.3-2 2.5-2s2.1.7 2.5 2" /><path d="M12 8.5h3.5M12 11.5h2.5" /></>,
  asset: <><rect x="3" y="7" width="14" height="9.5" rx="1.5" /><path d="M7 7V5.2A1.7 1.7 0 0 1 8.7 3.5h2.6A1.7 1.7 0 0 1 13 5.2V7" /><path d="M3 11.5h14M8.5 11.5v1.5h3v-1.5" /></>,
  folder: <path d="M2.5 6V15a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V7.5A1.5 1.5 0 0 0 16 6h-6L8.5 4H4A1.5 1.5 0 0 0 2.5 5.5z" />,
};
export function Icon({ name, className = "size-[18px]", strokeWidth = 1.6 }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {P[name]}
    </svg>
  );
}

// ------------------------------------------------------------------ shell
/**
 * Full-site layout: navy sidebar (desktop) / drawer (mobile) + routed content.
 * product = { name, tagline, icon }, nav = [{ to, label, icon, end? }]
 */
export function AppShell({ product, nav, cta }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => { setOpen(false); window.scrollTo({ top: 0 }); }, [pathname]);

  const side = (
    <aside className="relative isolate flex h-full flex-col bg-ink px-3 py-5 text-paper">
      <div className="grid-bg absolute inset-0 -z-10 opacity-60" aria-hidden />
      <Link to="/" className="flex items-center gap-3 px-2">
        <span className="grid size-10 place-items-center rounded-xl bg-paper text-ink"><Icon name={product.icon} className="size-5" /></span>
        <span className="leading-tight">
          <span className="block font-display text-[16px] font-medium">{product.name}</span>
          <span className="block font-mono text-[10px] uppercase tracking-[0.14em] text-mist">{product.tagline}</span>
        </span>
      </Link>
      {cta && (
        <Link to={cta.to} className="mx-1 mt-7 flex h-11 items-center justify-center gap-2 rounded-xl bg-lime font-medium text-ink transition-transform active:scale-[0.98]">
          <Icon name="plus" className="size-4" strokeWidth={2} /> {cta.label}
        </Link>
      )}
      <nav className="mt-6 flex-1 space-y-1" aria-label="Main">
        {nav.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `relative flex h-11 items-center gap-3 rounded-xl px-3 text-[14.5px] transition-colors ${isActive ? "text-paper" : "text-mist hover:text-paper"}`}>
            {({ isActive }) => (
              <>
                {isActive && <motion.span layoutId={`nav-${open}`} className="absolute inset-0 -z-10 rounded-xl bg-white/[0.08] ring-1 ring-white/10" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
                <Icon name={n.icon} />{n.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="space-y-1 border-t border-white/10 pt-4">
        <a href="/app/ai-products" target="_top" className="flex h-10 items-center gap-3 rounded-xl px-3 text-[13.5px] text-mist transition-colors hover:text-paper">
          <Icon name="back" /> Workflow automation
        </a>
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-dvh">
      <div className="sticky top-0 hidden h-dvh w-[264px] shrink-0 lg:block">{side}</div>
      <AnimatePresence>
        {open && (
          <>
            <motion.div className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-sm lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
            <motion.div className="fixed inset-y-0 left-0 z-50 w-[264px] lg:hidden" initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ duration: 0.4, ease: EASE }}>{side}</motion.div>
          </>
        )}
      </AnimatePresence>
      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-ink/8 bg-paper/85 px-4 backdrop-blur-xl lg:hidden">
          <button onClick={() => setOpen(true)} className="grid size-10 place-items-center rounded-lg hover:bg-ink/5" aria-label="Open menu"><Icon name="menu" className="size-5" /></button>
          <span className="flex items-center gap-2 font-display text-[15px]"><Icon name={product.icon} />{product.name}</span>
          {cta ? <Link to={cta.to} className="grid size-10 place-items-center rounded-lg hover:bg-ink/5" aria-label={cta.label}><Icon name="plus" /></Link> : <span className="w-10" />}
        </div>
        {/* Content is always visible: the entrance is a CSS slide only (no opacity, no
            exit-before-enter), so a paused animation can never leave a blank page. */}
        <main key={pathname} className="page-in mx-auto w-full max-w-[1200px] px-5 pb-20 pt-8 sm:px-8 sm:pt-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ building blocks
export function PageHeader({ eyebrow, title, children, actions }) {
  return (
    <motion.header {...rise()} className="mb-8 flex flex-wrap items-end justify-between gap-6">
      <div className="max-w-2xl">
        {eyebrow && <p className="label">{eyebrow}</p>}
        <h1 className="mt-2.5 text-[clamp(1.9rem,3.6vw,2.8rem)] font-medium leading-[1.05]">{title}</h1>
        {children && <div className="mt-3 text-[16px] leading-relaxed text-muted">{children}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </motion.header>
  );
}

export function Btn({ to, href, onClick, variant = "dark", icon, children, className = "", download, disabled, type = "button", target }) {
  const v = {
    dark: "bg-ink text-paper hover:bg-ink-3",
    lime: "bg-lime text-ink hover:brightness-95",
    line: "border border-ink/15 text-ink hover:border-ink/40 bg-white/40",
    ghost: "text-muted hover:text-ink hover:bg-ink/5",
  }[variant];
  const cls = `inline-flex h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${v} ${className}`;
  const inner = <>{icon && <Icon name={icon} className="size-4" />}{children}</>;
  if (to) return <Link to={to} className={cls}>{inner}</Link>;
  if (href) return <a href={href} className={cls} download={download} target={target} rel={target ? "noreferrer" : undefined}>{inner}</a>;
  return <button type={type} onClick={onClick} disabled={disabled} className={cls}>{inner}</button>;
}

export function Stat({ label, value, note, tone, i = 0, bar }) {
  const t = { good: "text-teal-ink", warn: "text-amber", bad: "text-rose" }[tone] || "";
  return (
    <motion.div {...rise(i)} className="card p-5">
      <p className="label">{label}</p>
      <p className={`num mt-2 font-display text-[1.7rem] leading-none ${t}`}>{value}</p>
      {bar != null && <div className="mt-3 h-1 overflow-hidden rounded-full bg-ink/8"><motion.div className="h-full rounded-full bg-teal" initial={false} animate={{ width: `${Math.min(100, bar)}%` }} transition={{ delay: 0.3, duration: 1, ease: EASE }} /></div>}
      {note && <p className="mt-2 text-[13px] text-muted">{note}</p>}
    </motion.div>
  );
}

export function Badge({ tone = "neutral", children, dot }) {
  const t = { good: "bg-teal/12 text-teal-ink", warn: "bg-amber-soft text-amber", bad: "bg-rose-soft text-rose", neutral: "bg-paper-2 text-muted", dark: "bg-ink text-paper" }[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.12em] ${t}`}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}{children}
    </span>
  );
}

export function Section({ title, aside, children, className = "", i = 0 }) {
  return (
    <motion.section {...rise(i)} className={`card ${className}`}>
      {(title || aside) && (
        <div className="flex flex-wrap items-baseline justify-between gap-3 px-5 pt-5">
          {title && <h2 className="text-lg font-medium">{title}</h2>}
          {aside}
        </div>
      )}
      {children}
    </motion.section>
  );
}

export function Empty({ icon = "file", title, children, action }) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-paper-2 text-muted"><Icon name={icon} className="size-6" /></span>
      <h3 className="mt-4 text-xl font-medium">{title}</h3>
      {children && <p className="mt-1.5 max-w-sm text-sm text-muted">{children}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Loading({ label = "Loading…" }) {
  return (
    <div className="flex items-center gap-3 py-16 text-muted">
      <span className="flex gap-1">{[0, 1, 2].map((i) => <motion.span key={i} className="size-1.5 rounded-full bg-teal" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }} />)}</span>
      {label}
    </div>
  );
}

export function ErrorNote({ children }) {
  return <div role="alert" className="rounded-xl border border-rose/30 bg-rose-soft px-4 py-3 text-sm text-rose">{children}</div>;
}

export function MailStatus({ mail, onResend, busy }) {
  if (!mail) return null;
  const sent = mail.status === "sent";
  return (
    <span className="inline-flex items-center gap-1">
      <span title={sent ? `Sent ${dateTime(mail.at)} to ${mail.to?.join(", ")}` : mail.error || ""} className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm ${sent ? "bg-teal/12 text-teal-ink" : "bg-rose-soft text-rose"}`}>
        <Icon name="mail" className="size-4" />
        {sent ? `Emailed to ${mail.to?.length || 0} recipients` : mail.status === "disabled" ? "Email not configured" : "Email failed"}
      </span>
      {onResend && <button onClick={onResend} disabled={busy} className="h-10 rounded-full px-3 text-sm text-muted underline-offset-4 hover:text-ink hover:underline disabled:opacity-50">{busy ? "Sending…" : sent ? "Resend" : "Retry"}</button>}
    </span>
  );
}

/** File drop zone. multiple=false → one file; true → list of files. */
export function DropZone({ title, hint, accept, multiple = false, files, onFiles, step, dark = true, minH = "min-h-[220px]" }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  const list = files || [];
  const has = list.length > 0;
  const add = (fl) => {
    const arr = [...fl].filter((f) => !accept || accept.split(",").some((ext) => f.name.toLowerCase().endsWith(ext.trim())));
    if (!arr.length) return;
    onFiles(multiple ? [...list, ...arr.filter((f) => !list.some((x) => x.name === f.name && x.size === f.size))] : [arr[0]]);
  };
  const filled = has && dark;
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
      className={`group relative flex ${minH} flex-col overflow-hidden rounded-2xl border-2 border-dashed p-5 transition-all duration-300 ${
        over ? "border-teal bg-teal/8" : filled ? "border-transparent bg-ink text-paper" : "border-ink/15 bg-white/50 hover:border-ink/35"
      }`}
    >
      <input ref={input} type="file" accept={accept} multiple={multiple} className="hidden" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      {!filled && <div className="dot-bg pointer-events-none absolute inset-0 opacity-40 [mask-image:linear-gradient(to_bottom,#000,transparent)]" />}
      <div className="relative flex items-center justify-between">
        {step && <span className={`font-mono text-xs ${filled ? "text-mist" : "text-muted"}`}>{step}</span>}
        {has && <span className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${filled ? "bg-lime/15 text-lime" : "bg-teal/12 text-teal-ink"}`}>{multiple ? `${list.length} file${list.length > 1 ? "s" : ""}` : "Ready"}</span>}
      </div>
      <div className="relative mt-auto pt-6">
        <h3 className="text-xl font-medium">{title}</h3>
        {has && !multiple ? (
          <div className="mt-2 space-y-0.5">
            <p className="truncate font-mono text-[13px]">{list[0].name}</p>
            <p className={`text-[13px] ${filled ? "text-mist" : "text-muted"}`}>{kb(list[0].size)}</p>
          </div>
        ) : (
          <p className={`mt-1.5 text-sm leading-relaxed ${filled ? "text-mist" : "text-muted"}`}>{hint}</p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => input.current?.click()}
            className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] transition-colors ${filled ? "border-white/20 hover:border-white/50" : "border-ink/15 bg-white hover:border-ink/40"}`}>
            <Icon name="upload" className="size-3.5" />{has ? (multiple ? "Add more" : "Replace") : "Drop files or browse"}
          </button>
          {has && <button type="button" onClick={() => onFiles([])} className={`text-[13px] underline-offset-4 hover:underline ${filled ? "text-mist" : "text-muted"}`}>Clear</button>}
        </div>
      </div>
    </div>
  );
}

/** Download links row (PDF / Excel / CSV …). items = [{ label, href, icon? }] */
export function Downloads({ items }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.filter(Boolean).map((d, i) => (
        <Btn key={d.label} href={d.href} variant={i === 0 ? "dark" : "line"} icon="download">{d.label}</Btn>
      ))}
    </div>
  );
}

/** Two-column FAQ list. */
export function Faq({ items }) {
  const [open, setOpen] = useState(0);
  return (
    <div className="divide-y divide-ink/8 rounded-2xl border border-ink/8 bg-white/60">
      {items.map(([q, a], i) => (
        <div key={q}>
          <button onClick={() => setOpen(open === i ? -1 : i)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-[15px] font-medium">
            {q}<span className={`text-xl leading-none text-muted transition-transform duration-300 ${open === i ? "rotate-45" : ""}`}>+</span>
          </button>
          <AnimatePresence initial={false}>
            {open === i && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: EASE }} className="overflow-hidden">
                <p className="px-5 pb-4 text-[14.5px] leading-relaxed text-muted">{a}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}

/** Steps strip used on Overview / Help pages. */
export function Steps({ items }) {
  return (
    <ol className="grid gap-px overflow-hidden rounded-2xl border border-ink/8 bg-ink/8 sm:grid-cols-2 lg:grid-cols-4">
      {items.map(([t, d], i) => (
        <li key={t} className="bg-paper p-5">
          <span className="font-mono text-xs text-muted">0{i + 1}</span>
          <p className="mt-2 font-display text-lg">{t}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">{d}</p>
        </li>
      ))}
    </ol>
  );
}

export function NotFound() {
  return <Empty icon="help" title="Page not found" action={<Btn to="/" icon="back">Back to overview</Btn>}>The link may be old or mistyped.</Empty>;
}

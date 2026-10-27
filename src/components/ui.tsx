import Link from "next/link";
import { clsx } from "clsx";
import { ArrowUpRight, CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { ComponentProps, CSSProperties, ReactNode } from "react";
import { EmptyArt, type EmptyKind } from "@/components/empty-art";

// ---------------------------------------------------------------- buttons

type Variant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-ink text-paper hover:bg-night-2 border-transparent shadow-[0_1px_0_rgb(255_255_255/.12)_inset,0_6px_16px_-10px_rgb(15_29_51/.6)]",
  secondary: "bg-surface text-ink border-line hover:border-ink/30 hover:bg-paper",
  ghost: "bg-transparent text-ink border-transparent hover:bg-subtle",
  danger: "bg-surface text-danger border-danger/40 hover:bg-danger-bg",
};
const sizes = { sm: "h-8 px-3 text-sm", md: "h-10 px-4 text-sm" };

export function buttonClass(variant: Variant = "primary", size: "sm" | "md" = "md", extra?: string) {
  return clsx(
    "app-btn inline-flex items-center justify-center gap-2 rounded-lg border font-medium whitespace-nowrap",
    "transition-[background-color,border-color,color,box-shadow,scale] duration-200 active:scale-[0.97]",
    "disabled:opacity-50 disabled:pointer-events-none",
    variants[variant],
    sizes[size],
    extra,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: "sm" | "md" }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: "sm" | "md" }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

// ---------------------------------------------------------------- layout

export function PageHeader({
  title,
  description,
  actions,
  back,
  icon,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
  icon?: ReactNode;
}) {
  return (
    <div className="app-rise mb-6">
      {back && (
        <Link href={back.href} className="group mb-3 inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-ink">
          <span aria-hidden className="transition-transform duration-300 group-hover:-translate-x-0.5">←</span> {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {icon && <span aria-hidden className="mt-1 grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-surface text-ink [&_svg]:size-5">{icon}</span>}
          <div className="min-w-0">
            <h1 className="font-editorial text-[1.9rem] leading-tight tracking-[-0.01em] text-ink sm:text-[2.25rem]">{title}</h1>
            {description && <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Card({ title, actions, children, className, padded = true, icon }: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
  icon?: ReactNode;
}) {
  return (
    <section className={clsx("min-w-0 rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgb(15_29_51/.04)]", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          {title && (
            <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink">
              {icon && <span aria-hidden className="text-muted [&_svg]:size-4">{icon}</span>}
              {title}
            </h2>
          )}
          {actions}
        </header>
      )}
      <div className={clsx(padded && "p-4")}>{children}</div>
    </section>
  );
}

type StatTone = "neutral" | "ok" | "warn" | "danger" | "info";
const STAT_TONE: Record<StatTone, { bar: string; icon: string }> = {
  neutral: { bar: "bg-ink/15", icon: "bg-subtle text-ink" },
  ok: { bar: "bg-ok", icon: "bg-ok-bg text-ok" },
  warn: { bar: "bg-marigold", icon: "bg-warn-bg text-warn" },
  danger: { bar: "bg-danger", icon: "bg-danger-bg text-danger" },
  info: { bar: "bg-info", icon: "bg-info-bg text-info" },
};

/** Tiny single-series trend for stat tiles. Decorative: the tile's value and hint carry the information. */
function Spark({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const step = 100 / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => `${(i * step).toFixed(2)},${(30 - (v / max) * 26).toFixed(2)}`);
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="mt-2 block h-8 w-full" aria-hidden>
      <polygon points={`0,32 ${pts.join(" ")} 100,32`} fill="var(--color-series-1)" opacity=".08" />
      <polyline points={pts.join(" ")} fill="none" stroke="var(--color-series-1)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" className="chart-line" pathLength={1} />
    </svg>
  );
}

export function Stat({ label, value, href, hint, icon, tone = "neutral", spark }: {
  label: string;
  value: ReactNode;
  href?: string;
  hint?: string;
  icon?: ReactNode;
  tone?: StatTone;
  spark?: number[];
}) {
  const t = STAT_TONE[tone];
  const body = (
    <>
      <span aria-hidden className={clsx("absolute inset-y-3 left-0 w-[3px] rounded-r-full", t.bar)} />
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-medium text-muted">{label}</div>
        {icon && <span aria-hidden className={clsx("grid size-7 shrink-0 place-items-center rounded-lg [&_svg]:size-3.5", t.icon)}>{icon}</span>}
        {!icon && href && <ArrowUpRight aria-hidden className="size-3.5 text-muted opacity-0 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100" />}
      </div>
      <div className="relative mt-1 font-editorial text-[2rem] leading-none tracking-[-0.01em] text-ink">{value}</div>
      {hint && <div className="relative mt-1.5 text-xs text-muted">{hint}</div>}
      {spark && spark.length > 1 && <Spark values={spark} />}
    </>
  );
  const cls = "group relative block overflow-hidden rounded-xl border border-line bg-surface px-4 py-3.5";
  return href ? (
    <Link href={href} data-spotlight className={clsx(cls, "transition-[border-color,box-shadow,translate] duration-300 hover:-translate-y-0.5 hover:border-ink/25 hover:shadow-[0_14px_30px_-22px_rgb(15_29_51/.5)] active:translate-y-0")}
      style={{ "--spot": "rgb(42 120 214 / .07)" } as CSSProperties}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function EmptyState({ title, children, action, kind }: { title: string; children?: ReactNode; action?: ReactNode; kind?: EmptyKind }) {
  return (
    <div className="app-rise flex flex-col items-center rounded-xl border border-dashed border-ink/20 bg-surface/70 px-6 py-10 text-center">
      <EmptyArt kind={kind} />
      <p className="mt-3 font-medium text-ink">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const NOTICE_ICON = { info: Info, warn: TriangleAlert, danger: CircleAlert, ok: CircleCheck };

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "danger" | "ok"; children: ReactNode }) {
  const cls = {
    info: "border-info/25 bg-info-bg text-info",
    warn: "border-warn/25 bg-warn-bg text-warn",
    danger: "border-danger/25 bg-danger-bg text-danger",
    ok: "border-ok/25 bg-ok-bg text-ok",
  }[tone];
  const Icon = NOTICE_ICON[tone];
  return (
    <div className={clsx("app-rise flex gap-2 rounded-lg border px-3 py-2.5 text-sm", cls)} role={tone === "danger" ? "alert" : "status"}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------- badges

type Tone = "neutral" | "ok" | "warn" | "danger" | "info" | "brand";
const tones: Record<Tone, string> = {
  neutral: "bg-subtle text-muted",
  ok: "bg-ok-bg text-ok",
  warn: "bg-warn-bg text-warn",
  danger: "bg-danger-bg text-danger",
  info: "bg-info-bg text-info",
  brand: "bg-brand-50 text-brand-700",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap", tones[tone])}>
      {children}
    </span>
  );
}

const STATUS_TONES: Record<string, Tone> = {
  ACTIVE: "ok", APPROVED: "ok", COMPLETED: "ok", PRESENT: "ok", CLOSED: "neutral", SETTLED: "ok", REVIEWED: "ok", SUBMITTED: "info",
  PENDING_APPROVAL: "warn", PENDING: "warn", PENDING_REVIEW: "info", UNDER_REVIEW: "warn", OPEN: "warn", AWAITING_RESPONSE: "warn",
  IN_PROGRESS: "info", ASSIGNED: "brand", ON_HOLD: "neutral", CHANGES_REQUESTED: "warn", HALF_DAY: "warn", LEAVE: "info",
  REJECTED: "danger", ABSENT: "danger", CANCELLED: "neutral", INACTIVE: "neutral", DRAFT: "neutral", ENDED: "neutral", PLANNED: "info",
  AWAITING_CLIENT: "warn", AWAITING_TEAM_MEMBER: "info",
  HIGH: "danger", MEDIUM: "warn", LOW: "neutral", WRITTEN_OFF: "neutral", OVERDUE: "danger",
};

export function humanize(v: string) {
  return v.charAt(0) + v.slice(1).toLowerCase().replaceAll("_", " ");
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return (
    <Badge tone={STATUS_TONES[status] ?? "neutral"}>
      <span aria-hidden className="size-1.5 rounded-full bg-current opacity-80" />
      {label ?? humanize(status)}
    </Badge>
  );
}

// ---------------------------------------------------------------- tables

export function Table({ children, minWidth = 640 }: { children: ReactNode; minWidth?: number }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgb(15_29_51/.04)]">
      <table
        className="w-full border-collapse text-sm [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-paper [&_tbody_tr:last-child>td]:border-b-0"
        style={{ minWidth }}
      >
        {children}
      </table>
    </div>
  );
}
export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th scope="col" className={clsx("sticky top-0 border-b border-line bg-paper/80 px-3 py-2.5 text-left text-xs font-medium text-muted backdrop-blur", className)}>
      {children}
    </th>
  );
}
export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={clsx("border-b border-line/70 px-3 py-2.5 align-top", className)}>{children}</td>;
}

// ---------------------------------------------------------------- tabs & pagination

export function TabNav({ tabs, current }: { tabs: { key: string; label: string; href: string; count?: number }[]; current: string }) {
  return (
    <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]" aria-label="Sections">
      {tabs.map((t) => {
        const active = t.key === current;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "group relative whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors",
              active ? "text-ink" : "text-muted hover:text-ink",
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={clsx("ml-1.5 rounded-md px-1.5 text-xs transition-colors", active ? "bg-ink text-paper" : "bg-subtle text-muted")}>{t.count}</span>
            )}
            <span aria-hidden className={clsx("absolute inset-x-2 -bottom-px h-0.5 origin-center rounded-full transition-transform duration-300", active ? "scale-x-100 bg-ink" : "scale-x-0 bg-ink/30 group-hover:scale-x-100")} />
          </Link>
        );
      })}
    </nav>
  );
}

export function Pagination({ page, pageSize, total, hrefFor }: { page: number; pageSize: number; total: number; hrefFor: (p: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav className="mt-3 flex items-center justify-between text-sm text-muted" aria-label="Pagination">
      <span>
        Page {page} of {pages} · {total} records
      </span>
      <span className="flex gap-2">
        {page > 1 && <LinkButton variant="secondary" size="sm" href={hrefFor(page - 1)}>Previous</LinkButton>}
        {page < pages && <LinkButton variant="secondary" size="sm" href={hrefFor(page + 1)}>Next</LinkButton>}
      </span>
    </nav>
  );
}

// ---------------------------------------------------------------- definition list

export function DetailList({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-xs font-medium text-muted">{k}</dt>
          <dd className="mt-0.5 break-words text-ink">{v === null || v === undefined || v === "" ? "—" : v}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---------------------------------------------------------------- people

const AVATAR_TONES = ["#3a6ea5", "#d9531f", "#2f6b4f", "#8a5a00", "#c2457a", "#1f8a8a", "#5b6b82", "#6f8f2a"];

/** Initials avatar with a stable colour per name (decorative; show the name next to it). */
export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const initials = name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";
  const hash = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  return (
    <span aria-hidden className={clsx("grid shrink-0 place-items-center rounded-full font-semibold text-white", size === "sm" ? "size-6 text-[10px]" : "size-8 text-xs")}
      style={{ background: AVATAR_TONES[hash % AVATAR_TONES.length] }}>
      {initials}
    </span>
  );
}

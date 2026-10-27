"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Briefcase, KeyRound, LayoutDashboard, ListChecks, Plus, Search, UserPlus, X } from "lucide-react";
import { clsx } from "clsx";

export type Faq = { category: string; q: string; a: string };

const TOPIC_ICON: Record<string, typeof Search> = { Registration: UserPlus, "Signing in": KeyRound, "Client portal": LayoutDashboard, Staff: Briefcase, Tasks: ListChecks };
const SUGGESTIONS = ["password", "GSTIN", "documents", "attendance", "approval"];

function highlight(text: string, q: string): ReactNode {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-sm bg-marigold-soft px-0.5 text-ink">{text.slice(i, i + q.length)}</mark>
      {highlight(text.slice(i + q.length), q)}
    </>
  );
}

export function HelpSearch({ faqs }: { faqs: Faq[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const input = useRef<HTMLInputElement>(null);
  const categories = [...new Set(faqs.map((f) => f.category))];
  const q = query.trim();
  const results = useMemo(() => {
    const lq = q.toLowerCase();
    return faqs.filter((f) => (category === "All" || f.category === category) && (!lq || `${f.q} ${f.a}`.toLowerCase().includes(lq)));
  }, [faqs, q, category]);

  // "/" focuses the search box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !/input|textarea|select/i.test(t.tagName)) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {/* Search */}
      <div className="pub-in relative mx-auto mt-10 max-w-2xl" style={{ "--d": "350ms" } as CSSProperties}>
        <div className="group relative rounded-2xl border-[1.5px] border-ink bg-surface shadow-[5px_5px_0_0_var(--color-ink)] transition-[box-shadow,translate] duration-300 ease-[var(--ease-out-expo)] focus-within:-translate-x-0.5 focus-within:-translate-y-0.5 focus-within:shadow-[7px_7px_0_0_var(--color-stamp-bright)]">
          <Search className="pointer-events-none absolute left-5 top-1/2 size-5 -translate-y-1/2 text-muted transition-colors group-focus-within:text-ink" aria-hidden />
          <label htmlFor="help-q" className="sr-only">Search help</label>
          <input
            ref={input}
            id="help-q"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search help — e.g. password, GSTIN, attendance"
            className="h-16 w-full rounded-2xl bg-transparent pl-14 pr-24 text-base placeholder:text-muted focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-4 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-paper-2 transition-transform active:scale-90">
              <X className="size-4" aria-hidden />
            </button>
          ) : (
            <kbd className="absolute right-5 top-1/2 hidden -translate-y-1/2 rounded-md border border-ink/20 px-2 py-0.5 font-mono text-xs text-muted sm:block">/</kbd>
          )}
        </div>
        <p className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm text-muted">
          <span>Try</span>
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" onClick={() => setQuery(s)} data-ripple className="rounded-full border border-ink/15 bg-surface/70 px-3 py-1 text-ink/80 transition-all duration-300 hover:border-ink hover:text-ink active:scale-95">
              {s}
            </button>
          ))}
        </p>
      </div>

      {/* Topics */}
      <div className="mx-auto mt-16 max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" role="group" aria-label="Categories">
          {["All", ...categories].map((c, i) => {
            const Icon = TOPIC_ICON[c] ?? Search;
            const count = c === "All" ? faqs.length : faqs.filter((f) => f.category === c).length;
            const on = category === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                aria-pressed={on}
                data-ripple
                data-reveal=""
                style={{ "--i": i } as CSSProperties}
                className={clsx(
                  "group flex flex-col items-start rounded-2xl border p-4 text-left transition-all duration-500 ease-[var(--ease-out-expo)] active:scale-[0.97]",
                  on ? "border-ink bg-ink text-paper" : "border-ink/10 bg-surface hover:-translate-y-1 hover:border-ink/30",
                )}
              >
                <span className={clsx("grid size-9 place-items-center rounded-lg transition-colors", on ? "bg-marigold text-night" : "bg-paper-2 text-ink")}>
                  <Icon className="size-[18px] transition-transform duration-500 ease-[var(--ease-spring)] group-hover:rotate-[-8deg] group-hover:scale-110" aria-hidden />
                </span>
                <span className="mt-4 font-medium">{c === "All" ? "All topics" : c}</span>
                <span className={clsx("mt-0.5 font-mono text-xs", on ? "text-paper/60" : "text-muted")}>{count} answers</span>
              </button>
            );
          })}
        </div>

        <p aria-live="polite" className="mt-10 flex items-baseline justify-between gap-4 border-b border-ink/15 pb-3">
          <span className="font-editorial text-3xl">{category === "All" ? "All answers" : category}</span>
          <span className="font-mono text-xs text-muted">{results.length} answers</span>
        </p>

        {results.length === 0 ? (
          <div className="pub-swap mt-8 flex flex-col items-center rounded-2xl border border-dashed border-ink/25 px-6 py-14 text-center">
            <svg viewBox="0 0 120 90" className="h-24 w-32 text-ink" aria-hidden>
              <rect x="20" y="10" width="64" height="74" rx="4" fill="#fbeccb" />
              <rect x="14" y="4" width="64" height="74" rx="4" fill="none" stroke="currentColor" strokeWidth="1.75" />
              <path d="M26 22h40M26 32h40M26 42h24" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" opacity=".35" />
              <circle cx="78" cy="56" r="14" fill="#f5f1e8" stroke="currentColor" strokeWidth="1.75" />
              <path d="M88 66l14 14" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
              <path d="M73 52l10 10M83 52L73 62" stroke="#d9531f" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <p className="mt-4 text-sm text-muted">No answers match “{query}”. Try another word, or contact the office below.</p>
          </div>
        ) : (
          <div key={`${category}|${q}`} className="mt-2 divide-y divide-ink/10">
            {results.map((f, i) => (
              <details key={f.q} className="pub-acc pub-swap group" style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}>
                <summary className="flex cursor-pointer list-none items-start justify-between gap-6 py-5">
                  <span>
                    <span className="block text-lg font-medium transition-colors group-hover:text-stamp">{f.q}</span>
                    <span className="mt-1 block font-mono text-[11px] text-muted">{f.category}</span>
                  </span>
                  <span className="pub-acc-icon mt-1 grid size-8 shrink-0 place-items-center rounded-full border border-ink/20"><Plus className="size-4" aria-hidden /></span>
                </summary>
                <p className="max-w-3xl pb-6 leading-relaxed text-ink/70">{highlight(f.a, q)}</p>
              </details>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

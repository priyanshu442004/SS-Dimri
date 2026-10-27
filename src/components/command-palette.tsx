"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { CornerDownLeft, LogOut, Search } from "lucide-react";

export type PaletteItem = { href: string; label: string; section: string; icon: ComponentType<{ className?: string }> };

/**
 * Ctrl/⌘ + K (or "/") opens a jump-to box over the page: type to filter every
 * destination the user can reach, Enter to go. With no match, Enter searches
 * records instead (if a search page is given). Complements the sidebar.
 * Render it only while open, so every opening starts from a clean state.
 */
export function CommandPalette({ onClose, items, searchHref, signOut }: {
  onClose: () => void;
  items: PaletteItem[];
  searchHref?: (q: string) => string;
  signOut?: () => Promise<void>;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);

  type Row = { key: string; label: string; hint: string; icon: ComponentType<{ className?: string }>; run: () => void };
  const rows = useMemo<Row[]>(() => {
    const needle = q.trim().toLowerCase();
    const go = (href: string) => () => { onClose(); router.push(href); };
    const out: Row[] = items
      .filter((i) => !needle || `${i.label} ${i.section}`.toLowerCase().includes(needle))
      .map((i) => ({ key: i.href, label: i.label, hint: i.section, icon: i.icon, run: go(i.href) }));
    if (needle && searchHref) out.push({ key: "search", label: `Search records for “${q.trim()}”`, hint: "Clients, tasks, staff", icon: Search, run: go(searchHref(q.trim())) });
    if (signOut && (!needle || "sign out log out".includes(needle))) {
      out.push({ key: "signout", label: "Sign out", hint: "Account", icon: LogOut, run: () => { onClose(); startTransition(() => signOut()); } });
    }
    return out;
  }, [q, items, searchHref, signOut, onClose, router]);

  useEffect(() => input.current?.focus(), []);

  useEffect(() => {
    (list.current?.children[active] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const sel = Math.min(active, Math.max(0, rows.length - 1));

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center px-4 pt-[12vh]" role="presentation">
      <button aria-label="Close" tabIndex={-1} className="app-palette-backdrop absolute inset-0 bg-night/40 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Jump to" className="app-palette relative w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_30px_80px_-20px_rgb(15_29_51/.55)]">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="size-4 shrink-0 text-muted" aria-hidden />
          <input
            ref={input}
            value={q}
            onChange={(e) => { setQ(e.target.value); setActive(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(rows.length - 1, a + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
              else if (e.key === "Enter") { e.preventDefault(); rows[sel]?.run(); }
              else if (e.key === "Escape") { e.preventDefault(); onClose(); }
            }}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={rows[sel] ? `palette-${rows[sel].key}` : undefined}
            aria-label="Jump to a page or search"
            placeholder="Jump to a page or search records…"
            className="h-14 w-full bg-transparent text-[15px] placeholder:text-muted focus:outline-none"
          />
          <kbd className="hidden rounded-md border border-line px-1.5 py-0.5 font-mono text-[10px] text-muted sm:block">Esc</kbd>
        </div>
        <ul ref={list} id="palette-list" role="listbox" className="max-h-[52vh] overflow-y-auto p-2">
          {rows.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted">Nothing matches “{q}”.</li>}
          {rows.map((r, i) => (
            <li
              key={r.key}
              id={`palette-${r.key}`}
              role="option"
              aria-selected={i === sel}
              onMouseMove={() => setActive(i)}
              onClick={r.run}
              className={clsx("flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors", i === sel ? "bg-ink text-paper" : "text-ink")}
            >
              <r.icon className={clsx("size-4 shrink-0", i === sel ? "text-marigold" : "text-muted")} />
              <span className="min-w-0 flex-1 truncate">{r.label}</span>
              <span className={clsx("shrink-0 text-xs", i === sel ? "text-paper/60" : "text-muted")}>{r.hint}</span>
              {i === sel && <CornerDownLeft className="size-3.5 shrink-0 text-paper/60" aria-hidden />}
            </li>
          ))}
        </ul>
        <p className="flex gap-4 border-t border-line bg-paper/60 px-4 py-2 text-[11px] text-muted">
          <span><kbd className="font-mono">↑ ↓</kbd> move</span>
          <span><kbd className="font-mono">Enter</kbd> open</span>
          <span><kbd className="font-mono">Esc</kbd> close</span>
        </p>
      </div>
    </div>
  );
}

/** Global shortcut: Ctrl/⌘+K anywhere, "/" outside text fields. */
export function usePaletteShortcut(setOpen: (o: boolean) => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /input|textarea|select/i.test((e.target as HTMLElement).tagName) || (e.target as HTMLElement).isContentEditable;
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setOpen(true); }
      else if (e.key === "/" && !typing) { e.preventDefault(); setOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);
}

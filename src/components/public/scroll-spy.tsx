"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { clsx } from "clsx";

export type SpyItem = { id: string; label: string; count: number; color: string };

/** Sticky section index: a vertical list on large screens, a chip bar on small ones. */
export function ScrollSpy({ items }: { items: SpyItem[] }) {
  const [active, setActive] = useState(0);
  const chips = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(els.indexOf(visible[0].target as HTMLElement));
      },
      { rootMargin: "-30% 0px -60% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [items]);

  // Keep the active chip in view on small screens.
  useEffect(() => {
    const el = chips.current?.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [active]);

  const current = items[active];
  return (
    <>
      {/* Small screens */}
      <div className="sticky top-[72px] z-20 -mx-4 border-b border-ink/10 bg-paper/90 px-4 py-3 backdrop-blur-md lg:hidden">
        <div ref={chips} className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
          {items.map((it, i) => (
            <a key={it.id} href={`#${it.id}`} data-ripple
              className={clsx("relative shrink-0 rounded-full border px-3 py-1.5 text-sm transition-all duration-300", i === active ? "border-ink bg-ink text-paper" : "border-ink/15 text-ink/70")}>
              {it.label}
            </a>
          ))}
        </div>
      </div>

      {/* Large screens */}
      <nav aria-label="Departments" className="sticky top-28 hidden self-start lg:block">
        <p className="font-mono text-xs text-muted">Department</p>
        <p className="mt-2 flex items-baseline gap-2 font-editorial">
          <span key={active} className="pub-swap inline-block text-7xl leading-none">{String(active + 1).padStart(2, "0")}</span>
          <span className="text-2xl text-muted">/ {String(items.length).padStart(2, "0")}</span>
        </p>
        <div className="relative mt-8 border-l border-ink/15">
          <span aria-hidden className="absolute -left-px top-0 h-11 w-[3px] rounded-full transition-[transform,background-color] duration-500 ease-[var(--ease-spring)]"
            style={{ transform: `translateY(${active * 44}px)`, background: current?.color } as CSSProperties} />
          {items.map((it, i) => (
            <a key={it.id} href={`#${it.id}`} aria-current={i === active ? "true" : undefined}
              className={clsx("flex h-11 items-center justify-between gap-4 pl-5 text-[15px] transition-all duration-300", i === active ? "translate-x-1 font-medium text-ink" : "text-muted hover:text-ink")}>
              <span>{it.label}</span>
              <span className="font-mono text-xs">{it.count}</span>
            </a>
          ))}
        </div>
      </nav>
    </>
  );
}

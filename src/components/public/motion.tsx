import { ViewTransition, type CSSProperties, type ReactNode } from "react";
import { clsx } from "clsx";

/**
 * Wraps a public page so it animates in and out on navigation. Links tagged
 * with transitionTypes={["nav-forward"]} / ["nav-back"] slide directionally;
 * every other navigation rises and fades. Must sit in page.tsx, not a layout.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const classes = { "nav-forward": "nav-forward", "nav-back": "nav-back", default: "page" };
  return (
    <ViewTransition enter={classes} exit={classes} default="none">
      <div>{children}</div>
    </ViewTransition>
  );
}

/** Staggered reveal props for list items: {...reveal(i)} */
export function reveal(i = 0, kind?: "left" | "right" | "scale" | "clip") {
  return { "data-reveal": kind ?? "", style: { "--i": i } as CSSProperties };
}

/** Headline whose words rise out of a mask on load. `em` words render in italic serif. */
export function SplitWords({ text, em = [], className, start = 0 }: { text: string; em?: string[]; className?: string; start?: number }) {
  const words = text.split(" ");
  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {words.map((w, i) => (
          <span key={i}>
            <span className="pub-word">
              <span style={{ "--w": i + start } as CSSProperties} className={clsx(em.includes(w.replace(/[.,]/g, "")) && "italic text-stamp")}>
                {w}
              </span>
            </span>
            {i < words.length - 1 && " "}
          </span>
        ))}
      </span>
    </span>
  );
}

/** Small mono section label, e.g. "01 — What we do". */
export function Eyebrow({ n, children, light }: { n?: string; children: ReactNode; light?: boolean }) {
  return (
    <p className={clsx("flex items-center gap-3 font-mono text-xs", light ? "text-paper/70" : "text-muted")}>
      {n && <span className={clsx("rounded-sm px-1.5 py-0.5", light ? "bg-paper/10 text-marigold" : "bg-ink text-paper")}>{n}</span>}
      <span>{children}</span>
      <span aria-hidden className={clsx("h-px w-10", light ? "bg-paper/25" : "bg-ink/25")} />
    </p>
  );
}

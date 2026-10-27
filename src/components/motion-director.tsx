"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * One listener set for every public page, so server components only need data
 * attributes:
 *  - [data-reveal]     fades/slides in when scrolled into view (sets [data-in])
 *  - .pub-btn, .app-btn, [data-ripple]  ink ripple from the click point
 *  - [data-spotlight]  cursor-following highlight (--mx / --my)
 *  - [data-tilt]       slight 3D tilt toward the cursor (--rx / --ry)
 *  - [data-count]      counts up to its value when revealed
 */
export function MotionDirector() {
  const pathname = usePathname();

  // Reveals: re-scan on every route change and whenever new nodes mount.
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-motion-ready", "");
    if (!root.hasAttribute("data-motion")) {
      // Reduced motion or late start: show everything immediately.
      document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => el.setAttribute("data-in", ""));
      document.querySelectorAll<HTMLElement>("[data-count]").forEach((el) => (el.textContent = el.dataset.count ?? el.textContent));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          el.setAttribute("data-in", "");
          el.querySelectorAll<HTMLElement>("[data-count]").forEach(countUp);
          if (el.hasAttribute("data-count")) countUp(el);
          io.unobserve(el);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    const scan = () => document.querySelectorAll<HTMLElement>("[data-reveal]:not([data-in]), [data-count]:not([data-counted])").forEach((el) => io.observe(el));
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, [pathname]);

  // Pointer effects via delegation.
  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fine = matchMedia("(pointer: fine)").matches;

    function onDown(e: PointerEvent) {
      if (reduce) return;
      const host = (e.target as Element).closest<HTMLElement>(".pub-btn, .app-btn, [data-ripple]");
      if (!host) return;
      const r = host.getBoundingClientRect();
      const size = Math.hypot(r.width, r.height) * 2;
      const dot = document.createElement("span");
      dot.className = "pub-ripple";
      dot.style.width = dot.style.height = `${size}px`;
      dot.style.left = `${e.clientX - r.left - size / 2}px`;
      dot.style.top = `${e.clientY - r.top - size / 2}px`;
      if (getComputedStyle(host).position === "static") host.style.position = "relative";
      host.style.overflow = "hidden";
      host.appendChild(dot);
      dot.addEventListener("animationend", () => dot.remove(), { once: true });
    }

    let tilted: HTMLElement | null = null;
    function onMove(e: PointerEvent) {
      if (!fine) return;
      const t = e.target as Element;
      const spot = t.closest<HTMLElement>("[data-spotlight]");
      if (spot) {
        const r = spot.getBoundingClientRect();
        spot.style.setProperty("--mx", `${e.clientX - r.left}px`);
        spot.style.setProperty("--my", `${e.clientY - r.top}px`);
      }
      if (reduce) return;
      const tilt = t.closest<HTMLElement>("[data-tilt]");
      if (tilted && tilted !== tilt) resetTilt(tilted);
      tilted = tilt;
      if (tilt) {
        const r = tilt.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        const max = Number(tilt.dataset.tilt) || 6;
        tilt.style.setProperty("--rx", `${(-py * max).toFixed(2)}deg`);
        tilt.style.setProperty("--ry", `${(px * max).toFixed(2)}deg`);
      }
    }
    const resetTilt = (el: HTMLElement) => {
      el.style.setProperty("--rx", "0deg");
      el.style.setProperty("--ry", "0deg");
    };
    const onLeave = () => tilted && resetTilt(tilted);

    document.addEventListener("pointerdown", onDown);
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return null;
}

function countUp(el: HTMLElement) {
  if (el.hasAttribute("data-counted")) return;
  el.setAttribute("data-counted", "");
  const target = Number(el.dataset.count);
  if (!Number.isFinite(target)) return;
  const start = performance.now();
  const dur = 1400;
  const step = (now: number) => {
    const p = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - p, 4);
    el.textContent = String(Math.round(target * eased));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

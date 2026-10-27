"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { RotateCcw } from "lucide-react";
import { buttonClass } from "@/components/ui";

// Shown for unexpected server/render errors. Never displays raw error details.
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="pub-grain flex flex-1 items-center justify-center bg-paper px-4 py-20">
      <div className="app-rise max-w-md text-center" role="alert">
        {/* A ledger sheet with a crossed-out line */}
        <svg viewBox="0 0 120 96" className="mx-auto h-24 w-32 text-ink" aria-hidden>
          <rect x="30" y="12" width="64" height="76" rx="5" fill="#f6dfd3" />
          <rect x="26" y="8" width="64" height="76" rx="5" fill="#fff" stroke="currentColor" strokeWidth="1.75" />
          <path d="M36 26h44M36 38h44M36 62h30" stroke="currentColor" strokeOpacity=".25" strokeWidth="1.75" strokeLinecap="round" />
          <path d="M34 50h48" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          <path className="pub-draw" pathLength={1} d="M32 54c12-8 28-6 52-10" stroke="#d9531f" strokeWidth="2.5" strokeLinecap="round" fill="none" style={{ "--d": "300ms" } as CSSProperties} />
        </svg>
        <h1 className="mt-4 font-editorial text-4xl text-ink">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted">The page could not be loaded. Please try again. If it keeps happening, contact your administrator.</p>
        <div className="mt-6 flex justify-center gap-3">
          <button onClick={reset} className={buttonClass("primary")}><RotateCcw className="size-4" aria-hidden /> Try again</button>
          <Link href="/" className={buttonClass("secondary")}>Home</Link>
        </div>
      </div>
    </main>
  );
}

import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowLeft } from "lucide-react";
import { Stamp } from "@/components/public/art";
import { SplitWords } from "@/components/public/motion";

export default function NotFound() {
  return (
    <main id="main" className="pub-grain relative flex flex-1 items-center overflow-hidden bg-paper px-4 py-20 text-ink">
      <div aria-hidden className="pub-dots absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,#000,transparent_65%)]" />
      <div className="relative mx-auto grid w-full max-w-5xl items-center gap-12 md:grid-cols-[1.2fr_1fr]">
        <div>
          <p className="pub-in font-mono text-sm text-muted">Error 404</p>
          <h1 className="mt-4 font-editorial text-[clamp(3rem,8vw,5.8rem)] leading-[0.92] tracking-[-0.03em]">
            <SplitWords text="Page not found." em={["found."]} />
          </h1>
          <p className="pub-in mt-3 font-editorial text-2xl italic text-ink/70" style={{ "--d": "250ms" } as CSSProperties}>This page was never filed.</p>
          <p className="pub-in mt-5 max-w-md text-lg text-ink/70" style={{ "--d": "300ms" } as CSSProperties}>
            The page may have moved, or you may not have access to the record you were looking for.
          </p>
          <div className="pub-in mt-8 flex flex-wrap gap-3" style={{ "--d": "450ms" } as CSSProperties}>
            <Link href="/" className="pub-btn pub-btn-ghost"><ArrowLeft className="size-4" aria-hidden /> Home</Link>
            <Link href="/app" className="pub-btn">Go to my dashboard</Link>
          </div>
        </div>
        {/* A misfiled sheet sliding out of its folder */}
        <div aria-hidden className="relative mx-auto aspect-square w-full max-w-[340px]">
          <svg viewBox="0 0 300 300" className="absolute inset-0 size-full">
            <path d="M30 110h90l18 18h132v142H30z" fill="#e3a21a" stroke="#1b1f24" strokeWidth="2" />
            <g className="pub-sway" style={{ transformOrigin: "150px 60px" }}>
              <g style={{ animation: "pub-in 900ms var(--ease-out-expo) 200ms both" }}>
                <rect x="70" y="40" width="160" height="190" rx="6" fill="#fff" stroke="#1b1f24" strokeWidth="2" transform="rotate(-8 150 135)" />
                <g transform="rotate(-8 150 135)" stroke="#1b1f24" strokeLinecap="round">
                  <path d="M92 74h90M92 94h116M92 114h70" strokeWidth="6" strokeOpacity=".18" />
                  <text x="92" y="180" fontFamily="Arial, Helvetica, sans-serif" fontSize="64" fill="#1b1f24" stroke="none">404</text>
                </g>
              </g>
            </g>
            <path d="M30 160h240v110H30z" fill="#fbeccb" stroke="#1b1f24" strokeWidth="2" />
            <path d="M120 200h60" stroke="#1b1f24" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <Stamp id="nf" className="pub-stamp absolute -bottom-4 -right-2 w-[48%]" style={{ "--d": "900ms" } as CSSProperties} top="RECORD NOT FOUND" bottom="PLEASE CHECK THE LINK" center="404" />
        </div>
      </div>
    </main>
  );
}

import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowUp, ArrowUpRight, Clock, Mail, MapPin, Phone } from "lucide-react";
import { FIRM } from "@/lib/firm";
import { MotionDirector } from "@/components/motion-director";
import { PUBLIC_NAV } from "@/components/public/nav";
import { SiteHeader, Wordmark } from "@/components/public/site-header";
import { Star } from "@/components/public/art";

const TEL = "tel:+911147094120";

export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-paper text-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <MotionDirector />
      <SiteHeader phone={FIRM.phone} tel={TEL} />

      <main id="main" className="flex-1">
        {children}
      </main>

      <footer className="pub-night-grid relative overflow-hidden text-paper">
        <div className="mx-auto max-w-7xl px-4 pt-16 sm:px-6 lg:px-8">
          <div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <div data-reveal="">
              <Wordmark light />
              <p className="mt-5 max-w-xs text-sm leading-relaxed text-paper/65">
                Accounting, GST, income tax, TDS and audit for businesses in and around Naraina Industrial Area, since {FIRM.established}.
              </p>
              <a href={FIRM.mapsUrl} target="_blank" rel="noopener noreferrer" className="pub-btn pub-btn-outline-light pub-btn-sm mt-6">
                Get directions <ArrowUpRight className="arrow size-4" aria-hidden />
              </a>
            </div>
            <div data-reveal="" style={{ "--i": 1 } as CSSProperties}>
              <p className="font-mono text-xs text-marigold">Visit</p>
              <p className="mt-3 flex gap-2 text-sm leading-relaxed text-paper/75"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />{FIRM.address}</p>
              <p className="mt-2 pl-6 text-xs text-paper/50">{FIRM.landmark}</p>
            </div>
            <div data-reveal="" style={{ "--i": 2 } as CSSProperties}>
              <p className="font-mono text-xs text-marigold">Talk to us</p>
              <ul className="mt-3 space-y-2 text-sm text-paper/75">
                <li><a className="pub-link inline-flex items-center gap-2 hover:text-paper" href={TEL}><Phone className="size-4" aria-hidden />{FIRM.phone}</a></li>
                <li><a className="pub-link inline-flex items-center gap-2 break-all hover:text-paper" href={`mailto:${FIRM.email}`}><Mail className="size-4 shrink-0" aria-hidden />{FIRM.email}</a></li>
                <li className="flex gap-2"><Clock className="mt-0.5 size-4 shrink-0" aria-hidden />{FIRM.officeHours}</li>
              </ul>
            </div>
            <div data-reveal="" style={{ "--i": 3 } as CSSProperties}>
              <p className="font-mono text-xs text-marigold">Explore</p>
              <ul className="mt-3 space-y-2 text-sm text-paper/75">
                {PUBLIC_NAV.map((n) => (
                  <li key={n.href}><Link href={n.href} className="pub-link hover:text-paper">{n.label}</Link></li>
                ))}
                <li><Link href="/login" className="pub-link hover:text-paper">Sign in</Link></li>
                <li><Link href="/register" className="pub-link hover:text-paper">Create account</Link></li>
              </ul>
            </div>
          </div>
        </div>

        {/* Oversized wordmark that drifts sideways as it scrolls through view */}
        <div aria-hidden className="mt-16 overflow-hidden border-y border-paper/10 py-4">
          <p className="pub-scroll-x flex items-center gap-8 whitespace-nowrap font-editorial text-[clamp(4rem,13vw,11rem)] leading-none text-paper/[0.09]" style={{ "--from": "4%", "--to": "-22%" } as CSSProperties}>
            Office <Star className="size-[0.35em] text-stamp-bright/60" /> <span className="italic">ERP</span> <Star className="size-[0.35em] text-marigold/60" /> Since {FIRM.established}
          </p>
        </div>

        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-xs text-paper/50 sm:px-6 lg:px-8">
          <p>© {FIRM.name} · {FIRM.nic}</p>
          <a href="#main" data-ripple className="group inline-flex items-center gap-2 rounded-full border border-paper/20 px-3 py-1.5 text-paper/70 transition-colors hover:border-paper/50 hover:text-paper">
            Back to top <ArrowUp className="size-3.5 transition-transform duration-500 ease-[var(--ease-spring)] group-hover:-translate-y-0.5" aria-hidden />
          </a>
        </div>
      </footer>
    </div>
  );
}

import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import { Phone } from "lucide-react";
import { BILLING_BASES, FIRM } from "@/lib/firm";
import { getPublicServices } from "@/lib/services/public-content";
import { Stamp } from "@/components/public/art";
import { Eyebrow, PageTransition, SplitWords, reveal } from "@/components/public/motion";
import { QuoteBuilder } from "@/components/public/quote-builder";

export const metadata: Metadata = { title: "Pricing" };
export const revalidate = 300;

// No prices have been confirmed for publication, so this page explains how
// engagements are billed (from the firm's own billing-basis master) and routes
// enquiries to the office. Do not add figures here without written approval.

/** Small calendar-rhythm illustration for each billing basis. */
function Rhythm({ code }: { code: string }): ReactNode {
  const dot = (i: number, on = true) => (
    <span key={i} className={`block rounded-[3px] transition-all duration-500 ease-[var(--ease-spring)] group-hover:scale-110 ${on ? "bg-ink" : "bg-ink/10"}`} style={{ transitionDelay: `${i * 30}ms` }} />
  );
  switch (code) {
    case "BIL-01": return <span className="grid h-12 w-full grid-cols-6 gap-1">{Array.from({ length: 12 }, (_, i) => dot(i))}</span>;
    case "BIL-02": return <span className="grid h-12 w-full grid-cols-6 gap-1">{Array.from({ length: 12 }, (_, i) => dot(i, i % 3 === 2))}</span>;
    case "BIL-03": return <span className="grid h-12 w-full grid-cols-6 gap-1">{Array.from({ length: 12 }, (_, i) => dot(i, i === 11))}</span>;
    case "BIL-04":
      return (
        <svg viewBox="0 0 120 48" className="h-12 w-full" aria-hidden>
          <path d="M4 6h112v12a6 6 0 0 0 0 12v12H4V30a6 6 0 0 0 0-12z" fill="none" stroke="currentColor" strokeWidth="1.75" />
          <path d="M84 8v32" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
          <path d="M18 20h50M18 28h34" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 120 48" className="h-12 w-full" aria-hidden>
          <circle cx="24" cy="24" r="19" fill="none" stroke="currentColor" strokeWidth="1.75" />
          <path className="origin-[24px_24px] transition-transform duration-700 group-hover:rotate-[300deg]" d="M24 12v12l8 5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          <path d="M56 16h56M56 24h40M56 32h48" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" opacity=".5" />
        </svg>
      );
  }
}

const FACTORS = [
  ["Your constitution", "A proprietorship, partnership, LLP or company each carries different filings and registers."],
  ["Transaction volume", "How many invoices, purchases and bank entries we post and reconcile each month."],
  ["GSTINs and locations", "Every GSTIN is a separate set of returns and reconciliations."],
  ["Services and frequency", "Monthly compliance, quarterly statements, annual returns or one-time work."],
  ["Where the work happens", "At our office, or on-site at your premises on agreed days."],
];

export default async function PricingPage() {
  const services = await getPublicServices();
  return (
    <PageTransition>
      <section className="pub-grain relative overflow-hidden border-b border-ink/10">
        <div aria-hidden className="pub-dots absolute inset-0 [mask-image:radial-gradient(ellipse_at_80%_30%,#000,transparent_60%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[1.3fr_1fr] lg:items-center lg:px-8">
          <div>
            <div className="pub-in"><Eyebrow>Fees &amp; billing</Eyebrow></div>
            <h1 className="mt-5 font-editorial text-[clamp(3.4rem,9vw,7.5rem)] leading-[0.9] tracking-[-0.03em]">
              <SplitWords text="Pricing" />
            </h1>
            <p className="pub-in mt-6 max-w-xl text-lg leading-relaxed text-ink/70" style={{ "--d": "300ms" } as CSSProperties}>
              Every business has different volumes and compliance requirements, so fees are agreed per engagement after an initial discussion. Here is how engagements are billed — and an easy way to ask for a proposal.
            </p>
            <div className="pub-in mt-8 flex flex-wrap gap-3" style={{ "--d": "450ms" } as CSSProperties}>
              <a href="#quote" className="pub-btn">Build a quote request</a>
              <a href="tel:+911147094120" className="pub-btn pub-btn-ghost"><Phone className="size-4" aria-hidden /> {FIRM.phone}</a>
            </div>
          </div>

          {/* Receipt illustration */}
          <div aria-hidden className="relative mx-auto w-full max-w-[360px]">
            <div className="pub-in pub-float relative rotate-[-2.5deg] bg-surface px-6 pb-10 pt-6 font-mono text-xs shadow-[0_30px_60px_-30px_rgb(15_29_51/.5)]" style={{ "--d": "200ms", "--t": "9s" } as CSSProperties}>
              <p className="text-center font-editorial text-2xl">S S Dimri &amp; Associates</p>
              <p className="mt-1 text-center text-[10px] text-muted">PROPOSAL · DRAFT</p>
              <div className="my-4 border-t border-dashed border-ink/30" />
              {[["Scope", "agreed with you"], ["Frequency", "as required"], ["Billing", "your choice"], ["Visits", "if needed"]].map(([k, v], i) => (
                <p key={k} className="flex justify-between py-1.5" style={{ animation: `pub-in 600ms var(--ease-out-expo) ${500 + i * 120}ms both` }}>
                  <span className="text-muted">{k}</span><span>{v}</span>
                </p>
              ))}
              <div className="my-4 border-t border-dashed border-ink/30" />
              <p className="flex justify-between text-sm font-semibold"><span>Fee</span><span>quoted per scope</span></p>
              {/* torn, scalloped bottom edge */}
              <span className="absolute inset-x-0 -bottom-[7px] h-4 bg-[radial-gradient(circle_at_8px_100%,var(--color-paper)_7px,transparent_7.5px)] bg-[length:16px_16px]" />
            </div>
            <Stamp id="price" className="pub-stamp absolute -bottom-6 -right-4 w-36" style={{ "--d": "1100ms" } as CSSProperties} top="QUOTED PER ENGAGEMENT" bottom="S S DIMRI & ASSOCIATES" center="Quote" />
          </div>
        </div>
      </section>

      {/* Billing bases */}
      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div data-reveal="" className="max-w-2xl">
          <Eyebrow n="01">How engagements are billed</Eyebrow>
          <h2 className="mt-4 font-editorial text-[clamp(2.2rem,4.6vw,3.6rem)] leading-[1.02] tracking-[-0.015em]">
            Pick the rhythm that <em className="text-stamp">fits your work</em>.
          </h2>
        </div>
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {BILLING_BASES.map((b, i) => (
            <li key={b.code} {...reveal(i)} data-spotlight className="pub-press group flex flex-col rounded-2xl border border-ink/10 bg-surface p-5 hover:border-ink/25">
              <Rhythm code={b.code} />
              <p className="mt-6 font-mono text-[11px] text-muted">{b.code}</p>
              <h3 className="mt-1 font-editorial text-2xl leading-tight">{b.label}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{b.description}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Factors */}
      <section className="pub-night-grid relative overflow-hidden text-paper">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[1fr_1.5fr] lg:px-8">
          <div data-reveal="left" className="lg:sticky lg:top-28 lg:self-start">
            <Eyebrow n="02" light>What shapes a quote</Eyebrow>
            <h2 className="mt-4 font-editorial text-[clamp(2.2rem,4.4vw,3.4rem)] leading-[1.02]">Five things we ask <em className="text-marigold">before we quote.</em></h2>
          </div>
          <ol className="divide-y divide-paper/10 border-y border-paper/10">
            {FACTORS.map(([t, d], i) => (
              <li key={t} {...reveal(i, "right")} className="group grid grid-cols-[3.5rem_1fr] gap-4 py-6">
                <span className="font-editorial text-5xl italic leading-none text-paper/25 transition-colors duration-500 group-hover:text-marigold">{i + 1}</span>
                <span>
                  <span className="block font-editorial text-2xl">{t}</span>
                  <span className="mt-1 block text-sm leading-relaxed text-paper/60">{d}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Quote builder */}
      <section id="quote" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-24 sm:px-6 lg:px-8">
        <div data-reveal="" className="max-w-2xl">
          <Eyebrow n="03">Request a quote</Eyebrow>
          <h2 className="mt-4 font-editorial text-[clamp(2.2rem,4.6vw,3.6rem)] leading-[1.02] tracking-[-0.015em]">Tell us about your business.</h2>
          <p className="mt-4 text-muted">Tell us your business type, monthly transaction volume and the services you need. We will respond with a proposal.</p>
        </div>
        <div className="mt-12" data-reveal="" style={{ "--i": 1 } as CSSProperties}>
          <QuoteBuilder services={services.map((s) => s.name)} bases={BILLING_BASES.map((b) => ({ code: b.code, label: b.label }))} email={FIRM.email} />
        </div>
      </section>
    </PageTransition>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import type { CSSProperties } from "react";
import { ArrowRight, IdCard, Landmark } from "lucide-react";
import { getPublicOrganization } from "@/lib/services/public-org";
import { isFirmRegistrationOpen } from "@/lib/services/firm-registration";
import { Stamp } from "@/components/public/art";
import { Eyebrow, PageTransition, SplitWords, reveal } from "@/components/public/motion";

export const metadata: Metadata = { title: "Create an account" };

/** Full registration: a stack of six form sheets. */
function SheetsArt() {
  return (
    <svg viewBox="0 0 220 140" className="h-36 w-full" aria-hidden>
      {[5, 4, 3, 2, 1, 0].map((i) => (
        <g key={i} className="transition-transform duration-700 ease-[var(--ease-spring)] group-hover:[transform:var(--fan)]" style={{ "--fan": `translate(${i * 7}px, ${-i * 3}px) rotate(${i * 2.5}deg)`, transformOrigin: "60px 130px" } as CSSProperties}>
          <rect x={40 + i * 3} y={20 - i * 2} width="120" height="104" rx="6" fill={i === 0 ? "#fff" : ["#f6dfd3", "#fbeccb", "#dcece2", "#dde7f3", "#ece6d8"][i - 1]} stroke="#1b1f24" strokeWidth="1.5" />
        </g>
      ))}
      <g>
        <text x="54" y="44" fontFamily="var(--font-geist-mono), monospace" fontSize="9" fill="#5d6470">STEP 1 OF 6</text>
        <path d="M54 58h80M54 72h80M54 86h52" stroke="#1b1f24" strokeOpacity=".3" strokeWidth="5" strokeLinecap="round" />
        <rect x="54" y="98" width="44" height="14" rx="4" fill="#1b1f24" />
      </g>
    </svg>
  );
}

/** Quick registration: a single slip with a lightning stripe. */
function SlipArt() {
  return (
    <svg viewBox="0 0 220 140" className="h-36 w-full" aria-hidden>
      <g className="transition-transform duration-700 ease-[var(--ease-spring)] group-hover:-translate-y-2 group-hover:rotate-[-3deg]" style={{ transformOrigin: "110px 80px" }}>
        <rect x="48" y="26" width="128" height="88" rx="6" fill="#fbeccb" transform="translate(4 4)" />
        <rect x="48" y="26" width="128" height="88" rx="6" fill="#fff" stroke="#1b1f24" strokeWidth="1.5" />
        <path d="M62 50h60M62 64h44M62 78h70" stroke="#1b1f24" strokeOpacity=".3" strokeWidth="5" strokeLinecap="round" />
        <rect x="62" y="92" width="38" height="12" rx="4" fill="#1b1f24" />
        <path d="M152 36l-14 24h12l-8 22 20-28h-12l8-18z" fill="#e3a21a" stroke="#1b1f24" strokeWidth="1.5" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

export default async function RegisterChoice() {
  await connection(); // depends on live database state (which firm exists); never prerender
  const [org, firmOpen] = await Promise.all([getPublicOrganization(), isFirmRegistrationOpen()]);
  const options = [
    {
      href: "/register/business" as const,
      art: <SheetsArt />,
      tag: "6 short sections",
      title: "Register your business",
      text: "Full registration: business identity, constitution and partners/directors, GSTINs, compliance numbers, documents and the services you need.",
      enabled: !!org,
    },
    {
      href: "/register/quick" as const,
      art: <SlipArt />,
      tag: "A few minutes",
      title: "Quick registration",
      text: "Just the essentials — name, contact and GSTIN. You can complete the remaining details after approval.",
      enabled: !!org,
    },
  ];
  return (
    <PageTransition>
      <section className="pub-grain relative overflow-hidden">
        <div aria-hidden className="pub-dots absolute inset-0 [mask-image:radial-gradient(ellipse_at_50%_0%,#000,transparent_60%)]" />
        <Stamp id="reg" className="pub-stamp pointer-events-none absolute -right-10 top-10 hidden w-48 opacity-80 lg:block" style={{ "--d": "900ms" } as CSSProperties} top="NEW CLIENT REGISTRATION" bottom="S S DIMRI & ASSOCIATES" center="Welcome" />
        <div className="relative mx-auto max-w-5xl px-4 pb-24 pt-14 sm:px-6">
          <div className="pub-in"><Eyebrow>Get started</Eyebrow></div>
          <h1 className="mt-5 font-editorial text-[clamp(3rem,7.5vw,6rem)] leading-[0.92] tracking-[-0.03em]">
            <SplitWords text="Create an account" em={["account"]} />
          </h1>
          <p className="pub-in mt-5 max-w-2xl text-lg text-ink/70" style={{ "--d": "250ms" } as CSSProperties}>
            Choose the option that describes you. Business registrations are reviewed by our office before the account is activated.
          </p>

          {!org && (
            <p role="status" className="pub-swap mt-8 rounded-xl border border-warn/30 bg-warn-bg px-4 py-3 text-sm text-warn">
              Online business registration is not open yet. Please contact the office to register.
            </p>
          )}

          <ul className="mt-12 grid gap-5 md:grid-cols-2">
            {options.map((o, i) => (
              <li key={o.href} {...reveal(i, "scale")}>
                {o.enabled ? (
                  <Link href={o.href} transitionTypes={["nav-forward"]} data-tilt="5" data-spotlight
                    className="group flex h-full flex-col overflow-hidden rounded-3xl border-[1.5px] border-ink/15 bg-surface transition-[border-color,box-shadow] duration-500 hover:border-ink hover:shadow-[8px_8px_0_0_var(--color-ink)]">
                    <span className="border-b border-ink/10 bg-paper-2/60 px-6 pt-6">{o.art}</span>
                    <span className="flex flex-1 flex-col p-6">
                      <span className="w-fit rounded-full bg-paper-2 px-2.5 py-1 font-mono text-[11px] text-muted">{o.tag}</span>
                      <span className="mt-4 font-editorial text-3xl leading-tight">{o.title}</span>
                      <span className="mt-2 flex-1 text-sm leading-relaxed text-muted">{o.text}</span>
                      <span className="mt-6 inline-flex items-center gap-2 font-medium">
                        Start <ArrowRight className="size-4 transition-transform duration-500 ease-[var(--ease-spring)] group-hover:translate-x-1.5" aria-hidden />
                      </span>
                    </span>
                  </Link>
                ) : (
                  <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-dashed border-ink/20 opacity-60">
                    <span className="border-b border-ink/10 px-6 pt-6 grayscale">{o.art}</span>
                    <span className="p-6">
                      <span className="font-editorial text-3xl">{o.title}</span>
                      <span className="mt-2 block text-sm text-muted">{o.text}</span>
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>

          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <div {...reveal(0)} className="flex gap-4 rounded-2xl border border-ink/10 bg-surface/70 p-5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-paper-2"><IdCard className="size-5" aria-hidden /></span>
              <div>
                <p className="font-medium">Joining S S Dimri &amp; Associates as staff?</p>
                <p className="mt-1 text-sm text-muted">
                  Staff accounts are created by the firm&apos;s administrator. You will receive a one-time link to set your password, then complete your onboarding details for approval.
                </p>
              </div>
            </div>
            {firmOpen && (
              <div {...reveal(1)} className="flex gap-4 rounded-2xl border border-ink/10 bg-surface/70 p-5">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-paper-2"><Landmark className="size-5" aria-hidden /></span>
                <div>
                  <p className="font-medium">Setting up the practice portal for a firm?</p>
                  <p className="mt-1 text-sm text-muted">
                    The firm owner registers the practice once. <Link href="/register/firm" className="pub-link font-medium text-stamp">Register a firm (owner)</Link>
                  </p>
                </div>
              </div>
            )}
          </div>
          <p className="mt-8 text-sm text-muted">Already have an account? <Link href="/login" className="pub-link font-medium text-stamp">Sign in</Link></p>
        </div>
      </section>
    </PageTransition>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import type { CSSProperties } from "react";
import { ArrowRight, Building2, IdCard } from "lucide-react";
import { isFirmRegistrationOpen } from "@/lib/services/firm-registration";
import { Stamp } from "@/components/public/art";
import { Eyebrow, PageTransition, SplitWords, reveal } from "@/components/public/motion";

export const metadata: Metadata = { title: "Create an account" };

/** Firm registration: a stack of form sheets. */
function SheetsArt() {
  return (
    <svg viewBox="0 0 220 140" className="h-36 w-full" aria-hidden>
      {[5, 4, 3, 2, 1, 0].map((i) => (
        <g key={i} className="transition-transform duration-700 ease-[var(--ease-spring)] group-hover:[transform:var(--fan)]" style={{ "--fan": `translate(${i * 7}px, ${-i * 3}px) rotate(${i * 2.5}deg)`, transformOrigin: "60px 130px" } as CSSProperties}>
          <rect x={40 + i * 3} y={20 - i * 2} width="120" height="104" rx="6" fill={i === 0 ? "#fff" : ["#f6dfd3", "#fbeccb", "#dcece2", "#dde7f3", "#ece6d8"][i - 1]} stroke="#1b1f24" strokeWidth="1.5" />
        </g>
      ))}
      <g>
        <text x="54" y="44" fontFamily="Arial, Helvetica, sans-serif" fontSize="9" fill="#5d6470">STEP 1 OF 5</text>
        <path d="M54 58h80M54 72h80M54 86h52" stroke="#1b1f24" strokeOpacity=".3" strokeWidth="5" strokeLinecap="round" />
        <rect x="54" y="98" width="44" height="14" rx="4" fill="#1b1f24" />
      </g>
    </svg>
  );
}

export default async function RegisterChoice() {
  await connection(); // depends on runtime configuration; never prerender
  const firmOpen = await isFirmRegistrationOpen();
  const options = [
    {
      href: "/register/firm" as const,
      art: <SheetsArt />,
      tag: "5 short sections",
      title: "Register your firm",
      text: "For the firm owner or administrator: your login, the firm's registration details, constitution and partners/directors, certificate and logo, and users. Your firm gets its own private portal.",
      enabled: firmOpen,
    },
  ];
  return (
    <PageTransition>
      <section className="pub-grain relative overflow-hidden">
        <div aria-hidden className="pub-dots absolute inset-0 [mask-image:radial-gradient(ellipse_at_50%_0%,#000,transparent_60%)]" />
        <Stamp id="reg" className="pub-stamp pointer-events-none absolute -right-10 top-10 hidden w-48 opacity-80 lg:block" style={{ "--d": "900ms" } as CSSProperties} top="NEW FIRM REGISTRATION" bottom="OFFICE ERP" center="Welcome" />
        <div className="relative mx-auto max-w-5xl px-4 pb-24 pt-14 sm:px-6">
          <div className="pub-in"><Eyebrow>Get started</Eyebrow></div>
          <h1 className="mt-5 font-editorial text-[clamp(3rem,7.5vw,6rem)] leading-[0.92] tracking-[-0.03em]">
            <SplitWords text="Create an account" em={["account"]} />
          </h1>
          <p className="pub-in mt-5 max-w-2xl text-lg text-ink/70" style={{ "--d": "250ms" } as CSSProperties}>
            Register your firm to get its own practice portal. Clients and staff do not sign up here: the firm registers them and sends their login.
          </p>

          {!firmOpen && (
            <p role="status" className="pub-swap mt-8 rounded-xl border border-warn/30 bg-warn-bg px-4 py-3 text-sm text-warn">
              New firm sign-ups are paused for now. Existing firms can sign in as usual.
            </p>
          )}

          <ul className="mt-12 grid gap-5 md:max-w-xl">
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
                <p className="font-medium">Joining a firm as staff?</p>
                <p className="mt-1 text-sm text-muted">
                  Staff accounts are created by your firm&apos;s administrator. You will receive your login by email, set your own password, then complete your onboarding details for approval.
                </p>
              </div>
            </div>
            <div {...reveal(1)} className="flex gap-4 rounded-2xl border border-ink/10 bg-surface/70 p-5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-paper-2"><Building2 className="size-5" aria-hidden /></span>
              <div>
                <p className="font-medium">A client of a firm?</p>
                <p className="mt-1 text-sm text-muted">
                  Your firm registers your business from its admin portal and invites you to the client portal. Ask your firm for an invitation, then sign in.
                </p>
              </div>
            </div>
          </div>
          <p className="mt-8 text-sm text-muted">Already have an account? <Link href="/login" className="pub-link font-medium text-stamp">Sign in</Link></p>
        </div>
      </section>
    </PageTransition>
  );
}

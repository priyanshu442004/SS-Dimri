import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { Stamp } from "./art";
import { Eyebrow, PageTransition, SplitWords } from "./motion";

/** Frame for the registration forms: header, form column and a "what happens next" rail. */
export function RegisterFrame({ back, eyebrow, title, em, description, next, children }: {
  back?: { href: "/register" | "/login"; label: string };
  eyebrow: string;
  title: string;
  em?: string[];
  description: ReactNode;
  next: string[];
  children: ReactNode;
}) {
  return (
    <PageTransition>
      <section className="pub-grain relative overflow-hidden">
        <div aria-hidden className="pub-dots absolute inset-x-0 top-0 h-96 [mask-image:linear-gradient(to_bottom,#000,transparent)]" />
        <div className="relative mx-auto grid max-w-6xl gap-12 px-4 pb-24 pt-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:px-8">
          <div className="min-w-0">
            {back && (
              <Link href={back.href} transitionTypes={["nav-back"]} className="group inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink">
                <ArrowLeft className="size-4 transition-transform duration-300 group-hover:-translate-x-1" aria-hidden /> {back.label}
              </Link>
            )}
            <div className="pub-in mt-8"><Eyebrow>{eyebrow}</Eyebrow></div>
            <h1 className="mt-4 font-editorial text-[clamp(2.6rem,6vw,4.6rem)] leading-[0.95] tracking-[-0.025em]">
              <SplitWords text={title} em={em} />
            </h1>
            <div className="pub-in mt-4 max-w-2xl text-lg leading-relaxed text-ink/70" style={{ "--d": "250ms" } as CSSProperties}>{description}</div>
            <div className="pub-form pub-steps pub-in mt-2" style={{ "--d": "380ms" } as CSSProperties}>{children}</div>
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-28 pt-24">
              <div className="pub-in relative rounded-2xl border border-ink/10 bg-surface/80 p-5" style={{ "--d": "500ms" } as CSSProperties}>
                <Stamp id="frame" className="pub-stamp absolute -right-8 -top-12 w-24" style={{ "--d": "1100ms" } as CSSProperties} top="REGISTRATION" bottom="OFFICE ERP" center="New" />
                <p className="font-mono text-xs text-muted">What happens next</p>
                <ol className="mt-4 space-y-4">
                  {next.map((n, i) => (
                    <li key={n} className="flex gap-3 text-sm" style={{ animation: `pub-in 700ms var(--ease-out-expo) ${650 + i * 120}ms both` }}>
                      <span className="grid size-6 shrink-0 place-items-center rounded-full border border-ink/20 font-editorial text-sm italic">{i + 1}</span>
                      <span className="leading-snug text-ink/75">{n}</span>
                    </li>
                  ))}
                </ol>
                <p className="mt-5 flex items-center gap-2 border-t border-ink/10 pt-4 text-xs text-muted">
                  <Check className="size-3.5 text-ledger" aria-hidden /> Documents are stored privately
                </p>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </PageTransition>
  );
}

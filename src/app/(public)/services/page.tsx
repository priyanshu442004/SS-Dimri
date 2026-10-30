import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowUpRight, Phone } from "lucide-react";
import { FIRM } from "@/lib/firm";
import { getPublicServices } from "@/lib/services/public-content";
import { DEPT_TONE, DeptIcon, Stamp, deptKey } from "@/components/public/art";
import { Eyebrow, PageTransition, SplitWords, reveal } from "@/components/public/motion";
import { ScrollSpy } from "@/components/public/scroll-spy";

export const metadata: Metadata = { title: "Services" };
export const revalidate = 300; // service catalogue changes rarely

const anchor = (d: string) => `dept-${d.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

export default async function ServicesPage() {
  const services = await getPublicServices();
  const departments = [...new Set(services.map((s) => s.department))];
  return (
    <PageTransition>
      {/* Hero */}
      <section className="pub-grain relative overflow-hidden border-b border-ink/10">
        <div aria-hidden className="pub-dots absolute inset-0 [mask-image:linear-gradient(to_bottom,#000,transparent)]" />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[1.3fr_1fr] lg:items-end lg:px-8 lg:pb-20">
          <div>
            <div className="pub-in"><Eyebrow n={String(services.length).padStart(2, "0")}>Services offered</Eyebrow></div>
            <h1 className="mt-5 font-editorial text-[clamp(3.4rem,9vw,7.5rem)] leading-[0.9] tracking-[-0.03em]">
              <SplitWords text="Services" />
            </h1>
            <p className="pub-in mt-6 max-w-xl text-lg leading-relaxed text-ink/70" style={{ "--d": "300ms" } as CSSProperties}>
              Professional services offered by {FIRM.name}, grouped by department. Scope and frequency are agreed with each client.
            </p>
          </div>
          {/* Floating department marks */}
          <div aria-hidden className="relative hidden h-56 lg:block">
            {departments.slice(0, 6).map((d, i) => {
              const pos = [[6, 8], [40, 0], [72, 14], [18, 52], [54, 46], [82, 58]][i];
              return (
                <span key={d} className="pub-pop absolute" style={{ left: `${pos[0]}%`, top: `${pos[1]}%`, "--d": `${300 + i * 110}ms` } as CSSProperties}>
                  <span className="pub-float grid size-20 place-items-center rounded-2xl border border-ink/10 shadow-[0_18px_30px_-20px_rgb(15_29_51/.5)]"
                    style={{ background: DEPT_TONE[deptKey(d)].soft, "--t": `${7 + i}s`, "--fd": `${-i * 0.8}s`, rotate: `${[-6, 4, -3, 7, -5, 3][i]}deg` } as CSSProperties}>
                    <DeptIcon name={d} className="size-12" />
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-4 pb-24 sm:px-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-16 lg:px-8 lg:pt-16">
        <ScrollSpy items={departments.map((d) => ({ id: anchor(d), label: d, count: services.filter((s) => s.department === d).length, color: DEPT_TONE[deptKey(d)].fill }))} />

        <div className="min-w-0 space-y-20">
          {departments.map((dept) => {
            const tone = DEPT_TONE[deptKey(dept)];
            const list = services.filter((s) => s.department === dept);
            return (
              <section key={dept} id={anchor(dept)} aria-labelledby={`h-${anchor(dept)}`} className="scroll-mt-36">
                <header data-reveal="" className="flex items-center gap-4 border-b border-ink/15 pb-5">
                  <span className="grid size-14 shrink-0 place-items-center rounded-xl" style={{ background: tone.soft }}><DeptIcon name={dept} className="size-10" /></span>
                  <h2 id={`h-${anchor(dept)}`} className="font-editorial text-4xl leading-none sm:text-5xl">{dept}</h2>
                </header>
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  {list.map((s, i) => (
                    <article key={s.slug} id={s.code ?? s.slug} data-spotlight {...reveal(i)}
                      className={`pub-press group relative flex flex-col rounded-2xl border border-ink/10 bg-surface p-6 hover:border-ink/25 ${list.length % 2 === 1 && i === list.length - 1 ? "md:col-span-2" : ""}`}
                      style={{ "--i": i, "--spot": `${tone.fill}1f` } as CSSProperties}>
                      <div className="flex items-start justify-between gap-4">
                        <span className="font-mono text-[11px] text-muted">{s.code}</span>
                        <span className="grid size-9 place-items-center rounded-full border border-ink/15 transition-all duration-500 ease-[var(--ease-spring)] group-hover:rotate-45 group-hover:border-ink group-hover:bg-ink group-hover:text-paper">
                          <ArrowUpRight className="size-4" aria-hidden />
                        </span>
                      </div>
                      <h3 className="mt-4 font-editorial text-[1.75rem] leading-tight">
                        <Link href={`/services/${s.slug}`} transitionTypes={["nav-forward"]} className="after:absolute after:inset-0 after:rounded-2xl after:content-['']">{s.name}</Link>
                      </h3>
                      {s.frequency && <p className="mt-1 text-sm" style={{ color: tone.text }}>{s.frequency}</p>}
                      <p className="mt-4 flex-1 text-sm leading-relaxed text-ink/75">{s.description}</p>
                      {s.deliverable && (
                        <p className="mt-5 rounded-lg bg-paper px-3 py-2.5 text-sm text-muted">
                          <span className="font-medium text-ink">You receive:</span> {s.deliverable}
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            );
          })}

          <div data-reveal="scale" className="pub-night-grid relative overflow-hidden rounded-2xl p-8 text-paper sm:p-10">
            <Stamp id="svc" className="pub-spin-slow pointer-events-none absolute -right-12 -top-12 w-52 opacity-30" color="#e3a21a" top="ASK THE OFFICE" bottom="CALL · EMAIL · VISIT" center="?" />
            <p className="relative font-editorial text-4xl leading-tight">Need a service not listed here?</p>
            <p className="relative mt-2 text-paper/65">Call or email us to discuss your requirements.</p>
            <div className="relative mt-6 flex flex-wrap gap-3">
              <a href={FIRM.tel} className="pub-btn pub-btn-light"><Phone className="size-4" aria-hidden /> Call {FIRM.phone}</a>
              <a href={`mailto:${FIRM.email}`} className="pub-btn pub-btn-outline-light">{FIRM.email}</a>
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, CalendarClock, CheckCircle2, FileCheck2, IndianRupee, Phone } from "lucide-react";
import { COMPLIANCES, FIRM } from "@/lib/firm";
import { getPublicServices } from "@/lib/services/public-content";
import { DEPT_TONE, DeptIcon, Stamp, deptKey } from "@/components/public/art";
import { Eyebrow, PageTransition, SplitWords, reveal } from "@/components/public/motion";

export const revalidate = 300;

async function find(slug: string) {
  const all = await getPublicServices();
  return { s: all.find((x) => x.slug === slug) ?? null, all };
}

export async function generateMetadata({ params }: PageProps<"/services/[slug]">): Promise<Metadata> {
  const { s } = await find((await params).slug);
  return { title: s?.name ?? "Service", description: s?.description ?? undefined };
}

const ENGAGEMENT = [
  { t: "Register", d: "Our office registers your business and invites you to the client portal." },
  { t: "Scope confirmed", d: "Our office reviews the details and agrees scope, frequency and fees with you." },
  { t: "Prepared & checked", d: "Work is prepared by one team member and reviewed by another before it goes out." },
  { t: "Shared in your portal", d: "Requests, documents and completed work are tracked in your client portal." },
];

export default async function ServiceDetail({ params }: PageProps<"/services/[slug]">) {
  const { s, all } = await find((await params).slug);
  if (!s) notFound();
  const tone = DEPT_TONE[deptKey(s.department)];
  const depts = s.department.split("/").map((d) => d.trim().toLowerCase());
  const compliances = COMPLIANCES.filter((c) => depts.includes(c.department.toLowerCase()));
  const related = all.filter((x) => x.slug !== s.slug && x.department === s.department).slice(0, 3);
  const others = related.length ? related : all.filter((x) => x.slug !== s.slug).slice(0, 3);

  return (
    <PageTransition>
      <section className="pub-grain relative overflow-hidden border-b border-ink/10" style={{ background: `linear-gradient(180deg, ${tone.soft}, var(--color-paper) 85%)` }}>
        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 pb-16 pt-10 sm:px-6 lg:grid-cols-[1.5fr_1fr] lg:items-center lg:px-8 lg:pb-24">
          <div>
            <Link href="/services" transitionTypes={["nav-back"]} className="group inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink">
              <ArrowLeft className="size-4 transition-transform duration-300 group-hover:-translate-x-1" aria-hidden /> All services
            </Link>
            <div className="pub-in mt-8"><Eyebrow n={s.code ?? undefined}>{s.department}</Eyebrow></div>
            <h1 className="mt-5 font-editorial text-[clamp(2.8rem,6.8vw,5.6rem)] leading-[0.95] tracking-[-0.025em]">
              <SplitWords text={s.name} />
            </h1>
            {s.description && (
              <p className="pub-in mt-6 max-w-2xl text-lg leading-relaxed text-ink/75" style={{ "--d": "350ms" } as CSSProperties}>{s.description}</p>
            )}
            <div className="pub-in mt-8 flex flex-wrap gap-3" style={{ "--d": "500ms" } as CSSProperties}>
              <a href="tel:+911147094120" className="pub-btn">Request this service <ArrowRight className="arrow size-4" aria-hidden /></a>
              <a href="tel:+911147094120" className="pub-btn pub-btn-ghost"><Phone className="size-4" aria-hidden /> {FIRM.phone}</a>
            </div>
          </div>
          <div aria-hidden className="relative mx-auto aspect-square w-full max-w-[340px]">
            <div className="pub-pop absolute inset-[12%] grid place-items-center rounded-[28%] border border-ink/10 bg-surface shadow-[0_40px_70px_-40px_rgb(15_29_51/.6)]" style={{ "--d": "200ms", rotate: "-4deg" } as CSSProperties}>
              <DeptIcon name={s.department} className="pub-float size-[62%]" style={{ "--t": "8s" } as CSSProperties} />
            </div>
            <Stamp id="detail" className="pub-stamp absolute -bottom-2 -right-2 w-[46%]" style={{ "--d": "900ms" } as CSSProperties} color={tone.fill}
              top={s.department.toUpperCase()} bottom="OFFICE ERP" center={s.code?.replace("SRV-", "№ ") ?? "№"} />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        {/* Facts */}
        <dl className="grid gap-4 md:grid-cols-3">
          {[
            { icon: CalendarClock, k: "Frequency", v: s.frequency },
            { icon: FileCheck2, k: "You receive", v: s.deliverable },
            { icon: IndianRupee, k: "Fees", v: "Quoted per engagement after understanding the scope." },
          ].filter((f) => f.v).map((f, i) => (
            <div key={f.k} {...reveal(i)} className="rounded-2xl border border-ink/10 bg-surface p-6">
              <dt className="flex items-center gap-2 text-sm text-muted"><f.icon className="size-4" style={{ color: tone.fill }} aria-hidden />{f.k}</dt>
              <dd className="mt-3 font-editorial text-2xl leading-snug">
                {f.v}
                {f.k === "Fees" && <Link href="/pricing" className="pub-link mt-3 block w-fit font-sans text-sm font-medium" style={{ color: tone.text }}>How we bill →</Link>}
              </dd>
            </div>
          ))}
        </dl>

        {/* Engagement timeline */}
        <section className="mt-24 grid gap-10 lg:grid-cols-[1fr_1.6fr]">
          <div data-reveal="left">
            <Eyebrow n="01">How the engagement runs</Eyebrow>
            <h2 className="mt-4 font-editorial text-[clamp(2rem,4vw,3rem)] leading-[1.05]">From registration to <em style={{ color: tone.text }}>delivered work</em>.</h2>
          </div>
          <ol className="relative border-l border-dashed border-ink/25 pl-8">
            {ENGAGEMENT.map((e, i) => (
              <li key={e.t} {...reveal(i, "right")} className="relative pb-10 last:pb-0">
                <span className="absolute -left-[49px] grid size-9 place-items-center rounded-full border-[1.5px] border-ink bg-paper font-editorial text-lg italic">{i + 1}</span>
                <h3 className="font-editorial text-2xl">{e.t}</h3>
                <p className="mt-1 max-w-lg text-sm leading-relaxed text-muted">{e.d}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Statutory deadlines for this department */}
        {compliances.length > 0 && (
          <section className="mt-24">
            <div data-reveal="" className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <Eyebrow n="02">Due dates we track</Eyebrow>
                <h2 className="mt-4 font-editorial text-[clamp(2rem,4vw,3rem)] leading-[1.05]">{s.department} compliance calendar</h2>
              </div>
              <p className="max-w-sm text-sm text-muted">Standard due dates; the government may extend them by notification.</p>
            </div>
            <div className="mt-8 overflow-hidden rounded-2xl border border-ink/10 bg-surface">
              <div className="hidden grid-cols-[1.4fr_1fr_1fr_1.4fr] gap-4 border-b border-ink/10 bg-paper-2/60 px-5 py-3 font-mono text-[11px] text-muted md:grid">
                <span>Compliance</span><span>Form</span><span>Frequency</span><span>Due</span>
              </div>
              <ul>
                {compliances.map((c, i) => (
                  <li key={c.name} {...reveal(Math.min(i, 8))} className="grid gap-1 border-b border-ink/5 px-5 py-4 text-sm transition-colors last:border-0 hover:bg-paper/70 md:grid-cols-[1.4fr_1fr_1fr_1.4fr] md:gap-4">
                    <span className="font-medium">{c.name}</span>
                    <span className="font-mono text-xs text-muted md:text-sm">{c.form}</span>
                    <span className="text-muted">{c.frequency}</span>
                    <span style={{ color: tone.text }}>{c.dueDateRule}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* Request panel */}
        <section data-reveal="scale" className="pub-night-grid relative mt-24 overflow-hidden rounded-3xl p-8 text-paper sm:p-12">
          <div aria-hidden className="absolute -left-24 -top-24 size-80 rounded-full blur-[90px]" style={{ background: `${tone.fill}55` }} />
          <div className="relative grid gap-10 lg:grid-cols-[1.2fr_1fr] lg:items-center">
            <div>
              <h2 className="font-editorial text-[clamp(2.2rem,4.5vw,3.5rem)] leading-[1.02]">Request this service</h2>
              <ul className="mt-6 space-y-3 text-paper/75">
                {["Call or visit our office: we register your business for you", "Our office confirms the engagement with you", "Track requests, documents and progress in your client portal"].map((t, i) => (
                  <li key={t} {...reveal(i)} className="flex gap-3"><CheckCircle2 className="mt-0.5 size-5 shrink-0 text-marigold" aria-hidden />{t}</li>
                ))}
              </ul>
            </div>
            <div className="flex flex-wrap gap-3 lg:justify-end">
              <a href="tel:+911147094120" className="pub-btn pub-btn-light">Call {FIRM.phone} <ArrowRight className="arrow size-4" aria-hidden /></a>
              <Link href="/login" className="pub-btn pub-btn-outline-light">Client sign in</Link>
            </div>
          </div>
        </section>

        {/* Related */}
        <section className="mt-24">
          <Eyebrow>{related.length ? `More in ${s.department}` : "Other services"}</Eyebrow>
          <ul className="mt-6 grid gap-4 md:grid-cols-3">
            {others.map((r, i) => (
              <li key={r.slug} {...reveal(i)}>
                <Link href={`/services/${r.slug}`} transitionTypes={["nav-forward"]} data-spotlight className="pub-press group flex h-full flex-col rounded-2xl border border-ink/10 bg-surface p-5 hover:border-ink/25">
                  <span className="flex items-center justify-between">
                    <DeptIcon name={r.department} className="size-10" />
                    <ArrowUpRight className="size-5 text-muted transition-transform duration-500 ease-[var(--ease-spring)] group-hover:rotate-45 group-hover:text-ink" aria-hidden />
                  </span>
                  <span className="mt-4 font-editorial text-2xl leading-tight">{r.name}</span>
                  {r.frequency && <span className="mt-1 text-sm text-muted">{r.frequency}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </PageTransition>
  );
}

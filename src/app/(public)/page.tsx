import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowRight, ArrowUpRight, MapPin, Phone, Plus } from "lucide-react";
import { COMPLIANCES, FIRM } from "@/lib/firm";
import { formatDue, upcomingDeadlines } from "@/lib/deadlines";
import { getPublicServices } from "@/lib/services/public-content";
import { DEPT_TONE, DeptIcon, DoodleArrow, LedgerCard, OfficeMap, Paperclip, Scribble, Stamp, Star, deptKey } from "@/components/public/art";
import { Eyebrow, PageTransition, reveal } from "@/components/public/motion";
import { PortalPreview } from "@/components/public/portal-preview";

export const revalidate = 300;

const TEL = "tel:+911147094120";
const CTA_SPAN: Record<number, string> = { 1: "lg:col-span-1", 2: "lg:col-span-2", 3: "lg:col-span-3", 4: "lg:col-span-4" };

const STEPS = [
  { title: "Register", text: "Tell us about your business online — a quick registration takes a few minutes; the full form covers constitution, GSTINs and documents." },
  { title: "We review", text: "Our office checks the details and confirms the services and engagement with you before activating your account." },
  { title: "Work together", text: "Your client portal shows what we need from you, work in progress, items for your review and outstanding dues." },
];

const FAQ = [
  { q: "Where is the office?", a: `${FIRM.address} (${FIRM.landmark}). Office hours: ${FIRM.officeHours}.` },
  { q: "Do you work at the client's premises?", a: "Yes. Our team works both at our office and on-site at clients' premises, depending on the engagement." },
  { q: "How are fees decided?", a: "Fees are agreed per engagement after we understand the scope — as a monthly retainer, per assignment, or annually." },
  { q: "Is my information kept private?", a: "Documents are stored privately and are visible only to you and authorised staff. Identity numbers are protected and never shown in full." },
];

// Form numbers from the firm's compliance master, for the marquee.
const FORMS = [...new Set(COMPLIANCES.map((c) => c.form.replace(/\s*\(.*\)$/, "")))].filter((f) => f.length > 2 && f.length < 22 && f !== "Challan");

export default async function HomePage() {
  const services = await getPublicServices();
  const departments = [...new Set(services.map((s) => s.department))].sort(
    (a, b) => services.filter((s) => s.department === b).length - services.filter((s) => s.department === a).length,
  );
  const deadlines = upcomingDeadlines(6);
  const next = deadlines[0];
  const years = new Date().getFullYear() - Number(FIRM.established);

  return (
    <PageTransition>
      {/* ------------------------------------------------------------ hero */}
      <section className="pub-grain relative overflow-hidden">
        <div aria-hidden className="pub-dots absolute inset-0 [mask-image:radial-gradient(ellipse_at_70%_40%,#000_10%,transparent_65%)]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-4 pb-20 pt-12 sm:px-6 md:pt-16 lg:grid-cols-[1.1fr_1fr] lg:px-8 lg:pb-28">
          <div>
            <p className="pub-in inline-flex items-center gap-2 rounded-full border border-ink/15 bg-surface/70 px-3 py-1.5 text-xs text-ink/80" style={{ "--d": "0ms" } as CSSProperties}>
              <MapPin className="size-3.5 text-stamp" aria-hidden /> Accounting, tax &amp; compliance · Naraina, New Delhi
            </p>
            <h1 className="mt-6 font-editorial text-[clamp(2.9rem,7.4vw,5.9rem)] leading-[0.95] tracking-[-0.02em] text-ink">
              <span className="sr-only">Books balanced. Returns filed. Deadlines met.</span>
              <span aria-hidden>
                <span className="pub-word"><span style={{ "--w": 0 } as CSSProperties}>Books</span></span>{" "}
                <span className="pub-word"><span style={{ "--w": 1 } as CSSProperties} className="italic">balanced.</span></span>
                <br />
                <span className="pub-word"><span style={{ "--w": 2 } as CSSProperties}>Returns</span></span>{" "}
                <span className="pub-word"><span style={{ "--w": 3 } as CSSProperties} className="italic">filed.</span></span>
                <br />
                <span className="pub-word"><span style={{ "--w": 4 } as CSSProperties}>Deadlines</span></span>{" "}
                <span className="relative inline-block">
                  <span className="pub-word"><span style={{ "--w": 5 } as CSSProperties} className="italic text-stamp">met.</span></span>
                  <Scribble className="text-marigold" delay={1000} />
                </span>
              </span>
            </h1>
            <p className="pub-in mt-7 max-w-xl text-lg leading-relaxed text-ink/70" style={{ "--d": "450ms" } as CSSProperties}>
              Accounts, GST, income tax, TDS and audit — handled by one team. {FIRM.name} has worked with businesses from Naraina Industrial Area since {FIRM.established}, at our office and on-site at clients&apos; premises.
            </p>
            <div className="pub-in mt-9 flex flex-wrap items-center gap-3" style={{ "--d": "600ms" } as CSSProperties}>
              <Link href="/register" className="pub-btn">
                Register your business <ArrowRight className="arrow size-4" aria-hidden />
              </Link>
              <Link href="/services" className="pub-btn pub-btn-ghost">Explore services</Link>
            </div>
            <dl className="pub-in mt-12 grid max-w-lg grid-cols-3 divide-x divide-ink/10 border-y border-ink/10 py-4" style={{ "--d": "750ms" } as CSSProperties}>
              {[["Since", FIRM.established], ["Office", "Mon – Sat"], ["Visits", "On-site too"]].map(([k, v]) => (
                <div key={k} className="px-4 first:pl-0">
                  <dt className="font-mono text-[11px] text-muted">{k}</dt>
                  <dd className="mt-1 font-editorial text-xl">{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Layered composition */}
          <div className="relative mx-auto aspect-[1/1.02] w-full max-w-[520px]" aria-hidden>
            <div className="pub-parallax absolute right-0 top-4 w-[82%]" style={{ "--speed": "0.12" } as CSSProperties}>
              <div className="pub-in pub-thud rotate-[2.5deg]" style={{ "--d": "250ms" } as CSSProperties}>
                <Paperclip className="absolute -top-6 left-10 z-10 h-16 w-6 rotate-[8deg]" />
                <LedgerCard />
              </div>
            </div>
            <div className="pub-parallax absolute -left-2 bottom-6 w-[58%] sm:left-0" style={{ "--speed": "0.32" } as CSSProperties}>
              <div className="pub-in pub-float -rotate-[3deg] rounded-xl border border-ink/15 bg-surface p-4 shadow-[0_28px_50px_-28px_rgb(15_29_51/.55)]" style={{ "--d": "650ms", "--t": "9s" } as CSSProperties}>
                <p className="flex items-center justify-between font-mono text-[10px] text-muted">
                  <span>NEXT DUE DATE</span>
                  <span className="rounded-sm bg-stamp-soft px-1.5 py-0.5 text-stamp">{next.daysLeft === 0 ? "today" : `in ${next.daysLeft} d`}</span>
                </p>
                <div className="mt-3 flex items-end gap-3">
                  <span className="font-editorial text-6xl leading-[0.8] text-ink">{formatDue(next.date).split(" ")[0]}</span>
                  <span className="pb-1 font-mono text-sm uppercase text-stamp">{formatDue(next.date).split(" ")[1]}</span>
                </div>
                <p className="mt-3 text-sm font-medium leading-snug">{next.title}</p>
                <p className="mt-1 font-mono text-[11px] text-muted">{next.form} · {next.department}</p>
              </div>
            </div>
            <div className="pub-parallax absolute bottom-[22%] right-[2%] w-[38%]" style={{ "--speed": "0.5" } as CSSProperties}>
              <Stamp id="hero" className="pub-stamp w-full drop-shadow-sm" style={{ "--d": "1300ms" } as CSSProperties} top="S S DIMRI & ASSOCIATES" bottom="NEW DELHI · 110028" center="Filed" sub={`SINCE ${FIRM.established}`} />
            </div>
            <div className="absolute -bottom-14 left-[47%] hidden w-[48%] text-ink/70 sm:block">
              <DoodleArrow className="h-10 w-16 rotate-180" />
              <p className="pub-in -mt-2 ml-14 font-editorial text-lg italic leading-tight" style={{ "--d": "2200ms" } as CSSProperties}>the real next due date, from our compliance calendar</p>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ marquee */}
      <div className="pub-marquee-wrap overflow-hidden border-y border-ink bg-ink py-4 text-paper" aria-label="Returns and forms we handle">
        <ul className="pub-marquee" style={{ "--dur": "60s" } as CSSProperties}>
          {[...FORMS, ...FORMS].map((f, i) => (
            <li key={i} aria-hidden={i >= FORMS.length} className="flex shrink-0 items-center gap-6 pr-6 font-mono text-sm">
              <span>{f}</span>
              <Star className={i % 3 === 0 ? "size-3 text-stamp-bright" : i % 3 === 1 ? "size-3 text-marigold" : "size-3 text-paper/40"} />
            </li>
          ))}
        </ul>
      </div>

      {/* ------------------------------------------------------------ services bento */}
      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div data-reveal="">
            <Eyebrow n="01">What we do</Eyebrow>
            <h2 className="mt-4 max-w-2xl font-editorial text-[clamp(2.2rem,4.6vw,3.6rem)] leading-[1.02] tracking-[-0.015em]">
              One team for every return, register and <em className="text-stamp">reconciliation</em>.
            </h2>
          </div>
          <Link href="/services" className="pub-btn pub-btn-ghost" data-reveal="" style={{ "--i": 1 } as CSSProperties}>
            All service details <ArrowRight className="arrow size-4" aria-hidden />
          </Link>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {departments.map((dept, i) => {
            const list = services.filter((s) => s.department === dept);
            const tone = DEPT_TONE[deptKey(dept)];
            const big = i === 0;
            return (
              <article
                key={dept}
                data-spotlight
                {...reveal(i, "scale")}
                className={`group relative flex flex-col overflow-hidden rounded-2xl border border-ink/10 bg-surface p-6 transition-[border-color,box-shadow] duration-500 hover:border-ink/25 hover:shadow-[0_24px_50px_-30px_rgb(15_29_51/.45)] ${big ? "sm:col-span-2 lg:row-span-2" : ""}`}
                style={{ "--i": i, "--spot": `${tone.fill}22` } as CSSProperties}
              >
                <div className="flex items-start justify-between">
                  <span className="grid place-items-center rounded-xl p-2 transition-transform duration-700 ease-[var(--ease-spring)] group-hover:-rotate-6 group-hover:scale-110" style={{ background: tone.soft }}>
                    <DeptIcon name={dept} className={big ? "size-16" : "size-12"} />
                  </span>
                  <span className="font-mono text-xs text-muted">{String(list.length).padStart(2, "0")} {list.length === 1 ? "service" : "services"}</span>
                </div>
                <h3 className={`mt-6 font-editorial leading-none ${big ? "text-5xl" : "text-3xl"}`}>{dept}</h3>
                <ul className="mt-5 flex-1 space-y-3">
                  {list.map((s) => (
                    <li key={s.slug}>
                      <Link href={`/services/${s.slug}`} transitionTypes={["nav-forward"]} className="group/l flex items-start justify-between gap-3">
                        <span>
                          <span className="pub-link font-medium text-ink">{s.name}</span>
                          {s.frequency && <span className="mt-0.5 block text-xs text-muted">{s.frequency}</span>}
                        </span>
                        <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-muted transition-all duration-300 group-hover/l:-translate-y-0.5 group-hover/l:translate-x-0.5 group-hover/l:text-ink" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
                {big && list[0]?.description && <p className="mt-8 border-t border-ink/10 pt-5 text-sm leading-relaxed text-muted">{list[0].description}</p>}
              </article>
            );
          })}
          {/* Closing tile fills whatever is left of the last row */}
          <aside {...reveal(departments.length, "scale")} className={`pub-night-grid relative flex flex-col justify-between gap-6 overflow-hidden rounded-2xl p-6 text-paper sm:col-span-2 ${CTA_SPAN[(4 - ((departments.length + 3) % 4)) % 4 || 4]}`}>
            <Stamp id="bento" className="pub-spin-slow pointer-events-none absolute -bottom-10 -right-10 w-40 opacity-30" color="#e3a21a" top="ASK THE OFFICE" bottom="CALL · EMAIL · VISIT" center="?" />
            <p className="relative max-w-md font-editorial text-3xl leading-tight">Need a service that isn&apos;t listed here?</p>
            <div className="relative flex flex-wrap gap-3">
              <a href={TEL} className="pub-btn pub-btn-light pub-btn-sm"><Phone className="size-4" aria-hidden /> {FIRM.phone}</a>
              <a href={`mailto:${FIRM.email}`} className="pub-btn pub-btn-outline-light pub-btn-sm">Email us</a>
            </div>
          </aside>
        </div>
      </section>

      {/* ------------------------------------------------------------ compliance calendar */}
      <section className="pub-grain relative border-y border-ink/10 bg-paper-2/70">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[0.8fr_1.6fr] lg:px-8">
          <div className="lg:sticky lg:top-28 lg:self-start" data-reveal="left">
            <Eyebrow n="02">Compliance calendar</Eyebrow>
            <h2 className="mt-4 font-editorial text-[clamp(2.2rem,4.4vw,3.4rem)] leading-[1.02] tracking-[-0.015em]">
              What&apos;s due <em className="text-stamp">next</em>, for businesses like yours.
            </h2>
            <p className="mt-5 max-w-sm leading-relaxed text-muted">
              The next standard due dates from the {COMPLIANCES.length} statutory deadlines we track across GST, TDS, income tax, ROC, PF/ESI and MSME.
            </p>
            <p className="mt-4 max-w-sm text-xs leading-relaxed text-muted">Dates can be extended by government notification — our team tracks those for every client.</p>
          </div>
          <ol className="grid gap-3 sm:grid-cols-2">
            {deadlines.map((d, i) => {
              const tone = DEPT_TONE[deptKey(d.department)];
              const [day, mon] = formatDue(d.date).split(" ");
              const pct = Math.max(4, 100 - Math.min(d.daysLeft, 45) * (100 / 45));
              return (
                <li key={`${d.title}-${i}`} {...reveal(i, "right")} className="pub-press group relative flex gap-4 overflow-hidden rounded-xl border border-ink/10 bg-surface p-4">
                  <div className="relative grid w-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-ink/10 text-center">
                    <span className="block w-full py-0.5 font-mono text-[10px] uppercase text-paper" style={{ background: tone.fill }}>{mon}</span>
                    <span className="block py-1.5 font-editorial text-4xl leading-none">{day}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center justify-between gap-2">
                      <span className="rounded-sm px-1.5 py-0.5 font-mono text-[10px]" style={{ background: tone.soft, color: tone.text }}>{d.department}</span>
                      <span className="font-mono text-[11px] text-muted">{d.daysLeft === 0 ? "Today" : d.daysLeft === 1 ? "Tomorrow" : `${d.daysLeft} days`}</span>
                    </p>
                    <p className="mt-2 font-medium leading-snug">{d.title}</p>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-muted">{d.form}</p>
                    <span aria-hidden className="mt-3 block h-1 overflow-hidden rounded-full bg-paper-2">
                      <span className="block h-full rounded-full transition-[width] duration-1000 ease-[var(--ease-out-expo)]" style={{ width: `${pct}%`, background: tone.fill }} />
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* ------------------------------------------------------------ steps */}
      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div data-reveal="" className="text-center">
          <div className="flex justify-center"><Eyebrow n="03">How it works</Eyebrow></div>
          <h2 className="mx-auto mt-4 max-w-3xl font-editorial text-[clamp(2.2rem,4.6vw,3.6rem)] leading-[1.02] tracking-[-0.015em]">
            From first form to filed return, in <em className="text-stamp">three</em> steps.
          </h2>
        </div>
        <div className="relative mt-16">
          <svg aria-hidden viewBox="0 0 1200 120" preserveAspectRatio="none" className="absolute inset-x-0 top-6 hidden h-24 w-full md:block">
            <path className="pub-path" pathLength={1} d="M80 60 C 260 -10, 380 130, 600 60 S 940 -10, 1120 60" fill="none" stroke="#0f1d33" strokeWidth="2" strokeDasharray="1" strokeLinecap="round" />
            <path d="M80 60 C 260 -10, 380 130, 600 60 S 940 -10, 1120 60" fill="none" stroke="#0f1d33" strokeOpacity=".12" strokeWidth="2" strokeDasharray="6 8" />
          </svg>
          <ol className="relative grid gap-10 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} {...reveal(i)} className="text-center">
                <span className="relative mx-auto grid size-[86px] place-items-center rounded-full border-[1.5px] border-ink bg-paper font-editorial text-5xl italic transition-transform duration-500 ease-[var(--ease-spring)] hover:-rotate-12 hover:scale-110">
                  {i + 1}
                  <span aria-hidden className="absolute -right-1 -top-1 size-5 rounded-full border-2 border-paper" style={{ background: ["#d9531f", "#e3a21a", "#2f6b4f"][i] }} />
                </span>
                <h3 className="mt-6 font-editorial text-3xl">{s.title}</h3>
                <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ------------------------------------------------------------ portal */}
      <section className="px-0 sm:px-3">
        <div className="pub-zoom pub-night-grid relative overflow-hidden text-paper">
          <div aria-hidden className="absolute -right-32 -top-32 size-[420px] rounded-full bg-stamp-bright/20 blur-[100px]" />
          <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
            <div data-reveal="" className="max-w-2xl">
              <Eyebrow n="04" light>The practice portal</Eyebrow>
              <h2 className="mt-4 font-editorial text-[clamp(2.2rem,4.6vw,3.6rem)] leading-[1.02] tracking-[-0.015em]">
                Work, attendance and follow-ups — <em className="text-marigold">in one place.</em>
              </h2>
              <p className="mt-5 leading-relaxed text-paper/65">
                Our team and registered clients use the portal to keep work, attendance and follow-ups in one place. Staff accounts are created by the firm.
              </p>
            </div>
            <div className="mt-14" data-reveal="" style={{ "--i": 1 } as CSSProperties}>
              <PortalPreview />
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ numbers */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <dl className="grid grid-cols-2 gap-y-10 lg:grid-cols-4 lg:divide-x lg:divide-ink/10">
          {[
            [years, "+", "years serving Naraina's businesses"],
            [services.length, "", "services offered"],
            [COMPLIANCES.length, "", "statutory due dates tracked"],
            [6, "", "days a week at the office"],
          ].map(([n, suffix, label], i) => (
            <div key={String(label)} {...reveal(i)} className="px-2 lg:px-8">
              <dd className="font-editorial text-[clamp(3.5rem,7vw,5.5rem)] leading-none tracking-[-0.03em]">
                <span data-count={n}>{n}</span><span className="text-stamp">{suffix}</span>
              </dd>
              <dt className="mt-2 max-w-[14rem] text-sm text-muted">{label}</dt>
            </div>
          ))}
        </dl>
      </section>

      {/* ------------------------------------------------------------ faq + visit */}
      <section className="border-t border-ink/10">
        <div className="mx-auto grid max-w-7xl gap-14 px-4 py-24 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:px-8">
          <div>
            <div data-reveal="">
              <Eyebrow n="05">Common questions</Eyebrow>
              <h2 className="mt-4 font-editorial text-[clamp(2.2rem,4.4vw,3.4rem)] leading-[1.02] tracking-[-0.015em]">Asked at the front desk.</h2>
            </div>
            <div className="mt-8 divide-y divide-ink/10 border-y border-ink/10">
              {FAQ.map((f, i) => (
                <details key={f.q} name="home-faq" className="pub-acc group" {...reveal(i)}>
                  <summary data-ripple className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-lg font-medium">
                    <span className="transition-colors group-hover:text-stamp">{f.q}</span>
                    <span className="pub-acc-icon grid size-8 shrink-0 place-items-center rounded-full border border-ink/20"><Plus className="size-4" aria-hidden /></span>
                  </summary>
                  <p className="max-w-xl pb-6 leading-relaxed text-muted">{f.a}</p>
                </details>
              ))}
            </div>
            <Link href="/help" className="pub-link mt-6 inline-flex items-center gap-1 text-sm font-medium" data-reveal="">More in the Help Centre <ArrowRight className="size-4" aria-hidden /></Link>
          </div>

          <div data-reveal="right" className="h-fit overflow-hidden rounded-2xl border border-ink/15 bg-surface shadow-[0_30px_60px_-40px_rgb(15_29_51/.5)]">
            <OfficeMap className="block h-auto w-full" />
            <div className="p-6">
              <h2 className="font-editorial text-3xl">Visit or call us</h2>
              <p className="mt-3 flex gap-2 text-sm text-muted">
                <MapPin className="mt-0.5 size-4 shrink-0 text-stamp" aria-hidden />
                <span>{FIRM.address}<br />{FIRM.landmark}</span>
              </p>
              <p className="mt-2 pl-6 text-sm text-muted">{FIRM.officeHours}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <a href={TEL} className="pub-btn"><Phone className="size-4" aria-hidden /> Call {FIRM.phone}</a>
                <a href={`mailto:${FIRM.email}`} className="pub-btn pub-btn-ghost">Email us</a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ closing CTA */}
      <section className="pub-grain relative overflow-hidden border-t border-ink/10 bg-stamp-soft/60">
        <Stamp id="cta" className="pub-rotate-scroll pointer-events-none absolute -right-16 -top-16 w-64 opacity-25 sm:w-80" top="ON TIME · EVERY QUARTER" bottom="GST · TDS · ITR · ROC" center="SSDA" />
        <div className="relative mx-auto max-w-5xl px-4 py-24 text-center sm:px-6">
          <h2 data-reveal="" className="font-editorial text-[clamp(2.6rem,6.5vw,5rem)] leading-[0.98] tracking-[-0.02em]">
            Let&apos;s put your compliance <em className="text-stamp">on a calendar.</em>
          </h2>
          <p data-reveal="" style={{ "--i": 1 } as CSSProperties} className="mx-auto mt-6 max-w-xl text-lg text-ink/70">
            Register online in a few minutes. Our office reviews it and confirms the engagement with you.
          </p>
          <div data-reveal="" style={{ "--i": 2 } as CSSProperties} className="mt-10 flex flex-wrap justify-center gap-3">
            <Link href="/register" className="pub-btn">Register your business <ArrowRight className="arrow size-4" aria-hidden /></Link>
            <Link href="/pricing" className="pub-btn pub-btn-ghost">How we bill</Link>
          </div>
        </div>
      </section>
    </PageTransition>
  );
}

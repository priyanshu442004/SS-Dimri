"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { Check, Mail, Minus, Plus } from "lucide-react";
import { clsx } from "clsx";

const CONSTITUTIONS = ["Individual", "Proprietorship", "Partnership", "LLP", "Private limited", "Other"];
const VOLUMES = ["Under 50", "50 – 200", "200 – 1,000", "Over 1,000"];

/**
 * Builds a quote request and hands it to the visitor's email app. Nothing is
 * stored or sent by the site, and no prices are shown (fees are agreed per engagement).
 */
export function QuoteBuilder({ services, bases, email }: { services: string[]; bases: { code: string; label: string }[]; email: string }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [constitution, setConstitution] = useState("");
  const [volume, setVolume] = useState(1);
  const [gstins, setGstins] = useState(1);
  const [onsite, setOnsite] = useState(false);
  const [basis, setBasis] = useState("");
  const [business, setBusiness] = useState("");

  const toggle = (s: string) => setPicked((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));

  const lines = useMemo(() => {
    const l: [string, string][] = [];
    if (business.trim()) l.push(["Business", business.trim()]);
    if (constitution) l.push(["Constitution", constitution]);
    l.push(["Invoices per month", VOLUMES[volume]]);
    l.push(["GSTINs", String(gstins)]);
    l.push(["Services", picked.length ? picked.join(", ") : "Not sure yet — please advise"]);
    l.push(["On-site visits", onsite ? "Yes, at our premises" : "Not required"]);
    if (basis) l.push(["Preferred billing", basis]);
    return l;
  }, [business, constitution, volume, gstins, picked, onsite, basis]);

  const href = `mailto:${email}?subject=${encodeURIComponent(`Quote request${business.trim() ? ` — ${business.trim()}` : ""}`)}&body=${encodeURIComponent(
    `Hello,\n\nPlease send a proposal for the following:\n\n${lines.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\nThank you.`,
  )}`;

  const chip = (on: boolean) =>
    clsx("inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm transition-all duration-300 ease-[var(--ease-out-expo)] active:scale-95",
      on ? "border-ink bg-ink text-paper" : "border-ink/15 bg-surface text-ink/75 hover:border-ink/40 hover:text-ink");

  return (
    <div className="grid gap-8 lg:grid-cols-[1.3fr_1fr]">
      <div className="space-y-8 rounded-2xl border border-ink/10 bg-surface p-6 sm:p-8">
        <div>
          <label htmlFor="qb-business" className="text-sm font-medium">Business name <span className="font-normal text-muted">(optional)</span></label>
          <input id="qb-business" value={business} onChange={(e) => setBusiness(e.target.value)} placeholder="e.g. Mehra Fabrication Works"
            className="mt-2 block h-11 w-full rounded-lg border border-ink/15 bg-paper/50 px-3 text-sm transition-[border-color,box-shadow] duration-300 focus:border-ink focus:shadow-[0_0_0_4px_var(--color-marigold-soft)] focus:outline-none" />
        </div>

        <fieldset>
          <legend className="text-sm font-medium">Services you need</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {services.map((s) => (
              <button key={s} type="button" aria-pressed={picked.includes(s)} onClick={() => toggle(s)} className={chip(picked.includes(s))}>
                <span className={clsx("grid size-4 place-items-center rounded-full transition-all duration-300", picked.includes(s) ? "bg-marigold text-night" : "scale-0 opacity-0 -ml-5")}>
                  <Check className="size-3" aria-hidden />
                </span>
                {s}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-medium">Constitution</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {CONSTITUTIONS.map((c) => (
              <button key={c} type="button" aria-pressed={constitution === c} onClick={() => setConstitution(constitution === c ? "" : c)} className={chip(constitution === c)}>{c}</button>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-8 sm:grid-cols-2">
          <div>
            <label htmlFor="qb-volume" className="text-sm font-medium">Invoices per month</label>
            <p className="mt-2 font-editorial text-3xl" aria-hidden>{VOLUMES[volume]}</p>
            <input id="qb-volume" type="range" min={0} max={VOLUMES.length - 1} step={1} value={volume} onChange={(e) => setVolume(Number(e.target.value))}
              aria-valuetext={VOLUMES[volume]} className="mt-3 w-full accent-[var(--color-stamp-bright)]" />
          </div>
          <div>
            <p id="qb-gst-label" className="text-sm font-medium">Number of GSTINs</p>
            <div className="mt-3 flex items-center gap-3" role="group" aria-labelledby="qb-gst-label">
              <button type="button" onClick={() => setGstins((n) => Math.max(0, n - 1))} aria-label="Fewer GSTINs" data-ripple className="grid size-10 place-items-center rounded-full border border-ink/20 transition-transform active:scale-90"><Minus className="size-4" aria-hidden /></button>
              <span key={gstins} className="pub-pop w-10 text-center font-editorial text-4xl" aria-live="polite">{gstins}</span>
              <button type="button" onClick={() => setGstins((n) => Math.min(20, n + 1))} aria-label="More GSTINs" data-ripple className="grid size-10 place-items-center rounded-full border border-ink/20 transition-transform active:scale-90"><Plus className="size-4" aria-hidden /></button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-xl bg-paper px-4 py-3">
          <span id="qb-onsite" className="text-sm font-medium">We need on-site visits at our premises</span>
          <button type="button" role="switch" aria-checked={onsite} aria-labelledby="qb-onsite" onClick={() => setOnsite((o) => !o)}
            className={clsx("relative h-7 w-12 shrink-0 rounded-full transition-colors duration-300", onsite ? "bg-ledger" : "bg-ink/20")}>
            <span className={clsx("absolute top-1 size-5 rounded-full bg-white shadow transition-transform duration-500 ease-[var(--ease-spring)]", onsite ? "translate-x-6" : "translate-x-1")} />
          </button>
        </div>

        <fieldset>
          <legend className="text-sm font-medium">Preferred billing <span className="font-normal text-muted">(optional)</span></legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {bases.map((b) => (
              <button key={b.code} type="button" aria-pressed={basis === b.label} onClick={() => setBasis(basis === b.label ? "" : b.label)} className={chip(basis === b.label)}>{b.label}</button>
            ))}
          </div>
        </fieldset>
      </div>

      {/* Live letter preview */}
      <div className="lg:sticky lg:top-28 lg:self-start">
        <div className="pub-ledger relative rotate-[0.6deg] overflow-hidden rounded-xl border border-ink/15 p-6 shadow-[0_30px_60px_-35px_rgb(15_29_51/.55)]" style={{ "--margin": "40px" } as CSSProperties}>
          <p className="pl-6 font-mono text-[11px] text-muted">To: {email}</p>
          <p className="mt-1 pl-6 font-editorial text-2xl">Quote request</p>
          <dl className="mt-4 space-y-0 pl-6 text-sm leading-8">
            {lines.map(([k, v]) => (
              <div key={k} className="pub-swap grid grid-cols-[8.5rem_1fr] gap-2">
                <dt className="text-muted">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <a href={href} className="pub-btn pub-btn-block mt-5"><Mail className="size-4" aria-hidden /> Email this request</a>
        <p className="mt-3 text-center text-xs text-muted">Opens your email app with the details filled in. Nothing is saved on this site.</p>
      </div>
    </div>
  );
}

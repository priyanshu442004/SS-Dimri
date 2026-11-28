"use client";

import { useRef, useState, useTransition, type DragEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { CircleAlert, FileText, MailCheck, RotateCcw, ScanText, Sparkles, TriangleAlert, UploadCloud, UserRound, Users, X } from "lucide-react";
import { inputCls, type FormState } from "@/components/form";
import { buttonClass } from "@/components/ui";
import { toast } from "@/components/toaster";
import type { EmailCandidate } from "@/lib/careers/email-extract";
import { scanResumeAction, submitResumeAction, type ScanState } from "./actions";

// Upload one resume. As soon as a file is chosen it is read on the server and the email address in
// it is shown — the person uploading always sees exactly where the email will go before it is sent:
//   one clear address       → shown ready, with "Use a different address" if needed;
//   several addresses       → they choose the candidate's (nothing is pre-chosen);
//   pieced-together address → shown with a warning, and they tick that they checked it;
//   no address readable     → they type it exactly as on the resume.

const ACCEPT = ".pdf,.docx,.jpg,.jpeg,.png,.webp";
const MB = 1024 * 1024;
const OTHER = "__other__";

type Scan = NonNullable<ScanState["scan"]>;

const sizeText = (n: number) => (n >= MB ? `${(n / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function hintFor(c: EmailCandidate): string | null {
  if (c.inReferences) return "In the References section — probably a referee's address";
  if (c.roleAddress) return "Looks like a company mailbox";
  if (!c.validTld) return "Does not end in a real domain";
  if (c.sources.includes("repaired") && c.sources.length === 1) return "Pieced together from the file — check it";
  if (c.sources.includes("link") && !c.sources.includes("text")) return "From the resume's email link";
  return null;
}

export function UploadForm({ selfName, team }: { selfName: string; team: string[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [scanning, startScan] = useTransition();
  const [sending, startSend] = useTransition();
  const [scan, setScan] = useState<Scan | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [choice, setChoice] = useState<string>("");
  const [typed, setTyped] = useState("");
  const [checked, setChecked] = useState(false);
  const [name, setName] = useState("");
  const [referredBy, setReferredBy] = useState<"SELF" | "OTHER">("SELF");
  const [referrer, setReferrer] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [done, setDone] = useState<string | null>(null);

  const candidates = scan?.candidates ?? [];
  const single = candidates.length === 1 ? candidates[0] : null;
  const trusted = (c: EmailCandidate) => c.sources.includes("text") || c.sources.includes("link");
  const email = choice === OTHER || candidates.length === 0 ? typed.trim().toLowerCase() : choice;
  const chosen = candidates.find((c) => c.email === choice) ?? null;
  const needsCheck = !!chosen && !trusted(chosen);

  function reset() {
    formRef.current?.reset();
    setFile(null); setScan(null); setScanError(null); setChoice(""); setTyped(""); setChecked(false);
    setName(""); setReferredBy("SELF"); setReferrer(""); setErrors({});
    if (inputRef.current) inputRef.current.value = "";
  }

  function pick(f: File | null | undefined) {
    if (!f) return;
    setDone(null);
    if (f.size > 10 * MB) { toast(`“${f.name}” is larger than 10 MB. Attach a smaller copy.`, "error"); return; }
    if (!/\.(pdf|docx|jpe?g|png|webp)$/i.test(f.name)) {
      toast(/\.doc$/i.test(f.name) ? "Old .doc files cannot be read. Save the resume as PDF or .docx and upload that." : `“${f.name}” is not a resume file. Upload a PDF or Word (.docx) file, or a photo of the resume.`, "error");
      return;
    }
    // Keep the input in step with a dropped file, so the form sends it.
    if (inputRef.current && inputRef.current.files?.[0] !== f) {
      const dt = new DataTransfer();
      dt.items.add(f);
      inputRef.current.files = dt.files;
    }
    setFile(f); setScan(null); setScanError(null); setChoice(""); setTyped(""); setChecked(false); setErrors({});
    const fd = new FormData();
    fd.set("resume", f);
    startScan(async () => {
      const r = await scanResumeAction(fd).catch(() => ({ ok: false, message: "Could not read the file. Please try again." }) as ScanState);
      if (!r.ok || !r.scan) { setScanError(r.message ?? "Could not read the file."); return; }
      setScan(r.scan);
      setName((n) => n || r.scan!.name || "");
      // Only one address that the file states plainly is chosen for them; anything else they choose.
      const c = r.scan.candidates;
      setChoice(c.length === 1 ? c[0].email : "");
    });
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDrag(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 1) toast("One resume at a time — only the first file was taken.", "warning");
    pick(files[0]);
  }

  function submit(e: FormEvent<HTMLFormElement>, confirmed = false) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!file) errs.resume = "Choose the resume file";
    if (!email) errs.candidateEmail = candidates.length > 1 ? "Choose the candidate's email address" : "Enter the candidate's email address";
    if (needsCheck && !checked) errs.checked = "Tick that you checked this address against the resume";
    if (name.trim().length < 2) errs.candidateName = "Enter the candidate's name";
    if (referredBy === "OTHER" && referrer.trim().length < 2) errs.referrerName = "Enter who referred this candidate";
    setErrors(errs);
    if (Object.keys(errs).length) { toast(Object.values(errs)[0], "error"); return; }
    send(confirmed);
  }

  function send(confirmed: boolean) {
    const fd = new FormData();
    fd.set("resume", file!);
    fd.set("candidateEmail", email);
    fd.set("candidateName", name.trim());
    fd.set("referredBy", referredBy);
    if (referredBy === "OTHER") fd.set("referrerName", referrer.trim());
    if (needsCheck && checked) fd.set("addressChecked", "on");
    if (confirmed) fd.set("confirmed", "on");
    startSend(async () => {
      const r: FormState = await submitResumeAction({}, fd).catch((): FormState => ({ ok: false, message: "Could not upload. Please try again." }));
      if (r.confirm) {
        if (window.confirm(r.confirm)) send(true);
        return;
      }
      if (!r.ok) {
        setErrors(Object.fromEntries(Object.entries(r.fieldErrors ?? {}).map(([k, v]) => [k, v?.[0]])));
        toast(r.message ?? "Could not upload.", "error");
        return;
      }
      toast(r.message ?? "Resume uploaded.", r.message?.includes("could not be sent") ? "warning" : "success");
      setDone(r.message ?? "Resume uploaded.");
      reset();
      router.refresh();
    });
  }

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="space-y-5">
      {done && (
        <div role="status" className="cv-reveal flex items-start gap-3 rounded-xl border border-ok/30 bg-ok-bg px-3.5 py-3 text-sm text-ok">
          <svg viewBox="0 0 24 24" className="mt-0.5 size-5 shrink-0" aria-hidden><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" opacity=".35" /><path className="cv-check" d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <p className="min-w-0 flex-1">{done}</p>
          <button type="button" onClick={() => setDone(null)} aria-label="Dismiss" className="text-ok/70 hover:text-ok"><X className="size-4" /></button>
        </div>
      )}

      {/* 1 · the file */}
      <div>
        <p className="mb-1.5 text-sm font-medium">Resume <span className="text-danger">*</span></p>
        <input ref={inputRef} id="resume" type="file" name="resume" accept={ACCEPT} className="sr-only" onChange={(e) => pick(e.target.files?.[0])} aria-describedby="resume-hint" />
        {!file ? (
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            className={clsx("rounded-xl border-2 border-dashed transition-colors duration-300", drag ? "cv-drop-active border-brand-600 bg-brand-50" : errors.resume ? "border-danger/50 bg-danger-bg/40" : "border-line bg-paper/60 hover:border-ink/30")}
          >
            <label htmlFor="resume" className="flex cursor-pointer flex-col items-center gap-2 px-4 py-8 text-center">
              <span className={clsx("grid size-12 place-items-center rounded-2xl bg-surface shadow-[0_6px_18px_-10px_rgb(15_29_51/.45)] transition-transform duration-300", drag && "-translate-y-1 scale-105")}>
                <UploadCloud className="size-6 text-brand-700" aria-hidden />
              </span>
              <span className="text-sm font-medium text-ink">{drag ? "Drop the resume here" : "Drag the resume here, or click to choose"}</span>
              <span id="resume-hint" className="text-xs text-muted">One file · PDF, Word (.docx) or a photo · up to 10 MB</span>
            </label>
          </div>
        ) : (
          <div className={clsx("flex items-center gap-3 rounded-xl border border-line bg-surface p-3", scanning && "cv-scan")}>
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700"><FileText className="size-5" aria-hidden /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium" title={file.name}>{file.name}</p>
              <p className="text-xs text-muted">{sizeText(file.size)} · {scanning ? <span className="ai-shimmer">Reading the resume…</span> : scan ? "Read" : scanError ? "Could not read" : ""}</p>
            </div>
            <button type="button" onClick={() => { reset(); inputRef.current?.click(); }} className={buttonClass("ghost", "sm")} disabled={sending}>
              <RotateCcw className="size-3.5" aria-hidden /> Change
            </button>
          </div>
        )}
        {errors.resume && <p className="mt-1 text-xs text-danger">{errors.resume}</p>}
        {scanError && <p role="alert" className="cv-reveal mt-2 flex gap-2 text-sm text-danger"><CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />{scanError}</p>}
      </div>

      {/* 2 · where the email goes */}
      {scan && (
        <fieldset className="cv-reveal space-y-2" aria-describedby="email-help">
          <legend className="mb-1.5 flex items-center gap-1.5 text-sm font-medium"><MailCheck className="size-4 text-muted" aria-hidden /> Candidate&apos;s email <span className="text-danger">*</span></legend>

          {single && trusted(single) && choice === single.email ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-ok/30 bg-ok-bg/60 px-3 py-2.5">
              <span className="min-w-0 flex-1 break-all font-mono text-sm text-ink">{single.email}</span>
              <span className="text-xs font-medium text-ok">Found in the resume</span>
              <button type="button" onClick={() => setChoice(OTHER)} className="text-xs font-medium text-brand-700 hover:underline">Use a different address</button>
            </div>
          ) : candidates.length > 0 ? (
            <>
              <p id="email-help" className="text-xs text-muted">
                {candidates.length > 1 ? `This resume has ${candidates.length} addresses. Choose the candidate's own — the email goes only to the one you choose.` : "Check this address against the resume before sending."}
              </p>
              <div className="space-y-1.5" role="radiogroup">
                {candidates.map((c, i) => {
                  const hint = hintFor(c);
                  const on = choice === c.email;
                  return (
                    <label key={c.email} style={{ "--d": `${i * 50}ms` } as React.CSSProperties}
                      className={clsx("cv-reveal flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 transition-[border-color,background-color,box-shadow] duration-200",
                        on ? "border-brand-600 bg-brand-50 ring-2 ring-brand-600/15" : "border-line bg-surface hover:border-ink/30")}>
                      <input type="radio" name="emailChoice" value={c.email} checked={on} onChange={() => { setChoice(c.email); setChecked(false); }} className="mt-1 accent-brand-700" />
                      <span className="min-w-0 flex-1">
                        <span className="block break-all font-mono text-sm text-ink">{c.email}</span>
                        {hint && <span className={clsx("mt-0.5 block text-xs", c.inReferences || c.roleAddress || !c.validTld ? "text-muted" : "text-warn")}>{hint}</span>}
                      </span>
                      {i === 0 && candidates.length > 1 && !c.inReferences && !c.roleAddress && <span className="shrink-0 rounded-md bg-marigold-soft px-1.5 py-0.5 text-[11px] font-medium text-warn">Most likely</span>}
                    </label>
                  );
                })}
                <label className={clsx("flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-colors", choice === OTHER ? "border-brand-600 bg-brand-50" : "border-line bg-surface hover:border-ink/30")}>
                  <input type="radio" name="emailChoice" value={OTHER} checked={choice === OTHER} onChange={() => setChoice(OTHER)} className="accent-brand-700" />
                  <span className="text-sm">Another address</span>
                </label>
              </div>
            </>
          ) : (
            <p role="status" className="flex gap-2 rounded-xl border border-warn/30 bg-warn-bg px-3 py-2.5 text-sm text-warn">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>{scan.readable ? "No email address is written in this resume." : "The text of this file could not be read (it may be a scanned image or photo)."} Type the candidate&apos;s email exactly as written on the resume.</span>
            </p>
          )}

          {(choice === OTHER || candidates.length === 0) && (
            <input type="email" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="name@example.com" autoComplete="off" spellCheck={false}
              aria-label="Candidate's email" aria-invalid={!!errors.candidateEmail} className={clsx(inputCls, "cv-reveal font-mono")} autoFocus={candidates.length > 0} />
          )}
          {chosen?.suggestion && (
            <button type="button" onClick={() => { setChoice(OTHER); setTyped(chosen.suggestion!); }} className="cv-reveal flex items-center gap-1.5 text-xs font-medium text-brand-700 hover:underline">
              <Sparkles className="size-3.5" aria-hidden /> The resume may have a typing mistake — did you mean <span className="font-mono">{chosen.suggestion}</span>?
            </button>
          )}
          {needsCheck && (
            <label className="cv-reveal flex items-start gap-2 rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn">
              <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5 accent-brand-700" />
              <span>I have checked <strong className="font-mono">{chosen!.email}</strong> against the resume — it is the candidate&apos;s address, letter for letter.</span>
            </label>
          )}
          {errors.candidateEmail && <p className="text-xs text-danger">{errors.candidateEmail}</p>}
          {errors.checked && <p className="text-xs text-danger">{errors.checked}</p>}
          {scan.previous.length > 0 && (
            <p className="cv-reveal flex gap-2 text-xs text-info"><ScanText className="mt-0.5 size-3.5 shrink-0" aria-hidden />Already uploaded on {scan.previous.map((p) => p.at).join(", ")}{scan.previous.some((p) => p.mailed) ? " — the candidate was emailed then." : "."}</p>
          )}
        </fieldset>
      )}

      {/* 3 · the candidate and the referral */}
      {(scan || scanError) && (
        <div className="cv-reveal space-y-4" style={{ "--d": "80ms" } as React.CSSProperties}>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium">Candidate&apos;s name <span className="text-danger">*</span></span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} placeholder="As on the resume" aria-invalid={!!errors.candidateName} className={inputCls} />
            <span className="mt-1 block text-xs text-muted">{scan?.name ? "Filled in from the resume — correct it if needed. The email greets the candidate by this name." : "The email greets the candidate by this name."}</span>
            {errors.candidateName && <span className="mt-1 block text-xs text-danger">{errors.candidateName}</span>}
          </label>
          {scan?.phone && <p className="-mt-2 text-xs text-muted">Phone found in the resume: <span className="font-mono text-ink">{scan.phone}</span> (saved with it)</p>}

          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">Referred by <span className="text-danger">*</span></legend>
            <div className="relative grid grid-cols-2 rounded-xl border border-line bg-subtle p-1" role="radiogroup">
              <span aria-hidden className={clsx("absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-lg bg-surface shadow-[0_2px_8px_-3px_rgb(15_29_51/.3)] transition-transform duration-300 [transition-timing-function:var(--ease-spring)]", referredBy === "OTHER" && "translate-x-full")} />
              {([["SELF", "Self", UserRound], ["OTHER", "Someone else", Users]] as const).map(([v, label, Icon]) => (
                <label key={v} className={clsx("relative z-10 flex cursor-pointer items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-colors", referredBy === v ? "text-ink" : "text-muted hover:text-ink")}>
                  <input type="radio" name="referredByChoice" value={v} checked={referredBy === v} onChange={() => setReferredBy(v)} className="sr-only" />
                  <Icon className="size-4" aria-hidden /> {label}
                </label>
              ))}
            </div>
            {referredBy === "SELF" ? (
              <p className="mt-1.5 text-xs text-muted">Saved as referred by <strong className="text-ink">{selfName}</strong>.</p>
            ) : (
              <div className="cv-reveal mt-2">
                <input value={referrer} onChange={(e) => setReferrer(e.target.value)} list="careers-team" maxLength={200} placeholder="Name of the person who referred this candidate" aria-label="Referred by" aria-invalid={!!errors.referrerName} className={inputCls} />
                <datalist id="careers-team">{team.map((t) => <option key={t} value={t} />)}</datalist>
                {errors.referrerName && <p className="mt-1 text-xs text-danger">{errors.referrerName}</p>}
              </div>
            )}
          </fieldset>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button type="submit" disabled={sending || scanning || !file} aria-busy={sending} className={buttonClass("primary", "md")}>
          {sending ? <><span aria-hidden className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> Uploading & emailing…</> : <><UploadCloud className="size-4" aria-hidden /> Upload & email candidate</>}
        </button>
        {email && !sending && <p className="min-w-0 text-xs text-muted">The email goes to <span className="break-all font-mono text-ink">{email}</span></p>}
      </div>
    </form>
  );
}

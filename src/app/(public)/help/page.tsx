import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowRight } from "lucide-react";
import { Eyebrow, PageTransition, SplitWords } from "@/components/public/motion";
import { FIRM } from "@/lib/firm";
import { HelpSearch, type Faq } from "./help-search";

export const metadata: Metadata = { title: "Help Centre" };

// Answers describe how the portal actually works; keep them in step with the code.
const FAQS: Faq[] = [
  { category: "Registration", q: "How does a business register?", a: "Choose “Create account”, then either the full business registration (identity, constitution and partners/directors, GSTINs, compliance numbers, documents and services) or the quick registration (just name, contact and GSTIN). Either way your registration stays “pending approval” until our office reviews it." },
  { category: "Registration", q: "Can I add more than one GSTIN?", a: "Yes. Add every GSTIN of the business; each is saved separately. The form checks the 15-character format and stops you entering the same GSTIN twice." },
  { category: "Registration", q: "Which documents can I upload?", a: "PDF, JPG, PNG, WEBP, DOCX or XLSX files up to 10 MB each — for example GST or incorporation certificates, MSME (Udyam), ESI and PF certificates and purchase orders. Files are stored privately; they are never available through a public link." },
  { category: "Registration", q: "How long does approval take?", a: "Our office reviews each registration. After you submit, signing in shows the current status of your registration and what happens next." },
  { category: "Signing in", q: "I forgot my password.", a: "Use “Forgot password?” on the sign-in page. Our administrator is notified and sends you a secure link to choose a new password. The link works once and expires after two hours." },
  { category: "Signing in", q: "What do I sign in with?", a: "Clients sign in with the email used at registration. Staff sign in with the login ID created by the administrator." },
  { category: "Client portal", q: "What can I see in the client portal?", a: "What we need from you, work in progress, work awaiting your review, recently completed work, your services, your team at the firm, outstanding dues and your documents. Internal working notes are not shown." },
  { category: "Client portal", q: "How do I send a document we asked for?", a: "Open the request under “Requests”, write a reply and attach the file. The team member who raised the request is notified." },
  { category: "Client portal", q: "How do I accept completed work?", a: "Items awaiting your review appear on the overview. Open one and choose “Accept”, or send your observations if something needs to change." },
  { category: "Staff", q: "How do I get a staff login?", a: "The administrator creates your login ID and gives you a one-time setup link. Open it to set your password, then complete “My onboarding” and submit it for approval. Other modules open once you are approved." },
  { category: "Staff", q: "How do I mark attendance?", a: "Open Attendance and press “Mark in” when you start and “Mark out” when you finish. If you allow location access, your location at that moment is saved with the entry; it is not tracked at any other time. You can only mark your own attendance." },
  { category: "Staff", q: "What goes in the timesheet and the day report?", a: "Use the daily timesheet for each piece of work: client, place, type of work, period and time taken. The day report summarises completed, new and pending work for your manager; it is pre-filled from your timesheet." },
  { category: "Tasks", q: "Can I delete a task?", a: "No. Team members update the status of their tasks and add remarks. Only managers and administrators can cancel a task, and every change is kept in the task history." },
  { category: "Tasks", q: "What does “Waiting for client” mean?", a: "The work cannot continue until the client provides information or documents. It is shown to the client as “waiting for information from you” if the task is shared with them." },
];

export default function HelpPage() {
  return (
    <PageTransition>
      <section className="pub-grain relative overflow-hidden pb-24">
        <div aria-hidden className="pub-dots absolute inset-x-0 top-0 h-[520px] [mask-image:linear-gradient(to_bottom,#000,transparent)]" />
        <div aria-hidden className="pointer-events-none absolute left-[6%] top-24 hidden lg:block">
          <span className="pub-float pub-pop block rotate-[-8deg] rounded-xl border border-ink/10 bg-surface p-3 font-mono text-xs shadow-[0_18px_30px_-20px_rgb(15_29_51/.5)]" style={{ "--d": "500ms", "--t": "8s" } as CSSProperties}>
            <span className="text-muted">Q.</span> Forgot password?
          </span>
        </div>
        <div aria-hidden className="pointer-events-none absolute right-[7%] top-36 hidden lg:block">
          <span className="pub-float pub-pop block rotate-[6deg] rounded-xl border border-ink/10 bg-marigold-soft p-3 font-mono text-xs shadow-[0_18px_30px_-20px_rgb(15_29_51/.5)]" style={{ "--d": "700ms", "--t": "9s", "--fd": "-2s" } as CSSProperties}>
            <span className="text-muted">A.</span> Add every GSTIN ✓
          </span>
        </div>
        <div className="relative mx-auto max-w-3xl px-4 pt-16 text-center sm:px-6">
          <div className="pub-in flex justify-center"><Eyebrow>Help Centre</Eyebrow></div>
          <h1 className="mt-5 font-editorial text-[clamp(3rem,8vw,6.2rem)] leading-[0.92] tracking-[-0.03em]">
            <SplitWords text="How can we help?" em={["help?"]} />
          </h1>
          <p className="pub-in mx-auto mt-5 max-w-xl text-lg text-ink/70" style={{ "--d": "250ms" } as CSSProperties}>
            Answers about registration, signing in, the client portal and the staff workspace.
          </p>
        </div>
        <HelpSearch faqs={FAQS} />
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6 lg:px-8">
        <div data-reveal="scale" className="pub-night-grid relative grid gap-8 overflow-hidden rounded-3xl p-8 text-paper sm:p-12 md:grid-cols-[1.4fr_1fr] md:items-center">
          <div aria-hidden className="absolute -right-20 -top-20 size-72 rounded-full bg-marigold/20 blur-[90px]" />
          <div className="relative">
            <h2 className="font-editorial text-4xl leading-tight sm:text-5xl">Still need help? <em className="text-marigold">Talk to a person.</em></h2>
            <p className="mt-4 text-paper/65">
              Call <a href="tel:+911147094120" className="pub-link font-medium text-paper">{FIRM.phone}</a> or email{" "}
              <a href={`mailto:${FIRM.email}`} className="pub-link break-all font-medium text-paper">{FIRM.email}</a> ({FIRM.officeHours}).
            </p>
          </div>
          <div className="relative flex flex-wrap gap-3 md:justify-end">
            <Link href="/login" className="pub-btn pub-btn-light">Sign in <ArrowRight className="arrow size-4" aria-hidden /></Link>
            <Link href="/register" className="pub-btn pub-btn-outline-light">Create an account</Link>
          </div>
        </div>
      </section>
    </PageTransition>
  );
}

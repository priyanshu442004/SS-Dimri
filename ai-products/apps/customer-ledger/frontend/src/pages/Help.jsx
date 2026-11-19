import { PageHeader, Section, Faq, Steps, Btn } from "@shared/ui";
import { SAMPLES } from "./NewRun";

const S = `${import.meta.env.BASE_URL}samples/`;

export default function Help() {
  return (
    <>
      <PageHeader eyebrow="Help & formats" title="How customer reconciliation works" actions={<Btn to="/new" icon="plus">New reconciliation</Btn>}>
        What to upload, how entries are matched, and what the output contains.
      </PageHeader>

      <Steps items={[["Upload", "Your customer ledger and the customer's statement for the same period, plus the customer master (Excel or CSV)."], ["Match", "Same reference first (leading zeros and punctuation ignored), then same amount and side within 7 days."],
        ["Explain", "Each difference is classified — amount mismatch, company books only, statement only — with a suggested action."], ["Report", "Reconciliation, ageing input and actions — PDF emailed, Excel to download."]]} />

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Section title="Input files" i={1}>
          <div className="space-y-4 p-5 text-sm">
            <Spec name="Company customer ledger (required)" cols={["Date", "Reference", "Description", "Amount_INR", "Side (Debit / Credit)", "Customer_Code (optional)", "Due_Date (optional)"]} />
            <Spec name="Customer statement (required)" cols={["Date", "Reference", "Description", "Amount_INR", "Side (Debit / Credit)"]} />
            <Spec name="Customer master (required)" cols={["Customer_Code", "Customer_Name", "GSTIN", "Credit_Terms_Days", "Opening_Balance_INR (optional)", "Statement_Date (optional)"]} />
            <Spec name="Test scenarios / notes (optional CSV)" cols={["Scenario / reference", "Expected issue"]} />
            <p className="text-muted">Column order doesn't matter and extra columns are ignored. Separate Debit and Credit columns work in place of Amount + Side. Close variations of these names are recognised; unfamiliar headers are mapped by AI. Up to 10 MB per file.</p>
            <div className="flex flex-wrap gap-2 pt-1">
              {SAMPLES.map(([f, l]) => <Btn key={f} href={`${S}${f}`} download variant="line" icon="download">{l}</Btn>)}
            </div>
          </div>
        </Section>
        <Section title="Match statuses" i={2}>
          <ol className="space-y-3 p-5 text-sm">
            {[["Matched", "Same reference and amount. If the descriptions differ (e.g. “Receipt” vs “Payment”), or the match was made on amount and date because the reference differs, the explanation says so."],
              ["Amount mismatch", "Same reference, different amount — the explanation says which side is higher and by how much."],
              ["Side mismatch", "Same reference and amount, but recorded as a debit on one side and a credit on the other."],
              ["Company books only", "In your ledger but not on the customer's statement — confirm delivery / acceptance and whether the customer omitted it."],
              ["Statement only", "On the customer's statement but not in your books — trace it to sales or bank records before posting."]].map(([t, d], i) => (
              <li key={t} className="grid grid-cols-[28px_1fr] gap-2"><span className="font-mono text-xs text-muted">0{i + 1}</span><span><b className="font-medium">{t}.</b> <span className="text-muted">{d}</span></span></li>
            ))}
          </ol>
        </Section>
      </div>

      <h2 className="mb-3 mt-10 text-xl font-medium">Questions</h2>
      <Faq items={[
        ["What is the “absolute value of identified differences”?", "The sum of the differences on every open item, ignoring sign: amount mismatches plus company-books-only and statement-only amounts. The run page also shows the net closing-balance difference and proves the open items explain it."],
        ["Where does the opening balance come from?", "From the customer master, if it has one (otherwise zero). It is applied to both sides, so the closing-balance difference is the difference in the period's entries."],
        ["How is the ageing worked out?", "Every invoice in your books is listed on the Ageing Input sheet. Ageing needs a due date and the date of the statement: the due date is the invoice date plus the credit terms (or a Due_Date column in your ledger), and the statement date comes from a Statement_Date / As_of column in the customer master. If the statement date isn't given, the invoice is marked “Due date not calculable” rather than guessed."],
        ["Will it post entries to my books?", "No. It suggests what to obtain and verify. Post any adjustment in your accounting software after review."],
        ["Who receives the email?", "The finance recipients listed under Settings receive the PDF summary as soon as a report is generated. Each unique set of files is emailed once; you can resend from the run page."],
        ["Can I ask questions about the files?", "Yes — open Ask AI (or the button on a run). The assistant answers from the reconciliation and every file you uploaded."],
        ["Is an AI model deciding the matches?", "No. Matching and every figure come from deterministic rules, so the same files always give the same result. AI is used only to read unfamiliar headers and for the chat."],
      ]} />
    </>
  );
}

function Spec({ name, cols }) {
  return (
    <div>
      <p className="font-medium">{name}</p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">{cols.map((c) => <li key={c} className="rounded-md bg-paper-2 px-2 py-0.5 font-mono text-[11.5px] text-muted">{c}</li>)}</ul>
    </div>
  );
}

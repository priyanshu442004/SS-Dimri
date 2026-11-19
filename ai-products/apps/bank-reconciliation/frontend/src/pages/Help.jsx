import { PageHeader, Section, Faq, Steps, Btn } from "@shared/ui";

const S = `${import.meta.env.BASE_URL}samples/`;

export default function Help() {
  return (
    <>
      <PageHeader eyebrow="Help & formats" title="How reconciliation works" actions={<Btn to="/new" icon="plus">New reconciliation</Btn>}>
        What to upload, how matching decides, and what each exception means.
      </PageHeader>

      <Steps items={[["Upload", "Bank statement and books ledger for the same period (CSV or Excel)."], ["Detect", "Columns, date format (D/M vs M/D) and the books' debit/credit convention are recognised automatically."],
        ["Match & classify", "Six matching passes, then every leftover item is classified with a next step."], ["Report", "PDF + Excel on screen and in History; the PDF is emailed to the finance team."]]} />

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Section title="Input files" i={1}>
          <div className="space-y-4 p-5 text-sm">
            <Spec name="Bank statement" cols={["Date (transaction)", "Value date — optional", "Reference / UTR / cheque no.", "Narration", "Debit and Credit (or a signed Amount)"]} />
            <Spec name="Books ledger" cols={["Posting date", "Voucher no. — optional", "Party / ledger", "Narration", "Debit and Credit", "Bank reference — recommended", "Voucher type — helps detect the sign convention"]} />
            <p className="text-muted">Header names don't need to match exactly — common bank and Tally/Zoho export names are recognised. CSV and .xlsx up to 10 MB each.</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Btn href={`${S}sample_bank_statement.csv`} download variant="line" icon="download">Sample bank statement</Btn>
              <Btn href={`${S}sample_books_ledger.csv`} download variant="line" icon="download">Sample books ledger</Btn>
            </div>
          </div>
        </Section>
        <Section title="Matching passes" i={2}>
          <ol className="space-y-3 p-5 text-sm">
            {[["Exact", "Same reference and same amount. Flagged as timing if the value date falls after the period."], ["Duplicate", "A second book entry identical to one already matched."],
              ["Mismatch", "Same reference, different amount — never auto-adjusted."], ["Amount + date", "Same amount within the date tolerance; narration similarity breaks ties, ambiguous cases are left for review."],
              ["One → many", "One bank row equals 2–4 book rows (bulk collections, split payments with fees)."], ["Many → one", "2–4 bank rows equal one book row (payroll batches)."]].map(([t, d], i) => (
              <li key={t} className="grid grid-cols-[28px_1fr] gap-2"><span className="font-mono text-xs text-muted">0{i + 1}</span><span><b className="font-medium">{t}.</b> <span className="text-muted">{d}</span></span></li>
            ))}
          </ol>
        </Section>
      </div>

      <h2 className="mb-3 mt-10 text-xl font-medium">Questions</h2>
      <Faq items={[
        ["Why is there no opening balance?", "Both sides cover the same period, so the opening balance cancels out. The difference is worked out from the period's transactions: total credits minus debits in the books versus the bank."],
        ["What does “unexplained residual” mean?", "The listed exceptions should add up exactly to the difference. Anything left over is shown as a residual — the reconciliation stays open; nothing is plugged."],
        ["Will it post entries to my books?", "No. It only suggests what to record (bank charges, interest, missing receipts). Post them in your accounting software after review."],
        ["Who receives the email?", "The finance recipients listed under Settings. Each unique reconciliation is emailed once; you can resend from its page."],
        ["Is an AI model deciding the matches?", "No. Amounts, totals and matches are computed by deterministic rules so the same files always give the same result."],
      ]} />
    </>
  );
}

function Spec({ name, cols }) {
  return (
    <div>
      <p className="font-medium">{name}</p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">{cols.map((c) => <li key={c} className="rounded-md bg-paper-2 px-2 py-0.5 text-[12.5px] text-muted">{c}</li>)}</ul>
    </div>
  );
}

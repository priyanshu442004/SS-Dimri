import { PageHeader, Section, Faq, Steps, Btn } from "@shared/ui";
import { SAMPLES } from "./NewRun";

const S = `${import.meta.env.BASE_URL}samples/`;

export default function Help() {
  return (
    <>
      <PageHeader eyebrow="Help & formats" title="How the fixed asset run works" actions={<Btn to="/new" icon="plus">New asset run</Btn>}>
        What to upload, how depreciation is computed, and why some calculations are held rather than guessed.
      </PageHeader>

      <Steps items={[["Upload", "The asset register and depreciation policy (required), plus additions, disposals and capital invoice PDFs."], ["Read", "Spreadsheets are recognised from their headers; invoices are read from the PDF text and agreed to the additions."],
        ["Compute", "Book depreciation for the quarter from the class policy; conflicts and missing inputs are held with the reason."], ["Report", "Asset rollforward, exceptions and additions extract — PDF emailed, Excel to download."]]} />

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Section title="Input files" i={1}>
          <div className="space-y-4 p-5 text-sm">
            <Spec name="Existing fixed asset register (required)" cols={["Asset_ID", "Asset_Description", "Asset_Class", "Purchase_Date", "Original_Cost_INR", "Available_For_Use_Date", "Depreciation_Method", "Useful_Life_Years_or_Rate", "Residual_Value_INR", "Status", "Disposal_Date", "Opening_Accumulated_Depreciation_INR (optional)"]} />
            <Spec name="Current year additions" cols={["Invoice_No", "Invoice_Date", "Vendor", "Asset_Description", "Asset_Class", "Cost_INR", "Available_For_Use_Date", "Proposed_Asset_ID"]} />
            <Spec name="Disposals" cols={["Asset_ID", "Disposal_Date", "Sale_Proceeds_INR", "Buyer", "Approval_Reference"]} />
            <Spec name="Depreciation policy (required)" cols={["Asset_Class", "Book_Method", "Useful_Life_Years", "Residual_Value_Percent", "Notes", "Partial_Period_Convention (optional)"]} />
            <Spec name="Capital invoices (PDF, optional)" cols={["Invoice number", "Invoice date", "Supplier", "Description", "Taxable value", "GST", "Invoice total"]} />
            <p className="text-muted">Column order doesn't matter, spreadsheets can go in any box, and close variations of these names are recognised; unfamiliar headers are mapped by AI. Invoices must be text PDFs (not scans). Up to 10 MB per file.</p>
            <div className="flex flex-wrap gap-2 pt-1">
              {SAMPLES.map(([f, l]) => <Btn key={f} href={`${S}${f}`} download variant="line" icon="download">{l}</Btn>)}
            </div>
          </div>
        </Section>
        <Section title="When a calculation is held" i={2}>
          <ol className="space-y-3 p-5 text-sm">
            {[["Method conflict", "The register's method (e.g. WDV) differs from the class policy (e.g. SLM). New additions in that class are held too, until the approved method is confirmed."],
              ["Disposal in the period", "Depreciation to the disposal date and the gain or loss need opening accumulated depreciation. Add an Opening_Accumulated_Depreciation column to compute them."],
              ["Partial period", "An addition available after the quarter's first month needs a partial-period convention. Add Partial_Period_Convention to the policy: full month, next month or daily."],
              ["Missing inputs", "No policy for the class, or WDV without an opening written-down value."],
              ["Tax depreciation", "Never inferred from the book policy — it needs separate tax blocks and rates."]].map(([t, d], i) => (
              <li key={t} className="grid grid-cols-[28px_1fr] gap-2"><span className="font-mono text-xs text-muted">0{i + 1}</span><span><b className="font-medium">{t}.</b> <span className="text-muted">{d}</span></span></li>
            ))}
          </ol>
        </Section>
      </div>

      <h2 className="mb-3 mt-10 text-xl font-medium">Questions</h2>
      <Faq items={[
        ["How is depreciation computed?", "Straight-line per the class policy: cost less the residual value % is spread over the useful life month by month. Assets in use before the quarter get three months, and the charge stops once the asset is fully depreciated. The life and residual % come from the policy, not the register."],
        ["Which period is used?", "The financial-year quarter (April–March) in which the additions and disposals fall — e.g. Q1 FY 2026-27 is April to June 2026."],
        ["Why does an addition in the first month get a figure?", "With no convention configured, an addition available in the quarter's first month is given an illustrative full-quarter charge, marked as needing approval of the convention. Later additions are held."],
        ["What happens with the capital invoice?", "The invoice number, supplier, taxable value, GST and total are read from the PDF and agreed to the additions file. A total that differs from the ledger cost, or a taxable value and GST that don't add up, is an exception."],
        ["Who receives the email?", "The recipients listed under Settings receive the PDF summary as soon as a report is generated. Each unique set of files is emailed once; you can resend from the run page."],
        ["Can I ask questions about the files?", "Yes — open Ask AI (or the button on a run). The assistant answers from the schedule, the exceptions, the invoices and every file you uploaded."],
        ["Is an AI model computing the depreciation?", "No. Every figure comes from deterministic rules, so the same files always give the same result. AI is used only to read unfamiliar headers or an invoice the rules can't parse, and for the chat."],
      ]} />
    </>
  );
}

function Spec({ name, cols }) {
  return (
    <div>
      <p className="font-medium">{name}</p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">{cols.map((c) => <li key={c} className="break-all rounded-md bg-paper-2 px-2 py-0.5 font-mono text-[11.5px] text-muted">{c}</li>)}</ul>
    </div>
  );
}

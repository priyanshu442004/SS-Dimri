import { PageHeader, Section, Faq, Steps, Btn } from "@shared/ui";
import { SAMPLES } from "./NewRun";

const S = `${import.meta.env.BASE_URL}samples/`;

export default function Help() {
  return (
    <>
      <PageHeader eyebrow="Help & formats" title="How TDS processing works" actions={<Btn to="/new" icon="plus">New TDS run</Btn>}>
        What to upload, what each check does, and what the output contains.
      </PageHeader>

      <Steps items={[["Upload", "Payment ledger, vendor master and challan register for the quarter (Excel or CSV). Review notes are optional."], ["Check", "Each payment's PAN, section and effective rate; repeat payments to the same deductee are grouped."],
        ["Reconcile", "TDS booked is compared with challans by quarter and by month (challan by the 7th settles the previous month)."], ["Report", "Deduction register, challan summary, exceptions and control summary — PDF emailed, Excel to download."]]} />

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Section title="Input files" i={1}>
          <div className="space-y-4 p-5 text-sm">
            <Spec name="Payment ledger (required)" cols={["Payment_ID", "Payment_Date", "Vendor_ID", "Vendor_Name", "PAN", "TDS_Section_As_Booked", "Nature", "Gross_Amount_INR", "TDS_Deducted_INR", "Net_Paid_INR", "TDS_Deposit_Date"]} />
            <Spec name="Vendor master (required)" cols={["Vendor_ID", "Vendor_Name", "PAN", "Vendor_Type", "PAN_Status"]} />
            <Spec name="TDS challan register (required)" cols={["Challan_ID", "BSR_Code", "Challan_Date", "Challan_Serial_No", "Amount_INR", "Minor_Head", "Assessment_FY", "Quarter"]} />
            <Spec name="Review notes (optional CSV)" cols={["Test_ID / Note no.", "Scenario / instruction"]} />
            <p className="text-muted">Column order doesn't matter and extra columns are ignored. Close variations of these names are recognised; unfamiliar headers are mapped by AI. Amounts may be numbers or text, dates as YYYY-MM-DD, DD-MM-YYYY or Excel dates. Up to 10 MB per file.</p>
            <div className="flex flex-wrap gap-2 pt-1">
              {SAMPLES.map(([f, l]) => <Btn key={f} href={`${S}${f}`} download variant="line" icon="download">{l}</Btn>)}
            </div>
          </div>
        </Section>
        <Section title="Checks, in order of priority" i={2}>
          <ol className="space-y-3 p-5 text-sm">
            {[["Missing PAN", "No PAN in the ledger or vendor master, or a PAN status of missing / invalid — mandatory human review."],
              ["Data errors", "Duplicate payment IDs; net paid not equal to gross less TDS."],
              ["Rate consistency", "Same deductee, section and quarter deducted at different rates — the first payment and each later one are flagged."],
              ["Configured rate", "Effective rate differs from the configured rule for the section and deductee type (see Settings)."],
              ["Aggregation", "Further payments to the same deductee under the same section in the quarter — aggregate for threshold checks."],
              ["Challans", "TDS booked vs challans per quarter, with a month-wise allocation to locate the shortfall."]].map(([t, d], i) => (
              <li key={t} className="grid grid-cols-[28px_1fr] gap-2"><span className="font-mono text-xs text-muted">0{i + 1}</span><span><b className="font-medium">{t}.</b> <span className="text-muted">{d}</span></span></li>
            ))}
          </ol>
        </Section>
      </div>

      <h2 className="mb-3 mt-10 text-xl font-medium">Questions</h2>
      <Faq items={[
        ["Is the output ready to file?", "No — by design it is a draft for review. A tax professional must confirm the applicable sections, thresholds and rates, and the data must be mapped to the current filing utility schema (Form 26Q / 24Q) before filing."],
        ["Where do the rates come from?", "From the configured rule table shown in Settings. They are used only to flag payments for review; the engine never decides legal treatment."],
        ["What is the “aggregate difference”?", "TDS recorded in the books minus the total of challans provided. The month-wise allocation on the run page shows which month the gap sits in."],
        ["Who receives the email?", "The finance recipients listed under Settings receive the PDF summary as soon as a report is generated. Each unique set of files is emailed once; you can resend from the run page."],
        ["Can I ask questions about the files?", "Yes — open Ask AI (or the button on a run). The assistant answers from the processed output and every file you uploaded, including the review notes."],
        ["Is an AI model computing the figures?", "No. Totals, rates, notes and exceptions come from deterministic rules, so the same files always give the same result. AI is used only to read unfamiliar headers and for the chat."],
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

import { PageHeader, Section, Faq, Steps, Btn, Icon } from "@shared/ui";

const S = `${import.meta.env.BASE_URL}samples/`;
const SAMPLES = ["01_INV-260401", "02_INV-260402", "03_INV-260403", "04_INV-260404", "05_INV-260405", "06_INV-260406", "07_INV-260407", "08_INV-260408", "09_INV-260401", "10_INV-260410"];

export default function Help() {
  return (
    <>
      <PageHeader eyebrow="Help & checks" title="How invoices are processed" actions={<Btn to="/new" icon="plus">Process invoices</Btn>}>
        What to upload, what is extracted, and every check run on each invoice.
      </PageHeader>
      <Steps items={[["Upload", "Text-based PDF invoices, up to 100 per batch."], ["Extract", "Supplier, GSTINs, invoice no./date, line items, taxable value, CGST/SGST/IGST, total."], ["Validate", "GST recalculated from rate × taxable; totals, duplicates and data quality checked."], ["Deliver", "On-screen register, PDF report, Excel and CSV; report + register emailed."]]} />

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Section title="Checks and what they mean" i={1}>
          <ul className="space-y-3 p-5 text-sm">
            {[["Duplicate invoice", "Same supplier (GSTIN) and invoice number as an earlier invoice in the batch. Excluded from totals so it is not paid twice."],
              ["Total mismatch", "Printed invoice total differs from taxable value + calculated GST by ₹0.50 or more."],
              ["GST mismatch", "Printed CGST/SGST/IGST differs from rate × taxable value, or the wrong tax type for the supply (same state → CGST+SGST, different → IGST)."],
              ["Line items vs taxable value", "Sum of item amounts doesn't equal the stated taxable value."],
              ["Data quality", "Missing invoice number/date/total or a malformed GSTIN."]].map(([t, d]) => (
              <li key={t}><b className="font-medium">{t}.</b> <span className="text-muted">{d}</span></li>
            ))}
          </ul>
        </Section>
        <Section title="Sample invoices" i={2}>
          <div id="samples" className="p-5 text-sm">
            <p className="text-muted">Ten synthetic invoices: one duplicate and one with an inflated total. Download them and run a batch to see both flagged.</p>
            <ul className="mt-4 grid grid-cols-2 gap-2">
              {SAMPLES.map((s) => (
                <li key={s}><a href={`${S}${s}.pdf`} download className="flex items-center gap-2 rounded-lg border border-ink/10 bg-white px-3 py-2 font-mono text-[12px] hover:border-ink/30"><Icon name="file" className="size-4 text-muted" />{s}.pdf</a></li>
              ))}
            </ul>
          </div>
        </Section>
      </div>

      <h2 className="mb-3 mt-10 text-xl font-medium">Questions</h2>
      <Faq items={[
        ["Can it read scanned invoices?", "Not yet — scanned image PDFs have no text layer and are reported as unreadable. Text-based PDFs (exported from billing software) work."],
        ["Is AI used to read invoices?", "Fields are read with layout rules first. If an invoice's layout is unfamiliar and required fields are missing, DeepSeek fills the gaps; the register shows how each invoice was read. GST and totals are always recalculated by code."],
        ["Why are totals lower than the sum of all invoices?", "Duplicate candidates are excluded from batch totals so the same invoice is not counted or paid twice."],
        ["What does the email contain?", "The PDF review report and the Excel register, sent to the recipients listed under Settings."],
        ["Does it post entries to my accounting software?", "No. Export the Excel/CSV register and import it, or post after review."],
      ]} />
    </>
  );
}

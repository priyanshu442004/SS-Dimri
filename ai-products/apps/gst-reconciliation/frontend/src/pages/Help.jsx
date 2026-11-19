import { PageHeader, Section, Steps, Faq, Btn, Icon } from "@shared/ui";

const BASE = import.meta.env.BASE_URL;
const SAMPLES = [
  ["Supply Outward Register FY2024-25.xlsx", "Outward register (sales)"],
  ["Supply Inward Register FY2024-25.xlsx", "Inward / ITC register (purchases)"],
  ["GSTR-2B FY2024-25.xlsx", "Compiled GSTR-2B"],
  ["GSTR-1 Annual Summary FY2024-25.pdf", "GSTR-1 annual summary"],
  ["GSTR-3B Annual Summary FY2024-25.pdf", "GSTR-3B annual summary"],
  ["RCM Working FY2024-25.xlsx", "Reverse-charge working"],
  ["Electronic Credit Ledger FY2024-25.csv", "Electronic credit ledger"],
];

const FORMATS = [
  ["Outward register", "Excel", "GSTR-1 section, party, GSTIN, place of supply, doc no., doc date, invoice value, taxable value, rate, IGST, CGST, SGST, cess"],
  ["Inward register", "Excel", "GSTR-2 section, supplier GSTIN, party, doc no., doc date, taxable value, rate, IGST, CGST, SGST"],
  ["GSTR-2B", "Excel", "Return period, supplier GSTIN, trade/legal name, invoice number & date, taxable value, integrated / central / state tax"],
  ["GSTR-1 / GSTR-3B", "PDF or Excel", "Annual or monthly summaries (text-based PDF)"],
  ["RCM working", "Excel", "Invoice date & number, party, taxable value, tax"],
  ["Cash / credit ledger", "CSV", "Electronic ledger export from the GST portal"],
  ["Portal GSTR-9 (optional)", "Excel", "Downloaded system-computed GSTR-9 workbook"],
];

export default function Help() {
  return (
    <>
      <PageHeader eyebrow="Help & formats" title="How GST Reconciliation works" actions={<Btn to="/new" icon="plus">New case</Btn>}>
        File names help the system recognise each document (e.g. "Supply Inward Register", "GSTR-2B"); unfamiliar layouts are mapped by AI and shown with a confidence score.
      </PageHeader>
      <div className="space-y-6">
        <Steps items={[
          ["Profile", "Every sheet, column and PDF page is read in full."],
          ["Map", "DeepSeek maps unfamiliar layouts to standard GST fields — never the amounts."],
          ["Reconcile", "Books are matched with GSTR-2B invoice by invoice (GSTIN + invoice no.)."],
          ["Calculate & explain", "GSTR-9 / 9C tables are computed in Python; AI explains each exception."],
        ]} />

        <Section title="Accepted documents" i={1}>
          <div className="overflow-x-auto p-5 pt-3">
            <table className="w-full min-w-[620px] text-[14px]">
              <thead><tr className="border-b border-ink/10 text-left text-muted"><th className="py-2 font-medium">Document</th><th className="py-2 font-medium">Format</th><th className="py-2 font-medium">Expected columns</th></tr></thead>
              <tbody>{FORMATS.map(([d, f, c]) => <tr key={d} className="border-b border-ink/6 align-top last:border-0"><td className="py-2.5 pr-4 font-medium">{d}</td><td className="py-2.5 pr-4 whitespace-nowrap">{f}</td><td className="py-2.5 text-muted">{c}</td></tr>)}</tbody>
            </table>
          </div>
        </Section>

        <Section title="Sample package" i={2} aside={<span className="label">synthetic · FY 2024-25</span>}>
          <p className="px-5 pt-2 text-sm text-muted">A complete fictional package with deliberate differences (3 invoices missing from GSTR-2B, 2 missing from books, 2 tax mismatches). Upload all seven files to a new case to try it.</p>
          <ul className="grid gap-2 p-5 sm:grid-cols-2">
            {SAMPLES.map(([f, d]) => (
              <li key={f}><a href={`${BASE}samples/${encodeURIComponent(f)}`} download className="flex items-center gap-3 rounded-xl border border-ink/8 bg-white px-3.5 py-3 transition-colors hover:border-teal/50">
                <Icon name="download" className="size-4 text-teal-ink" /><span className="min-w-0"><span className="block truncate text-[13.5px] font-medium">{f}</span><span className="block text-[12px] text-muted">{d}</span></span>
              </a></li>
            ))}
          </ul>
        </Section>

        <Faq items={[
          ["Does the AI calculate any return figure?", "No. AI only identifies document layouts, explains exceptions and answers questions in chat. Every amount in the reconciliation and in GSTR-9 / 9C is calculated deterministically from your files and keeps its source file and row."],
          ["How does Ask AI work?", "Ask AI reads the case's processed results (reconciliation, exceptions, GSTR-9 / 9C workings) plus the text of every uploaded file, and answers with DeepSeek. It names its sources; if something isn't in the documents it says so."],
          ["Why does GSTR-9C say DATA NEEDED?", "GSTR-9C needs audited turnover and ITC as per audited books. Enter them on the GSTR-9C tab, save, and re-run the analysis."],
          ["Can I file the return from here?", "No — the app produces draft working papers (PDF, Excel and field-level JSON). A senior must review and approve the figures, then file on the GST portal."],
          ["Scanned PDFs?", "Text-based PDFs are read in full. Scanned PDFs are held for human confirmation; upload the Excel export where possible."],
        ]} />
      </div>
    </>
  );
}

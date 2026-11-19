import SettingsPage from "@shared/SettingsPage";

export default function Settings() {
  return (
    <SettingsPage productName="Fixed Asset Register & Depreciation" rows={[
      ["Inputs", "Existing fixed asset register, current year additions, disposals, depreciation policy (+ capital invoice PDFs)"],
      ["Accepted files", (d) => `${d.limits.formats.join(", ")} · up to ${d.limits.maxFileMb} MB each`],
      ["Period", "The financial-year quarter (April–March) in which the additions and disposals fall"],
      ["Depreciation", "Book SLM per the class policy: cost less residual % over the useful life, monthly, full-month convention; capped at the depreciable amount"],
      ["Held", "Method conflicts, disposals without opening accumulated depreciation, additions after the first month without a partial-period convention, missing WDV/policy inputs"],
      ["Invoices", "Text PDFs read by rule (AI only if a field can't be found) and agreed to the additions by invoice number"],
      ["Outputs", "PDF Fixed Asset Processing Summary · Excel workbook (Asset Rollforward, Exceptions, Additions Extract)"],
      ["Emailed", "The PDF summary, as soon as a report is generated"],
      ["Tax", "Tax depreciation is never inferred from the book policy"],
    ]} />
  );
}

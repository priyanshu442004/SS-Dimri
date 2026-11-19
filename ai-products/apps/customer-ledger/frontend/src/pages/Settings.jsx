import SettingsPage from "@shared/SettingsPage";

export default function Settings() {
  return (
    <SettingsPage productName="Customer Ledger Reconciliation" rows={[
      ["Inputs", "Company customer ledger, customer statement, customer master (+ optional test-scenario / notes CSV)"],
      ["Accepted files", (d) => `${d.limits.formats.join(", ")} · up to ${d.limits.maxFileMb} MB each`],
      ["Matching", (d) => `Same reference (leading zeros and punctuation ignored), then same amount and side within ${d.dateWindow} days`],
      ["Outputs", "PDF Customer Reconciliation Summary · Excel workbook (Reconciliation, Ageing Input, Actions)"],
      ["Emailed", "The PDF summary, as soon as a report is generated"],
      ["Ageing", "Due date = invoice date + credit terms, aged at the statement date — both taken from the customer master (or a Due_Date column in the ledger)"],
      ["Computation", "Deterministic rules — AI only reads unfamiliar headers and answers chat questions"],
    ]} />
  );
}

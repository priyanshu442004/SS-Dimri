import SettingsPage from "@shared/SettingsPage";

export default function Settings() {
  return (
    <SettingsPage productName="Vendor Ledger Reconciliation" rows={[
      ["Inputs", "Books vendor ledger, supplier statement, vendor master (+ optional test-scenario / notes CSV)"],
      ["Accepted files", (d) => `${d.limits.formats.join(", ")} · up to ${d.limits.maxFileMb} MB each`],
      ["Matching", (d) => `Same reference (leading zeros and punctuation ignored), then same amount and side within ${d.dateWindow} days`],
      ["Outputs", "PDF Vendor Reconciliation Summary · Excel workbook (Reconciliation, Summary, Actions)"],
      ["Emailed", "The PDF summary, as soon as a report is generated"],
      ["Computation", "Deterministic rules — AI only reads unfamiliar headers and answers chat questions"],
    ]} />
  );
}

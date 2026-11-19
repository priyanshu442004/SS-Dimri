import SettingsPage from "@shared/SettingsPage";

export default function Settings() {
  return (
    <SettingsPage productName="Bank Reconciliation" rows={[
      ["Date tolerance", (d) => `${d.defaults.tolerance} days (adjustable per run)`],
      ["Books sign convention", "Auto-detect from voucher types"],
      ["Accepted files", (d) => `${d.limits.formats.join(", ")} · up to ${d.limits.maxFileMb} MB each`],
      ["Outputs", "PDF review report · Excel workbook (summary, exceptions, bridge, matches, unmatched rows)"],
      ["Matching", "Deterministic rules — no AI involved in amounts or matches"],
    ]} />
  );
}

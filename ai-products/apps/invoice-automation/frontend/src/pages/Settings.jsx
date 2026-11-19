import SettingsPage from "@shared/SettingsPage";

export default function Settings() {
  return (
    <SettingsPage productName="Invoice Automation" rows={[
      ["Accepted files", (d) => `${d.limits.formats.join(", ")} · up to ${d.limits.maxFiles} per batch, ${d.limits.maxFileMb} MB each`],
      ["Extraction", (d) => `Layout rules, with ${d.extraction.model} as fallback for unfamiliar layouts`],
      ["GST check tolerance", "₹0.50"],
      ["Outputs", "PDF review report · Excel register (5 sheets) · CSV register"],
      ["Email attachments", "PDF report + Excel register"],
    ]} />
  );
}

import SettingsPage from "@shared/SettingsPage";

export default function Settings() {
  return (
    <SettingsPage productName="Financial Statement Analysis" rows={[
      ["Required documents", (d) => d.documents.join(" → ")],
      ["Accepted files", (d) => `${d.limits.formats.join(", ")} · up to ${d.limits.maxFileMb} MB each`],
      ["AI model", (d) => `${d.model} (extraction and chat)`],
      ["Calculations", "Ratios, score and report text computed by code — not by the model"],
      ["Outputs", "PDF Financial Health Summary · Excel workbook · chat transcript (Markdown)"],
    ]} />
  );
}

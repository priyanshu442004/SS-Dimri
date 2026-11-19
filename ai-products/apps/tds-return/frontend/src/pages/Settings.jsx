import SettingsPage from "@shared/SettingsPage";
import { Section } from "@shared/ui";
import { useApi } from "@shared/api";

export default function Settings() {
  const { data } = useApi("/settings");
  return (
    <SettingsPage productName="TDS Returns" rows={[
      ["Inputs", "Payment Ledger, Vendor Master, TDS Challan Register (+ optional review notes CSV)"],
      ["Accepted files", (d) => `${d.limits.formats.join(", ")} · up to ${d.limits.maxFileMb} MB each`],
      ["Outputs", "PDF TDS Processing Summary · Excel workbook (Deduction Register, Challan Summary, Exceptions, Control Summary)"],
      ["Emailed", "The PDF summary, as soon as a report is generated"],
      ["Computation", "Deterministic rules — AI only reads unfamiliar headers and answers chat questions"],
    ]}>
      {data?.rules && (
        <Section title="Configured rate rules" i={3} className="lg:col-span-2">
          <p className="px-5 pt-2 text-sm text-muted">Indicative rates used to flag payments for review. A flag is a prompt for a tax professional, not a legal conclusion.</p>
          <div className="overflow-x-auto p-5 pt-3">
            <table className="w-full min-w-[520px] text-sm">
              <thead><tr className="text-left">{["Section", "Nature", "Configured rate"].map((h) => <th key={h} className="label py-2 pr-4 font-medium">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-ink/6">
                {data.rules.map((r) => <tr key={r.section}><td className="py-2.5 pr-4 font-mono">{r.section}</td><td className="py-2.5 pr-4">{r.label}</td><td className="py-2.5 text-muted">{r.basis}</td></tr>)}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </SettingsPage>
  );
}

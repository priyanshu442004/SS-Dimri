import { ChatPage } from "@shared/Chat";

/** Chat with a processed TDS run: its output and every file that was uploaded. */
export default function Ask() {
  return (
    <ChatPage
      noun="TDS run" icon="tds" newLabel="New TDS run"
      placeholder="Ask about a payment, the challan gap, a deductee, PAN issues…"
      runs={(d) => d.runs.map((r) => ({
        id: r.id,
        title: `TDS · ${r.period?.label || "run"}`,
        sub: `${r.totals?.payments ?? 0} payments · ${r.exceptions} exception${r.exceptions === 1 ? "" : "s"}`,
        at: r.createdAt,
      }))}
    />
  );
}

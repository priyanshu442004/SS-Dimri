import { ChatPage } from "@shared/Chat";

/** Chat with a processed customer reconciliation: its output and every file that was uploaded. */
export default function Ask() {
  return (
    <ChatPage
      noun="reconciliation" icon="customer" newLabel="New reconciliation"
      placeholder="Ask about a mismatch, a missing invoice, the ageing, the balance difference…"
      runs={(d) => d.runs.map((r) => ({
        id: r.id,
        title: `${r.customer?.name || "Customer"} · ${r.period?.label || ""}`,
        sub: `${r.stats?.exceptions ?? 0} exception${r.stats?.exceptions === 1 ? "" : "s"} · ${r.stats?.matched ?? 0} matched`,
        at: r.createdAt,
      }))}
    />
  );
}

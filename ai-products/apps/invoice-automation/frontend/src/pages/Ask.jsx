import { ChatPage } from "@shared/Chat";

/** Chat with a processed batch of invoices. */
export default function Ask() {
  return (
    <ChatPage
      noun="batch" icon="invoice" newLabel="New batch"
      placeholder="Ask about suppliers, GST, duplicates, a specific invoice…"
      runs={(d) => d.runs.map((r) => ({
        id: r.id,
        title: r.batchName || "Invoice batch",
        sub: `${r.totals?.invoices ?? "?"} invoices · ${r.ok ? "all passed" : `${r.totals?.exceptions ?? 0} need review`}`,
        at: r.createdAt,
      }))}
    />
  );
}

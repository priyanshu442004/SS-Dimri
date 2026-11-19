import { ChatPage } from "@shared/Chat";

/** Chat with a processed fixed asset run: its rollforward, exceptions, invoices and every file that was uploaded. */
export default function Ask() {
  return (
    <ChatPage
      noun="asset run" icon="asset" newLabel="New asset run"
      placeholder="Ask about an asset's depreciation, a held calculation, the disposal, the invoice…"
      runs={(d) => d.runs.map((r) => ({
        id: r.id,
        title: `Fixed assets · ${r.period?.label || ""}`,
        sub: `${(r.stats?.existing || 0) + (r.stats?.additions || 0)} assets · ${r.stats?.held ?? 0} held`,
        at: r.createdAt,
      }))}
    />
  );
}

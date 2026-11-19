import { ChatPage } from "@shared/Chat";
import { shortDate } from "@shared/format";

/** Chat with a processed reconciliation. */
export default function Ask() {
  return (
    <ChatPage
      noun="reconciliation" icon="bank" newLabel="New reconciliation"
      placeholder="Ask about the difference, exceptions, a transaction…"
      runs={(d) => d.runs.map((r) => ({
        id: r.id,
        title: `${r.accountName || "Bank account"} · ${r.period?.start ? `${shortDate(r.period.start)} – ${shortDate(r.period.end)}` : ""}`,
        sub: `${r.exceptions} exception${r.exceptions === 1 ? "" : "s"} · ${r.matchedPct}% matched`,
        at: r.createdAt,
      }))}
    />
  );
}

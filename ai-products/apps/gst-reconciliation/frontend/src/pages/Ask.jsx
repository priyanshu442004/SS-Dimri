import { ChatPage } from "@shared/Chat";

/** Chat with a GST case (any case that has documents). */
export default function Ask() {
  return (
    <ChatPage
      runsPath="/cases" noun="case" icon="gst" newLabel="New case"
      placeholder="Ask about ITC, GSTR-2B differences, GSTR-9 tables, a supplier…"
      runs={(cases) => cases.filter((c) => c.file_count > 0).map((c) => ({
        id: c.id,
        title: `${c.legal_name} · FY ${c.financial_year}`,
        sub: `${c.gstin} · ${c.result?.metrics ? `${c.result.metrics.exceptions} exceptions` : "not analysed yet"}`,
        at: c.updated_at,
      }))}
    />
  );
}

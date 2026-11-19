import { ChatPage } from "@shared/Chat";

/** Chat with a processed payroll run: its register, exceptions and every file that was uploaded. */
export default function Ask() {
  return (
    <ChatPage
      noun="payroll run" icon="payroll" newLabel="New payroll run"
      placeholder="Ask about an employee's pay, loss of pay, overtime, the statutory checks…"
      runs={(d) => d.runs.map((r) => ({
        id: r.id,
        title: `Payroll · ${r.period?.label || ""}`,
        sub: `${r.stats?.employees ?? 0} employees · ${r.stats?.exceptions ?? 0} exception${r.stats?.exceptions === 1 ? "" : "s"}`,
        at: r.createdAt,
      }))}
    />
  );
}

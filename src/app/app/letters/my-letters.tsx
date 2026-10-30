import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { LETTERS, memoFormatOf, MEMOS } from "@/lib/hr-letters/specs";
import { Badge, Card } from "@/components/ui";

/** The signed-in staff member's letters and memos, newest first. Renders nothing when there are none. */
export async function MyLetters({ employeeId, organizationId, className }: { employeeId: string; organizationId: string; className?: string }) {
  const [letters, memos] = await Promise.all([
    prisma.employeeLetter.findMany({ where: { employeeId, organizationId }, orderBy: { createdAt: "desc" } }),
    prisma.employeeMemo.findMany({ where: { employeeId, fileId: { not: null } }, orderBy: { createdAt: "desc" } }),
  ]);
  const rows = [
    ...letters.map((l) => ({ id: l.id, at: l.createdAt, title: LETTERS[l.kind].title, date: l.letterDate, done: !!l.acceptedAt, todo: "Read and accept" })),
    ...memos.map((m) => {
      const f = memoFormatOf(m.category);
      return { id: m.id, at: m.createdAt, title: `${f ? MEMOS[f].title : "Memo"} ${m.memoNumber ?? ""}`.trim(), date: m.memoDate, done: !!m.acknowledgedAt, todo: m.category === "SHOW_CAUSE" ? "Reply" : "Acknowledge" };
    }),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  if (!rows.length) return null;
  return (
    <Card title="My letters & memos" className={className}>
      <ul className="divide-y divide-line text-sm">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>
              <Link href={`/app/letters/${r.id}`} className="font-medium text-brand-700 hover:underline">{r.title}</Link>
              <span className="text-muted"> · {formatDate(r.date)}</span>
            </span>
            {r.done ? <Badge tone="ok">Done</Badge> : <Badge tone="warn">{r.todo}</Badge>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

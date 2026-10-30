import Link from "next/link";
import clsx from "clsx";
import { prisma } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/dates";
import { LETTERS, memoFormatOf, MEMOS, type LetterKind, type MemoFormat } from "@/lib/hr-letters/specs";
import type { AppContext } from "@/lib/session";
import { letterDefaults, memoDefaults } from "@/lib/services/hr-letters";
import { Badge, Card, Notice, Table, Td, Th } from "@/components/ui";
import { approveWithLetterAction, issueLetterAction, issueMemoAction } from "../../letters/actions";
import { HrDocumentForm } from "../../letters/hr-forms";

type Emp = { id: string; firstName: string; approvalStatus: string; onboardingSubmittedAt: Date | null; employmentType: string; employmentStatus: string };

/** Offer / appointment letters and memos for one staff member (owner & administrators). */
export async function LettersTab({ ctx, e, letter, memo }: { ctx: AppContext; e: Emp; letter?: string; memo?: string }) {
  const [letters, memos] = await Promise.all([
    prisma.employeeLetter.findMany({ where: { employeeId: e.id, organizationId: ctx.organization.id }, orderBy: { createdAt: "desc" }, include: { issuedBy: { select: { name: true } } } }),
    prisma.employeeMemo.findMany({ where: { employeeId: e.id }, orderBy: { createdAt: "desc" }, include: { issuedBy: { select: { firstName: true, lastName: true } } } }),
  ]);
  const decidable = !!e.onboardingSubmittedAt && ["PENDING", "UNDER_REVIEW", "ON_HOLD"].includes(e.approvalStatus);
  const appointment: LetterKind = e.employmentType === "TRAINEE" ? "APPOINTMENT_TRAINEE" : "APPOINTMENT_EMPLOYEE";
  const kind: LetterKind = letter && letter in LETTERS ? (letter as LetterKind) : decidable || e.approvalStatus === "APPROVED" ? appointment : "OFFER_LETTER";
  const format: MemoFormat | null = memo && memo in MEMOS ? (memo as MemoFormat) : null;
  const self = e.id === ctx.employee?.id;
  const exited = e.employmentStatus === "EXITED";
  const approving = decidable && kind !== "OFFER_LETTER" && !self;
  const [defaults, memoDefault] = await Promise.all([
    exited ? {} : letterDefaults(ctx, e.id, kind),
    format && !self ? memoDefaults(ctx, e.id, format) : {},
  ]);
  const base = `/app/employees/${e.id}?tab=letters`;
  const rows = [
    ...letters.map((l) => ({
      id: l.id, at: l.createdAt, what: LETTERS[l.kind].title, ref: l.referenceNo, date: l.letterDate, by: l.issuedBy?.name,
      status: l.acceptedAt ? <Badge tone="ok">Accepted {formatDate(l.acceptedAt)}</Badge> : <Badge tone="warn">Awaiting acceptance</Badge>,
    })),
    ...memos.map((m) => {
      const f = memoFormatOf(m.category);
      return {
        id: m.id, at: m.createdAt, what: `${f ? MEMOS[f].title : "Memo"}: ${m.subject}`, ref: m.memoNumber, date: m.memoDate,
        by: m.issuedBy ? `${m.issuedBy.firstName} ${m.issuedBy.lastName ?? ""}`.trim() : null,
        status: m.acknowledgedAt ? <Badge tone="ok">{m.employeeReply ? "Replied" : "Acknowledged"} {formatDate(m.acknowledgedAt)}</Badge> : <Badge tone="warn">Awaiting acknowledgement</Badge>,
      };
    }),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <div className="space-y-6">
      <Card title={`Issued letters & memos (${rows.length})`} padded={rows.length === 0}>
        {rows.length === 0 ? (
          <p className="text-sm text-muted">Nothing issued yet. Letters and memos are filled from the firm&apos;s templates, emailed with the Word file attached, and shown in the staff member&apos;s portal to accept or acknowledge.</p>
        ) : (
          <Table minWidth={720}>
            <thead><tr><Th>Document</Th><Th>No.</Th><Th>Date</Th><Th>Issued by</Th><Th>Status</Th><Th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td>{r.what}</Td>
                  <Td className="font-mono text-xs">{r.ref ?? "—"}</Td>
                  <Td>{formatDate(r.date)}</Td>
                  <Td>{r.by ?? "—"} <span className="block text-xs text-muted">{formatDateTime(r.at)}</span></Td>
                  <Td>{r.status}</Td>
                  <Td><Link href={`/app/letters/${r.id}`} className="font-medium text-brand-700 hover:underline">View</Link></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {exited ? (
        <Notice tone="info">{e.firstName} has exited the firm; no new letters can be issued.</Notice>
      ) : (
        <Card title="Issue a letter">
          <Pills items={(Object.keys(LETTERS) as LetterKind[]).map((k) => ({ key: k, label: LETTERS[k].title, href: `${base}&letter=${k}` }))} current={kind} />
          {approving ? (
            <div className="mb-4"><Notice tone="info">{e.firstName}&apos;s details are waiting for final approval. This approves them with the permanent ID below and issues the {LETTERS[kind].title.toLowerCase()} in one step.</Notice></div>
          ) : kind !== "OFFER_LETTER" && e.approvalStatus !== "APPROVED" && !self ? (
            <div className="mb-4"><Notice tone="warn">{e.firstName} has not submitted their details for approval yet. You can still issue the letter now.</Notice></div>
          ) : null}
          <HrDocumentForm
            key={kind}
            action={(approving ? approveWithLetterAction : issueLetterAction).bind(null, e.id, kind)}
            fields={LETTERS[kind].fields}
            defaults={defaults}
            approval={approving}
            submitLabel={approving ? `Approve & issue ${LETTERS[kind].title.toLowerCase()}` : `Issue ${LETTERS[kind].title.toLowerCase()}`}
            confirm={approving
              ? `Approve ${e.firstName} and issue the ${LETTERS[kind].title.toLowerCase()}? They are emailed the approval and the letter.`
              : `Issue the ${LETTERS[kind].title.toLowerCase()} to ${e.firstName}? It is emailed to them and shown in their portal.`}
          />
        </Card>
      )}

      {!self && (
        <Card title="Issue a memo">
          <Pills items={(Object.keys(MEMOS) as MemoFormat[]).map((f) => ({ key: f, label: MEMOS[f].title, href: `${base}&memo=${f}` }))} current={format ?? ""} />
          {format ? (
            <HrDocumentForm
              key={format}
              action={issueMemoAction.bind(null, e.id, format)}
              fields={MEMOS[format].fields}
              defaults={memoDefault}
              submitLabel="Issue memo"
              confirm={`Issue this memo to ${e.firstName}? It is emailed to them and they must acknowledge it in the portal.`}
            />
          ) : (
            <p className="text-sm text-muted">Choose a format. The memo number, name, designation and department are filled in automatically.</p>
          )}
        </Card>
      )}
    </div>
  );
}

function Pills({ items, current }: { items: { key: string; label: string; href: string }[]; current: string }) {
  return (
    <nav aria-label="Template" className="mb-4 flex flex-wrap gap-2">
      {items.map((i) => (
        <Link
          key={i.key}
          href={i.href}
          scroll={false}
          aria-current={i.key === current ? "page" : undefined}
          className={clsx(
            "rounded-full border px-3 py-1 text-sm transition-colors",
            i.key === current ? "border-ink bg-ink text-surface" : "border-line text-muted hover:border-ink/40 hover:text-ink",
          )}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

import { notFound } from "next/navigation";
import { Download, Printer } from "lucide-react";
import { can } from "@/lib/permissions";
import { isAwaitingApproval, requireContext } from "@/lib/session";
import { formatDate, formatDateTime } from "@/lib/dates";
import { LETTERS, memoFormatOf, MEMOS } from "@/lib/hr-letters/specs";
import { renderStoredLetter, SHEET } from "@/lib/hr-letters/sheet";
import { loadHrDocument } from "@/lib/services/hr-letters";
import { ActionButton } from "@/components/action-button";
import { buttonClass, Card, DetailList, Notice, PageHeader } from "@/components/ui";
import { acceptLetterAction, acknowledgeMemoAction } from "../actions";
import { AcknowledgeMemoForm } from "../hr-forms";

/** An issued offer / appointment letter or memo, laid out as the firm's Word template. */
export default async function LetterPage({ params }: PageProps<"/app/letters/[id]">) {
  const ctx = await requireContext();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const manage = can(ctx.role, "employees.manage") && !isAwaitingApproval(ctx);
  const doc = await loadHrDocument(ctx, id, manage);
  if (!doc?.file) notFound();
  const sheet = await renderStoredLetter(doc.file.objectKey);

  const mine = doc.employeeId === ctx.employee?.id;
  const person = `${doc.employee.firstName} ${doc.employee.lastName ?? ""}`.trim();
  const isLetter = doc.type === "letter";
  const title = isLetter ? LETTERS[doc.kind].title : doc.subject;
  const format = !isLetter ? memoFormatOf(doc.category) : null;
  const back = mine ? { href: "/app/onboarding", label: "My employee record" } : { href: `/app/employees/${doc.employeeId}?tab=letters`, label: person };

  return (
    <>
      <PageHeader
        title={title}
        back={back}
        description={isLetter ? `${doc.referenceNo ?? ""} · ${formatDate(doc.letterDate)} · ${person}` : `Memo ${doc.memoNumber ?? ""} · ${formatDate(doc.memoDate)} · ${person}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <a href={`/app/letters/${doc.id}/print`} target="_blank" rel="noopener" className={buttonClass("secondary", "sm")}>
              <Printer className="size-4" aria-hidden /> Print / PDF
            </a>
            <a href={`/api/files/${doc.file.id}`} className={buttonClass("secondary", "sm")}>
              <Download className="size-4" aria-hidden /> Word file
            </a>
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 overflow-x-auto rounded-lg bg-paper-line/40 p-2 sm:p-6">
          {sheet.pages.map((page, i) => (
            <article
              key={i}
              className="relative mx-auto mb-6 bg-white text-black shadow-sm ring-1 ring-black/5 last:mb-0"
              style={{
                width: "100%",
                maxWidth: `${SHEET.width}pt`,
                minHeight: `min(${SHEET.minHeight}pt, 140vw)`,
                fontFamily: "Arial, Helvetica, sans-serif",
                fontSize: "10.5pt",
                padding: `clamp(16px, 5vw, ${SHEET.headerTop}pt) clamp(16px, 8vw, ${SHEET.side}pt) clamp(24px, 8vw, ${SHEET.bottom}pt)`,
              }}
            >
              <div style={{ marginBottom: "18pt" }} dangerouslySetInnerHTML={{ __html: sheet.header }} />
              <div dangerouslySetInnerHTML={{ __html: page }} />
            </article>
          ))}
        </div>

        <div className="space-y-6">
          {isLetter ? (
            <Card title="Status">
              <DetailList
                items={[
                  ["Issued", `${formatDateTime(doc.createdAt)}${doc.issuedBy ? ` by ${doc.issuedBy.name}` : ""}`],
                  ["Reference", doc.referenceNo],
                  ["Accepted", doc.acceptedAt ? formatDateTime(doc.acceptedAt) : "Not yet"],
                ]}
              />
              {mine && !doc.acceptedAt && (
                <div className="mt-4 space-y-3 border-t border-line pt-4">
                  <p className="text-sm text-muted">Please read the letter. Accepting records your acceptance of these terms with the date and time.</p>
                  <ActionButton action={acceptLetterAction.bind(null, doc.id)} variant="primary" size="md" confirm="Accept this letter and its terms?">
                    I accept this letter
                  </ActionButton>
                </div>
              )}
              {doc.acceptedAt && <div className="mt-4"><Notice tone="ok">{mine ? "You accepted" : `${doc.employee.firstName} accepted`} this letter on {formatDateTime(doc.acceptedAt)}.</Notice></div>}
            </Card>
          ) : (
            <Card title="Status">
              <DetailList
                items={[
                  ["Format", format ? MEMOS[format].title : null],
                  ["Issued by", doc.issuedBy ? `${doc.issuedBy.firstName} ${doc.issuedBy.lastName ?? ""}`.trim() : null],
                  ["Reply by", doc.replyByDate ? formatDate(doc.replyByDate) : null],
                  ["Acknowledged", doc.acknowledgedAt ? formatDateTime(doc.acknowledgedAt) : "Not yet"],
                ]}
              />
              {doc.employeeReply && (
                <div className="mt-4 rounded-md border border-line bg-canvas p-3 text-sm">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Explanation · {formatDateTime(doc.repliedAt)}</p>
                  <p className="whitespace-pre-line">{doc.employeeReply}</p>
                </div>
              )}
              {mine && !doc.acknowledgedAt && (
                <div className="mt-4 border-t border-line pt-4">
                  <AcknowledgeMemoForm action={acknowledgeMemoAction.bind(null, doc.id)} replyRequired={doc.category === "SHOW_CAUSE"} />
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

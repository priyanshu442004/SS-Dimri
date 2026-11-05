import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/session";
import { dateOnly, formatDate, isoDateInTz, minutesToHhmm, toIsoDate } from "@/lib/dates";
import { daysAllowed, STATUS_OF_WORK_LABEL, timelineFlagOf, workStatusOf } from "@/lib/domain/tracker";
import { activeClientOptions, employeeOptions } from "@/lib/services/lookups";
import { canDelete } from "@/lib/services/deletions";
import { ActionButton } from "@/components/action-button";
import { DeleteButton } from "@/components/delete-dialog";
import { Card, Notice, PageHeader, Table, Td, Th } from "@/components/ui";
import { markTrackerLineReviewedAction, updateTrackerLineAction } from "../../../worklog-actions";
import { TrackerLineForm } from "../../tracker-forms";
import { FlagBadge, WorkStatusBadge } from "../../sections";
import { ClipboardList } from "lucide-react";

/** One tracker line: edit every column, and see the work logged against its Ref No. */
export default async function TrackerLinePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCapability("timesheet.view_all");
  const { id } = await params;
  const l = await prisma.trackerLine.findFirst({
    where: { id, organizationId: ctx.organization.id },
    include: {
      entries: { orderBy: [{ workDate: "desc" }, { createdAt: "desc" }], take: 200, include: { employee: { select: { firstName: true, lastName: true } } } },
    },
  });
  if (!l) notFound();
  const [clients, people, workTypes] = await Promise.all([
    activeClientOptions(ctx.organization.id),
    employeeOptions(ctx.organization.id),
    prisma.workType.findMany({ where: { organizationId: ctx.organization.id, OR: [{ isActive: true }, { name: l.typeOfWork }] }, orderBy: { sortOrder: "asc" }, select: { name: true } }),
  ]);
  const today = dateOnly(isoDateInTz(new Date(), ctx.organization.timezone));
  const iso = (x: Date | null) => (x ? toIsoDate(x) : "");
  const s = (x: string | null) => x ?? "";
  const types = [...new Set([...workTypes.map((w) => w.name), l.typeOfWork])];
  const allowed = daysAllowed(l.clientRaisedOn, l.clientDueBy);

  return (
    <>
      <PageHeader icon={<ClipboardList />}
        title={`${l.refNo} · ${l.clientName}`}
        back={{ href: "/app/timesheet?tab=tracker", label: "Tracker" }}
        description={<span className="flex flex-wrap items-center gap-2">{l.typeOfWork} <WorkStatusBadge s={workStatusOf(l)} /> <FlagBadge f={timelineFlagOf(l, today)} />{allowed !== null && <span className="text-xs text-muted">{allowed} days allowed to the client</span>}</span>}
        actions={canDelete(ctx, "trackerline") && <DeleteButton entity="trackerline" id={l.id} redirectTo="/app/timesheet?tab=tracker" />}
      />
      {!l.reviewedAt && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Notice tone="info">This line came in new from a team member&apos;s daily log. Check it, set the Maker, Checker and priority, and save.</Notice>
          <ActionButton variant="secondary" action={markTrackerLineReviewedAction.bind(null, l.id)}>Mark reviewed</ActionButton>
        </div>
      )}
      <div className="space-y-6">
        <Card title="Tracker line">
          <TrackerLineForm
            action={updateTrackerLineAction.bind(null, l.id)}
            clients={clients}
            people={people}
            workTypes={types}
            submitLabel="Save line"
            d={{
              refNo: l.refNo, clientId: s(l.clientId), clientNameText: l.clientId ? "" : l.clientName, branch: s(l.branch), typeOfWork: l.typeOfWork, bankName: s(l.bankName),
              periodFrom: iso(l.periodFrom), periodTo: iso(l.periodTo), statusOfWork: l.statusOfWork === "PENDING" ? "IN_PROGRESS" : l.statusOfWork,
              issueLevel: s(l.issueLevel), issueDetails: s(l.issueDetails), issueStatus: s(l.issueStatus),
              clientPendingItem: s(l.clientPendingItem), clientRaisedOn: iso(l.clientRaisedOn), clientDueBy: iso(l.clientDueBy), clientPendingStatus: s(l.clientPendingStatus),
              teamPendingItem: s(l.teamPendingItem), teamRaisedOn: iso(l.teamRaisedOn), teamDueBy: iso(l.teamDueBy), teamPendingStatus: s(l.teamPendingStatus),
              getFrom: s(l.getFrom), dateReceived: iso(l.dateReceived), makerEmployeeId: s(l.makerEmployeeId), checkerEmployeeId: s(l.checkerEmployeeId),
              checkerStatus: s(l.checkerStatus), workStartDate: iso(l.workStartDate), priority: s(l.priority), nextFollowUpOn: iso(l.nextFollowUpOn), remarks: s(l.remarks),
            }}
          />
        </Card>
        <Card title={`Work logged against ${l.refNo} (${l.entries.length})`} padded={false}>
          {l.entries.length === 0 ? <p className="p-4 text-sm text-muted">Nothing logged yet. The Maker sees this line in their timesheet.</p> : (
            <Table minWidth={900}>
              <thead><tr><Th>Date</Th><Th>Team member</Th><Th>Status of work</Th><Th>Time</Th><Th>Elaboration / details</Th><Th>Pending – client / team</Th></tr></thead>
              <tbody>
                {l.entries.map((e) => (
                  <tr key={e.id}>
                    <Td className="whitespace-nowrap"><Link href={`/app/timesheet/${e.id}`} className="font-medium text-brand-700 hover:underline">{formatDate(e.workDate)}</Link></Td>
                    <Td>{`${e.employee.firstName} ${e.employee.lastName ?? ""}`.trim()}</Td>
                    <Td className="text-xs">{e.workStatus ? STATUS_OF_WORK_LABEL[e.workStatus] : "—"}</Td>
                    <Td>{e.approxMinutes ? minutesToHhmm(e.approxMinutes) : "—"}</Td>
                    <Td className="max-w-sm text-xs">{e.workDetails ?? "—"}</Td>
                    <Td className="max-w-sm text-xs">{[e.clientPendingItem && `Client: ${e.clientPendingItem} (${e.clientPendingStatus ?? "Open"})`, e.teamPendingItem && `Team: ${e.teamPendingItem} (${e.teamPendingStatus ?? "Open"})`].filter(Boolean).join(" · ") || "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}

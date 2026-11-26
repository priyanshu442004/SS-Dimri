import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/session";
import { formatDate, isoDateInTz } from "@/lib/dates";
import { capacityFromPolicy, describeHours } from "@/lib/domain/allocation";
import { describeSchedule } from "@/lib/domain/allocation-schedule";
import { getPolicy } from "@/lib/services/office-rules";
import { refreshAllocationStatuses } from "@/lib/services/allocations";
import { allocationScope } from "@/lib/services/allocation-views";
import { employeeOptions } from "@/lib/services/lookups";
import { Card, Notice, PageHeader, TabNav } from "@/components/ui";
import { bulkAllocateAction, bulkTransferAction } from "./actions";
import { BulkAllocateForm, BulkTransferForm } from "./forms";

export const metadata: Metadata = { title: "Allocate / transfer many clients" };
const UUID = /^[0-9a-f-]{36}$/i;
const person = (e: { firstName: string; lastName: string | null }) => `${e.firstName} ${e.lastName ?? ""}`.trim();

// Bulk allocation and bulk transfer (tracker S.No. 105, 106): one person to many clients, or many
// clients from one person to another, in one go. History is kept as for a single change.
export default async function BulkAllocationPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireCapability("allocations.manage");
  const sp = await searchParams;
  const tab = sp.tab === "transfer" ? "transfer" : "allocate";
  const today = isoDateInTz(new Date(), ctx.organization.timezone);
  await refreshAllocationStatuses(ctx.organization.id, today);
  const scope = await allocationScope(ctx);
  const everyone = await employeeOptions(ctx.organization.id);
  const employees = scope.firm ? everyone : everyone.filter((e) => (scope.line ?? []).includes(e.value));
  const capacity = capacityFromPolicy((await getPolicy(ctx.organization.id)).row);

  return (
    <>
      <PageHeader icon={<Users />} title="Allocate or transfer many clients" back={{ href: "/app/allocations", label: "Team allocation" }}
        description="Allocate one person to many clients at once, or move many clients from one person to another. Each change keeps its history, exactly like a single change." />
      <TabNav current={tab} tabs={[
        { key: "allocate", label: "Allocate one person to many clients", href: "/app/allocations/bulk" },
        { key: "transfer", label: "Transfer clients to another person", href: "/app/allocations/bulk?tab=transfer" },
      ]} />
      {tab === "allocate" ? <Allocate /> : <Transfer />}
    </>
  );

  async function Allocate() {
    const clients = await prisma.client.findMany({
      where: { organizationId: ctx.organization.id, status: { in: ["ACTIVE", "ON_HOLD"] } },
      orderBy: { tradeName: "asc" },
      select: {
        id: true, tradeName: true, clientCode: true,
        teamAllocations: { where: { status: { in: ["ACTIVE", "PLANNED"] } }, select: { employee: { select: { id: true, firstName: true, lastName: true } } } },
      },
    });
    const list = clients.map((c) => ({
      id: c.id, name: c.tradeName, code: c.clientCode,
      people: [...new Map(c.teamAllocations.map((a) => [a.employee.id, { id: a.employee.id, name: person(a.employee) }])).values()],
    }));
    return (
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card title="Allocate one person to many clients">
          <BulkAllocateForm action={bulkAllocateAction} employees={employees} clients={list} today={today} capacity={capacity} />
        </Card>
        <Card title="How it works">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted">
            <li>A new junior joins a team with 30 clients? Choose <strong className="text-ink">Clients of</strong> the senior, tick all, and allocate — with the same days and hours as the senior on each client, and the senior as reviewer.</li>
            <li>Or pick any clients by searching, or <strong className="text-ink">Clients with no team yet</strong>.</li>
            <li>Each client is saved on its own. A client the person is already on, or that would overbook their day, is skipped and the reason is shown; tick &ldquo;Allow overlap&rdquo; to save those anyway.</li>
            <li>The person gets one notification listing their new clients.</li>
          </ul>
        </Card>
      </div>
    );
  }

  async function Transfer() {
    const from = typeof sp.from === "string" && UUID.test(sp.from) && everyone.some((e) => e.value === sp.from) && (scope.firm || (scope.line ?? []).includes(sp.from)) ? sp.from : "";
    const rows = from
      ? await prisma.teamAllocation.findMany({
          where: { organizationId: ctx.organization.id, employeeId: from, status: { in: ["ACTIVE", "PLANNED"] } },
          orderBy: { client: { tradeName: "asc" } },
          include: { client: { select: { tradeName: true, clientCode: true } } },
        })
      : [];
    const num = (d: unknown) => (d === null || d === undefined ? null : Number(d));
    const fromName = everyone.find((e) => e.value === from)?.label;
    return (
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card title={from ? `Move ${fromName?.split(" — ")[0]}'s clients` : "Whose clients are you moving?"}>
          <form className="mb-4 flex flex-wrap items-end gap-2">
            <input type="hidden" name="tab" value="transfer" />
            <label className="text-sm"><span className="mb-1 block font-medium">From team member</span>
              <select name="from" defaultValue={from} className="h-10 w-72 max-w-full rounded-md border border-line bg-surface px-2 text-sm">
                <option value="">Choose…</option>
                {everyone.filter((e) => scope.firm || (scope.line ?? []).includes(e.value)).map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
              </select>
            </label>
            <button className="h-10 rounded-md border border-line bg-surface px-4 text-sm hover:bg-subtle">Show their clients</button>
          </form>
          {from && (
            <BulkTransferForm key={from} action={bulkTransferAction} employees={everyone} from={from} today={today}
              rows={rows.map((a) => ({
                id: a.id, client: a.client.tradeName, code: a.client.clientCode, status: a.status,
                days: describeSchedule(a), hours: describeHours({ firstHalfHours: num(a.firstHalfHours), secondHalfHours: num(a.secondHalfHours) }, capacity),
                period: `${formatDate(a.startDate)} – ${a.endDate ? formatDate(a.endDate) : "ongoing"}`,
              }))} />
          )}
        </Card>
        <Card title="How it works">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted">
            <li>Use it when someone leaves the job or moves to other clients.</li>
            <li>Each ticked allocation ends the day before the effective date and the new person takes it over from that date, with the same days, hours and reviewer. The old allocation stays in history.</li>
            <li>An allocation that has not started yet simply moves to the new person.</li>
            <li>Tick &ldquo;Also make the new person the reviewer / team leader&rdquo; to hand over the old person&apos;s review duties too.</li>
          </ul>
          <div className="mt-3"><Notice tone="info">Someone leaving? After moving their clients, finish the exit on their <Link href="/app/employees" className="font-medium underline">employee record</Link>.</Notice></div>
        </Card>
      </div>
    );
  }
}

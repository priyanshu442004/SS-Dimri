import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { fmt } from "@/lib/chart-format";
import type { firmAnalytics, myAnalytics, teamAnalytics } from "@/lib/services/analytics";
import { BarList, ChartCard, Donut, StackedColumns, TrendLine } from "@/components/charts";

type Firm = Awaited<ReturnType<typeof firmAnalytics>>;
type Team = Awaited<ReturnType<typeof teamAnalytics>>;
type Mine = NonNullable<Awaited<ReturnType<typeof myAnalytics>>>;
type Point = { date: string; values: number[] };

const sum = (pts: Point[], i = 0) => pts.reduce((s, p) => s + p.values[i], 0);
const daily = (pts: Point[], format: "minutes" | "count", heads: string[]) => ({
  head: ["Date", ...heads],
  rows: pts.map((p) => [p.date, ...p.values.map((v) => fmt(v, format))]),
});
const list = (rows: { label: string; value: number }[], head: [string, string], format: "count" | "minutes" | "inr" = "count") => ({
  head,
  rows: rows.map((r) => [r.label, fmt(r.value, format)]),
});
const more = (href: string, label = "Open") => (
  <Link href={href} className="group inline-flex shrink-0 items-center gap-0.5 rounded-md border border-line px-2 py-1 text-xs font-medium text-muted transition-colors hover:border-ink/30 hover:text-ink">
    {label} <ArrowUpRight className="size-3 transition-transform group-hover:-translate-y-px group-hover:translate-x-px" aria-hidden />
  </Link>
);

/** Owner / administrator: the whole firm at a glance. */
export function FirmCharts({ a }: { a: Firm }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartCard title="Hours recorded per day" subtitle={`Last 30 days · ${fmt(sum(a.hoursPerDay), "minutes")} in total`} table={daily(a.hoursPerDay, "minutes", ["Hours"])} action={more("/app/timesheet?tab=collective")}>
        <TrendLine points={a.hoursPerDay} series={["Hours"]} format="minutes" />
      </ChartCard>
      <ChartCard title="Tasks created vs completed" subtitle={`Last 30 days · ${sum(a.tasksFlow, 0)} created, ${sum(a.tasksFlow, 1)} completed`} table={daily(a.tasksFlow, "count", ["Created", "Completed"])} action={more("/app/tasks?scope=all")}>
        <TrendLine points={a.tasksFlow} series={["Created", "Completed"]} />
      </ChartCard>
      <ChartCard title="Clients by status" table={list(a.clientsByStatus, ["Status", "Clients"])} action={more("/app/clients")}>
        <Donut slices={a.clientsByStatus} centerLabel="Clients" />
      </ChartCard>
      <ChartCard title="Tasks by status" subtitle="All tasks" table={list(a.tasksByStatus, ["Status", "Tasks"])} action={more("/app/tasks?scope=all&state=all")}>
        <BarList data={a.tasksByStatus} empty="No tasks yet." />
      </ChartCard>
      <ChartCard title="Attendance" subtitle="Last 14 days, people per status" table={daily(a.attendance, "count", a.attendanceSeries)} action={more("/app/attendance?tab=team")}>
        <StackedColumns days={a.attendance} series={a.attendanceSeries} />
      </ChartCard>
      <ChartCard title="Open tasks per team member" subtitle="Current workload" table={list(a.openTasksPerPerson, ["Team member", "Open tasks"])} action={more("/app/allocations")}>
        <BarList data={a.openTasksPerPerson} color="var(--color-series-7)" empty="No approved team members yet." />
      </ChartCard>
      <ChartCard title="Hours by client" subtitle="Last 30 days, top 8" table={list(a.hoursByClient, ["Client", "Hours"], "minutes")} action={more("/app/reports/clients")}>
        <BarList data={a.hoursByClient} format="minutes" color="var(--color-series-3)" empty="No client hours recorded in the last 30 days." />
      </ChartCard>
      <ChartCard title="Outstanding dues by client" subtitle="Open dues, top 8" table={list(a.duesByClient, ["Client", "Outstanding"], "inr")} action={more("/app/dues")}>
        <BarList data={a.duesByClient} format="inr" color="var(--color-series-2)" empty="No outstanding dues." />
      </ChartCard>
      <ChartCard
        title="Pending items by age"
        subtitle="Open items, waiting on client vs our team"
        table={{ head: ["Age", "With client", "With team"], rows: a.pendingAge.map((b) => [b.label, b.client, b.team]) }}
        action={more("/app/pending")}
      >
        <StackedColumns days={a.pendingAge.map((b) => ({ date: b.label, values: [b.client, b.team] }))} series={["With client", "With team"]} />
      </ChartCard>
    </div>
  );
}

/** Managers (whole firm) and seniors (their team). */
export function TeamCharts({ a, scope }: { a: Team; scope: string }) {
  return (
    <div className="mb-6 grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <ChartCard title={`Hours recorded per day — ${scope}`} subtitle={`Last 14 days · ${fmt(sum(a.hoursPerDay), "minutes")}`} table={daily(a.hoursPerDay, "minutes", ["Hours"])}>
          <TrendLine points={a.hoursPerDay} series={["Hours"]} format="minutes" />
        </ChartCard>
      </div>
      <ChartCard title="Open work by status" table={list(a.openTasksByStatus, ["Status", "Tasks"])}>
        <Donut slices={a.openTasksByStatus} centerLabel="Open tasks" />
      </ChartCard>
      <div className="lg:col-span-3">
        <ChartCard title={`Open tasks per person — ${scope}`} table={list(a.openTasksPerPerson, ["Team member", "Open tasks"])}>
          <BarList data={a.openTasksPerPerson} color="var(--color-series-7)" empty="No team members yet." />
        </ChartCard>
      </div>
    </div>
  );
}

/** A team member's own week. */
export function MyCharts({ a }: { a: Mine }) {
  return (
    <div className="mb-6 grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <ChartCard title="My hours per day" subtitle={`Last 14 days · ${fmt(sum(a.hoursPerDay), "minutes")}`} table={daily(a.hoursPerDay, "minutes", ["Hours"])} action={more("/app/timesheet")}>
          <TrendLine points={a.hoursPerDay} series={["Hours"]} format="minutes" />
        </ChartCard>
      </div>
      <ChartCard title="My tasks by status" table={list(a.tasksByStatus, ["Status", "Tasks"])} action={more("/app/tasks")}>
        <Donut slices={a.tasksByStatus} centerLabel="Tasks" />
      </ChartCard>
    </div>
  );
}

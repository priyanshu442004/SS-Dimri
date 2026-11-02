import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/session";
import { Badge, EmptyState, Notice, PageHeader, TabNav } from "@/components/ui";
import { CalendarDays, ChevronDown, FileText, Search } from "lucide-react";

export default async function CompliancesPage({ searchParams }: PageProps<"/app/compliances">) {
  await requireCapability("app.use");
  const sp = await searchParams;
  const items = await prisma.complianceItem.findMany({ orderBy: { sortOrder: "asc" } });
  const departments = [...new Set(items.map((i) => i.department))];
  const dept = typeof sp.dept === "string" && departments.includes(sp.dept) ? sp.dept : departments[0];
  const rows = items.filter((i) => i.department === dept);
  const query = typeof sp.q === "string" ? sp.q.trim() : "";
  const filteredRows = query
    ? rows.filter((item) =>
        [item.name, item.form, item.applicableTo, item.frequency, item.dueDateRule, item.penalty, item.remarks]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("en-IN")
          .includes(query.toLocaleLowerCase("en-IN")),
      )
    : rows;

  return (
    <>
      <PageHeader icon={<CalendarDays />} title="Compliance calendar" description="Department-wise compliance references from the firm's master data pack." />
      <div className="mb-4"><Notice tone="warn">Due dates are as compiled in October 2026 and change by notification — verify each year before relying on them.</Notice></div>
      <TabNav current={dept ?? ""} tabs={departments.map((d) => ({ key: d, label: d, href: `/app/compliances?dept=${encodeURIComponent(d)}`, count: items.filter((i) => i.department === d).length }))} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted" aria-live="polite">
          Showing <span className="font-medium text-ink">{filteredRows.length}</span> of {rows.length} references
          {dept ? <> in <span className="font-medium text-ink">{dept}</span></> : null}
        </p>
        <form action="/app/compliances" method="GET" role="search" className="relative w-full sm:max-w-sm">
          {dept && <input type="hidden" name="dept" value={dept} />}
          <label htmlFor="compliance-search" className="sr-only">Search compliance references</label>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            id="compliance-search"
            name="q"
            type="search"
            defaultValue={query}
            placeholder="Search name, form, frequency…"
            className="h-10 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-muted focus:border-brand-600 focus:outline-none"
          />
        </form>
      </div>
      {filteredRows.length === 0 ? (
        <EmptyState title={query ? "No matching references" : "No compliance references"} kind="search">
          {query ? "Try a different search term or clear your search." : "There are no compliance references in this department yet."}
        </EmptyState>
      ) : (
        <ul className="space-y-2.5">
          {filteredRows.map((item) => (
            <li key={item.id}>
              <details className="group overflow-hidden rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgb(15_29_51/.04)] transition-[border-color,box-shadow] duration-200 open:border-ink/20 open:shadow-[0_8px_24px_-18px_rgb(15_29_51/.35)]">
                <summary className="grid cursor-pointer list-none items-center gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] [&::-webkit-details-marker]:hidden">
                  <span className="flex min-w-0 items-center gap-3">
                    <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
                      <FileText className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-medium text-ink">{item.name}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted">{item.applicableTo || "Applicability not specified"}</span>
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2 pl-12 sm:pl-0">
                    <Badge tone="brand">{item.frequency || "Frequency not specified"}</Badge>
                    <span className="flex items-center gap-1 text-xs text-muted">
                      <CalendarDays aria-hidden className="size-3.5" />
                      {item.dueDateRule || "Due date not specified"}
                    </span>
                    <ChevronDown aria-hidden className="ml-auto size-4 text-muted transition-transform duration-200 group-open:rotate-180 sm:ml-1" />
                  </span>
                </summary>
                <dl className="grid gap-x-6 gap-y-4 border-t border-line bg-paper/50 px-4 py-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <dt className="text-xs font-medium text-muted">Form</dt>
                    <dd className="mt-1 break-words text-ink">{item.form || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-muted">Applicable to</dt>
                    <dd className="mt-1 break-words text-ink">{item.applicableTo || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-muted">Frequency</dt>
                    <dd className="mt-1 break-words text-ink">{item.frequency || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-muted">Due date</dt>
                    <dd className="mt-1 break-words text-ink">{item.dueDateRule || "—"}</dd>
                  </div>
                  <div className="sm:col-span-2 lg:col-span-2">
                    <dt className="text-xs font-medium text-muted">Late fee / penalty</dt>
                    <dd className="mt-1 break-words text-ink">{item.penalty || "—"}</dd>
                  </div>
                  {item.remarks && (
                    <div className="sm:col-span-2 lg:col-span-3">
                      <dt className="text-xs font-medium text-muted">Additional information</dt>
                      <dd className="mt-1 whitespace-pre-line break-words text-ink">{item.remarks}</dd>
                    </div>
                  )}
                </dl>
              </details>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

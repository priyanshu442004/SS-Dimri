import type { Metadata } from "next";
import Link from "next/link";
import { Package } from "lucide-react";
import { can } from "@/lib/permissions";
import { requireCapability } from "@/lib/session";
import { formatDate, isoDateInTz, toIsoDate } from "@/lib/dates";
import { ASSET_CATEGORIES, ASSET_CONDITIONS, ASSET_STATUSES, assetRegister, assetsOf, parseAssetFilters } from "@/lib/services/assets";
import { employeeOptions } from "@/lib/services/lookups";
import { ActionButton } from "@/components/action-button";
import { Badge, Card, DownloadButton, EmptyState, PageHeader, Stat, TabNav, Table, Td, Th } from "@/components/ui";
import { allocateAssetAction, deleteAssetAction, issueAssetAction, returnAssetAction, saveAssetAction } from "./actions";
import { AllocateForm, AssetForm, IssueForm, ReturnForm } from "./forms";

export const metadata: Metadata = { title: "Assets" };
const selectCls = "h-10 rounded-md border border-line bg-surface px-2 text-sm";
const inr = (n: unknown) => (n === null || n === undefined ? "—" : `₹${Number(n).toLocaleString("en-IN")}`);
const CONDITIONS = Object.entries(ASSET_CONDITIONS).map(([value, label]) => ({ value, label }));
const STATUS_TONE = { IN_STOCK: "ok", ISSUED: "info", UNDER_REPAIR: "warn", DISPOSED: "neutral" } as const;
const person = (e: { firstName: string; lastName: string | null }) => `${e.firstName} ${e.lastName ?? ""}`.trim();

// Fixed Assets Register and asset allocation (tracker S.No. 89, 90).
export default async function AssetsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireCapability("app.use");
  const sp = await searchParams;
  const manage = can(ctx, "assets.manage");
  const tab = manage ? (sp.tab === "mine" ? "mine" : sp.tab === "allocation" ? "allocation" : "register") : "mine";
  const today = isoDateInTz(new Date(), ctx.organization.timezone);

  return (
    <>
      <PageHeader icon={<Package />} title={manage ? "Fixed assets" : "My assets"}
        description={manage ? "The firm's office assets — laptops, desktops, printers, mobiles, furniture — who has each one, and its history of issue and return." : "Office assets issued to you. Return them when you leave or when asked."}
        actions={manage && tab === "register" && <DownloadButton href="/app/assets/export">Export to Excel</DownloadButton>} />
      {manage && <TabNav current={tab} tabs={[
        { key: "register", label: "Assets register", href: "/app/assets" },
        { key: "allocation", label: "Asset allocation (who has what)", href: "/app/assets?tab=allocation" },
        { key: "mine", label: "My assets", href: "/app/assets?tab=mine" },
      ]} />}
      {tab === "register" ? <Register /> : tab === "allocation" ? <Allocation /> : <Mine />}
    </>
  );

  async function Mine() {
    if (!ctx.employee) return <EmptyState kind="people" title="No staff record">Your login is not linked to an employee.</EmptyState>;
    const rows = await assetsOf(ctx.employee.id);
    const holding = rows.filter((r) => !r.returnedOn);
    return rows.length === 0 ? <EmptyState kind="documents" title="No assets issued to you" /> : (
      <Card title={`Assets with me (${holding.length})`} padded={false}>
        <Table minWidth={640}>
          <thead><tr><Th>Asset</Th><Th>Serial no.</Th><Th>Issued</Th><Th>Returned</Th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id}><Td><span className="font-medium">{r.asset.description}</span><div className="font-mono text-xs text-muted">{r.asset.code}{r.asset.category ? ` · ${r.asset.category}` : ""}</div></Td><Td className="text-xs">{r.asset.serialNo ?? "—"}</Td><Td className="whitespace-nowrap text-xs">{formatDate(r.issuedOn)}{r.issueCondition && ` · ${ASSET_CONDITIONS[r.issueCondition as keyof typeof ASSET_CONDITIONS] ?? r.issueCondition}`}</Td><Td className="whitespace-nowrap text-xs">{r.returnedOn ? formatDate(r.returnedOn) : <Badge tone="info">With me</Badge>}</Td></tr>)}</tbody>
        </Table>
      </Card>
    );
  }

  /** Who holds which asset, person by person, with the issue form alongside (tracker S.No. 112). */
  async function Allocation() {
    const [rows, employees] = await Promise.all([assetRegister(ctx.organization.id, parseAssetFilters({})), employeeOptions(ctx.organization.id)]);
    const issued = rows.flatMap((a) => a.issues.filter((i) => !i.returnedOn).map((i) => ({ asset: a, issue: i })));
    const byPerson = new Map<string, { name: string; items: typeof issued }>();
    for (const x of issued) {
      const k = x.issue.employee.id;
      byPerson.set(k, { name: person(x.issue.employee), items: [...(byPerson.get(k)?.items ?? []), x] });
    }
    const inStock = rows.filter((a) => a.status === "IN_STOCK");
    const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
    const people = [...byPerson.entries()].filter(([, v]) => !q || v.name.toLowerCase().includes(q)).sort((x, y) => x[1].name.localeCompare(y[1].name));
    return (
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Stat label="Assets issued" value={issued.length} tone="info" />
            <Stat label="People holding assets" value={byPerson.size} />
            <Stat label="In stock (can be issued)" value={inStock.length} tone="ok" />
          </div>
          <form className="flex flex-wrap gap-2" role="search">
            <input type="hidden" name="tab" value="allocation" />
            <input name="q" defaultValue={q} placeholder="Search a person" className={`${selectCls} w-64`} aria-label="Search a person" />
            <button className="h-10 rounded-md border border-line bg-surface px-4 text-sm hover:bg-subtle">Search</button>
          </form>
          {people.length === 0 ? (
            <EmptyState kind="documents" title={issued.length ? "Nobody matches" : "No asset is issued to anyone yet"}>{issued.length ? "Try another name." : "Issue an asset with the form on the right, or open an asset in the register and use Issue."}</EmptyState>
          ) : people.map(([id, v]) => (
            <Card key={id} title={`${v.name} (${v.items.length})`} padded={false}>
              <Table minWidth={620}>
                <thead><tr><Th>Asset</Th><Th>Serial no.</Th><Th>Issued</Th><Th /></tr></thead>
                <tbody>
                  {v.items.map(({ asset, issue }) => (
                    <tr key={issue.id}>
                      <Td><span className="font-medium">{asset.description}</span><div className="font-mono text-xs text-muted">{asset.code}{asset.category ? ` · ${asset.category}` : ""}</div></Td>
                      <Td className="text-xs">{asset.serialNo ?? "—"}</Td>
                      <Td className="whitespace-nowrap text-xs">{formatDate(issue.issuedOn)}{issue.issueCondition ? ` · ${ASSET_CONDITIONS[issue.issueCondition as keyof typeof ASSET_CONDITIONS] ?? issue.issueCondition}` : ""}{issue.notes && <div className="text-muted">{issue.notes}</div>}</Td>
                      <Td><Link href={`/app/assets?asset=${asset.id}#asset`} className="text-sm font-medium text-brand-700 hover:underline">Take back</Link></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          ))}
        </div>
        <Card title="Issue an asset">
          {inStock.length === 0 ? <p className="text-sm text-muted">No asset is in stock. Add assets in the register first.</p> : (
            <AllocateForm action={allocateAssetAction} assets={inStock.map((a) => ({ value: a.id, label: `${a.code} · ${a.description}` }))} employees={employees} conditions={CONDITIONS} today={today} />
          )}
        </Card>
      </div>
    );
  }

  async function Register() {
    const f = parseAssetFilters(sp);
    const [rows, employees] = await Promise.all([assetRegister(ctx.organization.id, f), employeeOptions(ctx.organization.id)]);
    const open = typeof sp.asset === "string" ? rows.find((r) => r.id === sp.asset) : undefined;
    const count = (s: string) => rows.filter((r) => r.status === s).length;
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Assets" value={rows.length} hint={inr(rows.reduce((t, r) => t + Number(r.cost ?? 0), 0)) + " cost"} />
          <Stat label="Issued" value={count("ISSUED")} tone="info" />
          <Stat label="In stock" value={count("IN_STOCK")} tone="ok" />
          <Stat label="Under repair / disposed" value={`${count("UNDER_REPAIR")} / ${count("DISPOSED")}`} />
        </div>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="space-y-3">
            <form className="flex flex-wrap items-end gap-2" role="search">
              <input name="q" defaultValue={f.q} placeholder="Code, description, serial, person" className={`${selectCls} w-64`} aria-label="Search assets" />
              <select name="category" defaultValue={f.category} className={selectCls} aria-label="Category"><option value="">All categories</option>{ASSET_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
              <select name="status" defaultValue={f.status} className={selectCls} aria-label="Status"><option value="">Any status</option>{Object.entries(ASSET_STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <button className="h-10 rounded-md border border-line bg-surface px-4 text-sm hover:bg-subtle">Apply</button>
            </form>
            {rows.length === 0 ? <EmptyState kind="documents" title="No assets yet">Add the firm&apos;s laptops, desktops, printers, mobiles and furniture on the right.</EmptyState> : (
              <Table minWidth={860}>
                <thead><tr><Th>Code</Th><Th>Asset</Th><Th>Purchase</Th><Th>Location / condition</Th><Th>Status · with</Th><Th /></tr></thead>
                <tbody>
                  {rows.map((a) => {
                    const holder = a.issues.find((i) => !i.returnedOn);
                    return (
                      <tr key={a.id} className={a.id === open?.id ? "bg-paper" : undefined}>
                        <Td className="font-mono text-xs">{a.code}</Td>
                        <Td><span className="font-medium">{a.description}</span><div className="text-xs text-muted">{[a.category, a.serialNo && `S/N ${a.serialNo}`].filter(Boolean).join(" · ")}</div></Td>
                        <Td className="whitespace-nowrap text-xs">{a.purchaseDate ? formatDate(a.purchaseDate) : "—"}<div>{inr(a.cost)}{a.vendor ? ` · ${a.vendor}` : ""}</div></Td>
                        <Td className="text-xs">{a.location ?? "—"}<div className="text-muted">{a.condition ? ASSET_CONDITIONS[a.condition as keyof typeof ASSET_CONDITIONS] : ""}</div></Td>
                        <Td className="text-xs"><Badge tone={STATUS_TONE[a.status as keyof typeof STATUS_TONE] ?? "neutral"}>{ASSET_STATUSES[a.status as keyof typeof ASSET_STATUSES] ?? a.status}</Badge>{holder && <div className="mt-1">{person(holder.employee)} · since {formatDate(holder.issuedOn)}</div>}</Td>
                        <Td><Link href={`/app/assets?asset=${a.id}#asset`} className="whitespace-nowrap text-sm font-medium text-brand-700 hover:underline">{a.status === "IN_STOCK" ? "Issue to someone" : a.status === "ISSUED" ? "Take back" : "Open"}</Link></Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </div>
          <div className="space-y-6">
            {open ? (
              <section id="asset" className="scroll-mt-24 space-y-4">
                <Card title={`${open.code} · ${open.description}`} actions={<Link href="/app/assets" className="text-xs text-muted hover:text-ink">Close</Link>}>
                  {open.status === "ISSUED" ? (
                    <><p className="mb-2 text-sm">With <strong>{person(open.issues.find((i) => !i.returnedOn)!.employee)}</strong> since {formatDate(open.issues.find((i) => !i.returnedOn)!.issuedOn)}.</p><ReturnForm action={returnAssetAction.bind(null, open.id)} conditions={CONDITIONS} today={today} /></>
                  ) : open.status !== "DISPOSED" ? (
                    <IssueForm action={issueAssetAction.bind(null, open.id)} employees={employees} conditions={CONDITIONS} today={today} />
                  ) : <p className="text-sm text-muted">Disposed: it cannot be issued.</p>}
                  <h3 className="mb-1 mt-4 text-sm font-semibold">History</h3>
                  {open.issues.length === 0 ? <p className="text-sm text-muted">Never issued.</p> : (
                    <ul className="divide-y divide-line text-sm">{open.issues.map((i) => <li key={i.id} className="py-1.5">{person(i.employee)} · out {formatDate(i.issuedOn)}{i.issueCondition ? ` (${ASSET_CONDITIONS[i.issueCondition as keyof typeof ASSET_CONDITIONS] ?? i.issueCondition})` : ""} · {i.returnedOn ? `in ${formatDate(i.returnedOn)}${i.returnCondition ? ` (${ASSET_CONDITIONS[i.returnCondition as keyof typeof ASSET_CONDITIONS] ?? i.returnCondition})` : ""}` : "still with them"}{i.notes && <span className="block text-xs text-muted">{i.notes}</span>}</li>)}</ul>
                  )}
                </Card>
                <Card title="Edit asset">
                  <AssetForm key={open.id} edit action={saveAssetAction.bind(null, open.id)} categories={ASSET_CATEGORIES} conditions={CONDITIONS} d={{ code: open.code, description: open.description, category: open.category ?? "", serialNo: open.serialNo ?? "", purchaseDate: open.purchaseDate ? toIsoDate(open.purchaseDate) : "", vendor: open.vendor ?? "", cost: open.cost ? String(Number(open.cost)) : "", location: open.location ?? "", condition: open.condition ?? "", status: open.status, notes: open.notes ?? "" }} />
                  {open.issues.length === 0 && <div className="mt-3"><ActionButton variant="ghost" action={deleteAssetAction.bind(null, open.id)} confirm="Remove this asset from the register?">Remove asset</ActionButton></div>}
                </Card>
              </section>
            ) : (
              <Card title="Add an asset"><AssetForm action={saveAssetAction.bind(null, null)} categories={ASSET_CATEGORIES} conditions={CONDITIONS} /></Card>
            )}
          </div>
        </div>
      </div>
    );
  }
}

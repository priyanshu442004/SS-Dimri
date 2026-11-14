"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { CircleAlert, CircleCheck, Copy, FileSpreadsheet, TriangleAlert, Upload, Users } from "lucide-react";
import { Badge, buttonClass, Card, Notice, Stat, Table, Td, Th } from "@/components/ui";
import { inputCls } from "@/components/form";
import { toast } from "@/components/toaster";
import { ALLOCATION_FIELDS, ALLOCATION_ROLES, EXTRA_COLUMN, type AllocationField, type AllocationMapping } from "@/lib/domain/allocation-import";
import { describeSchedule } from "@/lib/domain/allocation-schedule";
import { TABLE_FILE_ACCEPT } from "@/lib/table-file-accept";
import type { AllocationImportPreview } from "@/lib/services/allocation-import";
import { previewAllocationImportAction, runAllocationImportAction, type AllocationImportResult } from "./actions";

const FIELDS = Object.entries(ALLOCATION_FIELDS) as [AllocationField, { label: string }][];
type Preview = AllocationImportPreview & { missing: string[] };

const hoursText = (f: number | null, s: number | null) =>
  f === null && s === null ? "Full day" : !f && !s ? "No fixed hours" : [f ? `1st half ${f} h` : "", s ? `2nd half ${s} h` : ""].filter(Boolean).join(" · ");
const dmy = (iso?: string | null) => (iso ? iso.split("-").reverse().join("-") : "");

/** Upload → check columns and rows → import. Nothing is saved before the last step. */
export function AllocationImportFlow() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<AllocationMapping | null>(null);
  const [includeClashes, setIncludeClashes] = useState(false);
  const [result, setResult] = useState<AllocationImportResult | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const formData = (f: File, m: AllocationMapping | null) => {
    const fd = new FormData();
    fd.set("file", f);
    if (m) fd.set("mapping", JSON.stringify(m));
    if (includeClashes) fd.set("includeClashes", "on");
    return fd;
  };

  function check(f: File, m: AllocationMapping | null) {
    start(async () => {
      const r = await previewAllocationImportAction(formData(f, m));
      if (!r.ok) {
        toast(r.message, "error");
        setPreview(null);
        return;
      }
      setPreview(r.preview);
      setMapping(r.preview.mapping);
    });
  }

  function choose(f: File | undefined) {
    if (!f) return;
    setFile(f);
    setResult(null);
    check(f, null);
  }

  function remap(i: number, value: AllocationField | typeof EXTRA_COLUMN | "") {
    if (!file || !mapping) return;
    const next = mapping.map((v, j) => (j === i ? value : v === value && value !== EXTRA_COLUMN ? "" : v));
    setMapping(next);
    check(file, next);
  }

  function run() {
    if (!file || !mapping) return;
    start(async () => {
      const r = await runAllocationImportAction(formData(file, mapping));
      toast(r.message, r.ok ? "success" : "error");
      if (r.ok) {
        setResult(r);
        setPreview(null);
        setFile(null);
        if (input.current) input.current.value = "";
      }
    });
  }

  const toImport = preview ? preview.ready + (includeClashes ? preview.clashes : 0) : 0;

  return (
    <div className="space-y-6">
      <Card title="1. Choose your Excel or CSV file" icon={<FileSpreadsheet />}>
        <ul className="mb-3 list-disc space-y-1 pl-5 text-sm text-muted">
          <li>One row = one team member on one client. Someone on 3 clients has 3 rows.</li>
          <li>Client, Team member and From are required. Names are matched to the Client Master and the team list (full name, first name, employee code or PAN all work).</li>
          <li>The &ldquo;Allocation&rdquo; sheet of the firm&apos;s workbook is read; headings can be in any order. Blank cells stay blank.</li>
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <label className={buttonClass("primary", "md", "cursor-pointer")}>
            <Upload className="size-4" aria-hidden /> {file ? "Choose another file" : "Choose Excel or CSV file"}
            <input ref={input} type="file" accept={TABLE_FILE_ACCEPT} className="sr-only" onChange={(e) => choose(e.target.files?.[0])} />
          </label>
          <a href="/app/allocations/import/template" download className={buttonClass("secondary", "md")}>Download template</a>
          {file && <span className="text-sm text-muted">{file.name}</span>}
          {pending && <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-muted border-t-transparent" />}
        </div>
      </Card>

      {result && (
        <Notice tone={result.failures?.length ? "warn" : "ok"}>
          {result.message} <Link href="/app/allocations" className="font-medium underline">See the team allocation</Link>
          {!!result.failures?.length && <ul className="mt-1 list-disc pl-4">{result.failures.slice(0, 20).map((f) => <li key={f.row}>{f.message}</li>)}</ul>}
        </Notice>
      )}

      {preview && mapping && (
        <>
          <Card title="2. Check the columns" padded={false}>
            {preview.missing.length > 0 && <div className="p-4 pb-0"><Notice tone="danger">Tell us which column holds: {preview.missing.join(", ")}.</Notice></div>}
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
              {preview.header.map((h, i) => (
                <label key={`${h}-${i}`} className="min-w-0 text-sm">
                  <span className="mb-1 block truncate font-medium" title={h}>{h || `Column ${i + 1}`}</span>
                  <select value={mapping[i] ?? ""} onChange={(e) => remap(i, e.target.value as AllocationField | typeof EXTRA_COLUMN | "")} className={clsx(inputCls, (!mapping[i] || mapping[i] === EXTRA_COLUMN) && "text-muted")}>
                    <option value="">Do not import</option>
                    <option value={EXTRA_COLUMN}>Keep as an extra detail</option>
                    {FIELDS.map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="Ready to import" value={preview.ready} icon={<CircleCheck />} tone="ok" hint={`from ${preview.totalRows} rows`} />
            <Stat label="Already allocated" value={preview.duplicates} icon={<Copy />} tone={preview.duplicates ? "info" : "neutral"} hint="Skipped, never doubled" />
            <Stat label="Clash with other work" value={preview.clashes} icon={<Users />} tone={preview.clashes ? "warn" : "neutral"} hint="Same day and half is full" />
            <Stat label="With errors" value={preview.failed} icon={<CircleAlert />} tone={preview.failed ? "danger" : "neutral"} hint="Skipped" />
            <Stat label="With notes" value={preview.warnings} icon={<TriangleAlert />} tone={preview.warnings ? "warn" : "neutral"} hint="Imported; read the note" />
          </div>

          <Card title="3. Check the rows" padded={false}>
            <Table minWidth={980}>
              <thead><tr><Th>Row</Th><Th>Client</Th><Th>Team member</Th><Th>Period</Th><Th>Days</Th><Th>Hours</Th><Th>Result</Th></tr></thead>
              <tbody>
                {preview.rows.map((r) => {
                  const v = r.values;
                  return (
                    <tr key={r.row} className="align-top">
                      <Td className="text-xs text-muted">{r.row}</Td>
                      <Td className="font-medium">{r.clientLabel ?? v.client ?? "—"}{v.resourceType && <div className="text-xs font-normal text-muted">{v.resourceType}</div>}</Td>
                      <Td>{r.employeeLabel ?? v.employee ?? "—"}{v.role && <div className="text-xs text-muted">{ALLOCATION_ROLES[v.role]}</div>}</Td>
                      <Td className="text-xs">{v.from ? `${dmy(v.from)} – ${v.to ? dmy(v.to) : "ongoing"}` : "—"}{r.status === "ENDED" && <div className="text-muted">Ended (history)</div>}{r.status === "PLANNED" && <div className="text-muted">Starts later</div>}</Td>
                      <Td className="text-xs">{describeSchedule(v)}</Td>
                      <Td className="text-xs">{hoursText(v.firstHalfHours, v.secondHalfHours)}{v.allowOverlap && <div className="text-muted">Overlap allowed</div>}</Td>
                      <Td className="max-w-sm text-xs">
                        {r.outcome === "error" ? <Badge tone="danger">Not imported</Badge>
                          : r.outcome === "duplicate" ? <Badge tone="info">Already allocated</Badge>
                          : r.outcome === "clash" ? <Badge tone="warn">Clash</Badge>
                          : <Badge tone="ok">Will be imported</Badge>}
                        {r.errors.map((e) => <p key={e} className="mt-1 text-danger">{e}</p>)}
                        {r.note && <p className="mt-1 text-muted">{r.note}</p>}
                        {r.warnings.map((w) => <p key={w} className="mt-1 text-warn">{w}</p>)}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            {preview.totalRows > preview.rows.length && <p className="border-t border-line px-3 py-2 text-xs text-muted">Showing {preview.rows.length} of {preview.totalRows} rows, problems first.</p>}
          </Card>

          <Card title="4. Import">
            {preview.clashes > 0 && (
              <label className="mb-3 flex items-start gap-2 text-sm">
                <input type="checkbox" checked={includeClashes} onChange={(e) => setIncludeClashes(e.target.checked)} className="mt-0.5 size-4 accent-ink" />
                <span>Also import the {preview.clashes} clashing {preview.clashes === 1 ? "row" : "rows"}, marked &ldquo;allow overlap&rdquo; (the person is booked on more than one client at the same time).</span>
              </label>
            )}
            <p className="mb-3 text-sm text-muted">Each team member gets one notice listing their new clients. Rows already allocated are never doubled, so importing the same file again is safe.</p>
            <button type="button" onClick={run} disabled={pending || preview.missing.length > 0 || toImport === 0} className={buttonClass("primary", "md")}>
              {pending ? "Working…" : `Import ${toImport} ${toImport === 1 ? "allocation" : "allocations"}`}
            </button>
          </Card>
        </>
      )}
    </div>
  );
}

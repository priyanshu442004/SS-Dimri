"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { CircleAlert, CircleCheck, Copy, FileSpreadsheet, Merge, TriangleAlert, Upload } from "lucide-react";
import { Badge, buttonClass, Card, Notice, Stat, Table, Td, Th } from "@/components/ui";
import { inputCls } from "@/components/form";
import { toast } from "@/components/toaster";
import { IMPORT_FIELDS, type ColumnMapping, type ImportField } from "@/lib/domain/client-import";
import type { ImportPreview } from "@/lib/services/client-import";
import { previewImportAction, runImportAction, type ImportResult } from "./actions";

const FIELDS = Object.entries(IMPORT_FIELDS) as [ImportField, { label: string }][];

/** Upload → check the preview and the column matching → import. Nothing is saved before the last step. */
export function ImportFlow({ canApprove }: { canApprove: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [activate, setActivate] = useState(true);
  const [fillMissing, setFillMissing] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const formData = (f: File, m: ColumnMapping | null) => {
    const fd = new FormData();
    fd.set("file", f);
    if (m) fd.set("mapping", JSON.stringify(m));
    if (activate) fd.set("activate", "on");
    if (fillMissing) fd.set("fillMissing", "on");
    return fd;
  };

  function check(f: File, m: ColumnMapping | null) {
    start(async () => {
      const r = await previewImportAction(formData(f, m));
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

  function remap(i: number, value: ImportField | "") {
    if (!file || !mapping) return;
    // One sheet column per field: choosing a field elsewhere frees it from its old column.
    const next = mapping.map((v, j) => (j === i ? value : v === value ? "" : v));
    setMapping(next);
    check(file, next);
  }

  function run() {
    if (!file || !mapping) return;
    start(async () => {
      const r = await runImportAction(formData(file, mapping));
      toast(r.message, r.ok ? "success" : "error");
      if (r.ok) {
        setResult(r);
        setPreview(null);
        setFile(null);
        if (input.current) input.current.value = "";
      }
    });
  }

  const hasName = !!mapping?.includes("tradeName");

  return (
    <div className="space-y-6">
      <Card title="1. Choose your Excel file" icon={<FileSpreadsheet />}>
        <p className="mb-3 text-sm text-muted">
          Use the firm&apos;s Client Master (one row per GSTIN), or start from our template. Columns are recognised by their heading, in any order, and the title rows above the headings are fine. Rows with the same PAN become one client with all its GSTINs. Passwords are stored encrypted.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className={buttonClass("primary", "md", "cursor-pointer")}>
            <Upload className="size-4" aria-hidden /> {file ? "Choose another file" : "Choose .xlsx file"}
            <input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(e) => choose(e.target.files?.[0])} />
          </label>
          <a href="/app/clients/import/template" download className={buttonClass("secondary", "md")}>Download template</a> {/* eslint-disable-line @next/next/no-html-link-for-pages -- a file download, not a page */}
          {file && <span className="text-sm text-muted">{file.name}</span>}
          {pending && <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-muted border-t-transparent" />}
        </div>
      </Card>

      {result && (
        <Notice tone={result.failures?.length ? "warn" : "ok"}>
          {result.message}{" "}
          <Link href="/app/clients" className="font-medium underline">See the clients</Link>
          {!!result.failures?.length && (
            <ul className="mt-1 list-disc pl-4">{result.failures.slice(0, 20).map((f) => <li key={f.row}>{f.message}</li>)}</ul>
          )}
        </Notice>
      )}

      {preview && mapping && (
        <>
          <Card title="2. Check the columns" padded={false}>
            {!hasName && <div className="p-4 pb-0"><Notice tone="danger">Tell us which column holds the client name to continue.</Notice></div>}
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {preview.header.map((h, i) => (
                <label key={`${h}-${i}`} className="min-w-0 text-sm">
                  <span className="mb-1 block truncate font-medium" title={h}>{h || `Column ${i + 1}`}</span>
                  <select
                    value={mapping[i] ?? ""}
                    onChange={(e) => remap(i, e.target.value as ImportField | "")}
                    className={clsx(inputCls, !mapping[i] && "text-muted")}
                  >
                    <option value="">Do not import</option>
                    {FIELDS.map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="New clients" value={preview.ready} icon={<CircleCheck />} tone="ok" hint={`from ${preview.totalRows} rows`} />
            <Stat label="Same PAN, merged" value={preview.merged} icon={<Merge />} tone={preview.merged ? "info" : "neutral"} hint="Added to that client as GSTINs" />
            <Stat label="Already registered" value={preview.duplicates} icon={<Copy />} tone={preview.duplicates ? "info" : "neutral"} hint={fillMissing ? "Only missing details filled in" : "Skipped, never overwritten"} />
            <Stat label="With errors" value={preview.failed} icon={<CircleAlert />} tone={preview.failed ? "danger" : "neutral"} hint="Skipped" />
            <Stat label="With warnings" value={preview.warnings} icon={<TriangleAlert />} tone={preview.warnings ? "warn" : "neutral"} hint="Imported without the bad value" />
          </div>

          <Card title="3. Check the rows" padded={false}>
            <Table minWidth={760}>
              <thead><tr><Th>Row</Th><Th>Client</Th><Th>GSTIN / PAN</Th><Th>Departments</Th><Th>Contact</Th><Th>Result</Th></tr></thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.row}>
                    <Td className="text-xs text-muted">{r.row}</Td>
                    <Td className="font-medium">{r.values.tradeName ?? "—"}{r.values.clientCode && <div className="font-mono text-xs font-normal text-muted">{r.values.clientCode}</div>}</Td>
                    <Td className="text-xs">{[...r.values.gstins, r.values.pan].filter(Boolean).join(", ") || "—"}</Td>
                    <Td className="text-xs">{r.values.departmentList?.join(", ") || "—"}</Td>
                    <Td className="text-xs">{[r.values.contactName, r.values.contactMobile].filter(Boolean).join(" · ") || "—"}</Td>
                    <Td className="text-xs">
                      {r.errors.length > 0 ? <Badge tone="danger">{r.errors[0]}</Badge>
                        : r.mergedInto ? <Badge tone="info">Same PAN as row {r.mergedInto}: added there</Badge>
                        : r.duplicateOf ? <Badge tone="info">Already registered: {r.duplicateOf}</Badge>
                        : <Badge tone="ok">Will be imported</Badge>}
                      {r.warnings.map((w) => <p key={w} className="mt-1 text-warn">{w}</p>)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {preview.totalRows > preview.rows.length && <p className="border-t border-line px-3 py-2 text-xs text-muted">Showing {preview.rows.length} of {preview.totalRows} rows, problems first.</p>}
          </Card>

          <Card title="4. Import">
            {canApprove ? (
              <label className="mb-3 flex items-start gap-2 text-sm">
                <input type="checkbox" checked={activate} onChange={(e) => setActivate(e.target.checked)} className="mt-0.5 size-4 accent-ink" />
                <span>Mark them as approved and use the Status column (otherwise they wait in the approval queue)</span>
              </label>
            ) : (
              <p className="mb-3 text-sm text-muted">Imported clients go to the approval queue for an administrator.</p>
            )}
            {preview.duplicates > 0 && (
              <label className="mb-3 flex items-start gap-2 text-sm">
                <input type="checkbox" checked={fillMissing} onChange={(e) => setFillMissing(e.target.checked)} className="mt-0.5 size-4 accent-ink" />
                <span>For the {preview.duplicates} already registered, fill in only what they are missing (new GSTINs, departments, empty fields). Saved values are never changed.</span>
              </label>
            )}
            <button type="button" onClick={run} disabled={pending || !hasName || (preview.ready === 0 && !(fillMissing && preview.duplicates))} className={buttonClass("primary", "md")}>
              {pending ? "Working… this can take a minute for a long sheet" : `Import ${preview.ready} ${preview.ready === 1 ? "client" : "clients"}${fillMissing && preview.duplicates ? ` and update ${preview.duplicates}` : ""}`}
            </button>
          </Card>
        </>
      )}
    </div>
  );
}

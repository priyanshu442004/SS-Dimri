"use client";

import { useState, type MouseEvent } from "react";
import { CheckCircle2, ExternalLink, ShieldCheck, XCircle } from "lucide-react";
import { checkIdentifier, PORTAL_URL, type IdCheck, type IdKind } from "@/lib/domain/identifier-check";

/**
 * "Validate" button for a PAN, TAN or GSTIN field of the same form (by field name). A GSTIN box with
 * several lines checks each line, and each GSTIN against the form's PAN. Name and status are on
 * the government portal: the link opens it.
 */
export function IdValidate({ kind, field, panField = "pan", value, pan: panValue }: { kind: IdKind; field?: string; panField?: string; value?: string; pan?: string | null }) {
  const [results, setResults] = useState<IdCheck[] | null>(null);

  function run(e: MouseEvent<HTMLButtonElement>) {
    const form = e.currentTarget.closest("form");
    const read = (name: string) => {
      const el = form?.elements.namedItem(name);
      return el && "value" in el ? String((el as unknown as { value: string }).value) : "";
    };
    const raw = value ?? (field ? read(field) : "");
    const pan = kind === "GSTIN" ? (panValue ?? read(panField)) : null;
    const items = kind === "GSTIN" ? raw.split(/[\s,]+/).filter(Boolean) : [raw];
    setResults((items.length ? items : [""]).map((v) => checkIdentifier(kind, v, pan)));
  }

  return (
    <div className="mt-1.5">
      <span className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={run} className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-0.5 text-xs font-medium hover:bg-subtle">
          <ShieldCheck className="size-3.5" aria-hidden /> Validate {kind}
        </button>
        {results?.some((r) => r.ok) && (
          <a href={PORTAL_URL[kind]} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-700 hover:underline">
            Check name & status on the {kind === "GSTIN" ? "GST" : "Income Tax"} portal <ExternalLink className="size-3" aria-hidden />
          </a>
        )}
      </span>
      {results && (
        <ul className="mt-1.5 space-y-1" aria-live="polite">
          {results.map((r, i) => (
            <li key={i} className={`rounded-md px-2 py-1 text-xs ${r.ok ? "bg-ok-bg text-ok" : "bg-danger-bg text-danger"}`}>
              <span className="flex items-start gap-1.5">
                {r.ok ? <CheckCircle2 className="mt-px size-3.5 shrink-0" aria-hidden /> : <XCircle className="mt-px size-3.5 shrink-0" aria-hidden />}
                <span>
                  {results.length > 1 && r.value && <strong className="font-mono">{r.value}: </strong>}
                  {r.message}
                  {r.details.length > 0 && <span className="block text-muted">{r.details.join(" · ")}</span>}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import { inputCls } from "@/components/form";

export type PlaceClient = { name: string; opens: string | null; mine: boolean };

/**
 * The client for "Client office" / "Client visit" at mark-in (tracker S.No. 77, 78). A searchable list of
 * the firm's active clients — the person's allocated clients first — instead of a browser suggestion
 * list (empty for anyone not allocated that day, and hard to use on phones). Free text is still allowed
 * (a client not yet registered). When the client has an office opening time, it is shown: late-coming
 * is checked against it.
 */
export function ClientPlacePicker({ clients, defaultValue, label, firmStart, name = "workPlace", required, onPick, scheduleHint }: {
  clients: PlaceClient[]; defaultValue?: string | null; label: string; firmStart: string;
  /** Form field name (Team timings posts it as "siteName"). */
  name?: string; required?: boolean;
  /** Called when a client is picked from the list. */
  onPick?: (c: PlaceClient) => void;
  /** Team timings: the note speaks of the reporting time, not of today's late-coming. */
  scheduleHint?: boolean;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const id = useId();
  const shown = useMemo(() => {
    const q = value.trim().toLowerCase();
    const list = q ? clients.filter((c) => c.name.toLowerCase().includes(q)) : clients;
    return list.slice(0, 60);
  }, [clients, value]);
  const picked = clients.find((c) => c.name.toLowerCase() === value.trim().toLowerCase());
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const choose = (picked: string) => {
    setValue(picked); setOpen(false);
    const c = clients.find((x) => x.name === picked);
    if (c) onPick?.(c);
  };
  return (
    <div ref={box} className="relative">
      <label htmlFor={`${id}-in`} className="mb-1 block text-sm font-medium">{label}</label>
      <input
        id={`${id}-in`} name={name} required={required} value={value} autoComplete="off" role="combobox" aria-expanded={open} aria-controls={`${id}-list`}
        placeholder={clients.length ? "Search or pick the client" : "Type the client's name"}
        className={inputCls}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setValue(e.target.value); setOpen(true); setActive(0); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, shown.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter" && open && shown[active]) { e.preventDefault(); choose(shown[active].name); }
          else if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && shown.length > 0 && (
        <ul id={`${id}-list`} role="listbox" className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-line bg-surface py-1 text-sm shadow-lg">
          {shown.map((c, i) => (
            <li key={c.name} role="option" aria-selected={i === active}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(c.name)} onMouseEnter={() => setActive(i)}
                className={clsx("flex w-full items-center justify-between gap-2 px-3 py-2 text-left", i === active && "bg-subtle")}>
                <span className="min-w-0 truncate">{c.name}</span>
                <span className="shrink-0 text-xs text-muted">{c.mine ? "Allocated · " : ""}{c.opens ? `opens ${c.opens}` : ""}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-xs text-muted">
        {scheduleHint ? (picked?.opens ? <>{picked.name} opens at <strong className="text-ink">{picked.opens}</strong> — set as the reporting time; change it if needed.</>
          : picked ? null
          : value.trim() ? "Not a registered client: saved as typed. Pick from the list if the client is registered." : null)
          : picked?.opens ? <>Late-coming today is checked against <strong className="text-ink">{picked.name}</strong>&apos;s opening time, <strong className="text-ink">{picked.opens}</strong>.</>
          : picked ? <>No opening time is set for this client: late-coming is checked against the office time ({firmStart}).</>
          : value.trim() ? "Not a registered client name: the office time applies. Pick from the list if the client is registered." : null}
      </p>
    </div>
  );
}

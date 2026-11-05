"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { clsx } from "clsx";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { FieldShell, inputCls, useFieldError } from "@/components/form";

// Search-as-you-type pickers: type part of a name instead of hunting through a long
// list. They post ordinary form fields (hidden inputs), so server actions are unchanged.

export type PickerOption = { value: string; label: string; level?: string | null };

const LEVEL: Record<string, string> = { JUNIOR: "Junior", MID_LEVEL: "Mid-level", SENIOR: "Senior" };

const matches = (o: PickerOption, needle: string) => !needle || o.label.toLowerCase().includes(needle);

/** Calls `fn` when the surrounding form is reset, so a picker returns to its starting value. */
function useFormReset(ref: React.RefObject<HTMLElement | null>, fn: () => void) {
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    form.addEventListener("reset", fn);
    return () => form.removeEventListener("reset", fn);
  }, [ref, fn]);
}

function OptionList({ id, options, active, selected, onPick, onHover, empty }: {
  id: string;
  options: PickerOption[];
  active: number;
  selected: (v: string) => boolean;
  onPick: (o: PickerOption) => void;
  onHover: (i: number) => void;
  empty: string;
}) {
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    (list.current?.children[active] as HTMLElement | undefined)?.scrollIntoView?.({ block: "nearest" });
  }, [active]);
  return (
    <ul
      ref={list}
      id={id}
      role="listbox"
      className="app-rise absolute left-0 right-0 z-40 mt-1 max-h-60 overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-[0_18px_40px_-20px_rgb(15_29_51/.5)]"
    >
      {options.length === 0 && <li className="px-2.5 py-2 text-sm text-muted">{empty}</li>}
      {options.map((o, i) => (
        <li
          key={o.value || "none"}
          id={`${id}-${i}`}
          role="option"
          aria-selected={selected(o.value)}
          onMouseDown={(e) => { e.preventDefault(); onPick(o); }}
          onMouseEnter={() => onHover(i)}
          className={clsx("flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-sm", i === active ? "bg-subtle text-ink" : "text-ink")}
        >
          <Check className={clsx("size-3.5 shrink-0", selected(o.value) ? "text-brand-700" : "opacity-0")} aria-hidden />
          <span className="min-w-0 flex-1 truncate">{o.label}</span>
          {o.level && LEVEL[o.level] && <span className="shrink-0 text-xs text-muted">{LEVEL[o.level]}</span>}
        </li>
      ))}
    </ul>
  );
}

/** One person (or client) from a long list, chosen by typing. */
export function SearchSelect({
  label,
  name,
  options,
  defaultValue = "",
  value: controlled,
  onChange,
  placeholder = "Search by name…",
  emptyLabel,
  hint,
  required,
  className,
}: {
  label: string;
  name: string;
  options: PickerOption[];
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  /** Adds a first option that clears the field, e.g. "No client (internal)". */
  emptyLabel?: string;
  hint?: string;
  required?: boolean;
  className?: string;
}) {
  const error = useFieldError(name);
  const id = `${name}-${useId()}`;
  const [inner, setInner] = useState(defaultValue);
  const value = controlled ?? inner;
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useFormReset(box, useMemo(() => () => { setInner(defaultValue); setQuery(null); }, [defaultValue]));

  const selected = options.find((o) => o.value === value);
  const shown = useMemo(() => {
    const needle = (query ?? "").trim().toLowerCase();
    const list = options.filter((o) => matches(o, needle));
    return emptyLabel && !needle ? [{ value: "", label: emptyLabel }, ...list] : list;
  }, [options, query, emptyLabel]);

  const pick = (o: PickerOption) => {
    setInner(o.value);
    onChange?.(o.value);
    setQuery(null);
    setOpen(false);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, shown.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && open) { e.preventDefault(); if (shown[active]) pick(shown[active]); }
    else if (e.key === "Escape" && open) { e.stopPropagation(); setOpen(false); setQuery(null); }
  };

  return (
    <FieldShell {...{ label, id, hint, required, className, error }}>
      <div ref={box} className="relative">
        <input type="hidden" name={name} value={value} />
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted" aria-hidden />
        <input
          ref={input}
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={open && shown[active] ? `${id}-list-${active}` : undefined}
          aria-invalid={!!error}
          aria-required={required}
          autoComplete="off"
          value={query ?? selected?.label ?? ""}
          placeholder={emptyLabel ?? placeholder}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); if (!e.target.value && value) { setInner(""); onChange?.(""); } }}
          onFocus={(e) => { setOpen(true); e.target.select(); }}
          onBlur={() => { setOpen(false); setQuery(null); }}
          onKeyDown={onKey}
          className={clsx(inputCls, "pl-8 pr-8")}
        />
        <ChevronsUpDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" aria-hidden />
        {open && <OptionList id={`${id}-list`} options={shown} active={active} selected={(v) => v === value} onPick={pick} onHover={setActive} empty="No match. Try another spelling." />}
      </div>
    </FieldShell>
  );
}

/** Several people chosen by typing; each shows as a removable chip. Posts `name` once per person. */
export function PeoplePicker({
  label,
  name,
  options,
  defaultValue = [],
  onChange,
  hint,
  className,
  placeholder = "Type a name to search…",
}: {
  label: string;
  name: string;
  options: PickerOption[];
  defaultValue?: string[];
  onChange?: (values: string[]) => void;
  hint?: string;
  className?: string;
  placeholder?: string;
}) {
  const error = useFieldError(name);
  const id = `${name}-${useId()}`;
  const [values, setValues] = useState<string[]>(defaultValue);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const update = (next: string[]) => { setValues(next); onChange?.(next); };
  useFormReset(box, useMemo(() => () => { setValues(defaultValue); setQuery(""); onChange?.(defaultValue); }, [defaultValue, onChange]));

  const byValue = useMemo(() => new Map(options.map((o) => [o.value, o])), [options]);
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return options.filter((o) => !values.includes(o.value) && matches(o, needle));
  }, [options, query, values]);

  const add = (o: PickerOption) => {
    update([...values, o.value]);
    setQuery("");
    setActive(0);
    // Close, so the list never covers the fields below; typing or clicking opens it again.
    setOpen(false);
    input.current?.focus();
  };
  const remove = (v: string) => update(values.filter((x) => x !== v));

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, shown.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (open && shown[active]) add(shown[active]); }
    else if (e.key === "Backspace" && !query && values.length) remove(values[values.length - 1]);
    else if (e.key === "Escape" && open) { e.stopPropagation(); setOpen(false); }
  };

  return (
    <FieldShell {...{ label, id, hint, className, error }}>
      <div ref={box} className="relative">
        {values.map((v) => <input key={v} type="hidden" name={name} value={v} />)}
        <div
          className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1.5 transition-[border-color,box-shadow] duration-200 focus-within:border-ink focus-within:ring-4 focus-within:ring-marigold-soft hover:border-ink/25"
          onMouseDown={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); input.current?.focus(); } }}
        >
          {values.map((v) => (
            <span key={v} className="inline-flex max-w-full items-center gap-1 rounded-md bg-subtle px-2 py-0.5 text-sm text-ink">
              <span className="truncate">{byValue.get(v)?.label ?? "Former team member"}</span>
              <button type="button" onClick={() => remove(v)} aria-label={`Remove ${byValue.get(v)?.label ?? "person"}`} className="rounded text-muted transition-colors hover:text-danger">
                <X className="size-3.5" aria-hidden />
              </button>
            </span>
          ))}
          <input
            ref={input}
            id={id}
            role="combobox"
            aria-expanded={open}
            aria-controls={`${id}-list`}
            aria-autocomplete="list"
            aria-activedescendant={open && shown[active] ? `${id}-list-${active}` : undefined}
            aria-invalid={!!error}
            autoComplete="off"
            value={query}
            placeholder={values.length ? "" : placeholder}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); }}
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={onKey}
            className="min-w-24 flex-1 bg-transparent px-1 py-0.5 text-sm text-ink placeholder:text-muted/70 focus:outline-none"
          />
        </div>
        {open && <OptionList id={`${id}-list`} options={shown} active={active} selected={() => false} onPick={add} onHover={setActive} empty={options.length ? "No match. Try another spelling." : "No approved employees yet."} />}
      </div>
    </FieldShell>
  );
}

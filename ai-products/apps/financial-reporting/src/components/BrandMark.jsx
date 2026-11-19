import { FileSpreadsheet } from "lucide-react";

/** Product mark for the navy sidebar — same treatment as the other product apps. */
export default function BrandMark() {
  return (
    <a href={`${import.meta.env.BASE_URL}dashboard`} className="flex items-center gap-3">
      <span className="grid size-10 place-items-center rounded-xl bg-paper text-ink">
        <FileSpreadsheet className="size-5" />
      </span>
      <span className="leading-tight">
        <span className="block font-display text-[16px] font-medium text-paper">Trial Balance</span>
        <span className="block font-mono text-[10px] uppercase tracking-[0.14em] text-mist">Agarwal &amp; Saxena</span>
      </span>
    </a>
  );
}

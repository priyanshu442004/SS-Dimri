import "server-only";
import { readObject } from "@/lib/storage/s3";
import { renderDocxHtml } from "./docx";

// Page geometry of the firm's templates (A4; margins in twips ÷ 20 = pt):
// header 25pt from the top, body from 85pt, sides 60pt, bottom 60pt, footer 35pt.
export const SHEET = { width: 595.3, minHeight: 841.9, headerTop: 25, bodyTop: 85, side: 60, bottom: 60 } as const;

export async function renderStoredLetter(objectKey: string) {
  return renderDocxHtml(await readObject(objectKey));
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Stand-alone printable document: the letterhead repeats on every printed page, with "Page n" below. */
export function printableHtml(title: string, r: ReturnType<typeof renderDocxHtml>) {
  const sections = r.pages
    .map((p) => `<table class="frame"><thead><tr><td class="head">${r.header}</td></tr></thead><tbody><tr><td>${p}</td></tr></tbody></table>`)
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><style>
@page { size: A4; margin: ${SHEET.headerTop}pt ${SHEET.side}pt ${SHEET.bottom}pt; ${r.footer ? `@bottom-center { content: "Page " counter(page); font: 8pt Arial, Helvetica, sans-serif; color: #808080; }` : ""} }
* { box-sizing: border-box; }
html { background: #fff; }
body { margin: 0; font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; color: #000; background: #fff; }
.frame { width: 100%; border-collapse: collapse; }
.frame > thead > tr > td, .frame > tbody > tr > td { padding: 0; vertical-align: top; }
.frame > thead .head { padding-bottom: 18pt; }
.frame + .frame { break-before: page; }
.bar { display: none; }
@media screen {
  html, body { background: #e9e7e1; }
  .bar { display: flex; gap: 8px; justify-content: center; padding: 12px; font: 14px system-ui, sans-serif; }
  .bar button { font: inherit; padding: 8px 14px; border-radius: 6px; border: 1px solid #1e3a5f; background: #1e3a5f; color: #fff; cursor: pointer; }
  .frame { background: #fff; width: ${SHEET.width}pt; max-width: 100%; margin: 0 auto 16px; box-shadow: 0 1px 4px rgba(0,0,0,.15); }
  .frame > thead .head { padding: ${SHEET.headerTop}pt ${SHEET.side}pt 18pt; }
  .frame > tbody > tr > td { padding: 0 ${SHEET.side}pt ${SHEET.bottom}pt; }
}
@media screen and (max-width: 640px) {
  .frame > thead .head { padding: 16px 16px 12px; }
  .frame > tbody > tr > td { padding: 0 16px 24px; }
}
</style></head><body><div class="bar"><button type="button" onclick="window.print()">Print / Save as PDF</button></div>${sections}<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},300)})</script></body></html>`;
}

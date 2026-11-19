// PDF → clean text rows. Financial PDFs often store a label and its amounts as
// separate text runs, so plain extraction scrambles columns. We rebuild each
// visual row from word coordinates, keeping columns apart with " | ".
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const ROW_TOLERANCE = 2.5; // pt: runs whose baselines differ less than this share a row
const COLUMN_GAP = 14;     // pt: a horizontal gap wider than this starts a new column

export async function pdfToRows(buffer) {
  const doc = await getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  }).promise;

  const pages = [];
  let charCount = 0;
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const { items } = await page.getTextContent();
    const runs = items
      .filter((it) => it.str && it.str.trim())
      .map((it) => ({ x: it.transform[4], y: it.transform[5], w: it.width, s: it.str.replace(/\s+/g, " ").trim() }));
    charCount += runs.reduce((a, r) => a + r.s.length, 0);

    // group into rows top→bottom (PDF y grows upward)
    runs.sort((a, b) => b.y - a.y || a.x - b.x);
    const rows = [];
    for (const r of runs) {
      const row = rows.find((rw) => Math.abs(rw.y - r.y) <= ROW_TOLERANCE);
      if (row) row.runs.push(r); else rows.push({ y: r.y, runs: [r] });
    }
    const lines = rows
      .sort((a, b) => b.y - a.y)
      .map(({ runs: rs }) => {
        rs.sort((a, b) => a.x - b.x);
        let line = "", end = null;
        for (const r of rs) {
          if (end !== null) line += r.x - end > COLUMN_GAP ? " | " : " ";
          line += r.s;
          end = r.x + r.w;
        }
        return line;
      });
    pages.push(lines.join("\n"));
    page.cleanup();
  }
  await doc.destroy();
  return { text: pages.join("\n\n--- page break ---\n\n"), pages: pages.length, charCount };
}

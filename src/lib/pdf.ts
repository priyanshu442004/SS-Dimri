import "server-only";

// HTML → PDF with the headless Chromium that is installed on the server for the report PDFs
// (playwright-core). One print at a time: the server is small, and a second Chromium would only
// slow both down. Used by the salary slips and by the assistant's PDF files.

let queue: Promise<unknown> = Promise.resolve();

export type PdfOptions = { landscape?: boolean; margin?: string; format?: "A4" | "A3" };

/** Prints one or more complete HTML documents; one PDF per document, in order. */
export async function htmlToPdfs(htmls: string[], opts: PdfOptions = {}): Promise<Buffer[]> {
  const run = queue.then(async () => {
    const { chromium } = await import("playwright-core");
    const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    try {
      const out: Buffer[] = [];
      for (const html of htmls) {
        const page = await browser.newPage({ viewport: { width: 1240, height: 1754 } });
        try {
          // Self-contained documents: no network, so nothing can be fetched while printing.
          await page.route("**/*", (route) => (route.request().url().startsWith("data:") ? route.continue() : route.abort()));
          await page.setContent(html, { waitUntil: "load", timeout: 30_000 });
          await page.emulateMedia({ media: "print" });
          const m = opts.margin ?? "12mm";
          out.push(await page.pdf({ format: opts.format ?? "A4", landscape: !!opts.landscape, printBackground: true, margin: { top: m, bottom: m, left: m, right: m } }));
        } finally {
          await page.close();
        }
      }
      return out;
    } finally {
      await browser.close();
    }
  });
  queue = run.catch(() => undefined);
  return run;
}

export async function htmlToPdf(html: string, opts: PdfOptions = {}): Promise<Buffer> {
  return (await htmlToPdfs([html], opts))[0];
}

export const escapeHtml = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

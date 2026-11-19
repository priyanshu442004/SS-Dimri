"""Bank Reconciliation — Final Review Report renderer.

Reads the report model (JSON, UTF-8) on stdin, writes an A4 PDF to argv[1].
Layout, fonts and spacing replicate the reference "bank_reconciliation_final_report"
(ReportLab, Helvetica). Glyphs Helvetica lacks (₹, −) are drawn in DejaVu Sans,
so the rupee sign renders instead of the reference's "■" fallback.
Positions are measured in points from the TOP of the page.
"""
import json, os, sys

from reportlab.lib.colors import HexColor, black, white
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

HERE = os.path.dirname(os.path.abspath(__file__))
pdfmetrics.registerFont(TTFont("DejaVu", os.path.join(HERE, "fonts", "DejaVuSans.ttf")))
FALLBACK = set("₹−")  # characters not in Helvetica

W, H = 595.2756, 841.8898
LEFT, RIGHT = 44.0, 551.28
BOTTOM = 800.0           # flow limit (top-down); matches the reference page break
PAGE_TOP = 43.4          # first line top on continuation pages (8.5pt text)
ASC = 1.068              # calibrated against the reference: span-top + ASC*size = baseline

F = {"r": "Helvetica", "b": "Helvetica-Bold", "i": "Helvetica-Oblique", "bi": "Helvetica-BoldOblique"}


def segs(text, font):
    """Split a string into (substring, fontname) runs, routing fallback glyphs to DejaVu."""
    out = []
    for ch in text:
        f = "DejaVu" if ch in FALLBACK else font
        if out and out[-1][1] == f:
            out[-1][0] += ch
        else:
            out.append([ch, f])
    return out


def width(text, font, size):
    return sum(pdfmetrics.stringWidth(s, f, size) for s, f in segs(text, font))


class Doc:
    def __init__(self, path, title):
        self.c = canvas.Canvas(path, pagesize=(W, H))
        self.c.setTitle(title)
        self.c.setAuthor("Agarwal & Saxena Bank Reconciliation")
        self.top = 0.0
        self.fresh = False  # True right after a page break: the next block sits at PAGE_TOP, no gap

    # ---- primitives
    def draw(self, x, top, text, font, size, color=black):
        c = self.c
        c.setFillColor(color)
        base = H - (top + ASC * size)
        for s, f in segs(text, font):
            c.setFont(f, size)
            c.drawString(x, base, s)
            x += pdfmetrics.stringWidth(s, f, size)

    def new_page(self):
        self.c.showPage()
        self.top = PAGE_TOP
        self.fresh = True

    def advance(self, gap, need=12):
        """Move down by `gap` before a block needing `need` points; break the page if it won't fit."""
        if self.fresh:
            return
        if self.top + gap + need > BOTTOM:
            self.new_page()
        else:
            self.top += gap

    # ---- rich paragraph: runs = [(text, style)] ; style in r/b/i/bi
    def wrap(self, runs, size, maxw):
        words = []
        for text, st in runs:
            parts = text.split(" ")
            for i, p in enumerate(parts):
                if p == "":
                    continue
                words.append((p, st, i == 0 and not text.startswith(" ")))
        lines, cur, cw = [], [], 0.0
        for w, st, glue in words:
            ww = width(w, F[st], size)
            sp = 0 if not cur or glue else width(" ", F[cur[-1][1]], size)
            if cur and cw + sp + ww > maxw + 0.1:  # small tolerance, as ReportLab allows
                lines.append(cur); cur, cw, sp = [], 0.0, 0
            cur.append((w, st, glue if cur else True, sp)); cw += sp + ww
        if cur:
            lines.append(cur)
        return lines

    def para(self, runs, size, leading, x=LEFT, maxw=None, color=black):
        maxw = maxw or (RIGHT - x)
        lines = self.wrap(runs, size, maxw)
        for li, ln in enumerate(lines):
            if li:
                self.advance(leading)
            self.fresh = False
            px = x
            for w, st, glue, sp in ln:
                px += sp
                self.draw(px, self.top, w, F[st], size, color)
                px += width(w, F[st], size)
        return len(lines)


def render(m, out):
    d = Doc(out, m["title"])
    c = d.c
    # title + subtitle
    tw = width(m["title"], F["b"], 18)
    d.draw((W - tw) / 2, 42.7, m["title"], F["b"], 18)
    d.draw(LEFT, 77.1, m["subtitle"], F["bi"], 12)

    # status paragraph
    d.top = 111.3
    d.para([(m["statusLead"], "b"), (" " + m["statusText"], "r")], 10, 12)

    def heading(text, gap):
        d.advance(gap, 24.4 + 12)  # keep a heading with its first line
        d.fresh = False
        d.draw(LEFT, d.top, text, F["b"], 14)

    # 1. summary table
    heading("1. Reconciliation summary", 21.8)
    t0 = d.top + 24.0
    cols = [52.6, 227.6, 377.6, 542.6]
    rows = [["Metric", "Bank Statement", "Books / Cash Book"]] + m["summary"]
    c.setFillColor(HexColor("#233f62"))
    c.rect(cols[0], H - (t0 + 18), cols[-1] - cols[0], 18, stroke=0, fill=1)
    for i, r in enumerate(rows):
        rt = t0 + 18 * i
        for j, cell in enumerate(r):
            d.draw(cols[j] + 6, rt + 2.4, cell, F["r"], 8, white if i == 0 else black)
    c.setStrokeColor(HexColor("#808080")); c.setLineWidth(0.4)
    bottom = t0 + 18 * len(rows)
    for i in range(len(rows) + 1):
        y = H - (t0 + 18 * i); c.line(cols[0], y, cols[-1], y)
    for x in cols:
        c.line(x, H - t0, x, H - bottom)
    d.top = bottom

    # 2. exceptions
    heading("2. Identified gaps, exceptions and review actions", 9.0)
    d.top += 24.4
    first = True
    for e in m["exceptions"]:
        if not first:
            d.advance(22)
        first = False
        d.para([(e["title"], "b"), (" — " + e["text"], "r"), (" Next step:", "i"), (" " + e["next"], "r")], 8.5, 12)
    if not m["exceptions"]:
        d.para([("No exceptions — every bank and book transaction is matched.", "r")], 8.5, 12)

    def numbered(items):
        for i, s in enumerate(items):
            if i:
                d.advance(18)
            d.para([(f"{i + 1}. {s}", "r")], 8.5, 12)

    heading("3. Recommended next steps", 25.6)
    d.top += 24.4
    numbered(m["nextSteps"])
    c.showPage()
    c.save()


if __name__ == "__main__":
    render(json.loads(sys.stdin.buffer.read().decode("utf-8")), sys.argv[1])

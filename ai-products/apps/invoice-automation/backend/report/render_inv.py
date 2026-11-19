"""Invoice Processing — Review Report renderer.

Reads the report model (JSON, UTF-8) on stdin and writes an A4 PDF to argv[1].
Same visual family as the Bank Reconciliation report: Helvetica, navy table
headers (#233F62), grey hairline grids; ₹ and − drawn with DejaVu Sans.
Positions are points from the TOP of the page.
"""
import json, os, sys

from reportlab.lib.colors import HexColor, black, white
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

HERE = os.path.dirname(os.path.abspath(__file__))
pdfmetrics.registerFont(TTFont("DejaVu", os.path.join(HERE, "fonts", "DejaVuSans.ttf")))
FALLBACK = set("₹−")
W, H = 595.2756, 841.8898
LEFT, RIGHT = 44.0, 551.28
BOTTOM, PAGE_TOP = 790.0, 46.0
ASC = 1.068
F = {"r": "Helvetica", "b": "Helvetica-Bold", "i": "Helvetica-Oblique", "bi": "Helvetica-BoldOblique"}
NAVY, GRID, ZEBRA, RED, MUTED = HexColor("#233f62"), HexColor("#808080"), HexColor("#f4f6fb"), HexColor("#b8432f"), HexColor("#566176")


def segs(text, font):
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


def fit(text, font, size, maxw):
    """Truncate with an ellipsis so a cell never overflows."""
    if width(text, font, size) <= maxw:
        return text
    while text and width(text + "…", font, size) > maxw:
        text = text[:-1]
    return text + "…"


class Doc:
    def __init__(self, path, m):
        self.m = m
        self.c = canvas.Canvas(path, pagesize=(W, H))
        self.c.setTitle(m["title"]); self.c.setAuthor("Agarwal & Saxena Invoice Automation")
        self.top, self.fresh, self.page = 0.0, False, 1

    def draw(self, x, top, text, font, size, color=black, align="left", maxw=None):
        if maxw:
            text = fit(text, font, size, maxw)
        if align == "right":
            x -= width(text, font, size)
        elif align == "center":
            x -= width(text, font, size) / 2
        c = self.c
        c.setFillColor(color)
        base = H - (top + ASC * size)
        for s, f in segs(text, font):
            c.setFont(f, size); c.drawString(x, base, s); x += pdfmetrics.stringWidth(s, f, size)

    def footer(self):
        self.draw(LEFT, 812, self.m["footer"], F["r"], 7, MUTED)
        self.draw(RIGHT, 812, f"Page {self.page}", F["r"], 7, MUTED, align="right")

    def new_page(self):
        self.footer(); self.c.showPage(); self.page += 1
        self.top, self.fresh = PAGE_TOP, True

    def advance(self, gap, need=12):
        if self.fresh:
            return
        if self.top + gap + need > BOTTOM:
            self.new_page()
        else:
            self.top += gap

    def para(self, runs, size, leading, x=LEFT, maxw=None):
        maxw = maxw or (RIGHT - x)
        words = []
        for text, st in runs:
            for i, p in enumerate(text.split(" ")):
                if p:
                    words.append((p, st, i == 0 and not text.startswith(" ")))
        lines, cur, cw = [], [], 0.0
        for w, st, glue in words:
            ww = width(w, F[st], size)
            sp = 0 if not cur or glue else width(" ", F[cur[-1][1]], size)
            if cur and cw + sp + ww > maxw + 0.1:
                lines.append(cur); cur, cw, sp = [], 0.0, 0
            cur.append((w, st, sp)); cw += sp + ww
        if cur:
            lines.append(cur)
        for li, ln in enumerate(lines):
            if li:
                self.advance(leading)
            self.fresh = False
            px = x
            for w, st, sp in ln:
                px += sp
                self.draw(px, self.top, w, F[st], size)
                px += width(w, F[st], size)

    def heading(self, text, gap, need=24 + 18 * 3):
        """need = space the following block requires; short tables move whole to the next page."""
        self.advance(gap, min(need, BOTTOM - PAGE_TOP - 40))
        self.fresh = False
        self.draw(LEFT, self.top, text, F["b"], 13)
        self.top += 22

    def table(self, cols, rows, size=7.6, rh=16, totals=None, flags=None):
        """cols = [(header, width, align)], rows = [[cell…]]; header repeats on page breaks."""
        x0 = LEFT + (RIGHT - LEFT - sum(w for _, w, _ in cols)) / 2
        c = self.c

        def header():
            c.setFillColor(NAVY); c.rect(x0, H - (self.top + rh), sum(w for _, w, _ in cols), rh, stroke=0, fill=1)
            x = x0
            for h, w, al in cols:
                self.draw(x + (w - 5 if al == "r" else 5), self.top + (rh - size) / 2 - 0.6, h, F["b"], size, white, align="right" if al == "r" else "left", maxw=w - 8)
                x += w
            self.top += rh

        self.fresh = False
        header()
        all_rows = rows + ([totals] if totals else [])
        for ri, r in enumerate(all_rows):
            if self.top + rh > BOTTOM:
                self.new_page(); self.fresh = False; header()
            is_total = totals is not None and ri == len(all_rows) - 1
            flagged = flags and ri < len(rows) and flags[ri]
            if is_total or ri % 2 == 1:
                c.setFillColor(HexColor("#e8ece5") if is_total else ZEBRA)
                c.rect(x0, H - (self.top + rh), sum(w for _, w, _ in cols), rh, stroke=0, fill=1)
            x = x0
            for (h, w, al), cell in zip(cols, r):
                font = F["b"] if is_total else F["r"]
                color = RED if (flagged and al != "r" and cell and str(cell).startswith("⚠")) else black
                self.draw(x + (w - 5 if al == "r" else 5), self.top + (rh - size) / 2 - 0.6, str(cell).lstrip("⚠ "), font, size, color,
                          align="right" if al == "r" else "left", maxw=w - 8)
                x += w
            c.setStrokeColor(GRID); c.setLineWidth(0.3)
            c.line(x0, H - (self.top + rh), x0 + sum(w for _, w, _ in cols), H - (self.top + rh))
            self.top += rh


def render(m, out):
    d = Doc(out, m)
    tw = width(m["title"], F["b"], 18)
    d.draw((W - tw) / 2, 42.7, m["title"], F["b"], 18)
    d.draw(LEFT, 77.1, m["subtitle"], F["bi"], 12)
    d.top = 111.3
    d.para([(m["statusLead"], "b"), (" " + m["statusText"], "r")], 10, 12)

    d.heading("1. Batch summary", 24, 24 + 18 * (len(m["summary"]) + 1))
    d.table([("Metric", 300, "l"), ("Value", 190, "r")], m["summary"], size=8.2, rh=18)

    d.heading("2. Exceptions and review actions", 22)
    if not m["exceptions"]:
        d.para([("No exceptions — every invoice passed the arithmetic, GST and duplicate checks.", "r")], 8.5, 12)
    for i, e in enumerate(m["exceptions"]):
        if i:
            d.advance(20)
        d.para([(e["title"], "b"), (" — " + e["text"], "r"), (" Next step:", "i"), (" " + e["next"], "r")], 8.5, 12)

    d.heading("3. GST summary by rate", 26, 24 + 16 * (len(m["gstByRate"]["rows"]) + 2))
    d.table([("GST rate", 70, "l"), ("Invoices", 60, "r"), ("Taxable value", 95, "r"), ("CGST", 80, "r"), ("SGST", 80, "r"), ("IGST", 60, "r"), ("Total GST", 62, "r")],
            m["gstByRate"]["rows"], totals=m["gstByRate"]["total"])

    d.heading("4. Supplier summary", 22, 24 + 16 * (len(m["suppliers"]["rows"]) + 2))
    d.table([("Supplier", 190, "l"), ("GSTIN", 110, "l"), ("Invoices", 55, "r"), ("Taxable value", 70, "r"), ("Invoice total", 82, "r")],
            m["suppliers"]["rows"], totals=m["suppliers"]["total"])

    d.heading("5. Invoice register", 22)
    d.table([("#", 20, "l"), ("Invoice no.", 62, "l"), ("Date", 52, "l"), ("Supplier", 108, "l"), ("Taxable", 56, "r"), ("Rate", 30, "r"),
             ("CGST", 44, "r"), ("SGST", 44, "r"), ("Total", 58, "r"), ("Check", 33, "l")],
            m["register"]["rows"], size=7.2, rh=15, totals=m["register"]["total"], flags=m["register"]["flags"])

    d.heading("Important limitation", 26)
    d.para([(m["limitation"], "r")], 8.5, 12)
    d.footer()
    d.c.showPage(); d.c.save()


if __name__ == "__main__":
    render(json.loads(sys.stdin.buffer.read().decode("utf-8")), sys.argv[1])

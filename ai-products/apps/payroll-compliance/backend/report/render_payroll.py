"""Payroll Processing Summary — PDF renderer.

Reads the report model (JSON, UTF-8) on stdin, writes an A4 PDF to argv[1].
Replicates the client's reference "Payroll Processing Summary" (ReportLab, Helvetica):
centred title, subtitle, two-column "Output section | Result" table with a navy header.
Long results wrap inside their cell (the reference let them run past the page edge).
Positions are measured in points from the TOP of the page.
"""
import json, os, sys

from reportlab.lib.colors import HexColor, black, white
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

HERE = os.path.dirname(os.path.abspath(__file__))
pdfmetrics.registerFont(TTFont("DejaVu", os.path.join(HERE, "fonts", "DejaVuSans.ttf")))
FALLBACK = set("₹−≠")  # glyphs Helvetica lacks

W, H = 595.2756, 841.8898
X0, X1, X2 = 42.52, 198.43, 552.76   # table left, column split, right
PAD = 5.0
SIZE = 8.0
LEADING = 10.0
ROW_H = 22.0
BOTTOM = 800.0


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


def draw(c, x, baseline_top, text, font, size, color=black):
    c.setFillColor(color)
    for s, f in segs(text, font):
        c.setFont(f, size)
        c.drawString(x, H - baseline_top, s)
        x += pdfmetrics.stringWidth(s, f, size)


def wrap(text, font, size, maxw):
    lines = []
    for para in str(text).split("\n"):
        cur = ""
        for word in para.split(" "):
            cand = word if not cur else f"{cur} {word}"
            if cur and width(cand, font, size) > maxw:
                lines.append(cur)
                cur = word
            else:
                cur = cand
        lines.append(cur)
    return lines or [""]


def render(m, out):
    c = canvas.Canvas(out, pagesize=(W, H))
    c.setTitle(m["title"])
    c.setAuthor("Agarwal & Saxena Payroll Processing")

    tw = width(m["title"], "Helvetica-Bold", 18)
    draw(c, (W - tw) / 2, 66.6, m["title"], "Helvetica-Bold", 18)
    draw(c, 48.5, 86.6, m["subtitle"], "Helvetica", 10)

    rows = [["Output section", "Result"]] + m["rows"]
    top = 98.2
    c.setLineWidth(0.4)
    for i, (k, v) in enumerate(rows):
        left_lines = wrap(k, "Helvetica", SIZE, X1 - X0 - 2 * PAD)
        right_lines = wrap(v, "Helvetica", SIZE, X2 - X1 - 2 * PAD)
        n = max(len(left_lines), len(right_lines))
        h = max(ROW_H, 12.0 + n * LEADING)
        if top + h > BOTTOM:
            c.showPage()
            top = 42.0
        y = H - top - h
        if i == 0:
            c.setFillColor(HexColor("#233f62"))
            c.rect(X0, y, X2 - X0, h, stroke=0, fill=1)
        c.setStrokeColor(HexColor("#808080"))
        c.rect(X0, y, X2 - X0, h, stroke=1, fill=0)
        c.line(X1, y, X1, y + h)
        color = white if i == 0 else black
        first = top + (h - n * LEADING) / 2 + 6.6 if n > 1 else top + 13.3
        for j, ln in enumerate(left_lines):
            draw(c, X0 + PAD, first + j * LEADING, ln, "Helvetica", SIZE, color)
        for j, ln in enumerate(right_lines):
            draw(c, X1 + PAD, first + j * LEADING, ln, "Helvetica", SIZE, color)
        top += h

    c.showPage()
    c.save()


if __name__ == "__main__":
    render(json.loads(sys.stdin.buffer.read().decode("utf-8")), sys.argv[1])

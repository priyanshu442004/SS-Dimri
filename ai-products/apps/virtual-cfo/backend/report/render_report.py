"""Financial Health Summary renderer.

Reads a fully-computed report model (JSON) on stdin and writes a 2-page A4 PDF to
argv[1]. All numbers and sentences are prepared by the Node backend; this file
only draws. Geometry, fonts, colours and chart styling replicate the reference
"FY2024 Financial Health Summary" (ReportLab + matplotlib, DejaVu Sans).
Coordinates below are in PDF points measured from the TOP of the page.
"""
import io, json, os, sys, tempfile

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

# ---------------------------------------------------------------- fonts
FONT_DIR = os.path.join(os.path.dirname(matplotlib.__file__), "mpl-data", "fonts", "ttf")
pdfmetrics.registerFont(TTFont("DV", os.path.join(FONT_DIR, "DejaVuSans.ttf")))
pdfmetrics.registerFont(TTFont("DV-B", os.path.join(FONT_DIR, "DejaVuSans-Bold.ttf")))
plt.rcParams["font.family"] = "DejaVu Sans"
ASC = 0.761  # calibrated: reference span-top + ASC*size = baseline (DejaVu)

# ---------------------------------------------------------------- palette
BLUE = "#1a3fa8"; HEAD = "#1b3fa8"; INK = "#1f2937"; GREY = "#6b7280"
PANEL = "#f4f6fb"; RULE = "#e4e6eb"; AXIS = "#e5e7eb"
GREEN = "#2e8b57"; GREEN_BAR = "#2d8a56"; RED = "#dc4a38"; RED_BAR = "#db4938"; AMBER = "#f59e0b"
TONE = {"good": GREEN, "bad": RED, "neutral": GREY, "warn": AMBER}
BAR_TONE = {"good": GREEN_BAR, "bad": RED_BAR, "neutral": GREEN_BAR, "warn": AMBER}
STATUS_TONE = {"Low": RED, "Mixed": AMBER, "Watch": AMBER, "Good": GREEN}

W, H = 595.2756, 841.8898
LM, CW = 39.7, 515.9  # left margin, content width


def Y(top):
    """top-down coordinate -> ReportLab bottom-up."""
    return H - top


class Page:
    def __init__(self, c):
        self.c = c

    def rect(self, x, top, w, h, fill=None, stroke=None, lw=0):
        c = self.c
        if fill:
            c.setFillColor(HexColor(fill))
        if stroke:
            c.setStrokeColor(HexColor(stroke)); c.setLineWidth(lw)
        c.rect(x, Y(top + h), w, h, stroke=1 if stroke else 0, fill=1 if fill else 0)

    def line(self, x1, t1, x2, t2, color, lw):
        c = self.c
        c.setStrokeColor(HexColor(color)); c.setLineWidth(lw)
        c.line(x1, Y(t1), x2, Y(t2))

    def text(self, x, top, s, size, color=INK, bold=False, align="left"):
        c = self.c
        font = "DV-B" if bold else "DV"
        c.setFont(font, size); c.setFillColor(HexColor(color))
        base = Y(top + ASC * size)
        if align == "center":
            c.drawCentredString(x, base, s)
        elif align == "right":
            c.drawRightString(x, base, s)
        else:
            c.drawString(x, base, s)

    def rich(self, x, top, width, runs, size, leading, color=INK):
        """Word-wrap runs [(text, bold[, color])] and draw; returns line count."""
        words = []
        for run in runs:
            t, b = run[0], run[1]
            col = run[2] if len(run) > 2 else color
            for i, w in enumerate(t.split(" ")):
                if w == "" and i:
                    continue
                words.append((w, b, col, i > 0 or t.startswith(" ")))
        lines, cur, cur_w = [], [], 0.0
        sp = pdfmetrics.stringWidth(" ", "DV", size)
        for w, b, col, _ in words:
            if not w:
                continue
            ww = pdfmetrics.stringWidth(w, "DV-B" if b else "DV", size)
            add = ww + (sp if cur else 0)
            if cur and cur_w + add > width:
                lines.append(cur); cur, cur_w = [], 0.0; add = ww
            cur.append((w, b, col)); cur_w += add
        if cur:
            lines.append(cur)
        c = self.c
        for li, ln in enumerate(lines):
            base = Y(top + li * leading + ASC * size)
            # merge consecutive words of the same style into one string per run,
            # so the PDF text layer reads naturally (copy/paste, search)
            segs = []
            for w, b, col in ln:
                if segs and segs[-1][1] == b and segs[-1][2] == col:
                    segs[-1][0] += " " + w
                else:
                    segs.append([w if not segs else " " + w, b, col])
            px = x
            for s, b, col in segs:
                f = "DV-B" if b else "DV"
                c.setFont(f, size); c.setFillColor(HexColor(col)); c.drawString(px, base, s)
                px += pdfmetrics.stringWidth(s, f, size)
        return len(lines)

    def image(self, path, x, top, w, h):
        self.c.drawImage(ImageReader(path), x, Y(top + h), w, h, mask="auto")


def heading(p, top, s):
    p.text(LM, top, s, 10.5, HEAD, bold=True)


def footer(p, m, n):
    p.text(LM, 814.3, m["footer"], 6.5, GREY)
    p.text(555.6, 814.3, f"Page {n} of 2", 6.5, GREY, align="right")


# ---------------------------------------------------------------- charts
def save(fig, tmp, name):
    path = os.path.join(tmp, name)
    fig.savefig(path, dpi=fig.dpi, transparent=True)
    plt.close(fig)
    return path


def donut(tmp, name, d):
    fig = plt.figure(figsize=(792 / 224, 550 / 224), dpi=224)
    ax = fig.add_axes([35 / 792, 105 / 550, 340 / 792, 340 / 550])
    vals = [max(i["value"], 0.0001) for i in d["items"]]
    ax.pie(vals, colors=[i["color"] for i in d["items"]], startangle=90, counterclock=False,
           wedgeprops=dict(width=0.36, edgecolor="white", linewidth=1.4))
    ax.set_xlim(-1.03, 1.03); ax.set_ylim(-1.03, 1.03); ax.set_aspect("equal")
    ax.text(0, 0.07, d["totalLabel"], ha="center", va="center", fontsize=10.85, fontweight="bold", color=INK)
    ax.text(0, -0.17, "Total", ha="center", va="center", fontsize=6.5, color=GREY)
    handles = [plt.Rectangle((0, 0), 1, 1, color=i["color"]) for i in d["items"]]
    fig.legend(handles, [f"{i['label']}  {i['text']}" for i in d["items"]], loc="center left",
               bbox_to_anchor=(432 / 792, 0.5), frameon=False, fontsize=6.5, labelcolor=INK,
               handlelength=0.85, handleheight=0.85, handletextpad=0.8, labelspacing=0.78, borderaxespad=0)
    return save(fig, tmp, name)


def returns_bars(tmp, items):
    fig = plt.figure(figsize=(1606 / 400, 440 / 400), dpi=400)
    ax = fig.add_axes([190 / 1606, 0.02, 0.8, 0.96])
    labels = [i["label"] for i in items][::-1]
    vals = [i["value"] for i in items][::-1]
    cols = [i["color"] for i in items][::-1]
    ax.barh(range(len(vals)), vals, color=cols, height=0.56)
    top = max(max(vals), 0.01)
    ax.set_xlim(0, top * 1.093)
    ax.set_ylim(-0.405, len(vals) - 0.595)
    for i, (v, it) in enumerate(zip(vals, [x["text"] for x in items][::-1])):
        ax.text(max(v, 0) + top * 0.017, i, it, va="center", fontsize=6.1, fontweight="bold", color=INK)
    ax.set_yticks(range(len(vals)), labels)
    ax.tick_params(axis="y", length=0, labelsize=5.65, labelcolor=GREY, pad=2.5)
    ax.set_xticks([])
    for s in ("top", "right", "bottom"):
        ax.spines[s].set_visible(False)
    ax.spines["left"].set_color(AXIS); ax.spines["left"].set_linewidth(1.1)
    return save(fig, tmp, "returns.png")


def cashflow_bars(tmp, bars):
    fig = plt.figure(figsize=(792 / 224, 484 / 224), dpi=224)
    ax = fig.add_axes([10 / 792, 46 / 484, 772 / 792, 438 / 484])
    vals = [b["value"] for b in bars]
    lo, hi = min(min(vals), 0), max(max(vals), 0)
    span = (hi - lo) or 1
    ax.bar(range(len(vals)), vals, width=0.55, color=[GREEN if v >= 0 else RED for v in vals])
    ax.set_ylim(lo - 0.157 * span, hi + 0.169 * span)
    ax.set_xlim(-0.41, len(vals) - 0.59)
    ax.axhline(0, color="#7b8794", linewidth=1.3)
    for i, b in enumerate(bars):
        v = b["value"]
        ax.text(i, v + (0.02 * span if v >= 0 else -0.02 * span), b["text"], ha="center",
                va="bottom" if v >= 0 else "top", fontsize=7.4, fontweight="bold", color=INK)
    ax.set_xticks(range(len(vals)), [b["label"] for b in bars])
    ax.tick_params(axis="x", length=0, labelsize=6.9, labelcolor=GREY, pad=4)
    ax.set_yticks([])
    for s in ("top", "right", "left"):
        ax.spines[s].set_visible(False)
    ax.spines["bottom"].set_color(AXIS); ax.spines["bottom"].set_linewidth(1.1)
    return save(fig, tmp, "cashflow.png")


def turnover_bars(tmp, t):
    fig = plt.figure(figsize=(792 / 224, 484 / 224), dpi=224)
    ax = fig.add_axes([10 / 792, 46 / 484, 772 / 792, 438 / 484])
    g = t["groups"]; n = len(g); bw = 0.357
    prev = [x["prev"] for x in g]; cur = [x["cur"] for x in g]
    xs = list(range(n))
    ax.bar([x - bw / 2 for x in xs], prev, width=bw, color="#c7d2ee", label=t["prevLabel"])
    ax.bar([x + bw / 2 for x in xs], cur, width=bw, color="#1b3fa8", label=t["curLabel"])
    top = max(prev + cur + [0.01])
    ax.set_ylim(0, top * 1.223); ax.set_xlim(-0.5, n - 0.5)
    for x, v in zip(xs, prev):
        ax.text(x - bw / 2, v + top * 0.012, f"{v:.2f}x", ha="center", va="bottom", fontsize=6.4, color=INK)
    for x, v in zip(xs, cur):
        ax.text(x + bw / 2, v + top * 0.012, f"{v:.2f}x", ha="center", va="bottom", fontsize=6.4, color=INK)
    ax.set_xticks(xs, [x["label"] for x in g])
    ax.tick_params(axis="x", length=0, labelsize=6.7, labelcolor=GREY, pad=4)
    ax.set_yticks([])
    for s in ("top", "right", "left"):
        ax.spines[s].set_visible(False)
    ax.spines["bottom"].set_color(AXIS); ax.spines["bottom"].set_linewidth(1.1)
    ax.legend(loc="center right", bbox_to_anchor=(0.985, 0.909), ncol=2, frameon=False, fontsize=6.8,
              labelcolor=INK, handlelength=2.0, handleheight=0.75, columnspacing=1.9, borderaxespad=0)
    return save(fig, tmp, "turnover.png")


# ---------------------------------------------------------------- pages
def page1(p, m, tmp):
    # header band + score ring
    p.rect(0, 0, W, 96.4, fill=BLUE)
    p.text(LM, 33.8, m["title"], 19, "#ffffff", bold=True)
    p.text(LM, 61.6, m["subtitle"], 8.5, "#ffffff")
    cx, cy, r = 518.8, 48.2, 31.2
    c = p.c
    c.setLineWidth(3); c.setStrokeColor(HexColor("#5d79ca")); c.circle(cx, Y(cy), r, stroke=1, fill=0)
    extent = -360 * max(0, min(100, m["score"])) / 100
    if extent:
        c.setLineWidth(3.4); c.setStrokeColor(HexColor("#9cc3ff"))
        c.arc(cx - r, Y(cy) - r, cx + r, Y(cy) + r, 90, extent)
    p.text(cx, 38.3, str(m["score"]), 15, "#ffffff", bold=True, align="center")
    p.text(cx, 50.1, "/ 100", 6, "#ffffff", align="center")

    # verdict
    p.rect(LM, 113.4, CW, 34.4, fill="#fff6e6")
    p.line(LM, 113.4, LM, 147.8, "#f49e0a", 3)
    p.rich(47.7, 121.3, 505, [(m["verdictLead"], True), (" " + m["verdictText"], False)], 8, 11.2)

    # KPI grid
    p.rect(41.7, 154.8, 511.8, 107.7, fill=PANEL)
    for x in (212.3, 382.9):
        p.line(x, 154.8, x, 262.5, "#ffffff", 4)
    p.line(41.7, 208.6, 553.5, 208.6, "#ffffff", 4)
    cells = [(41.7, 212.3), (212.3, 382.9), (382.9, 553.5)]
    for i, k in enumerate(m["kpis"]):
        row, col = divmod(i, 3)
        x0, x1 = cells[col]
        top = 154.8 + row * 53.8
        p.line(x0, top, x1, top, BAR_TONE.get(k["bar"], GREEN_BAR), 2)
        tx = x0 + 8 if col == 0 else x0 + 8
        p.text(tx, top + 7.5, k["label"], 6.3, GREY)
        p.text(tx, top + 19.1, k["value"], 13, INK, bold=True)
        p.text(tx, top + 34.6, k["sub"], 6.8, TONE.get(k["subTone"], GREY))

    # balance sheet snapshot
    heading(p, 275.0, "Balance Sheet Snapshot")
    p.rect(LM, 288.5, CW, 184.1, fill=PANEL)
    p.image(donut(tmp, "assets.png", m["assets"]), 40, 293, 255, 177)
    p.image(donut(tmp, "liabs.png", m["liabilities"]), 298, 293, 255, 177)
    for x, cap in ((45.7, m["assetCaption"]), (303.6, m["liabCaption"])):
        p.rich(x, 476.2, 245, [(cap["lead"], True, GREY), (" · " + cap["text"], False, GREY)], 6.8, 9, GREY)

    # profitability & returns
    heading(p, 504.1, "Profitability & Returns")
    p.image(returns_bars(tmp, m["returns"]), 40, 521, 289, 79)
    p.text(338.9, 526.3, m["earnings"]["lead"], 8, INK, bold=True)
    top = 539.4
    for b in m["earnings"]["bullets"]:
        n = p.rich(346.9, top, 205, [("• " + b, False)], 7.8, 10.6)
        top += 12.4 + (n - 1) * 10.6

    heading(p, 611.2, "What’s Working")
    top = 626.6
    for b in m["working"]:
        n = p.rich(47.7, top, 505, [("• " + b, False)], 7.8, 10.6)
        top += 12.4 + (n - 1) * 10.6
    footer(p, m, 1)


def page2(p, m, tmp):
    heading(p, 42.2, "Cash Flow & Working Capital")
    p.rect(LM, 55.7, CW, 162.8, fill=PANEL)
    p.image(cashflow_bars(tmp, m["cashflow"]), 46, 60, 255, 156)
    p.image(turnover_bars(tmp, m["turnover"]), 304, 60, 255, 156)
    for x, cap in ((45.7, m["cashCaption"]), (303.6, m["turnoverCaption"])):
        p.rich(x, 222.1, 245, [(cap["lead"], True, GREY), (" " + cap["text"], False, GREY)], 6.8, 9, GREY)

    # scorecard
    heading(p, 250.0, "Six-Dimension Scorecard")
    cols = [45.7, 154.0, 210.8, 417.1]
    p.rect(LM, 263.5, CW, 18, fill=BLUE)
    for x, h in zip(cols, ("Dimension", "Status", "Key metrics", "Takeaway")):
        p.text(x, 269.3, h, 7.4, "#ffffff", bold=True)
    top = 281.5
    widths = (104, 52, 195, 136)
    for i, r in enumerate(m["scorecard"]):
        # measure wrapped lines for each cell to size the row
        def nlines(text, width, bold=False):
            words, n, w = text.split(" "), 1, 0.0
            sp = pdfmetrics.stringWidth(" ", "DV", 7.6)
            for wd in words:
                ww = pdfmetrics.stringWidth(wd, "DV-B" if bold else "DV", 7.6)
                if w and w + sp + ww > width:
                    n += 1; w = ww
                else:
                    w += (sp if w else 0) + ww
            return n
        lines = max(nlines(r["metrics"], widths[2]), nlines(r["takeaway"], widths[3]), nlines(r["dimension"], widths[0], True))
        rh = 18 + (lines - 1) * 10
        p.rect(LM, top, CW, rh, fill="#ffffff" if i % 2 == 0 else PANEL)
        mid = top + rh / 2 - 3.2  # single-line cells are vertically centred
        p.text(cols[0], mid, r["dimension"], 7.6, INK, bold=True)
        p.text(cols[1], mid, "● " + r["status"], 7.6, STATUS_TONE.get(r["status"], AMBER), bold=True)
        n = nlines(r["metrics"], widths[2])
        p.rich(cols[2], mid - (n - 1) * 5, widths[2], [(r["metrics"], False)], 7.6, 10)
        n = nlines(r["takeaway"], widths[3])
        p.rich(cols[3], mid - (n - 1) * 5, widths[3], [(r["takeaway"], False)], 7.6, 10)
        top += rh
    # hairline under the header and every row
    y = 281.5
    p.line(LM, y, LM + CW, y, RULE, 0.4)
    for h_ in m["_rowHeights"]:
        y += h_
        p.line(LM, y, LM + CW, y, RULE, 0.4)

    # risks
    top = y + 8.5
    heading(p, top, "Key Risks")
    top += 15.4
    for rk in m["risks"]:
        p.text(47.7, top, "• ", 7.8, INK)
        n = p.rich(54.8, top, 498, [(rk["lead"], True), (" " + rk["text"], False)], 7.8, 10.6)
        top += 12.4 + (n - 1) * 10.6

    # actions
    top += 4.9
    heading(p, top, "Recommended Actions")
    top += 13.5
    n_act = len(m["actions"])
    p.rect(LM, top, 19.8, 19.2 * n_act, fill=BLUE)
    p.rect(59.5, top, 496.1, 19.2 * n_act, fill=PANEL)
    for i in range(1, n_act):
        p.line(LM, top + 19.2 * i, LM + CW, top + 19.2 * i, "#ffffff", 2)
    for i, a in enumerate(m["actions"]):
        rt = top + 19.2 * i
        p.text(49.6, rt + 5.9, str(i + 1), 8, "#ffffff", bold=True, align="center")
        p.rich(67.5, rt + 6.4, 484, [(a["lead"], True), (" " + a["text"], False)], 7.6, 10)
    top += 19.2 * n_act + 6

    # data note — measure on a scratch canvas first so the box fits the text
    box_top = top
    nlines = Page(canvas.Canvas(io.BytesIO())).rich(45.7, box_top + 5.6, 505, [("Data note:", True, GREY), (" " + m["dataNote"], False, GREY)], 6.8, 9, GREY)
    bh = 8 + nlines * 9
    p.rect(LM, box_top, CW, bh, stroke=RULE, lw=0.5)
    p.rich(45.7, box_top + 5.6, 505, [("Data note:", True, GREY), (" " + m["dataNote"], False, GREY)], 6.8, 9, GREY)
    footer(p, m, 2)


def row_heights(m):
    hs = []
    sp = pdfmetrics.stringWidth(" ", "DV", 7.6)
    def nlines(text, width, bold=False):
        n, w = 1, 0.0
        for wd in text.split(" "):
            ww = pdfmetrics.stringWidth(wd, "DV-B" if bold else "DV", 7.6)
            if w and w + sp + ww > width:
                n += 1; w = ww
            else:
                w += (sp if w else 0) + ww
        return n
    for r in m["scorecard"]:
        lines = max(nlines(r["metrics"], 195), nlines(r["takeaway"], 136), nlines(r["dimension"], 104, True))
        hs.append(18 + (lines - 1) * 10)
    return hs


def main():
    out = sys.argv[1]
    m = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    m["_rowHeights"] = row_heights(m)
    with tempfile.TemporaryDirectory() as tmp:
        c = canvas.Canvas(out, pagesize=(W, H))
        c.setTitle(m["title"]); c.setAuthor("CFO Intelligence"); c.setSubject(m.get("subject", ""))
        page1(Page(c), m, tmp); c.showPage()
        page2(Page(c), m, tmp); c.showPage()
        c.save()


if __name__ == "__main__":
    main()

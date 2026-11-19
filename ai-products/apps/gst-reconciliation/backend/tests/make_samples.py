"""Build a small, fully synthetic GST annual-return package (FY 2024-25) for demos and tests.

    python tests/make_samples.py <out_dir>

Books vs GSTR-2B differences are seeded on purpose: 3 invoices only in books, 2 only in
GSTR-2B and 2 with tax differences. All names and GSTINs are fictional.
"""
from __future__ import annotations

import csv
import random
import sys
from datetime import date, timedelta
from pathlib import Path

import openpyxl
from openpyxl.styles import Font
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "samples")
OUT.mkdir(parents=True, exist_ok=True)
rng = random.Random(2425)

TAXPAYER = ("Shree Ganesh Traders Private Limited (Sample)", "09AABCS1234F1Z5", "Uttar Pradesh")
CUSTOMERS = [("Arora Retail LLP", "09AAJFA1111K1Z2", "Uttar Pradesh"), ("Bharat Engineering Works", "07AABFB2222L1Z8", "Delhi"),
             ("Coastal Foods Pvt Ltd", "27AACCC3333M1Z1", "Maharashtra"), ("Deccan Agro Industries", "36AADCD4444N1Z4", "Telangana"),
             ("Everest Builders", "09AAEFE5555P1Z9", "Uttar Pradesh")]
SUPPLIERS = [("Northline Steel Pvt Ltd", "09AAACN6666Q1Z3", "Uttar Pradesh"), ("Orbit Packaging Co", "07AAFFO7777R1Z6", "Delhi"),
             ("Pioneer Logistics", "09AAGFP8888S1Z0", "Uttar Pradesh"), ("Quantum Office Systems", "06AAHCQ9999T1Z7", "Haryana"),
             ("Rivera Chemicals Ltd", "24AAICR1212U1Z5", "Gujarat"), ("Sterling IT Services", "29AAJCS3434V1Z2", "Karnataka")]
RATES = [5, 12, 18, 18, 18, 28]
START = date(2024, 4, 1)


def tax(taxable: float, rate: int, interstate: bool) -> tuple[float, float, float]:
    t = round(taxable * rate / 100, 2)
    return (t, 0.0, 0.0) if interstate else (0.0, round(t / 2, 2), round(t / 2, 2))


def day(n: int) -> date:
    return START + timedelta(days=n)


# ------------------------------------------------------------------ outward register
outward = []
for i in range(1, 41):
    name, gstin, state = rng.choice(CUSTOMERS)
    b2c = i % 9 == 0
    section = "B2CS" if b2c else "B2B"
    rate = rng.choice(RATES)
    taxable = float(rng.randrange(40_000, 900_000, 500))
    igst, cgst, sgst = tax(taxable, rate, state != TAXPAYER[2] and not b2c)
    outward.append([section, "Walk-in customers" if b2c else name, "" if b2c else gstin, "Uttar Pradesh" if b2c else state,
                    f"SGT/24-25/{i:04d}", day(i * 9), round(taxable + igst + cgst + sgst, 2), taxable, rate, igst, cgst, sgst, 0])
# one credit note
outward.append(["CDNR", CUSTOMERS[1][0], CUSTOMERS[1][1], "Delhi", "SGT/CN/0001", day(200), -59_000.0, -50_000.0, 18, -9_000.0, 0, 0, 0])

wb = openpyxl.Workbook(); ws = wb.active; ws.title = "(Final)"
ws.append(["Supply Outward Register — " + TAXPAYER[0] + " — FY 2024-25"]); ws["A1"].font = Font(bold=True)
ws.append([])
ws.append(["GSTR-1 Section", "Party", "GSTIN / UIN", "Place of Supply", "Doc. No.", "Doc. Date", "Invoice Value", "Taxable Value", "Tax Rates", "IGST", "CGST", "SGST", "Cess"])
for r in outward:
    ws.append(r)
wb.save(OUT / "Supply Outward Register FY2024-25.xlsx")

# ------------------------------------------------------------------ inward register + GSTR-2B
inward, gstr2b = [], []
for i in range(1, 31):
    name, gstin, state = SUPPLIERS[i % len(SUPPLIERS)]
    rate = rng.choice(RATES)
    taxable = float(rng.randrange(20_000, 450_000, 250))
    igst, cgst, sgst = tax(taxable, rate, state != TAXPAYER[2])
    inv = f"{name.split()[0][:3].upper()}/{2400 + i}"
    d = day(i * 11)
    inward.append(["B2B", gstin, name, state, inv, d, round(taxable + igst + cgst + sgst, 2), taxable, rate, igst, cgst, sgst, 0])
    if i in (7, 18, 26):          # supplier has not filed: in books only
        continue
    if i in (4, 21):              # supplier reported different tax
        igst, cgst, sgst = (round(igst * 0.9, 2), round(cgst * 0.9, 2), round(sgst * 0.9, 2))
    gstr2b.append([d.strftime("%b-%Y"), gstin, name, inv, d, round(taxable + igst + cgst + sgst, 2), rate, taxable, igst, cgst, sgst, 0])
for k, (name, gstin, state) in enumerate(SUPPLIERS[3:5], 1):  # in 2B only: not booked yet
    taxable = 64_000.0 * k
    igst, cgst, sgst = tax(taxable, 18, True)
    gstr2b.append([day(300 + k).strftime("%b-%Y"), gstin, name, f"{name.split()[0][:3].upper()}/X{k:02d}", day(300 + k), taxable + igst, 18, taxable, igst, cgst, sgst, 0])

wb = openpyxl.Workbook(); ws = wb.active; ws.title = "ITC Register (Final)"
ws.append(["Supply Inward Register — " + TAXPAYER[0] + " — FY 2024-25"]); ws.append([])
ws.append(["GSTR-2 Section", "GSTIN of Supplier", "Party", "Place of Supply", "Doc. No.", "Doc. Date", "Invoice Value", "Taxable Value", "Tax Rates", "IGST", "CGST", "SGST", "Cess"])
for r in inward:
    ws.append(r)
wb.save(OUT / "Supply Inward Register FY2024-25.xlsx")

wb = openpyxl.Workbook(); ws = wb.active; ws.title = "GSTR-2B Final"
ws.append(["Goods and Services Tax - GSTR-2B (compiled, FY 2024-25)"]); ws.append([])
ws.append(["Return Period", "GSTIN of Supplier", "Trade/Legal name", "Invoice number", "Invoice Date", "Invoice Value", "Rate(%)", "Taxable Value", "Integrated Tax", "Central Tax", "State/UT Tax", "Cess"])
for r in gstr2b:
    ws.append(r)
wb.save(OUT / "GSTR-2B FY2024-25.xlsx")

# ------------------------------------------------------------------ RCM working
wb = openpyxl.Workbook(); ws = wb.active; ws.title = "Sheet1"
ws.append(["Invoice Date", "Invoice Number", "Party", "Taxable Value", "IGST", "CGST", "SGST", "Tax Rate"])
for k in range(1, 5):
    t = 25_000.0 * k
    ws.append([day(60 * k), f"GTA/{k:03d}", "Pioneer Logistics (GTA)", t, 0, round(t * 0.025, 2), round(t * 0.025, 2), 5])
wb.save(OUT / "RCM Working FY2024-25.xlsx")

# ------------------------------------------------------------------ credit ledger (CSV)
with open(OUT / "Electronic Credit Ledger FY2024-25.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["Date", "Reference No.", "Description", "IGST", "CGST", "SGST", "Balance IGST", "Balance CGST", "Balance SGST"])
    bal = [0.0, 0.0, 0.0]
    for m in range(12):
        credit = [round(rng.uniform(20_000, 90_000), 2) for _ in range(3)]
        bal = [round(b + c, 2) for b, c in zip(bal, credit)]
        w.writerow([day(30 * m + 20).isoformat(), f"GSTR3B-{m + 1:02d}", "ITC credited as per GSTR-3B", *credit, *bal])
        used = [round(c * 0.8, 2) for c in credit]
        bal = [round(b - u, 2) for b, u in zip(bal, used)]
        w.writerow([day(30 * m + 20).isoformat(), f"DEBIT-{m + 1:02d}", "Utilised for payment of tax", *[-u for u in used], *bal])


# ------------------------------------------------------------------ GSTR-1 / GSTR-3B annual summaries (text PDFs)
def summary_pdf(path: Path, title: str, rows: list[tuple[str, float, float, float, float]]) -> None:
    c = canvas.Canvas(str(path), pagesize=A4)
    y = 800
    for line, size in ((title, 13), (f"GSTIN: {TAXPAYER[1]}    Legal name: {TAXPAYER[0]}", 9), ("Financial year: 2024-25 (annual summary of monthly returns)", 9)):
        c.setFont("Helvetica-Bold" if size > 10 else "Helvetica", size); c.drawString(40, y, line); y -= 18
    y -= 8
    c.setFont("Helvetica-Bold", 9)
    for x, h in zip((40, 300, 380, 450, 520), ("Description", "Taxable value", "IGST", "CGST", "SGST")):
        c.drawString(x, y, h)
    c.setFont("Helvetica", 9)
    for desc, *vals in rows:
        y -= 16
        c.drawString(40, y, desc)
        for x, v in zip((300, 380, 450, 520), vals):
            c.drawRightString(x + 60, y, f"{v:,.2f}")
    c.showPage(); c.save()


def sums(rows, idx):
    return round(sum(r[idx] for r in rows), 2)


b2b = [r for r in outward if r[0] == "B2B"]; b2c = [r for r in outward if r[0] == "B2CS"]; cdn = [r for r in outward if r[0] == "CDNR"]
summary_pdf(OUT / "GSTR-1 Annual Summary FY2024-25.pdf", "Form GSTR-1 — Annual summary of outward supplies", [
    ("B2B invoices (4A)", sums(b2b, 7), sums(b2b, 9), sums(b2b, 10), sums(b2b, 11)),
    ("B2C small (7)", sums(b2c, 7), sums(b2c, 9), sums(b2c, 10), sums(b2c, 11)),
    ("Credit notes - registered (9B)", sums(cdn, 7), sums(cdn, 9), sums(cdn, 10), sums(cdn, 11)),
    ("Total", sums(outward, 7), sums(outward, 9), sums(outward, 10), sums(outward, 11)),
])
summary_pdf(OUT / "GSTR-3B Annual Summary FY2024-25.pdf", "Form GSTR-3B — Annual summary of monthly returns", [
    ("3.1(a) Outward taxable supplies", sums(outward, 7), sums(outward, 9), sums(outward, 10), sums(outward, 11) - 1250.0),
    ("4(A)(5) All other ITC", sums(inward, 7), sums(inward, 9), sums(inward, 10), sums(inward, 11)),
    ("4(A)(3) Inward supplies liable to reverse charge", 250_000.0, 0, 6_250.0, 6_250.0),
])
print("samples written to", OUT.resolve())

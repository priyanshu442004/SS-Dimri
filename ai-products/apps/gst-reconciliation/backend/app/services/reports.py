from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .official_forms import build_official_bundle
from .official_pdf import create_official_gstr9_pdf, create_official_gstr9c_pdf


TEAL = colors.HexColor("#0B6B5C")
INK = colors.HexColor("#16211F")
MUTED = colors.HexColor("#66716E")
PAPER = colors.HexColor("#F7F5EF")
LINE = colors.HexColor("#D9DED8")
RED = colors.HexColor("#B4493F")
AMBER = colors.HexColor("#B97816")


def money(value: Any) -> str:
    try:
        return f"INR {float(value):,.2f}"
    except (TypeError, ValueError):
        return "-"


def _header_footer(canvas, doc, title: str) -> None:
    canvas.saveState()
    canvas.setFillColor(TEAL)
    canvas.rect(0, A4[1] - 16 * mm, A4[0], 16 * mm, fill=1, stroke=0)
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 9)
    canvas.drawString(18 * mm, A4[1] - 10 * mm, title)
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 8)
    canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, f"Page {doc.page}")
    canvas.restoreState()


def _pdf_styles():
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="TitleGST", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=22, leading=27, textColor=INK, spaceAfter=5 * mm))
    styles.add(ParagraphStyle(name="SubGST", parent=styles["BodyText"], fontSize=9.5, leading=14, textColor=MUTED, spaceAfter=4 * mm))
    styles.add(ParagraphStyle(name="HeadingGST", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=12, leading=16, textColor=INK, spaceBefore=5 * mm, spaceAfter=3 * mm))
    styles.add(ParagraphStyle(name="BodyGST", parent=styles["BodyText"], fontSize=8.5, leading=12, textColor=INK))
    styles.add(ParagraphStyle(name="ValueGST", parent=styles["BodyText"], fontSize=7.2, leading=9, textColor=INK, wordWrap="LTR"))
    styles.add(ParagraphStyle(name="RightGST", parent=styles["BodyText"], fontSize=8.5, leading=12, textColor=INK, alignment=TA_RIGHT))
    return styles


def _table(data: list[list[Any]], widths: list[float] | None = None) -> Table:
    table = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), PAPER),
                ("TEXTCOLOR", (0, 0), (-1, 0), INK),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("LEADING", (0, 0), (-1, -1), 10),
                ("GRID", (0, 0), (-1, -1), 0.35, LINE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return table


def create_gstr9_pdf(result: dict[str, Any], path: Path) -> None:
    styles = _pdf_styles()
    case = result["case"]
    document = SimpleDocTemplate(str(path), pagesize=A4, rightMargin=16 * mm, leftMargin=16 * mm, topMargin=23 * mm, bottomMargin=17 * mm)
    story = [
        Paragraph("GSTR-9 Annual Return Working", styles["TitleGST"]),
        Paragraph(
            f"{case['legal_name']} | GSTIN {case['gstin']} | FY {case['financial_year']}<br/>"
            "AI-assisted mapping with deterministic calculations. Draft for human review; not filed on the GST portal.",
            styles["SubGST"],
        ),
    ]
    metrics = result.get("metrics", {})
    story.append(
        _table(
            [
                ["Annual turnover", "Net ITC", "Documents", "Exceptions"],
                [money(metrics.get("annual_turnover")), money(metrics.get("net_itc")), metrics.get("documents", 0), metrics.get("exceptions", 0)],
            ],
            [42 * mm, 42 * mm, 38 * mm, 38 * mm],
        )
    )
    story.extend([Spacer(1, 4 * mm), Paragraph("GSTR-9 table working", styles["HeadingGST"])])
    gstr9 = result.get("gstr9", {})
    if gstr9.get("available"):
        for sheet, rows in gstr9.get("tables", {}).items():
            story.append(Paragraph(sheet, styles["HeadingGST"]))
            values = [["Code", "Description", "Values"]]
            for row in rows:
                values.append(
                    [
                        row["code"],
                        Paragraph(row["label"], styles["BodyGST"]),
                        Paragraph(" | ".join(money(value) for value in row["values"]), styles["ValueGST"]),
                    ]
                )
            story.append(_table(values, [17 * mm, 94 * mm, 55 * mm]))
    else:
        story.append(Paragraph("Portal GSTR-9 workbook was not available. Source reconciliations were completed, but table population remains DATA NEEDED.", styles["BodyGST"]))
    story.extend([PageBreak(), Paragraph("Exception register", styles["TitleGST"])])
    exception_rows = [["Risk", "Issue", "Count", "Amount", "Recommended action"]]
    for item in result.get("exceptions", []):
        explanation = item.get("explanation", {})
        exception_rows.append(
            [
                item.get("severity", "amber").upper(),
                Paragraph(explanation.get("summary") or item.get("title", ""), styles["BodyGST"]),
                item.get("count", 0),
                money(item.get("amount", 0)),
                Paragraph(explanation.get("action") or item.get("recommended_action", ""), styles["BodyGST"]),
            ]
        )
    story.append(_table(exception_rows, [16 * mm, 52 * mm, 14 * mm, 32 * mm, 52 * mm]))
    story.extend(
        [
            Spacer(1, 6 * mm),
            Paragraph("Controls", styles["HeadingGST"]),
            Paragraph("Every amount in this report comes from parsed source records, the portal draft, or approved manual financial inputs. AI-generated prose cannot alter a return figure.", styles["BodyGST"]),
            Spacer(1, 3 * mm),
            Paragraph("Reviewed by senior before filing: No", styles["BodyGST"]),
        ]
    )
    document.build(story, onFirstPage=lambda c, d: _header_footer(c, d, "GST Annual Return Control Center"), onLaterPages=lambda c, d: _header_footer(c, d, "GST Annual Return Control Center"))


def create_gstr9c_pdf(result: dict[str, Any], path: Path) -> None:
    styles = _pdf_styles()
    case = result["case"]
    document = SimpleDocTemplate(str(path), pagesize=A4, rightMargin=18 * mm, leftMargin=18 * mm, topMargin=23 * mm, bottomMargin=17 * mm)
    story = [
        Paragraph("GSTR-9C Reconciliation Working", styles["TitleGST"]),
        Paragraph(
            f"{case['legal_name']} | GSTIN {case['gstin']} | FY {case['financial_year']}<br/>"
            "Draft reconciliation statement. Independent audited figures require human approval.",
            styles["SubGST"],
        ),
    ]
    gstr9c = result.get("gstr9c", {})
    if gstr9c.get("status") == "DATA NEEDED":
        story.append(_table([["Status", "Missing inputs"], ["DATA NEEDED", ", ".join(gstr9c.get("missing", []))]], [42 * mm, 116 * mm]))
        story.append(Spacer(1, 5 * mm))
        story.append(Paragraph(gstr9c.get("message", "Audited financial inputs are required."), styles["BodyGST"]))
    else:
        sections = [
            ("Table 5 - Turnover reconciliation", gstr9c.get("table_5", {})),
            ("Table 7 - Taxable turnover reconciliation", gstr9c.get("table_7", {})),
            ("Table 12 - ITC reconciliation", gstr9c.get("table_12", {})),
        ]
        for title, values in sections:
            story.append(Paragraph(title, styles["HeadingGST"]))
            rows = [["Particular", "Amount"]]
            rows.extend([[key.replace("_", " ").title(), money(value)] for key, value in values.items()])
            story.append(_table(rows, [108 * mm, 50 * mm]))
    story.extend(
        [
            Spacer(1, 8 * mm),
            Paragraph("Senior review", styles["HeadingGST"]),
            Paragraph("Unreconciled differences must carry an approved explanation and source evidence. The tool never adjusts a GSTR-9C figure merely to force agreement with GSTR-9.", styles["BodyGST"]),
            Spacer(1, 3 * mm),
            Paragraph("Reviewed by senior before filing: No", styles["BodyGST"]),
        ]
    )
    document.build(story, onFirstPage=lambda c, d: _header_footer(c, d, "GST Annual Return Control Center"), onLaterPages=lambda c, d: _header_footer(c, d, "GST Annual Return Control Center"))


def _style_workbook(workbook: Workbook) -> None:
    teal = "0B6B5C"
    pale = "EEF4F1"
    border = Border(bottom=Side(style="thin", color="D9DED8"))
    for worksheet in workbook.worksheets:
        worksheet.freeze_panes = "A2"
        worksheet.sheet_view.showGridLines = False
        for cell in worksheet[1]:
            cell.fill = PatternFill("solid", fgColor=teal)
            cell.font = Font(color="FFFFFF", bold=True)
            cell.alignment = Alignment(vertical="center")
        worksheet.row_dimensions[1].height = 24
        for row in worksheet.iter_rows(min_row=2):
            for cell in row:
                cell.border = border
                if isinstance(cell.value, (int, float)):
                    cell.number_format = '#,##0.00;[Red]-#,##0.00'
        for index, column in enumerate(worksheet.columns, 1):
            values = [len(str(cell.value or "")) for cell in list(column)[:200]]
            worksheet.column_dimensions[get_column_letter(index)].width = min(max(max(values, default=8) + 2, 12), 48)
        worksheet.auto_filter.ref = worksheet.dimensions
        if worksheet.max_row > 2:
            for cell in worksheet[2]:
                cell.fill = PatternFill("solid", fgColor=pale)


def create_gstr9_xlsx(result: dict[str, Any], path: Path) -> None:
    workbook = Workbook()
    summary = workbook.active
    summary.title = "Summary"
    summary.append(["Metric", "Value"])
    for key, value in result.get("metrics", {}).items():
        summary.append([key.replace("_", " ").title(), value])
    for sheet, rows in result.get("gstr9", {}).get("tables", {}).items():
        worksheet = workbook.create_sheet(sheet[:31])
        worksheet.append(["Code", "Description", "Values"])
        for row in rows:
            worksheet.append([row["code"], row["label"], " | ".join(str(value) for value in row["values"])])
    exceptions = workbook.create_sheet("Exceptions")
    exceptions.append(["Risk", "Issue", "Count", "Amount", "Action"])
    for item in result.get("exceptions", []):
        exceptions.append([item.get("severity"), item.get("title"), item.get("count"), item.get("amount"), item.get("recommended_action")])
    _style_workbook(workbook)
    workbook.save(path)


def create_gstr9c_xlsx(result: dict[str, Any], path: Path) -> None:
    workbook = Workbook()
    worksheet = workbook.active
    worksheet.title = "GSTR-9C Working"
    worksheet.append(["Table", "Particular", "Amount / status"])
    gstr9c = result.get("gstr9c", {})
    if gstr9c.get("status") == "DATA NEEDED":
        worksheet.append(["Status", "Missing inputs", ", ".join(gstr9c.get("missing", []))])
    else:
        for table, values in (("5", gstr9c.get("table_5", {})), ("7", gstr9c.get("table_7", {})), ("12", gstr9c.get("table_12", {}))):
            for key, value in values.items():
                worksheet.append([table, key.replace("_", " ").title(), value])
    _style_workbook(workbook)
    workbook.save(path)


def generate_reports(result: dict[str, Any], directory: Path) -> list[str]:
    directory.mkdir(parents=True, exist_ok=True)
    if "official_returns" not in result:
        result["official_returns"] = build_official_bundle(result)
    (directory / "GSTR9_Official_Data.json").write_text(
        json.dumps(result["official_returns"]["gstr9"], indent=2, ensure_ascii=False), encoding="utf-8"
    )
    (directory / "GSTR9C_Official_Data.json").write_text(
        json.dumps(result["official_returns"]["gstr9c"], indent=2, ensure_ascii=False), encoding="utf-8"
    )
    outputs = {
        "GSTR9_Draft_Working.pdf": create_official_gstr9_pdf,
        "GSTR9C_Draft_Working.pdf": create_official_gstr9c_pdf,
        "GSTR9_Draft_Working.xlsx": create_gstr9_xlsx,
        "GSTR9C_Draft_Working.xlsx": create_gstr9c_xlsx,
    }
    for filename, builder in outputs.items():
        builder(result, directory / filename)
    return list(outputs) + ["GSTR9_Official_Data.json", "GSTR9C_Official_Data.json"]

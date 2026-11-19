from __future__ import annotations

import copy
from pathlib import Path
from typing import Any

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


PAGE = landscape(A4)
BLACK = colors.black
GREY = colors.HexColor("#AAA7A7")

GSTR9_TITLES = {
    "4": "Details of advances, inward and outward supplies made during the financial year on which tax is payable",
    "5": "Details of outward supplies made during the financial year on which tax is not payable",
    "6": "Details of ITC availed during the financial year",
    "7": "Details of ITC Reversed and Ineligible ITC for the financial year",
    "8": "Other ITC related information",
    "9": "Details of tax paid as declared in returns filed during the financial year",
    "10": "Particulars of the transactions for the financial year declared in returns of the next financial year till the specified period",
    "14": "Differential tax paid on account of declaration in 10 and 11 above",
    "15": "Particulars of Demands and Refunds",
    "16": "Information on supplies received from composition taxpayers, deemed supply under section 143 and goods sent on approval basis",
    "19": "Late fee payable and paid",
}


def indian_number(value: float | None) -> str:
    if value is None:
        return ""
    number = float(value)
    sign = "-" if number < 0 else ""
    integer, decimal = f"{abs(number):.2f}".split(".")
    if len(integer) > 3:
        head, tail = integer[:-3], integer[-3:]
        groups: list[str] = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        integer = ",".join(groups + [tail])
    return f"{sign}{integer}.{decimal}"


def styles() -> dict[str, ParagraphStyle]:
    sample = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("OfficialTitle", parent=sample["Title"], fontName="Helvetica-Bold", fontSize=14, leading=16, alignment=TA_CENTER, spaceAfter=1.2 * mm),
        "subtitle": ParagraphStyle("OfficialSubtitle", parent=sample["BodyText"], fontName="Helvetica-Bold", fontSize=8, leading=9, alignment=TA_CENTER, spaceAfter=2 * mm),
        "body": ParagraphStyle("OfficialBody", parent=sample["BodyText"], fontName="Helvetica", fontSize=5.8, leading=6.8, alignment=TA_LEFT),
        "small": ParagraphStyle("OfficialSmall", parent=sample["BodyText"], fontName="Helvetica", fontSize=5.1, leading=6.0, alignment=TA_LEFT),
        "header": ParagraphStyle("OfficialHeader", parent=sample["BodyText"], fontName="Helvetica-Bold", fontSize=5.8, leading=6.8, alignment=TA_CENTER),
        "amount": ParagraphStyle("OfficialAmount", parent=sample["BodyText"], fontName="Helvetica", fontSize=5.6, leading=6.5, alignment=TA_RIGHT),
        "declaration": ParagraphStyle("Declaration", parent=sample["BodyText"], fontName="Helvetica", fontSize=6.5, leading=8.5, alignment=TA_LEFT),
    }


def _page(canvas, _document) -> None:
    canvas.saveState()
    if hasattr(canvas, "setFillAlpha"):
        canvas.setFillAlpha(0.28)
    canvas.setFillColor(colors.HexColor("#777777"))
    canvas.setFont("Helvetica-Bold", 86)
    canvas.translate(PAGE[0] / 2, PAGE[1] / 2)
    canvas.rotate(35)
    canvas.drawCentredString(0, -22, "DRAFT")
    canvas.restoreState()


def _basic_details(form: dict[str, Any], style: dict[str, ParagraphStyle]) -> Table:
    header = form["header"]
    labels = [
        ("1", "Financial Year", header.get("financial_year", "")),
        ("2", "GSTIN", header.get("gstin", "")),
        ("3(a)", "Legal Name" if form["form"] == "GSTR-9C" else "Legal name of the registered person", header.get("legal_name", "")),
        ("3(b)", "Trade Name (if any)" if form["form"] == "GSTR-9C" else "Trade name, if any", header.get("trade_name", "")),
        ("3(c)", "ARN", header.get("arn", "")),
        ("3(d)", "ARN Date" if form["form"] == "GSTR-9C" else "Date of Filing", header.get("filing_date", "")),
    ]
    if form["form"] == "GSTR-9C":
        labels.append(("4", "Name of Act. If you are liable to audit under any Act", header.get("audited_under_act", "")))
    data = [[Paragraph("Pt.I", style["header"]), Paragraph("Basic Details", style["header"]), ""]]
    data.extend([[code, Paragraph(label, style["body"]), Paragraph(str(value or "DATA NEEDED"), style["body"])] for code, label, value in labels])
    table = Table(data, colWidths=[12 * mm, 82 * mm, 100 * mm], hAlign="LEFT")
    table.setStyle(TableStyle([
        ("SPAN", (1, 0), (2, 0)), ("GRID", (0, 0), (-1, -1), 0.55, BLACK),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 5.8), ("LEFTPADDING", (0, 0), (-1, -1), 2.5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2.5), ("TOPPADDING", (0, 0), (-1, -1), 1.7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1.7),
    ]))
    return table


def _official_table(section: dict[str, Any], style: dict[str, ParagraphStyle], show_title: bool = True) -> Table:
    columns = list(section.get("columns", [])) or ["Amount"]
    max_values = max((len(item.get("values", [])) for item in section.get("rows", [])), default=len(columns))
    while len(columns) < max_values:
        columns.append(f"Value {len(columns) + 1}")
    data: list[list[Any]] = []
    header_rows = 1
    if show_title:
        data.append([Paragraph(section.get("part", ""), style["header"]), Paragraph(f"{section.get('number', '')} {section.get('title', '')}", style["header"])] + [""] * len(columns))
        header_rows = 2
    data.append([Paragraph("Sr.No", style["header"]), Paragraph("Description", style["header"])] + [Paragraph(name, style["header"]) for name in columns])
    missing_cells: list[tuple[int, int]] = []
    for item in section.get("rows", []):
        row_index = len(data)
        values = list(item.get("values", []))
        values.extend([None] * (len(columns) - len(values)))
        output: list[Any] = [Paragraph(str(item.get("code", "")), style["body"]), Paragraph(str(item.get("description", "")), style["body"])]
        for column_index, value in enumerate(values[: len(columns)], start=2):
            if value is None:
                missing_cells.append((column_index, row_index))
                text = item.get("note", "") if len(columns) == 1 else ""
            else:
                text = indian_number(value)
            output.append(Paragraph(str(text), style["amount"] if value is not None else style["small"]))
        data.append(output)
    usable = PAGE[0] - 36 * mm
    code_width = 11 * mm
    description_width = 100 * mm if len(columns) <= 4 else 78 * mm
    value_width = (usable - code_width - description_width) / len(columns)
    table = Table(data, colWidths=[code_width, description_width] + [value_width] * len(columns), repeatRows=header_rows, hAlign="CENTER", splitByRow=1)
    commands: list[tuple[Any, ...]] = [
        ("GRID", (0, 0), (-1, -1), 0.48, BLACK), ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("FONTNAME", (0, 0), (-1, header_rows - 1), "Helvetica-Bold"),
        ("LEFTPADDING", (0, 0), (-1, -1), 2), ("RIGHTPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING", (0, 0), (-1, -1), 1.25), ("BOTTOMPADDING", (0, 0), (-1, -1), 1.25),
    ]
    if show_title:
        commands.append(("SPAN", (1, 0), (-1, 0)))
    commands.extend(("BACKGROUND", cell, cell, GREY) for cell in missing_cells)
    table.setStyle(TableStyle(commands))
    return table


def _table_map(form: dict[str, Any]) -> dict[str, dict[str, Any]]:
    output: dict[str, dict[str, Any]] = {}
    for original in form.get("tables", []):
        section = copy.deepcopy(original)
        number = str(section.get("number", ""))
        filtered = []
        for item in section.get("rows", []):
            code = str(item.get("code", "")).strip()
            compact = code.replace(" ", "").replace(":", "").lower()
            if compact in {"gstin", "financialyear", "s.no", "hsncode"}:
                continue
            if code.lower().startswith("pt.") or code == number:
                continue
            filtered.append(item)
        section["rows"] = filtered
        if form["form"] == "GSTR-9" and number in GSTR9_TITLES:
            section["title"] = GSTR9_TITLES[number]
        output[number] = section
    if form["form"] == "GSTR-9":
        defaults = {
            "4": ("Pt.II", GSTR9_TITLES["4"], ["Taxable Value", "Central Tax", "State/UT Tax", "Integrated Tax", "Cess"]),
            "5": ("Pt.II", GSTR9_TITLES["5"], ["Taxable Value", "Central Tax", "State/UT Tax", "Integrated Tax", "Cess"]),
            "6": ("Pt.III", GSTR9_TITLES["6"], ["Central Tax", "State/UT Tax", "Integrated Tax", "Cess"]),
            "7": ("Pt.III", GSTR9_TITLES["7"], ["Central Tax", "State/UT Tax", "Integrated Tax", "Cess"]),
            "8": ("Pt.III", GSTR9_TITLES["8"], ["Central Tax", "State/UT Tax", "Integrated Tax", "Cess"]),
            "9": ("Pt.IV", GSTR9_TITLES["9"], ["Tax Payable", "Paid Through Cash", "ITC - Central", "ITC - State/UT", "ITC - Integrated", "ITC - Cess"]),
            "10": ("Pt.V", GSTR9_TITLES["10"], ["Taxable Value", "Central Tax", "State/UT Tax", "Integrated Tax", "Cess"]),
            "14": ("Pt.V", GSTR9_TITLES["14"], ["Payable", "Paid"]),
            "15": ("Pt.VI", GSTR9_TITLES["15"], ["Central Tax", "State/UT Tax", "Integrated Tax", "Cess", "Interest", "Penalty", "Late Fee/Others"]),
            "16": ("Pt.VI", GSTR9_TITLES["16"], ["Taxable Value", "Central Tax", "State/UT Tax", "Integrated Tax", "Cess"]),
            "19": ("Pt.VI", GSTR9_TITLES["19"], ["Payable", "Paid"]),
        }
    else:
        defaults = {
            "5": ("Pt.II", "Reconciliation of Gross Turnover", ["Amount"]),
            "6": ("Pt.II", "Reasons for Un-Reconciled difference in Annual Gross Turnover", ["Reason"]),
            "7": ("Pt.II", "Reconciliation of Taxable Turnover", ["Amount"]),
            "8": ("Pt.II", "Reasons for Un-Reconciled difference in taxable turnover", ["Reason"]),
            "9": ("Pt.III", "Reconciliation of rate wise liability and amount payable thereon", ["Taxable Value", "Central Tax", "State/UT Tax", "Integrated Tax", "Cess"]),
            "10": ("Pt.III", "Reasons for un-reconciled payment of amount", ["Reason"]),
            "11": ("Pt.III", "Additional amount payable but not paid", ["Taxable Value", "Central Tax", "State/UT Tax", "Integrated Tax", "Cess"]),
            "12": ("Pt.IV", "Reconciliation of Net Input Tax Credit (ITC)", ["Amount"]),
            "13": ("Pt.IV", "Reasons for un-reconciled difference in ITC", ["Reason"]),
            "14": ("Pt.IV", "Reconciliation of ITC declared in Annual Return with audited expenses", ["Value", "Total ITC", "Eligible ITC"]),
            "15": ("Pt.IV", "Reasons for un-reconciled difference in ITC", ["Reason"]),
            "16": ("Pt.IV", "Tax payable on un-reconciled difference in ITC", ["Amount Payable"]),
            "17": ("Pt.V", "Additional Liability due to non-reconciliation", ["Value", "Central Tax", "State/UT Tax", "Integrated Tax", "Cess"]),
        }
    for number, (part, title, columns) in defaults.items():
        output.setdefault(number, {"number": number, "part": part, "title": title, "columns": columns, "rows": []})
    return output


def _slice(section: dict[str, Any], start: int | None = None, end: int | None = None) -> dict[str, Any]:
    result = copy.deepcopy(section)
    result["rows"] = result.get("rows", [])[start:end]
    return result


def _amount_note(style: dict[str, ParagraphStyle]) -> Paragraph:
    return Paragraph("(Amount in Rs. in all tables)", ParagraphStyle("Currency", parent=style["body"], alignment=TA_RIGHT))


def _add(story: list[Any], section: dict[str, Any], style: dict[str, ParagraphStyle], start: int | None = None, end: int | None = None, show_title: bool = True, gap: float = 2.4) -> None:
    story.append(_official_table(_slice(section, start, end), style, show_title=show_title))
    story.append(Spacer(1, gap * mm))


def _title_block(form_name: str, style: dict[str, ParagraphStyle]) -> list[Any]:
    return [Paragraph(f"Form {form_name}", style["title"]), Paragraph("[See rule 80]" if form_name == "GSTR-9" else "See rule 80(3)", style["small"]), Paragraph("Annual Return" if form_name == "GSTR-9" else "Reconciliation Statement<br/>PART - A", style["subtitle"])]


def _basic_signature(form: dict[str, Any], style: dict[str, ParagraphStyle]) -> Table:
    data = [
        [Paragraph(f"Date: {form.get('declaration_date') or 'DATA NEEDED'}", style["body"]), Paragraph("Name of the Authorised Signatory", style["header"])],
        ["", Paragraph(form.get("signatory_name") or "DATA NEEDED", style["body"])],
        ["", Paragraph("Designation/Status", style["header"])],
        ["", Paragraph(form.get("signatory_designation") or "DATA NEEDED", style["body"])],
    ]
    table = Table(data, colWidths=[175 * mm, 68 * mm])
    table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("ALIGN", (1, 0), (1, -1), "CENTER"), ("TOPPADDING", (0, 0), (-1, -1), 2)]))
    return table


def _verification_page(form: dict[str, Any], style: dict[str, ParagraphStyle]) -> list[Any]:
    if form["form"] == "GSTR-9":
        heading = "Verification:"
        text = "I hereby solemnly affirm and declare that the information given herein above is true and correct to the best of my knowledge and belief and nothing has been concealed there from and in case of any reduction in output tax liability the benefit thereof has been/will be passed on to the recipient of supply."
    else:
        heading = "Verification of registered person:"
        text = "I hereby solemnly affirm and declare that the information given herein above is true and correct and nothing has been concealed there from. I am uploading this self-certified reconciliation statement in FORM GSTR-9C. I am also uploading other statements, as applicable, including financial statement, profit and loss account and balance sheet etc."
    return [Paragraph(heading, style["declaration"]), Spacer(1, 2 * mm), Paragraph(text, style["declaration"]), Spacer(1, 9 * mm), _basic_signature(form, style)]


def _gstr9_story(form: dict[str, Any], style: dict[str, ParagraphStyle]) -> list[Any]:
    t = _table_map(form)
    story: list[Any] = _title_block("GSTR-9", style) + [_basic_details(form, style), Spacer(1, 3 * mm), Paragraph("Pt. II - Details of outward and inward supplies made during the financial year", style["subtitle"]), _amount_note(style)]
    _add(story, t["4"], style, 0, 7)
    story.append(PageBreak())
    _add(story, t["4"], style, 7, None, show_title=False)
    _add(story, t["5"], style, 0, 5)
    story.append(PageBreak())
    _add(story, t["5"], style, 5, None, show_title=False)
    story.append(Paragraph("Pt. III - Details of ITC for the financial year", style["subtitle"]))
    _add(story, t["6"], style, 0, 2)
    story.append(PageBreak())
    _add(story, t["6"], style, 2, None, show_title=False)
    story.append(PageBreak())
    _add(story, t["7"], style)
    _add(story, t["8"], style, 0, 4)
    story.append(PageBreak())
    _add(story, t["8"], style, 4, None, show_title=False)
    _add(story, t["9"], style)
    _add(story, t["10"], style, 0, 1)
    story.append(PageBreak())
    _add(story, t["10"], style, 1, None, show_title=False)
    _add(story, t["14"], style)
    _add(story, t["15"], style, 0, 4)
    story.append(PageBreak())
    _add(story, t["15"], style, 4, None, show_title=False)
    _add(story, t["16"], style)
    story += [Paragraph("17. HSN Wise Summary of outward supplies.", style["body"]), Spacer(1, 1.5 * mm), Paragraph("18. HSN Wise Summary of inward supplies.", style["body"]), Spacer(1, 2 * mm)]
    _add(story, t["19"], style)
    story.append(PageBreak())
    story.extend(_verification_page(form, style))
    return story


def _gstr9c_story(form: dict[str, Any], style: dict[str, ParagraphStyle]) -> list[Any]:
    t = _table_map(form)
    story: list[Any] = _title_block("GSTR-9C", style) + [_basic_details(form, style), Spacer(1, 3 * mm), Paragraph("Reconciliation of turnover declared in audited Annual Financial Statement with turnover declared in Annual Return (GSTR-9)", style["subtitle"]), _amount_note(style)]
    _add(story, t["5"], style, 0, 5)
    story.append(PageBreak())
    _add(story, t["5"], style, 5, None, show_title=False)
    _add(story, t["6"], style)
    _add(story, t["7"], style, 0, 4)
    story.append(PageBreak())
    _add(story, t["7"], style, 4, None, show_title=False)
    _add(story, t["8"], style)
    story.append(Paragraph("Pt.III - Reconciliation of tax paid", style["subtitle"]))
    _add(story, t["9"], style, 0, 13)
    story.append(PageBreak())
    _add(story, t["9"], style, 13, None, show_title=False)
    _add(story, t["10"], style)
    _add(story, t["11"], style, 0, 4)
    story.append(PageBreak())
    _add(story, t["11"], style, 4, None, show_title=False)
    story.append(Paragraph("Pt. IV - Reconciliation of Input Tax Credit (ITC)", style["subtitle"]))
    _add(story, t["12"], style)
    _add(story, t["13"], style)
    story.append(PageBreak())
    _add(story, t["14"], style, 0, 19)
    story.append(PageBreak())
    _add(story, t["14"], style, 19, None, show_title=False)
    _add(story, t["15"], style)
    _add(story, t["16"], style)
    _add(story, t["17"], style, 0, 0)
    story.append(PageBreak())
    _add(story, t["17"], style, 0, None, show_title=False)
    story.append(PageBreak())
    story.extend(_verification_page(form, style))
    return story


def create_official_pdf(form: dict[str, Any], path: Path) -> None:
    style = styles()
    document = SimpleDocTemplate(str(path), pagesize=PAGE, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=10 * mm, bottomMargin=10 * mm, title=f"Form {form['form']}", author="GST Annual Return AI")
    story = _gstr9_story(form, style) if form["form"] == "GSTR-9" else _gstr9c_story(form, style)
    document.build(story, onFirstPage=_page, onLaterPages=_page)


def create_official_gstr9_pdf(result: dict[str, Any], path: Path) -> None:
    create_official_pdf(result["official_returns"]["gstr9"], path)


def create_official_gstr9c_pdf(result: dict[str, Any], path: Path) -> None:
    create_official_pdf(result["official_returns"]["gstr9c"], path)

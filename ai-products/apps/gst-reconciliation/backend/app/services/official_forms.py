from __future__ import annotations

import copy
import re
from typing import Any


TAX_COLUMNS = ["Taxable Value", "Central Tax", "State/UT Tax", "Integrated Tax", "Cess"]
ITC_COLUMNS = ["Central Tax", "State/UT Tax", "Integrated Tax", "Cess"]


def row(
    code: str,
    description: str,
    values: list[float | None],
    source: str = "calculated",
    status: str = "populated",
    note: str = "",
) -> dict[str, Any]:
    return {
        "code": code,
        "description": description,
        "values": [round(float(value), 2) if value is not None else None for value in values],
        "note": note,
        "source": source,
        "status": status,
    }


def table(number: str, part: str, title: str, columns: list[str], rows: list[dict[str, Any]]) -> dict[str, Any]:
    return {"number": number, "part": part, "title": title, "columns": columns, "rows": rows}


def _part_for_gstr9(number: int) -> str:
    if number <= 5:
        return "Pt. II"
    if number <= 8:
        return "Pt. III"
    if number == 9:
        return "Pt. IV"
    if number <= 14:
        return "Pt. V"
    return "Pt. VI"


def _columns_for_gstr9(number: int) -> list[str]:
    if number in {4, 5, 10, 11, 16, 17, 18}:
        return TAX_COLUMNS
    if number in {6, 7, 8}:
        return ITC_COLUMNS
    if number == 9:
        return ["Tax Payable", "Paid Through Cash", "ITC - Central", "ITC - State/UT", "ITC - Integrated", "ITC - Cess"]
    if number == 14:
        return ["Payable", "Paid"]
    if number == 15:
        return ["Central Tax", "State/UT Tax", "Integrated Tax", "Cess", "Interest", "Penalty", "Late Fee/Others"]
    if number == 19:
        return ["Payable", "Paid"]
    return ["Amount"]


def build_gstr9(result: dict[str, Any]) -> dict[str, Any]:
    case = result["case"]
    financial = result.get("financial_inputs", {})
    tables: list[dict[str, Any]] = []
    for name, source_rows in result.get("gstr9", {}).get("tables", {}).items():
        match = re.match(r"\s*(\d+)", name)
        if not match:
            continue
        number = int(match.group(1))
        title = name[match.end():].strip(" -") or f"Table {number}"
        rows = [
            row(
                str(item.get("code", "")),
                str(item.get("label", "")),
                list(item.get("values", [])),
                source=str(item.get("source") or "portal GSTR-9 workbook"),
                status="data_needed" if all(value is None for value in item.get("values", [])) else "populated",
                note="DATA NEEDED - approved supporting working required." if all(value is None for value in item.get("values", [])) else "",
            )
            for item in source_rows
        ]
        tables.append(table(str(number), _part_for_gstr9(number), title, _columns_for_gstr9(number), rows))
    tables.sort(key=lambda item: int(item["number"]) if item["number"].isdigit() else 999)
    return {
        "form": "GSTR-9",
        "status": "DRAFT - HUMAN REVIEW REQUIRED",
        "header": {
            "financial_year": case["financial_year"],
            "gstin": case["gstin"],
            "legal_name": case["legal_name"],
            "trade_name": financial.get("trade_name") or case["legal_name"],
            "arn": financial.get("arn", ""),
            "filing_date": financial.get("filing_date", ""),
            "audited_under_act": financial.get("audited_under_act", "Companies Act"),
        },
        "tables": tables,
        "declaration_text": "I hereby declare that the information in this draft working has been reviewed against the source records. This document is not a filed return.",
        "signatory_name": financial.get("signatory_name", ""),
        "signatory_designation": financial.get("signatory_designation", ""),
        "declaration_date": financial.get("filing_date", ""),
    }


def _reason_rows(result: dict[str, Any], title_contains: str = "") -> list[dict[str, Any]]:
    items = []
    for index, item in enumerate(result.get("exceptions", []), 1):
        title = str(item.get("title", ""))
        if title_contains and title_contains.lower() not in title.lower():
            continue
        explanation = item.get("explanation", {})
        text = explanation.get("summary") or title
        items.append(row(chr(64 + min(index, 26)), text, [None], source="exception register", status="review"))
    return items or [row("A", "DATA NEEDED - add an approved reason if an unreconciled amount remains.", [None], source="human input", status="data_needed")]


def build_gstr9c(result: dict[str, Any]) -> dict[str, Any]:
    case = result["case"]
    financial = result.get("financial_inputs", {})
    g9c = result.get("gstr9c", {})
    t5 = g9c.get("table_5", {})
    t7 = g9c.get("table_7", {})
    t12 = g9c.get("table_12", {})
    missing = g9c.get("status") == "DATA NEEDED"
    na = None
    table5 = [
        row("A", "Turnover (including exports) as per audited Annual Financial Statements", [financial.get("audited_turnover")], "approved audited input", "data_needed" if financial.get("audited_turnover") is None else "populated"),
        row("B", "Unbilled revenue at the beginning of the financial year", [financial.get("opening_unbilled_revenue", 0)]),
        row("C", "Unadjusted advances at the end of the financial year", [financial.get("closing_unadjusted_advances", 0)]),
        row("D", "Deemed supply under Schedule I", [na], "human input", "data_needed"),
        row("E", "Credit notes issued after the end of the financial year but reflected in the annual return", [na], "human input", "data_needed"),
        row("F", "Trade discounts accounted for in audited statements but not permissible under GST", [financial.get("trade_discount_adjustment", 0)]),
        row("G", "Turnover from the transition period", [na], "human input", "not_applicable"),
        row("H", "Unbilled revenue at the end of the financial year", [financial.get("closing_unbilled_revenue", 0)]),
        row("I", "Unadjusted advances at the beginning of the financial year", [financial.get("opening_unadjusted_advances", 0)]),
        row("J", "Credit notes accounted for in audited statements but not permissible under GST", [na], "human input", "data_needed"),
        row("K", "Adjustments for supply of goods by SEZ units to DTA units", [na], "human input", "not_applicable"),
        row("L", "Turnover for the period under composition scheme", [na], "human input", "not_applicable"),
        row("M", "Adjustments in turnover under section 15 and rules thereunder", [na], "human input", "data_needed"),
        row("N", "Adjustments in turnover due to foreign exchange fluctuations", [na], "human input", "data_needed"),
        row("O", "Other turnover adjustments", [financial.get("other_turnover_adjustment", 0)]),
        row("P", "Annual turnover after adjustments", [t5.get("adjusted_turnover")], "Python calculation", "data_needed" if missing else "populated"),
        row("Q", "Turnover as declared in Annual Return (GSTR-9)", [t5.get("gstr9_turnover")], "portal GSTR-9", "data_needed" if missing else "populated"),
        row("R", "Unreconciled turnover (Q - P)", [t5.get("unreconciled_turnover")], "Python calculation", "data_needed" if missing else "populated"),
    ]
    table7 = [
        row("A", "Annual turnover after adjustments", [t5.get("adjusted_turnover")]),
        row("B", "Exempted, nil-rated, non-GST and no-supply turnover", [financial.get("exempt_nil_non_gst_turnover", 0)]),
        row("C", "Zero-rated supplies without payment of tax", [financial.get("zero_rated_without_tax", 0)]),
        row("D", "Supplies on which tax is payable by the recipient under reverse charge", [financial.get("recipient_rcm_turnover", 0)]),
        row("E", "Taxable turnover after adjustments", [t7.get("reconciled_taxable_turnover")]),
        row("F", "Taxable turnover declared in Annual Return (GSTR-9)", [t7.get("gstr9_taxable_turnover")]),
        row("G", "Unreconciled taxable turnover", [t7.get("unreconciled_taxable_turnover")]),
    ]
    # The portal's GSTR-9 table 9 is a tax-payment table, not the rate-wise
    # liability table required by GSTR-9C. Keep the statutory GSTR-9C row set
    # fixed and allow unavailable rate splits to remain explicitly blank.
    rate_labels = (
        ("A", "5%"), ("B", "5% (RC)"), ("B1", "6%"), ("C", "12%"),
        ("D", "12% (RC)"), ("E", "18%"), ("F", "18% (RC)"),
        ("G", "28%"), ("H", "28% (RC)"), ("I", "3%"),
        ("J", "0.25%"), ("K", "0.10%"), ("L", "Interest"),
        ("M", "Late Fee"), ("N", "Penalty"), ("O", "Others"),
        ("P", "Total amount to be paid as per tables above"),
        ("Q", "Total amount paid as declared in Annual Return (GSTR-9)"),
        ("R", "Un-reconciled payment of amount"),
    )
    rate_rows = [row(code, label, [na, na, na, na, na], "tax-rate working", "data_needed") for code, label in rate_labels]
    additional_tax_labels = (
        ("A", "5%"), ("A1", "6%"), ("B", "12%"), ("C", "18%"),
        ("D", "28%"), ("E", "3%"), ("F", "0.25%"), ("G", "0.10%"),
        ("G1", "Others"), ("H", "Interest"), ("I", "Late Fee"),
        ("J", "Penalty"), ("K", "Others (please specify)"),
    )
    table11 = [row(code, label, [0, 0, 0, 0, 0]) for code, label in additional_tax_labels]
    table12 = [
        row("A", "ITC availed as per audited Annual Financial Statements", [financial.get("book_itc")], "approved audited input", "data_needed" if financial.get("book_itc") is None else "populated"),
        row("B", "ITC booked in earlier financial years claimed in the current financial year", [financial.get("prior_year_itc_claimed", 0)]),
        row("C", "ITC booked in the current financial year to be claimed in subsequent financial years", [financial.get("current_year_itc_claimed_later", 0)]),
        row("D", "ITC availed as per audited financial statements or books of account", [t12.get("adjusted_book_itc")]),
        row("E", "ITC claimed in Annual Return (GSTR-9)", [t12.get("gstr9_net_itc")]),
        row("F", "Unreconciled ITC", [t12.get("unreconciled_itc")]),
    ]
    expense_labels = ["Purchases", "Freight / Carriage", "Power and fuel", "Imported goods", "Rent and Insurance", "Goods lost, stolen, destroyed, written off or disposed by gift/free samples", "Royalties", "Employees' Cost", "Conveyance charges", "Bank Charges", "Entertainment charges", "Stationery Expenses", "Repair and Maintenance", "Other Miscellaneous expenses", "Capital goods"] + [f"Any other expense {index}" for index in range(1, 11)]
    expense_rows = [row(chr(65 + index) if index < 17 else f"Q{index - 16}", label, [na, na, na], "audited expense ledger", "data_needed") for index, label in enumerate(expense_labels)]
    expense_rows.extend([row("R", "Total eligible ITC availed", [na, na, na], "Python calculation", "data_needed"), row("S", "ITC claimed in Annual Return (GSTR-9)", [na, na, t12.get("gstr9_net_itc")], "portal GSTR-9"), row("T", "Unreconciled ITC", [na, na, na], "Python calculation", "data_needed")])
    liability_rows = [row(code, label, [0], "Python calculation") for code, label in (("A", "Central Tax"), ("B", "State/UT Tax"), ("C", "Integrated Tax"), ("D", "Cess"), ("E", "Interest"), ("F", "Penalty"))]
    additional_rows = [row(code, label, [na, na, na, na, na], "human input", "data_needed") for code, label in (("A", "5%"), ("A1", "6%"), ("B", "12%"), ("C", "18%"), ("D", "28%"), ("E", "3%"), ("F", "0.25%"), ("G", "0.10%"), ("G1", "Others"), ("H", "Input Tax Credit"), ("I", "Interest"), ("J", "Late Fee"), ("K", "Penalty"), ("L", "Other amount paid for supplies not included in Annual Return"), ("M", "Erroneous refund to be paid back"), ("N", "Outstanding demands to be settled"), ("O", "Other") )]
    tables = [
        table("5", "Pt. II", "Reconciliation of Gross Turnover", ["Amount"], table5),
        table("6", "Pt. II", "Reasons for unreconciled difference in Annual Gross Turnover", ["Reason"], _reason_rows(result, "turnover")),
        table("7", "Pt. II", "Reconciliation of Taxable Turnover", ["Amount"], table7),
        table("8", "Pt. II", "Reasons for unreconciled difference in taxable turnover", ["Reason"], _reason_rows(result, "turnover")),
        table("9", "Pt. III", "Reconciliation of rate-wise liability and amount payable", ["Taxable Value", "Central Tax", "State/UT Tax", "Integrated Tax", "Cess"], rate_rows),
        table("10", "Pt. III", "Reasons for unreconciled payment of amount", ["Reason"], _reason_rows(result)),
        table("11", "Pt. III", "Additional amount payable but not paid", TAX_COLUMNS, table11),
        table("12", "Pt. IV", "Reconciliation of Net Input Tax Credit (ITC)", ["Amount"], table12),
        table("13", "Pt. IV", "Reasons for unreconciled difference in ITC", ["Reason"], _reason_rows(result, "ITC")),
        table("14", "Pt. IV", "Reconciliation of ITC declared in Annual Return with audited expenses", ["Value", "Total ITC", "Eligible ITC"], expense_rows),
        table("15", "Pt. IV", "Reasons for unreconciled difference in ITC", ["Reason"], _reason_rows(result, "ITC")),
        table("16", "Pt. IV", "Tax payable on unreconciled difference in ITC", ["Amount Payable"], liability_rows),
        table("17", "Pt. V", "Additional Liability due to non-reconciliation", ["Value", "Central Tax", "State/UT Tax", "Integrated Tax", "Cess"], additional_rows),
    ]
    return {
        "form": "GSTR-9C",
        "status": "DRAFT - HUMAN REVIEW REQUIRED" if not missing else "DATA NEEDED",
        "header": {
            "financial_year": case["financial_year"],
            "gstin": case["gstin"],
            "legal_name": case["legal_name"],
            "trade_name": financial.get("trade_name") or case["legal_name"],
            "arn": financial.get("gstr9c_arn") or financial.get("arn", ""),
            "filing_date": financial.get("gstr9c_arn_date") or financial.get("filing_date", ""),
            "audited_under_act": financial.get("audited_under_act", "Companies Act"),
        },
        "tables": tables,
        "declaration_text": "I hereby declare that this draft reconciliation statement has been prepared from the supplied records. Human approval is required before filing.",
        "signatory_name": financial.get("signatory_name", ""),
        "signatory_designation": financial.get("signatory_designation", ""),
        "declaration_date": financial.get("gstr9c_arn_date") or financial.get("filing_date", ""),
    }


def build_official_bundle(result: dict[str, Any]) -> dict[str, Any]:
    return {"gstr9": build_gstr9(result), "gstr9c": build_gstr9c(result)}


def lock_calculated_values(baseline: dict[str, Any], candidate: dict[str, Any]) -> dict[str, Any]:
    """Accept model-authored structured JSON while preventing it from changing any numeric figure."""
    output = copy.deepcopy(baseline)
    for form_name in ("gstr9", "gstr9c"):
        candidate_form = candidate.get(form_name, {})
        candidate_tables = {item.get("number"): item for item in candidate_form.get("tables", [])}
        for target_table in output[form_name]["tables"]:
            proposed = candidate_tables.get(target_table["number"], {})
            proposed_rows = {item.get("code"): item for item in proposed.get("rows", [])}
            for target_row in target_table["rows"]:
                proposed_row = proposed_rows.get(target_row["code"])
                if proposed_row:
                    target_row["note"] = str(proposed_row.get("note") or target_row["note"])
        output[form_name]["status"] = baseline[form_name]["status"]
    return output

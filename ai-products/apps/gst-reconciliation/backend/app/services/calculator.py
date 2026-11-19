from __future__ import annotations

import re
import uuid
from collections import defaultdict
from typing import Any


MONEY_FIELDS = ("taxable_value", "invoice_value", "igst", "cgst", "sgst", "cess")


def total(records: list[dict[str, Any]], field: str) -> float:
    return round(sum(float(record.get(field) or 0) for record in records), 2)


def invoice_key(record: dict[str, Any], gstin_field: str) -> tuple[str, str]:
    gstin = re.sub(r"[^A-Z0-9]", "", str(record.get(gstin_field) or "").upper())
    invoice = re.sub(r"[^A-Z0-9]", "", str(record.get("invoice_number") or "").upper())
    return gstin, invoice


def records_for(normalized: list[dict[str, Any]], role: str) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for document in normalized:
        if document.get("role") == role and document.get("kind") == "records":
            for record in document.get("records", []):
                records.append({**record, "_file_id": document.get("file_id"), "_file_name": document.get("file_name")})
    return records


def document_for(normalized: list[dict[str, Any]], role: str) -> dict[str, Any] | None:
    return next((document for document in normalized if document.get("role") == role), None)


def _tax_values(record: dict[str, Any]) -> list[float]:
    """Return statutory GSTR-9 tax columns in their official order."""
    return [
        round(float(record.get("taxable_value") or 0), 2),
        round(float(record.get("cgst") or 0), 2),
        round(float(record.get("sgst") or 0), 2),
        round(float(record.get("igst") or 0), 2),
        round(float(record.get("cess") or 0), 2),
    ]


def _sum_tax(records: list[dict[str, Any]]) -> list[float]:
    return [round(sum(_tax_values(item)[index] for item in records), 2) for index in range(5)]


def _sum_itc(records: list[dict[str, Any]]) -> list[float]:
    # The GSTR-9 ITC order is CGST, SGST/UTGST, IGST, Cess.
    return [
        round(sum(float(item.get(field) or 0) for item in records), 2)
        for field in ("cgst", "sgst", "igst", "cess")
    ]


def _statutory_row(code: str, label: str, values: list[float | None], source: str) -> dict[str, Any]:
    return {"code": code, "label": label, "values": values, "source": source}


def _tax_rate_control(document: dict[str, Any] | None) -> list[float] | None:
    """Read the signed grand-total control from the tax-rate outward working."""
    if not document or document.get("kind") != "workbook_tables":
        return None
    for rows in document.get("sheets", {}).values():
        for source_row in rows:
            text = " ".join(str(value or "") for value in source_row).upper()
            if "GRAND TOTAL" not in text:
                continue
            values = [float(value) for value in source_row if isinstance(value, (int, float))]
            if len(values) >= 4:
                # Source order: taxable value, IGST, CGST, SGST.
                return [round(values[0], 2), round(values[2], 2), round(values[3], 2), round(values[1], 2), 0.0]
    return None


def _source_gstr9(outward: list[dict[str, Any]], inward: list[dict[str, Any]], gstr2b: list[dict[str, Any]], rcm: list[dict[str, Any]], outward_control: list[float] | None = None) -> dict[str, Any]:
    """Build the GSTR-9 table grid from the supplied workpapers.

    The old implementation only displayed a separately uploaded portal workbook.  The
    annual-return package supplied by users normally contains registers and control
    schedules instead, so retain the statutory row structure and calculate only the
    rows that can be evidenced by those schedules.  A blank value is intentional: it
    means that a statutory row needs a separate approved working, not that it is zero.
    """
    def section(record: dict[str, Any]) -> str:
        return re.sub(r"[^A-Z0-9]", "", str(record.get("supply_type") or "").upper())

    outward_groups = {
        "A": [item for item in outward if section(item) in {"B2CS", "B2CL"}],
        "B": [item for item in outward if section(item) == "B2B"],
        "C": [item for item in outward if section(item).startswith("EXP")],
        "D": [item for item in outward if section(item).startswith("SEZ")],
        "E": [item for item in outward if section(item) in {"DEXP", "DEEMEDEXPORT"}],
        "G": [item for item in outward if "RCM" in section(item)],
        "I": [item for item in outward if section(item) in {"CDNR", "CDNUR", "CRN", "CREDITNOTE"}],
        "J": [item for item in outward if section(item) in {"DNR", "DNUR", "DEBITNOTE"}],
    }
    outward_rows = [
        _statutory_row("A", "Supplies made to unregistered persons (B2C)", _sum_tax(outward_groups["A"]), "outward register"),
        _statutory_row("B", "Supplies made to registered persons (B2B)", _sum_tax(outward_groups["B"]), "outward register"),
        _statutory_row("C", "Zero rated supply (Export) on payment of tax", _sum_tax(outward_groups["C"]), "outward register"),
        _statutory_row("D", "Supply to SEZs on payment of tax", _sum_tax(outward_groups["D"]), "outward register"),
        _statutory_row("E", "Deemed exports on payment of tax", _sum_tax(outward_groups["E"]), "outward register"),
        _statutory_row("F", "Advances on which tax has been paid but invoice has not been issued", [None] * 5, "DATA NEEDED - advance register"),
        _statutory_row("G", "Inward supplies on which tax is to be paid on reverse charge basis", _sum_tax(outward_groups["G"]), "outward register"),
        _statutory_row("H", "Sub-total (A to G above)", _sum_tax(sum((outward_groups[key] for key in "ABCDEG"), [])), "calculated from outward register"),
        _statutory_row("I", "Credit Notes issued in respect of transactions specified in A to F above", _sum_tax(outward_groups["I"]), "outward register"),
        _statutory_row("J", "Debit Notes issued in respect of transactions specified in A to F above", _sum_tax(outward_groups["J"]), "outward register"),
        _statutory_row("K", "Supplies/tax declared through Amendments (+)", [None] * 5, "DATA NEEDED - amendment working"),
        _statutory_row("L", "Supplies/tax reduced through Amendments (-)", [None] * 5, "DATA NEEDED - amendment working"),
        _statutory_row("M", "Sub-total (I to L above)", [None] * 5, "DATA NEEDED - amendment working"),
        _statutory_row("N", "Supplies and advances on which tax is to be paid (H + M above)", outward_control or _sum_tax(outward), "tax-rate outward control" if outward_control else "calculated from outward register"),
    ]
    rcm_itc = _sum_itc(rcm)
    inward_itc = _sum_itc(inward)
    gstr2b_itc = _sum_itc(gstr2b)
    total_itc = [round(inward_itc[index], 2) for index in range(4)]
    net_itc = [round(total_itc[index] - rcm_itc[index], 2) for index in range(4)]
    tables = {
        "4 Outward": outward_rows,
        "5 Outward non-taxable": [
            _statutory_row(code, label, [None] * 5, "DATA NEEDED - nature of supply working")
            for code, label in (("A", "Zero rated supply (Export) without payment of tax"), ("B", "Supply to SEZs without payment of tax"), ("C", "Supplies on which tax is to be paid by recipient on reverse charge basis"), ("D", "Exempted"), ("E", "Nil rated"), ("F", "Non-GST supply"), ("G", "Sub-total (A to F above)"), ("H", "Credit Notes"), ("I", "Debit Notes"), ("J", "Supplies declared through Amendments (+)"), ("K", "Supplies reduced through Amendments (-)"), ("L", "Sub-total (H to K above)"), ("M", "Turnover on which tax is not to be paid (G + L above)"))
        ],
        "6 ITC availed": [
            _statutory_row("A", "Total amount of input tax credit availed through FORM GSTR-3B", total_itc, "inward register"),
            _statutory_row("B", "Inward supplies (other than imports and inward supplies liable to reverse charge but includes services received from SEZs)", net_itc, "inward register less RCM working"),
            _statutory_row("C", "Inward supplies received from unregistered persons liable to reverse charge", rcm_itc, "RCM working"),
            _statutory_row("D", "Import of goods (including supplies from SEZs)", [0, 0, 0, 0], "no import ledger supplied"),
            _statutory_row("E", "Import of services (excluding inward supplies from SEZs)", [0, 0, 0, 0], "no import ledger supplied"),
            _statutory_row("F", "Input Tax credit received from ISD", [0, 0, 0, 0], "no ISD ledger supplied"),
            _statutory_row("G", "Transition Credit through TRAN-I", [0, 0, 0, 0], "not applicable to FY 2023-24"),
            _statutory_row("H", "Transition Credit through TRAN-II", [0, 0, 0, 0], "not applicable to FY 2023-24"),
            _statutory_row("I", "Any other ITC availed but not specified above", [0, 0, 0, 0], "no other ITC working supplied"),
            _statutory_row("J", "Sub-total (B to I above)", total_itc, "calculated from source workings"),
            _statutory_row("K", "Transition Credit through TRAN-I (including revisions)", [0, 0, 0, 0], "not applicable to FY 2023-24"),
            _statutory_row("L", "Transition Credit through TRAN-II (including revisions)", [0, 0, 0, 0], "not applicable to FY 2023-24"),
            _statutory_row("M", "ITC reclaimed which was reversed under Table 4(B)(2) in earlier tax period", [None] * 4, "DATA NEEDED - ITC reversal working"),
            _statutory_row("N", "Sub-total (K to M above)", [None] * 4, "DATA NEEDED - ITC reversal working"),
            _statutory_row("O", "Difference (J - N)", [None] * 4, "DATA NEEDED - ITC reversal working"),
        ],
        "7 ITC Rev": [_statutory_row(code, label, [None] * 4, "DATA NEEDED - ITC reversal working") for code, label in (("A", "As per Rule 37"), ("B", "As per Rule 39"), ("C", "As per Rule 42"), ("D", "As per Rule 43"), ("E", "As per section 17(5)"), ("F", "Reversal of TRAN-I credit"), ("G", "Reversal of TRAN-II credit"), ("H", "Other reversals"), ("I", "Total ITC Reversed (A to H above)"), ("J", "Net ITC Available for Utilization (6O - 7I)"))],
        "8 Other ITC": [
            _statutory_row("A", "ITC as per GSTR-2B", gstr2b_itc, "compiled GSTR-2B / Table 8 reconciliation"),
            _statutory_row("B", "ITC as per Table 6(B) and 6(H)", net_itc, "inward register less RCM working"),
            _statutory_row("C", "ITC on inward supplies received during FY but availed in next FY", [None] * 4, "DATA NEEDED - subsequent-year ITC working"),
            _statutory_row("D", "Difference (A - (B + C))", [round(gstr2b_itc[i] - net_itc[i], 2) for i in range(4)], "calculated from 2B and inward register"),
            _statutory_row("E", "ITC available but not availed", [None] * 4, "DATA NEEDED - eligibility decision"),
            _statutory_row("F", "ITC available but ineligible", [None] * 4, "DATA NEEDED - eligibility decision"),
            _statutory_row("G", "IGST paid on import of goods", [0, 0, 0, 0], "no import ledger supplied"),
            _statutory_row("H", "IGST credit availed on import of goods", [0, 0, 0, 0], "no import ledger supplied"),
            _statutory_row("I", "Difference (G - H)", [0, 0, 0, 0], "no import ledger supplied"),
            _statutory_row("J", "ITC available but not availed on import of goods", [0, 0, 0, 0], "no import ledger supplied"),
            _statutory_row("K", "Total ITC to be lapsed", [None] * 4, "DATA NEEDED - annual ITC decision"),
        ],
    }
    key_figures = {
        "b2c_turnover": _sum_tax(outward_groups["A"])[0], "b2b_turnover": _sum_tax(outward_groups["B"])[0],
        "rcm_turnover": _sum_tax(outward_groups["G"])[0], "credit_notes": _sum_tax(outward_groups["I"])[0],
        "taxable_supplies": (outward_control or _sum_tax(outward))[0], "annual_turnover": (outward_control or _sum_tax(outward))[0],
        "gross_itc_cgst": total_itc[0], "gross_itc_sgst": total_itc[1], "gross_itc_igst": total_itc[2],
        "gross_itc": round(sum(total_itc), 2), "gstr2b_itc_cgst": gstr2b_itc[0], "gstr2b_itc_sgst": gstr2b_itc[1], "gstr2b_itc_igst": gstr2b_itc[2], "gstr2b_itc": round(sum(gstr2b_itc), 2),
        # Net ITC cannot be derived until the statutory reversal working is approved.
        "net_itc": None,
    }
    return {"available": True, "tables": tables, "key_figures": key_figures, "source": "calculated from uploaded annual-return workpapers"}


def reconcile_inward(inward: list[dict[str, Any]], gstr2b: list[dict[str, Any]]) -> dict[str, Any]:
    book_index: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    portal_index: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for record in inward:
        key = invoice_key(record, "supplier_gstin")
        if all(key):
            book_index[key].append(record)
    for record in gstr2b:
        key = invoice_key(record, "supplier_gstin")
        if all(key):
            portal_index[key].append(record)

    book_keys = set(book_index)
    portal_keys = set(portal_index)
    matched_keys = book_keys & portal_keys
    books_only_keys = book_keys - portal_keys
    portal_only_keys = portal_keys - book_keys
    mismatch_count = 0
    mismatch_tax = 0.0
    for key in matched_keys:
        book_tax = sum(total(items, field) for field in ("igst", "cgst", "sgst", "cess") for items in [book_index[key]])
        portal_tax = sum(total(items, field) for field in ("igst", "cgst", "sgst", "cess") for items in [portal_index[key]])
        if abs(book_tax - portal_tax) > 1:
            mismatch_count += 1
            mismatch_tax += abs(book_tax - portal_tax)

    def sum_keys(index: dict[tuple[str, str], list[dict[str, Any]]], keys: set[tuple[str, str]]) -> float:
        return round(
            sum(
                float(item.get("igst") or 0) + float(item.get("cgst") or 0)
                + float(item.get("sgst") or 0) + float(item.get("cess") or 0)
                for key in keys for item in index[key]
            ),
            2,
        )

    def describe(items: list[dict[str, Any]]) -> dict[str, Any]:
        first = items[0]
        tax = sum(float(i.get(f) or 0) for i in items for f in ("igst", "cgst", "sgst", "cess"))
        return {
            "party": first.get("party"), "gstin": first.get("supplier_gstin"), "invoice_number": first.get("invoice_number"),
            "invoice_date": first.get("invoice_date"), "taxable_value": round(sum(float(i.get("taxable_value") or 0) for i in items), 2),
            "tax": round(tax, 2), "row": first.get("_row"), "file": first.get("_file_name"),
        }

    def tax_of(items: list[dict[str, Any]]) -> float:
        return round(sum(float(i.get(f) or 0) for i in items for f in ("igst", "cgst", "sgst", "cess")), 2)

    # line-level detail for the review screen and the case chat (largest tax first, capped)
    details = {
        "books_only": sorted((describe(book_index[k]) for k in books_only_keys), key=lambda d: -d["tax"])[:300],
        "portal_only": sorted((describe(portal_index[k]) for k in portal_only_keys), key=lambda d: -d["tax"])[:300],
        "mismatches": sorted(
            ({**describe(book_index[k]), "books_tax": tax_of(book_index[k]), "gstr2b_tax": tax_of(portal_index[k]),
              "difference": round(tax_of(book_index[k]) - tax_of(portal_index[k]), 2)}
             for k in matched_keys if abs(tax_of(book_index[k]) - tax_of(portal_index[k])) > 1),
            key=lambda d: -abs(d["difference"]),
        )[:300],
    }

    return {
        "details": details,
        "book_records": len(inward),
        "portal_records": len(gstr2b),
        "matched": len(matched_keys),
        "books_only": len(books_only_keys),
        "portal_only": len(portal_only_keys),
        "amount_mismatches": mismatch_count,
        "books_only_itc": sum_keys(book_index, books_only_keys),
        "portal_only_itc": sum_keys(portal_index, portal_only_keys),
        "mismatch_itc": round(mismatch_tax, 2),
    }


def extract_portal_gstr9(document: dict[str, Any] | None) -> dict[str, Any]:
    if not document or document.get("kind") != "workbook_tables":
        return {"available": False, "tables": {}, "key_figures": {}}
    tables: dict[str, list[dict[str, Any]]] = {}
    for sheet, rows in document.get("sheets", {}).items():
        table_rows = []
        for row in rows:
            code = str(row[1]).strip() if len(row) > 1 and row[1] is not None else ""
            label = str(row[2]).strip() if len(row) > 2 and row[2] is not None else ""
            if code and label and code not in {"1", "2", "3", "4", "5", "6"}:
                numeric = [round(float(value), 2) for value in row if isinstance(value, (int, float))]
                table_rows.append({"code": code, "label": label, "values": numeric})
        if table_rows:
            tables[sheet.strip()] = table_rows

    def find(sheet: str, code: str, index: int = 0) -> float:
        rows = tables.get(sheet, [])
        row = next((item for item in rows if item["code"].upper() == code.upper()), None)
        return row["values"][index] if row and len(row["values"]) > index else 0.0

    key_figures = {
        "b2c_turnover": find("4 Outward", "A", 0),
        "b2b_turnover": find("4 Outward", "B", 0),
        "rcm_turnover": find("4 Outward", "G", 0),
        "credit_notes": find("4 Outward", "I", 0),
        "taxable_supplies": find("4 Outward", "N", 0),
        "annual_turnover": find("5 Outward", "N", 0),
        "gross_itc_cgst": find("6 ITC availed", "A", 0),
        "gross_itc_sgst": find("6 ITC availed", "A", 1),
        "gross_itc_igst": find("6 ITC availed", "A", 2),
        "reversed_itc_cgst": find("7 ITC Rev", "I", 0),
        "reversed_itc_sgst": find("7 ITC Rev", "I", 1),
        "reversed_itc_igst": find("7 ITC Rev", "I", 2),
        "net_itc_cgst": find("7 ITC Rev", "J", 0),
        "net_itc_sgst": find("7 ITC Rev", "J", 1),
        "net_itc_igst": find("7 ITC Rev", "J", 2),
        "gstr2b_itc_cgst": find("8 Other ITC", "A", 0),
        "gstr2b_itc_sgst": find("8 Other ITC", "A", 1),
        "gstr2b_itc_igst": find("8 Other ITC", "A", 2),
    }
    key_figures["gross_itc"] = round(
        key_figures["gross_itc_cgst"] + key_figures["gross_itc_sgst"] + key_figures["gross_itc_igst"], 2
    )
    key_figures["net_itc"] = round(
        key_figures["net_itc_cgst"] + key_figures["net_itc_sgst"] + key_figures["net_itc_igst"], 2
    )
    key_figures["gstr2b_itc"] = round(
        key_figures["gstr2b_itc_cgst"] + key_figures["gstr2b_itc_sgst"] + key_figures["gstr2b_itc_igst"], 2
    )
    return {"available": True, "tables": tables, "key_figures": key_figures}


def calculate_gstr9c(gstr9: dict[str, Any], financial: dict[str, Any]) -> dict[str, Any]:
    key = gstr9.get("key_figures", {})
    audited = financial.get("audited_turnover")
    book_itc = financial.get("book_itc")
    if audited is None or book_itc is None:
        return {
            "status": "DATA NEEDED",
            "missing": [name for name, value in (("audited_turnover", audited), ("book_itc", book_itc)) if value is None],
            "message": "Enter audited turnover and book ITC to complete GSTR-9C independently.",
        }
    adjusted_turnover = (
        float(audited)
        + float(financial.get("opening_unbilled_revenue") or 0)
        + float(financial.get("closing_unadjusted_advances") or 0)
        - float(financial.get("closing_unbilled_revenue") or 0)
        - float(financial.get("opening_unadjusted_advances") or 0)
        + float(financial.get("trade_discount_adjustment") or 0)
        + float(financial.get("other_turnover_adjustment") or 0)
    )
    taxable = (
        adjusted_turnover
        - float(financial.get("exempt_nil_non_gst_turnover") or 0)
        - float(financial.get("zero_rated_without_tax") or 0)
        - float(financial.get("recipient_rcm_turnover") or 0)
    )
    adjusted_itc = (
        float(book_itc)
        + float(financial.get("prior_year_itc_claimed") or 0)
        - float(financial.get("current_year_itc_claimed_later") or 0)
    )
    annual_turnover = float(key.get("annual_turnover") or 0)
    net_itc = float(key.get("net_itc") or 0)
    return {
        "status": "Ready for review",
        "table_5": {
            "audited_turnover": round(float(audited), 2),
            "adjusted_turnover": round(adjusted_turnover, 2),
            "gstr9_turnover": round(annual_turnover, 2),
            "unreconciled_turnover": round(annual_turnover - adjusted_turnover, 2),
        },
        "table_7": {
            "reconciled_taxable_turnover": round(taxable, 2),
            "gstr9_taxable_turnover": round(annual_turnover, 2),
            "unreconciled_taxable_turnover": round(annual_turnover - taxable, 2),
        },
        "table_12": {
            "book_itc": round(float(book_itc), 2),
            "adjusted_book_itc": round(adjusted_itc, 2),
            "gstr9_net_itc": round(net_itc, 2),
            "unreconciled_itc": round(net_itc - adjusted_itc, 2),
        },
        "audited_under_act": financial.get("audited_under_act", "Companies Act"),
    }


def build_exceptions(reconciliation: dict[str, Any], gstr9: dict[str, Any], gstr9c: dict[str, Any]) -> list[dict[str, Any]]:
    exceptions = []
    inward = reconciliation.get("inward", {})
    candidates = [
        ("books_only", "Invoices in books but absent from GSTR-2B", inward.get("books_only_itc", 0), "Obtain supplier filing evidence or confirm ITC treatment."),
        ("portal_only", "Invoices in GSTR-2B but absent from books", inward.get("portal_only_itc", 0), "Obtain invoices and confirm whether they belong to the taxpayer."),
        ("amount_mismatches", "Matched invoices with tax differences", inward.get("mismatch_itc", 0), "Compare invoice and supplier-reported tax before approving ITC."),
    ]
    for field, title, amount, action in candidates:
        count = inward.get(field, 0)
        if count:
            exceptions.append(
                {
                    "id": uuid.uuid4().hex[:8],
                    "severity": "red" if amount > 10000 else "amber",
                    "title": title,
                    "count": count,
                    "amount": round(float(amount), 2),
                    "recommended_action": action,
                    "evidence_needed": "Invoice, supplier filing status and ITC working",
                }
            )
    if gstr9c.get("status") == "DATA NEEDED":
        exceptions.append(
            {
                "id": uuid.uuid4().hex[:8],
                "severity": "amber",
                "title": "GSTR-9C audited figures are missing",
                "count": len(gstr9c.get("missing", [])),
                "amount": 0,
                "recommended_action": "Enter audited turnover and book ITC in the GSTR-9C inputs screen.",
                "evidence_needed": "Audited financial statements or approved audited figures",
            }
        )
    return exceptions


def calculate(case: dict[str, Any], normalized: list[dict[str, Any]], validation: list[dict[str, Any]]) -> dict[str, Any]:
    outward = records_for(normalized, "outward_register")
    inward = records_for(normalized, "inward_register")
    gstr2b = records_for(normalized, "gstr2b")
    rcm = records_for(normalized, "rcm_working")
    portal_workbook = extract_portal_gstr9(document_for(normalized, "portal_gstr9"))
    # A pre-populated portal workbook is useful when supplied, but it must not be a
    # prerequisite for preparing the annual-return draft.  The nine standard
    # workpapers are sufficient to construct the source-led statutory table grid.
    outward_control = _tax_rate_control(document_for(normalized, "tax_rate_summary"))
    portal = portal_workbook if portal_workbook.get("available") else _source_gstr9(outward, inward, gstr2b, rcm, outward_control)

    outward_totals = {field: total(outward, field) for field in MONEY_FIELDS}
    inward_totals = {field: total(inward, field) for field in MONEY_FIELDS}
    gstr2b_totals = {field: total(gstr2b, field) for field in MONEY_FIELDS}
    rcm_totals = {field: total(rcm, field) for field in MONEY_FIELDS}
    reconciliation = {
        "outward": {"records": len(outward), "totals": outward_totals},
        "inward": reconcile_inward(inward, gstr2b),
        "inward_totals": inward_totals,
        "gstr2b_totals": gstr2b_totals,
        "rcm": {"records": len(rcm), "totals": rcm_totals},
        "outward_control": {"values": outward_control, "difference": round((outward_control or [outward_totals["taxable_value"]])[0] - outward_totals["taxable_value"], 2)},
    }
    gstr9c = calculate_gstr9c(portal, case.get("financial_inputs", {}))
    exceptions = build_exceptions(reconciliation, portal, gstr9c)
    red = sum(1 for item in exceptions if item["severity"] == "red")
    risk = "High" if red >= 2 else "Medium" if exceptions else "Low"
    status = "Ready for review" if portal.get("available") else "Data review"
    return {
        "case": {key: case[key] for key in ("id", "legal_name", "gstin", "financial_year")},
        "financial_inputs": case.get("financial_inputs", {}),
        "status": status,
        "risk_level": risk,
        "metrics": {
            "documents": len(normalized),
            "outward_records": len(outward),
            "inward_records": len(inward),
            "gstr2b_records": len(gstr2b),
            "exceptions": len(exceptions),
            "annual_turnover": portal.get("key_figures", {}).get("annual_turnover", outward_totals["taxable_value"]),
            "net_itc": portal.get("key_figures", {}).get("net_itc"),
        },
        "validation": validation,
        "reconciliation": reconciliation,
        "gstr9": portal,
        "gstr9c": gstr9c,
        "exceptions": exceptions,
        "reviewed_by_senior": False,
    }

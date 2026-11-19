from __future__ import annotations

import csv
import hashlib
import json
import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Iterable

import openpyxl
import pdfplumber

from ..schemas import DocumentRole


ROLE_KEYWORDS: list[tuple[DocumentRole, tuple[str, ...]]] = [
    (DocumentRole.reference_gstr9c, ("gstr-9c", "gstr9c")),
    (DocumentRole.portal_gstr9, ("gstr9_", "gstr-9_", "gstr9 ")),
    (DocumentRole.gstr3b_summary, ("gstr3b", "gstr-3b")),
    (DocumentRole.gstr1_summary, ("gstr-1", "gstr1", "gstr-1_iff")),
    (DocumentRole.cash_ledger, ("cash_ledger", "cash ledger")),
    (DocumentRole.credit_ledger, ("creditledger", "credit_ledger", "credit ledger")),
    (DocumentRole.table8_reconciliation, ("table 8", "table8")),
    (DocumentRole.tax_rate_summary, ("tax rate wise", "rate wise outward")),
    (DocumentRole.hsn_outward, ("hsn", "outward")),
    (DocumentRole.hsn_inward, ("hsn", "inward")),
    (DocumentRole.rcm_working, ("rcm",)),
    (DocumentRole.inward_reconciliation, ("inward reconciliation",)),
    (DocumentRole.outward_register, ("outward register", "supply outward")),
    (DocumentRole.inward_register, ("inward register", "supply inward")),
    (DocumentRole.gstr2b, ("gstr-2b", "gstr2b")),
]


STANDARD_FIELDS = {
    "outward_register": [
        "supply_type", "party", "customer_gstin", "place_of_supply", "invoice_number",
        "invoice_date", "invoice_value", "taxable_value", "tax_rate", "igst", "cgst", "sgst", "cess",
    ],
    "inward_register": [
        "supply_type", "supplier_gstin", "party", "place_of_supply", "invoice_number",
        "invoice_date", "invoice_value", "taxable_value", "tax_rate", "igst", "cgst", "sgst", "cess",
    ],
    "gstr2b": [
        "month", "supplier_gstin", "party", "invoice_number", "invoice_date", "invoice_value",
        "tax_rate", "taxable_value", "igst", "cgst", "sgst", "cess",
    ],
    "rcm_working": ["invoice_date", "invoice_number", "party", "taxable_value", "igst", "cgst", "sgst", "tax_rate"],
}


ALIASES = {
    "supply_type": ("gstr-1 section", "gstr-2 section", "section", "invoice type", "type"),
    "party": ("party", "trade/legal name", "account", "supplier name", "customer name"),
    "customer_gstin": ("gstin / uin", "customer gstin", "recipient gstin"),
    "supplier_gstin": ("gstin of supplier", "gstin / uin", "supplier gstin"),
    "place_of_supply": ("place of supply", "pos"),
    "invoice_number": ("doc. no.", "doc no", "invoice number", "note number", "vch/bill no", "voucher no"),
    "invoice_date": ("doc. date", "invoice date", "note date", "date"),
    "invoice_value": ("invoice value", "note value", "total value"),
    "taxable_value": ("taxable value", "taxable amt", "taxable amount", "debit(rs.)"),
    "tax_rate": ("tax rates", "rate(%)", "rate", "tax rate"),
    "igst": ("igst", "integrated tax"),
    "cgst": ("cgst", "central tax"),
    "sgst": ("sgst", "state/ut tax", "state tax"),
    "cess": ("cess",),
    "month": ("month", "return period"),
}


def normalize_text(value: Any) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value).strip()).lower()


def json_value(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, str) and value.startswith("="):
        return value
    return value


def number(value: Any) -> float:
    if value in (None, "", "-", "—"):
        return 0.0
    if isinstance(value, (int, float, Decimal)):
        return float(value)
    text = str(value).strip().replace(",", "").replace("₹", "").replace("%", "")
    if text.startswith("(") and text.endswith(")"):
        text = f"-{text[1:-1]}"
    try:
        return float(Decimal(text))
    except (InvalidOperation, ValueError):
        return 0.0


def identify_by_filename(filename: str, extension: str) -> DocumentRole:
    name = filename.lower()
    if extension == ".pdf" and ("gstr9_" in name or "gstr9-" in name) and "9c" not in name:
        return DocumentRole.reference_gstr9
    if "gstr-9c" in name or "gstr9c" in name:
        return DocumentRole.reference_gstr9c
    if ("table 8" in name or "table8" in name) and ("recon" in name or "gstr-2b" in name or "gstr2b" in name):
        return DocumentRole.table8_reconciliation
    if extension in {".xlsx", ".xlsm"} and re.search(r"gstr[- ]?9(?:_| |$)", name):
        return DocumentRole.portal_gstr9
    alternatives = [
        (DocumentRole.gstr3b_summary, ("gstr3b", "gstr-3b")),
        (DocumentRole.gstr1_summary, ("gstr-1", "gstr1", "gstr-1_iff")),
        (DocumentRole.cash_ledger, ("cash_ledger", "cash ledger")),
        (DocumentRole.credit_ledger, ("creditledger", "credit_ledger", "credit ledger")),
        (DocumentRole.tax_rate_summary, ("tax rate wise", "rate wise outward")),
        (DocumentRole.rcm_working, ("rcm",)),
        (DocumentRole.inward_reconciliation, ("inward reconciliation",)),
        (DocumentRole.outward_register, ("outward register", "supply outward")),
        (DocumentRole.inward_register, ("inward register", "supply inward")),
        (DocumentRole.gstr2b, ("gstr-2b", "gstr2b")),
    ]
    if "hsn" in name and "outward" in name:
        return DocumentRole.hsn_outward
    if "hsn" in name and "inward" in name:
        return DocumentRole.hsn_inward
    for role, keywords in alternatives:
        if any(keyword in name for keyword in keywords):
            return role
    return DocumentRole.unknown


def detect_header(rows: list[tuple[int, list[Any]]], required_hits: int = 3) -> tuple[int | None, list[str]]:
    best_index: int | None = None
    best_headers: list[str] = []
    best_score = 0
    aliases = {alias for values in ALIASES.values() for alias in values}
    for actual_index, row in rows[:60]:
        headers = [normalize_text(value) for value in row]
        score = sum(any(alias in header for alias in aliases) for header in headers if header)
        if score > best_score:
            best_score = score
            best_index = actual_index
            best_headers = [str(value).strip() if value is not None else "" for value in row]
    return (best_index, best_headers) if best_score >= required_hits else (None, [])


def infer_mapping(headers: list[str], role: DocumentRole) -> dict[str, str]:
    mapping: dict[str, str] = {}
    wanted = STANDARD_FIELDS.get(role.value, [])
    for field in wanted:
        for header in headers:
            normalized = normalize_text(header)
            if any(alias == normalized or alias in normalized for alias in ALIASES.get(field, ())):
                mapping[field] = header
                break
    return mapping


def profile_xlsx(path: Path) -> dict[str, Any]:
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=False)
    sheets = []
    all_text: list[str] = []
    for worksheet in workbook.worksheets:
        numbered_rows: list[tuple[int, list[Any]]] = []
        for actual_row, row in enumerate(
            worksheet.iter_rows(min_row=1, max_row=min(worksheet.max_row, 60), values_only=True), 1
        ):
            values = [json_value(value) for value in row]
            if any(value not in (None, "") for value in values):
                numbered_rows.append((actual_row, values[:24]))
                all_text.extend(normalize_text(value) for value in values if value not in (None, ""))
            if len(numbered_rows) >= 20:
                break
        header_row, headers = detect_header(numbered_rows)
        sample_rows = [values for _, values in numbered_rows]
        sheets.append(
            {
                "name": worksheet.title,
                "rows": worksheet.max_row,
                "columns": worksheet.max_column,
                "header_row": header_row,
                "headers": headers[:24],
                "sample_rows": sample_rows[:10],
            }
        )
    return {"kind": "xlsx", "sheets": sheets, "text_fingerprint": " ".join(all_text)[:8000]}


def profile_csv(path: Path) -> dict[str, Any]:
    raw = path.read_bytes()
    text = None
    encoding = "utf-8-sig"
    for candidate in ("utf-8-sig", "utf-16", "cp1252"):
        try:
            text = raw.decode(candidate)
            encoding = candidate
            break
        except UnicodeDecodeError:
            continue
    rows = list(csv.reader((text or "").splitlines()))
    return {
        "kind": "csv",
        "encoding": encoding,
        "rows": len(rows),
        "columns": max((len(row) for row in rows), default=0),
        "sample_rows": rows[:15],
        "text_fingerprint": " ".join(" ".join(row) for row in rows[:20])[:8000],
    }


def profile_pdf(path: Path) -> dict[str, Any]:
    pages = []
    with pdfplumber.open(path) as pdf:
        for index, page in enumerate(pdf.pages):
            text = page.extract_text() or ""
            pages.append({"page": index + 1, "text": text[:6000], "characters": len(text)})
    return {"kind": "pdf", "pages": pages, "text_fingerprint": " ".join(page["text"] for page in pages)[:16000]}


def profile_file(path: Path, original_name: str) -> dict[str, Any]:
    extension = path.suffix.lower()
    if extension in {".xlsx", ".xlsm"}:
        profile = profile_xlsx(path)
    elif extension == ".csv":
        profile = profile_csv(path)
    elif extension == ".pdf":
        profile = profile_pdf(path)
    else:
        profile = {"kind": extension.lstrip("."), "unsupported": True, "text_fingerprint": ""}
    role = identify_by_filename(original_name, extension)
    fingerprint = normalize_text(profile.get("text_fingerprint"))
    if role == DocumentRole.unknown:
        if "supply outward register" in fingerprint:
            role = DocumentRole.outward_register
        elif "supply inward register" in fingerprint:
            role = DocumentRole.inward_register
        elif "goods and services tax - gstr-2b" in fingerprint:
            role = DocumentRole.gstr2b
        elif "form gstr-3b" in fingerprint:
            role = DocumentRole.gstr3b_summary
        elif "form gstr-1" in fingerprint:
            role = DocumentRole.gstr1_summary
        elif "electronic credit ledger" in fingerprint:
            role = DocumentRole.credit_ledger
    profile["local_role"] = role.value
    profile["sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
    return profile


def choose_sheet(profile: dict[str, Any], role: DocumentRole) -> dict[str, Any] | None:
    sheets = profile.get("sheets", [])
    preferences = {
        DocumentRole.outward_register: ("(final)", "final", "original"),
        DocumentRole.inward_register: ("itc register (final)", "original", "final"),
        DocumentRole.gstr2b: ("gstr-2b final", "gstr-2b", "b2b"),
        DocumentRole.rcm_working: ("sheet1", "rcm"),
        DocumentRole.hsn_outward: ("hsn summary", "summary"),
        DocumentRole.hsn_inward: ("sheet1",),
    }.get(role, ())
    for preferred in preferences:
        for sheet in sheets:
            if normalize_text(sheet["name"]) == preferred:
                return sheet
    return max(sheets, key=lambda sheet: sheet.get("rows", 0), default=None)


def local_mapping(profile: dict[str, Any], role: DocumentRole) -> dict[str, Any]:
    if profile.get("kind") != "xlsx":
        return {
            "document_role": role.value,
            "source_sheet": None,
            "header_row": None,
            "data_start_row": None,
            "columns": {},
            "transformations": {},
            "confidence": 0.9 if role != DocumentRole.unknown else 0.35,
            "notes": ["Local deterministic file classification"],
        }
    sheet = choose_sheet(profile, role)
    headers = sheet.get("headers", []) if sheet else []
    header_row = sheet.get("header_row") if sheet else None
    mapping = infer_mapping(headers, role)
    expected = len(STANDARD_FIELDS.get(role.value, [])) or 1
    confidence = min(0.98, 0.55 + 0.45 * len(mapping) / expected)
    return {
        "document_role": role.value,
        "source_sheet": sheet.get("name") if sheet else None,
        "header_row": header_row,
        "data_start_row": header_row + 1 if header_row else None,
        "columns": mapping,
        "transformations": {"dates": "parse", "amounts": "decimal", "formulas": "ignore_or_recompute"},
        "confidence": confidence,
        "notes": ["Initial mapping inferred from headers; AI may refine unknown layouts"],
    }


def _header_index(headers: list[Any], mapping: dict[str, str]) -> dict[str, int]:
    normalized = {normalize_text(value): index for index, value in enumerate(headers)}
    result = {}
    for field, source in mapping.items():
        if normalize_text(source) in normalized:
            result[field] = normalized[normalize_text(source)]
    return result


def extract_xlsx(path: Path, mapping: dict[str, Any]) -> dict[str, Any]:
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    sheet_name = mapping.get("source_sheet")
    worksheet = workbook[sheet_name] if sheet_name in workbook.sheetnames else workbook[workbook.sheetnames[0]]
    header_row = mapping.get("header_row") or 1
    headers = [cell.value for cell in next(worksheet.iter_rows(min_row=header_row, max_row=header_row))]
    indices = _header_index(headers, mapping.get("columns", {}))
    records = []
    for row_number, row in enumerate(worksheet.iter_rows(min_row=header_row + 1, values_only=True), header_row + 1):
        if not any(value not in (None, "") for value in row):
            continue
        record: dict[str, Any] = {"_row": row_number, "_sheet": worksheet.title}
        for field, index in indices.items():
            value = row[index] if index < len(row) else None
            if field in {"invoice_value", "taxable_value", "tax_rate", "igst", "cgst", "sgst", "cess"}:
                value = number(value)
            elif isinstance(value, (datetime, date)):
                value = value.isoformat()
            record[field] = value
        if any(value not in (None, "", 0, 0.0) for key, value in record.items() if not key.startswith("_")):
            records.append(record)
    return {"kind": "records", "sheet": worksheet.title, "record_count": len(records), "records": records}


def extract_workbook_tables(path: Path, max_rows_per_sheet: int = 2500) -> dict[str, Any]:
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    sheets: dict[str, list[list[Any]]] = {}
    for worksheet in workbook.worksheets:
        rows = []
        for row in worksheet.iter_rows(min_row=1, max_row=min(worksheet.max_row, max_rows_per_sheet), values_only=True):
            values = [json_value(value) for value in row]
            if any(value not in (None, "") for value in values):
                rows.append(values)
        sheets[worksheet.title] = rows
    return {"kind": "workbook_tables", "sheets": sheets}


def extract_csv(path: Path, role: DocumentRole) -> dict[str, Any]:
    raw = path.read_bytes()
    text = None
    for encoding in ("utf-8-sig", "utf-16", "cp1252"):
        try:
            text = raw.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    rows = list(csv.reader((text or "").splitlines()))
    return {"kind": "ledger", "role": role.value, "row_count": len(rows), "rows": rows}


def extract_pdf(profile: dict[str, Any], role: DocumentRole) -> dict[str, Any]:
    text = "\n".join(page.get("text", "") for page in profile.get("pages", []))
    return {"kind": "pdf_text", "role": role.value, "text": text, "page_count": len(profile.get("pages", []))}


def normalize_file(path: Path, profile: dict[str, Any], mapping: dict[str, Any]) -> dict[str, Any]:
    role = DocumentRole(mapping.get("document_role", profile.get("local_role", "unknown")))
    try:
        if role in {
            DocumentRole.portal_gstr9,
            DocumentRole.inward_reconciliation,
            DocumentRole.table8_reconciliation,
            DocumentRole.tax_rate_summary,
            DocumentRole.hsn_outward,
            DocumentRole.hsn_inward,
        } and profile.get("kind") == "xlsx":
            normalized = extract_workbook_tables(path)
        elif profile.get("kind") == "xlsx" and mapping.get("header_row") and mapping.get("columns"):
            normalized = extract_xlsx(path, mapping)
        elif profile.get("kind") == "csv":
            normalized = extract_csv(path, role)
        elif profile.get("kind") == "pdf":
            normalized = extract_pdf(profile, role)
        else:
            normalized = {"kind": "profile_only", "profile": profile}
    except Exception as exc:
        return {"kind": "error", "error": str(exc), "role": role.value}
    normalized["role"] = role.value
    return normalized


def compact_profile(profile: dict[str, Any]) -> str:
    copy = dict(profile)
    copy.pop("text_fingerprint", None)
    for sheet in copy.get("sheets", []):
        sheet["sample_rows"] = sheet.get("sample_rows", [])[:8]
    return json.dumps(copy, ensure_ascii=False, default=str)[:24000]

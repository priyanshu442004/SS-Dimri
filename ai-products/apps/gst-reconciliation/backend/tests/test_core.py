from pathlib import Path

import openpyxl

from app.schemas import DocumentRole
from app.services.calculator import calculate
from app.services.official_forms import build_official_bundle
from app.services.parsers import identify_by_filename, local_mapping, normalize_file, profile_file
from app.services.reports import generate_reports


def make_register(path: Path, outward: bool = True):
    workbook = openpyxl.Workbook()
    sheet = workbook.active
    sheet.title = "(Final)" if outward else "ITC Register (Final)"
    headers = ["GSTR-1 Section" if outward else "GSTR-2 Section", "Party", "GSTIN / UIN", "Doc. No.", "Doc. Date", "Invoice Value", "Taxable Value", "Tax Rates", "IGST", "CGST", "SGST"]
    sheet.append(headers)
    sheet.append(["B2B", "Example Party", "06AAAAA0000A1Z5", "INV-1", "01-04-2023", 1180, 1000, 18, 0, 90, 90])
    workbook.save(path)


def portal_document():
    return {
        "role": "portal_gstr9",
        "kind": "workbook_tables",
        "sheets": {
            "4 Outward": [[None, "A", "Supplies made to un-registered persons (B2C)", None, None, 0, 0, 0, 0, 0], [None, "B", "Supplies made to registered persons (B2B)", None, None, 1000, 90, 90, 0, 0], [None, "N", "Supplies and advances", None, None, 1000, 90, 90, 0, 0]],
            "5 Outward ": [[None, "N", "Total Turnover", 1000, 90, 90, 0, 0]],
            "6 ITC availed": [[None, "A", "Total amount of input tax credit", None, 90, 90, 0, 0]],
            "7 ITC Rev": [[None, "I", "Total ITC Reversed", 0, 0, 0, 0], [None, "J", "Net ITC Available", 90, 90, 0, 0]],
            "8 Other ITC": [[None, "A", "ITC as per GSTR-2B", 90, 90, 0, 0]],
        },
    }


def test_layout_mapping_and_normalization(tmp_path):
    file_path = tmp_path / "Supply Outward Register.xlsx"
    make_register(file_path)
    profile = profile_file(file_path, file_path.name)
    assert profile["local_role"] == DocumentRole.outward_register.value
    mapping = local_mapping(profile, DocumentRole.outward_register)
    normalized = normalize_file(file_path, profile, mapping)
    assert normalized["record_count"] == 1
    assert normalized["records"][0]["taxable_value"] == 1000


def test_calculation_and_reports(tmp_path):
    normalized = [
        {"role": "outward_register", "kind": "records", "records": [{"customer_gstin": "06AAAAA0000A1Z5", "invoice_number": "INV1", "taxable_value": 1000, "cgst": 90, "sgst": 90}]},
        {"role": "inward_register", "kind": "records", "records": [{"supplier_gstin": "06BBBBB0000B1Z5", "invoice_number": "P1", "taxable_value": 500, "cgst": 45, "sgst": 45}]},
        {"role": "gstr2b", "kind": "records", "records": [{"supplier_gstin": "06BBBBB0000B1Z5", "invoice_number": "P1", "taxable_value": 500, "cgst": 45, "sgst": 45}]},
        portal_document(),
    ]
    case = {"id": "case1", "legal_name": "Example Pvt Ltd", "gstin": "06AAAAA0000A1Z5", "financial_year": "2023-24", "financial_inputs": {"audited_turnover": 1000, "book_itc": 180}}
    result = calculate(case, normalized, [])
    assert result["gstr9"]["available"] is True
    assert result["reconciliation"]["inward"]["matched"] == 1
    assert result["gstr9c"]["table_5"]["unreconciled_turnover"] == 0
    files = generate_reports(result, tmp_path / "reports")
    assert len(files) == 6
    assert all((tmp_path / "reports" / name).exists() for name in files)
    assert result["official_returns"]["gstr9"]["form"] == "GSTR-9"
    assert result["official_returns"]["gstr9c"]["form"] == "GSTR-9C"
    assert len(result["official_returns"]["gstr9c"]["tables"]) == 13


def test_source_package_builds_gstr9_without_portal_workbook():
    normalized = [
        {"role": "outward_register", "kind": "records", "records": [
            {"supply_type": "B2B", "taxable_value": 1000, "cgst": 90, "sgst": 90},
            {"supply_type": "B2CS", "taxable_value": 500, "cgst": 45, "sgst": 45},
        ]},
        {"role": "inward_register", "kind": "records", "records": [
            {"taxable_value": 600, "igst": 108},
        ]},
        {"role": "gstr2b", "kind": "records", "records": [
            {"taxable_value": 600, "igst": 108},
        ]},
        {"role": "rcm_working", "kind": "records", "records": [
            {"taxable_value": 100, "cgst": 2.5, "sgst": 2.5},
        ]},
    ]
    case = {"id": "case1", "legal_name": "Example Pvt Ltd", "gstin": "06AAAAA0000A1Z5", "financial_year": "2023-24", "financial_inputs": {}}
    result = calculate(case, normalized, [])
    table4 = {row["code"]: row for row in result["gstr9"]["tables"]["4 Outward"]}
    assert result["gstr9"]["available"] is True
    assert table4["A"]["values"][0] == 500
    assert table4["B"]["values"][0] == 1000
    assert result["gstr9"]["key_figures"]["annual_turnover"] == 1500
    official = build_official_bundle(result)["gstr9"]
    assert next(table for table in official["tables"] if table["number"] == "4")["rows"][0]["source"] == "outward register"


def test_filename_roles_use_alternatives_and_precedence():
    assert identify_by_filename("GSTR9_06AACCD3091P1ZD_2023-24.xlsx", ".xlsx") == DocumentRole.portal_gstr9
    assert identify_by_filename("Table 8 Vs GSTR-2B Reconciliation.xlsx", ".xlsx") == DocumentRole.table8_reconciliation
    assert identify_by_filename("Electronic_Cash_Ledger (6).csv", ".csv") == DocumentRole.cash_ledger
    assert identify_by_filename("GSTR-1_IFF_annual.pdf", ".pdf") == DocumentRole.gstr1_summary

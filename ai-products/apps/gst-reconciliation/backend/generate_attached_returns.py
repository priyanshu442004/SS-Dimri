"""Generate controlled annual-return drafts from the supplied FY 2023-24 workpapers.

This intentionally bypasses AI layout calls: source roles are known from the package
names and every monetary figure remains deterministic and traceable to a workbook.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from app.schemas import DocumentRole
from app.services.calculator import calculate
from app.services.official_forms import build_official_bundle
from app.services.parsers import local_mapping, normalize_file, profile_file
from app.services.reports import generate_reports


ROOT = Path(__file__).resolve().parents[1]
SOURCE_FILES = [
    "Compiled GSTR-2B.xlsx",
    "DNS_Supply Inward Register(Match).xlsx",
    "DNS_Supply Outward Register(Match).xlsx",
    "HSN & SAC Summary Of Inward  Supply.xlsx",
    "HSN & SAC Summary Of Outward Supply.xlsx",
    "Inward Reconciliation FY 2023-24 hr.xlsx",
    "RCM Working.xlsx",
    "Table 8 Vs GSTR-2B Reconciliation.xlsx",
    "Tax Rate Wise Outward Supply Details.xlsx",
]


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate controlled GSTR-9 and GSTR-9C drafts from the nine FY 2023-24 workpapers.")
    parser.add_argument("--source-dir", type=Path, default=Path.home() / "Downloads", help="Folder containing the supplied workbooks.")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "output" / "annual_return_fy2023_24", help="Destination for generated reports.")
    arguments = parser.parse_args()
    normalized = []
    validation = []
    for filename in SOURCE_FILES:
        path = arguments.source_dir / filename
        if not path.exists():
            raise FileNotFoundError(path)
        profile = profile_file(path, filename)
        role = DocumentRole(profile["local_role"])
        mapping = local_mapping(profile, role)
        document = normalize_file(path, profile, mapping)
        document.update({"file_id": filename, "file_name": filename})
        normalized.append(document)
        validation.append({"level": "passed", "file": filename, "message": f"Accepted as {role.value}."})

    case = {
        "id": "dns-electronics-fy2023-24",
        "legal_name": "DNS ELECTRONICS PRIVATE LIMITED",
        "gstin": "06AACCD3091P1ZD",
        "financial_year": "2023-24",
        # Audited turnover and audited book ITC were not included in the nine
        # workpapers.  GSTR-9C therefore remains a controlled draft pending approval.
        "financial_inputs": {"trade_name": "DNS Electronics Pvt. Ltd.", "audited_under_act": "Companies Act"},
    }
    result = calculate(case, normalized, validation)
    result["official_returns"] = build_official_bundle(result)
    reports = generate_reports(result, arguments.output_dir)
    print(f"Generated {len(reports)} files in {arguments.output_dir}")
    print(f"Annual turnover: {result['metrics']['annual_turnover']:,.2f}")
    print("GSTR-9C status:", result["gstr9c"]["status"])


if __name__ == "__main__":
    main()

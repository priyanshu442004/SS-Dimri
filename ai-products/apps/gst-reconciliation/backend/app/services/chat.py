"""Chat with a processed GST case: DeepSeek answers grounded in the case's calculated result
(reconciliation, GSTR-9 / 9C workings, exceptions) and the text of every uploaded source file."""
from __future__ import annotations

import csv
import io
import json
from pathlib import Path
from typing import Any

import openpyxl
import pdfplumber

from ..storage import storage

MAX_HISTORY = 16
MAX_CONTEXT = 120_000  # characters of documents per request
PER_FILE = 18_000      # characters of raw text per source file

SUGGESTIONS = [
    "Summarise this GST case in 5 points",
    "Explain the books vs GSTR-2B differences and the ITC at risk",
    "Which exceptions must be resolved before filing GSTR-9?",
    "Compare outward tax in books with GSTR-1 and GSTR-3B",
    "List the suppliers whose invoices are missing in GSTR-2B",
    "What data is still needed to complete GSTR-9C?",
]


def _cell(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def _file_text(path: Path) -> str:
    ext = path.suffix.lower()
    try:
        if ext in {".xlsx", ".xlsm"}:
            wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
            out = []
            for ws in wb.worksheets:
                out.append(f"--- sheet: {ws.title} ---")
                for row in ws.iter_rows(values_only=True):
                    cells = [_cell(v) for v in row]
                    if any(cells):
                        out.append(" | ".join(cells).rstrip(" |"))
                    if sum(len(x) for x in out) > PER_FILE:
                        break
            return "\n".join(out)
        if ext == ".csv":
            raw = path.read_bytes()
            for enc in ("utf-8-sig", "utf-16", "cp1252"):
                try:
                    text = raw.decode(enc)
                    break
                except UnicodeDecodeError:
                    continue
            else:
                return ""
            return "\n".join(" | ".join(r) for r in csv.reader(io.StringIO(text)))
        if ext == ".pdf":
            with pdfplumber.open(path) as pdf:
                return "\n\n".join(page.extract_text() or "" for page in pdf.pages)
    except Exception as exc:  # unreadable file — the processed result still applies
        return f"(could not read: {exc})"
    return ""


def build_context(case_id: str) -> tuple[str, str]:
    """(title, documents text) for the case."""
    case = storage.get_case(case_id)
    result = case.get("result") or {}
    files = storage.list_files(case_id)
    title = f"GST annual-return case for {case['legal_name']} (GSTIN {case['gstin']}, FY {case['financial_year']})"
    summary = {
        "status": result.get("status"), "risk_level": result.get("risk_level"), "metrics": result.get("metrics"),
        "validation": result.get("validation"), "reconciliation": result.get("reconciliation"),
        "gstr9_key_figures": (result.get("gstr9") or {}).get("key_figures"),
        "gstr9c": result.get("gstr9c"), "financial_inputs": case.get("financial_inputs"),
    }
    parts = [
        "=== CASE ===",
        f"{title}. Status: {case['status']}. Amounts in ₹.",
        "=== PROCESSED RESULT (deterministic calculations) ===",
        json.dumps(summary, default=str, separators=(",", ":")),
        "=== EXCEPTIONS (review queue) ===",
        *[json.dumps({k: e.get(k) for k in ("id", "severity", "title", "count", "amount", "recommended_action", "explanation", "records")}, default=str, separators=(",", ":"))[:3000]
          for e in result.get("exceptions", [])],
        "=== GSTR-9 TABLE WORKING ===",
        json.dumps((result.get("gstr9") or {}).get("tables"), default=str, separators=(",", ":"))[:20000],
        "=== UPLOADED FILES (role · status · AI-mapping confidence) ===",
        *[f"- {f['original_name']} · {f['role']} · {f['status']} · {round((f.get('confidence') or 0) * 100)}%" for f in files],
    ]
    if not result:
        parts.insert(2, "NOTE: the analysis has not been run yet — only the uploaded files are available.")
    for f in files:
        text = _file_text(storage.file_path(f))
        parts.append(f"\n=== SOURCE FILE: {f['original_name']} ({f['role'].replace('_', ' ')}) ===\n{text[:PER_FILE]}")
    docs = "\n".join(parts)
    if len(docs) > MAX_CONTEXT:
        docs = docs[:MAX_CONTEXT] + "\n…[context truncated]"
    return title, docs


def system_prompt(case_id: str) -> str:
    title, docs = build_context(case_id)
    return f"""You are "GST Assistant", the AI assistant inside GST Reconciliation, used by a firm of Chartered Accountants (Agarwal & Saxena).
You answer questions about ONE processed job: the {title}. Everything you know about it is in the DOCUMENTS section below —
the system's processed output (already calculated, deterministic) and the source documents the user uploaded.

HOW TO ANSWER
- Ground every figure in the documents. Name where it came from briefly, e.g. (GSTR-2B), (inward register, row 14), (GSTR-9 table 6).
- Never invent figures or recompute numbers the processed result already states; quote them. Show short working only when you derive something new.
- Indian conventions: ₹ with Indian digit grouping, dates as DD-MM-YYYY. Use GST terms correctly (ITC, RCM, GSTR-1/2B/3B/9/9C, CGST/SGST/IGST).
- You may use general GST law knowledge to explain — say when something is general guidance rather than from these documents. Never present a draft as a filed return.
- If the documents don't contain the answer, say so and name the data that would answer it (mark it DATA NEEDED).
- Stay on GST, accounting, tax and this case. Politely decline unrelated topics.

STYLE
- Lead with the answer in one sentence, then support it. Usually 60–180 words unless the user asks for detail.
- Markdown that fits: bullets, a small table for comparisons, **bold** for the key figure, ### headings only for multi-part answers. No filler.

DOCUMENTS
{docs}"""


def chat_path(case_id: str) -> Path:
    return storage.case_dir(case_id) / "chat.json"


def load_chat(case_id: str) -> list[dict[str, Any]]:
    try:
        return json.loads(chat_path(case_id).read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def save_chat(case_id: str, messages: list[dict[str, Any]]) -> None:
    chat_path(case_id).write_text(json.dumps(messages, ensure_ascii=False, indent=1), encoding="utf-8")

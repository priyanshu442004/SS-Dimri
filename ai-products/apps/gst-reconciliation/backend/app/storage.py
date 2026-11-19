from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from fastapi import UploadFile

from .config import settings
from .schemas import CaseCreate, FinancialInputs


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Storage:
    def __init__(self, root: Path | None = None):
        self.root = root or settings.absolute_data_dir
        self.root.mkdir(parents=True, exist_ok=True)
        self.db_path = self.root / "gst_agent.sqlite3"
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        return connection

    def _init_db(self) -> None:
        with self._connect() as db:
            db.executescript(
                """
                CREATE TABLE IF NOT EXISTS cases (
                    id TEXT PRIMARY KEY,
                    legal_name TEXT NOT NULL,
                    gstin TEXT NOT NULL,
                    financial_year TEXT NOT NULL,
                    status TEXT NOT NULL,
                    risk_level TEXT NOT NULL DEFAULT 'Not assessed',
                    financial_inputs TEXT NOT NULL DEFAULT '{}',
                    result_json TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS files (
                    id TEXT PRIMARY KEY,
                    case_id TEXT NOT NULL,
                    original_name TEXT NOT NULL,
                    stored_name TEXT NOT NULL,
                    size INTEGER NOT NULL,
                    sha256 TEXT NOT NULL,
                    role TEXT NOT NULL DEFAULT 'unknown',
                    status TEXT NOT NULL DEFAULT 'uploaded',
                    confidence REAL NOT NULL DEFAULT 0,
                    notes TEXT NOT NULL DEFAULT '[]',
                    profile_json TEXT NOT NULL DEFAULT '{}',
                    mapping_json TEXT NOT NULL DEFAULT '{}',
                    normalized_json TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(case_id) REFERENCES cases(id)
                );
                CREATE TABLE IF NOT EXISTS runs (
                    id TEXT PRIMARY KEY,
                    case_id TEXT NOT NULL,
                    status TEXT NOT NULL,
                    model TEXT,
                    result_json TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL,
                    finished_at TEXT
                );
                """
            )

    def create_case(self, payload: CaseCreate) -> dict[str, Any]:
        case_id = uuid.uuid4().hex[:12]
        now = utc_now()
        with self._connect() as db:
            db.execute(
                "INSERT INTO cases(id,legal_name,gstin,financial_year,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
                (case_id, payload.legal_name, payload.gstin.upper(), payload.financial_year, "Draft", now, now),
            )
        return self.get_case(case_id)

    def list_cases(self) -> list[dict[str, Any]]:
        with self._connect() as db:
            rows = db.execute(
                """SELECT c.*, COUNT(f.id) AS file_count
                   FROM cases c LEFT JOIN files f ON f.case_id=c.id
                   GROUP BY c.id ORDER BY c.updated_at DESC"""
            ).fetchall()
        return [self._decode_case(dict(row)) for row in rows]

    def get_case(self, case_id: str) -> dict[str, Any]:
        with self._connect() as db:
            row = db.execute("SELECT * FROM cases WHERE id=?", (case_id,)).fetchone()
            if not row:
                raise KeyError(case_id)
            count = db.execute("SELECT COUNT(*) FROM files WHERE case_id=?", (case_id,)).fetchone()[0]
        result = self._decode_case(dict(row))
        result["file_count"] = count
        return result

    def _decode_case(self, value: dict[str, Any]) -> dict[str, Any]:
        value["financial_inputs"] = json.loads(value.get("financial_inputs") or "{}")
        value["result"] = json.loads(value.pop("result_json", "{}") or "{}")
        return value

    def update_case(self, case_id: str, **values: Any) -> None:
        if not values:
            return
        values["updated_at"] = utc_now()
        fields = ",".join(f"{key}=?" for key in values)
        with self._connect() as db:
            db.execute(f"UPDATE cases SET {fields} WHERE id=?", (*values.values(), case_id))

    def save_financial_inputs(self, case_id: str, inputs: FinancialInputs) -> None:
        self.update_case(case_id, financial_inputs=inputs.model_dump_json())

    def save_result(self, case_id: str, result: dict[str, Any]) -> None:
        self.update_case(
            case_id,
            result_json=json.dumps(result, default=str),
            status=result.get("status", "Ready for review"),
            risk_level=result.get("risk_level", "Review"),
        )

    @staticmethod
    def _safe_filename(name: str) -> str:
        clean = re.sub(r"[^A-Za-z0-9._ -]+", "_", Path(name).name).strip(" .")
        return clean or "upload.bin"

    async def save_upload(self, case_id: str, upload: UploadFile) -> dict[str, Any]:
        content = await upload.read()
        digest = hashlib.sha256(content).hexdigest()
        file_id = uuid.uuid4().hex[:12]
        original = Path(upload.filename or "upload.bin").name
        stored_name = f"{file_id}_{self._safe_filename(original)}"
        case_dir = self.case_dir(case_id) / "uploads"
        case_dir.mkdir(parents=True, exist_ok=True)
        path = case_dir / stored_name
        path.write_bytes(content)
        now = utc_now()
        with self._connect() as db:
            db.execute(
                """INSERT INTO files(id,case_id,original_name,stored_name,size,sha256,created_at)
                   VALUES(?,?,?,?,?,?,?)""",
                (file_id, case_id, original, stored_name, len(content), digest, now),
            )
        return self.get_file(file_id)

    def get_file(self, file_id: str) -> dict[str, Any]:
        with self._connect() as db:
            row = db.execute("SELECT * FROM files WHERE id=?", (file_id,)).fetchone()
            if not row:
                raise KeyError(file_id)
        return self._decode_file(dict(row))

    def list_files(self, case_id: str) -> list[dict[str, Any]]:
        with self._connect() as db:
            rows = db.execute("SELECT * FROM files WHERE case_id=? ORDER BY created_at", (case_id,)).fetchall()
        return [self._decode_file(dict(row)) for row in rows]

    @staticmethod
    def _decode_file(value: dict[str, Any]) -> dict[str, Any]:
        for key in ("notes", "profile_json", "mapping_json", "normalized_json"):
            value[key.replace("_json", "")] = json.loads(value.pop(key, "{}") or ("[]" if key == "notes" else "{}"))
        return value

    def update_file(self, file_id: str, **values: Any) -> None:
        encoded: dict[str, Any] = {}
        for key, value in values.items():
            db_key = key
            if key in {"profile", "mapping", "normalized"}:
                db_key = f"{key}_json"
                value = json.dumps(value, default=str)
            elif key == "notes":
                value = json.dumps(value)
            encoded[db_key] = value
        fields = ",".join(f"{key}=?" for key in encoded)
        with self._connect() as db:
            db.execute(f"UPDATE files SET {fields} WHERE id=?", (*encoded.values(), file_id))

    def delete_file(self, file_id: str) -> None:
        record = self.get_file(file_id)
        self.file_path(record).unlink(missing_ok=True)
        with self._connect() as db:
            db.execute("DELETE FROM files WHERE id=?", (file_id,))
        self.update_case(record["case_id"], status="Files uploaded")

    def file_path(self, file_record: dict[str, Any]) -> Path:
        return self.case_dir(file_record["case_id"]) / "uploads" / file_record["stored_name"]

    def case_dir(self, case_id: str) -> Path:
        directory = self.root / "cases" / case_id
        directory.mkdir(parents=True, exist_ok=True)
        return directory

    def reports_dir(self, case_id: str) -> Path:
        directory = self.case_dir(case_id) / "reports"
        directory.mkdir(parents=True, exist_ok=True)
        return directory

    def create_run(self, case_id: str, model: str) -> str:
        run_id = uuid.uuid4().hex[:12]
        with self._connect() as db:
            db.execute(
                "INSERT INTO runs(id,case_id,status,model,created_at) VALUES(?,?,?,?,?)",
                (run_id, case_id, "running", model, utc_now()),
            )
        return run_id

    def finish_run(self, run_id: str, status: str, result: dict[str, Any]) -> None:
        with self._connect() as db:
            db.execute(
                "UPDATE runs SET status=?,result_json=?,finished_at=? WHERE id=?",
                (status, json.dumps(result, default=str), utc_now(), run_id),
            )

    def list_runs(self, case_id: str | None = None) -> list[dict[str, Any]]:
        query = "SELECT * FROM runs"
        params: Iterable[Any] = ()
        if case_id:
            query += " WHERE case_id=?"
            params = (case_id,)
        query += " ORDER BY created_at DESC LIMIT 50"
        with self._connect() as db:
            rows = db.execute(query, params).fetchall()
        result = []
        for row in rows:
            item = dict(row)
            item["result"] = json.loads(item.pop("result_json", "{}") or "{}")
            result.append(item)
        return result


storage = Storage()

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class DocumentRole(str, Enum):
    outward_register = "outward_register"
    inward_register = "inward_register"
    gstr2b = "gstr2b"
    gstr1_summary = "gstr1_summary"
    gstr3b_summary = "gstr3b_summary"
    cash_ledger = "cash_ledger"
    credit_ledger = "credit_ledger"
    rcm_working = "rcm_working"
    hsn_outward = "hsn_outward"
    hsn_inward = "hsn_inward"
    inward_reconciliation = "inward_reconciliation"
    table8_reconciliation = "table8_reconciliation"
    tax_rate_summary = "tax_rate_summary"
    portal_gstr9 = "portal_gstr9"
    reference_gstr9 = "reference_gstr9"
    reference_gstr9c = "reference_gstr9c"
    unknown = "unknown"


class CaseCreate(BaseModel):
    legal_name: str = Field(min_length=2, max_length=160)
    gstin: str = Field(min_length=15, max_length=15)
    financial_year: str = Field(pattern=r"^\d{4}-\d{2}$")


class FinancialInputs(BaseModel):
    audited_turnover: float | None = None
    book_itc: float | None = None
    trade_discount_adjustment: float = 0
    opening_unbilled_revenue: float = 0
    closing_unbilled_revenue: float = 0
    closing_unadjusted_advances: float = 0
    opening_unadjusted_advances: float = 0
    exempt_nil_non_gst_turnover: float = 0
    zero_rated_without_tax: float = 0
    recipient_rcm_turnover: float = 0
    prior_year_itc_claimed: float = 0
    current_year_itc_claimed_later: float = 0
    other_turnover_adjustment: float = 0
    audited_under_act: str = "Companies Act"
    trade_name: str = ""
    arn: str = ""
    filing_date: str = ""
    signatory_name: str = ""
    signatory_designation: str = ""
    gstr9c_arn: str = ""
    gstr9c_arn_date: str = ""


class OfficialReturnHeader(BaseModel):
    model_config = ConfigDict(extra="forbid")

    financial_year: str
    gstin: str
    legal_name: str
    trade_name: str
    arn: str
    filing_date: str
    audited_under_act: str


class OfficialReturnRow(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    description: str
    values: list[float | None]
    note: str
    source: str
    status: str


class OfficialReturnTable(BaseModel):
    model_config = ConfigDict(extra="forbid")

    number: str
    part: str
    title: str
    columns: list[str]
    rows: list[OfficialReturnRow]


class OfficialReturnDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")

    form: str
    status: str
    header: OfficialReturnHeader
    tables: list[OfficialReturnTable]
    declaration_text: str
    signatory_name: str
    signatory_designation: str
    declaration_date: str


class OfficialReturnBundle(BaseModel):
    model_config = ConfigDict(extra="forbid")

    gstr9: OfficialReturnDocument
    gstr9c: OfficialReturnDocument


class MappingDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    document_role: DocumentRole
    source_sheet: str | None = None
    header_row: int | None = None
    data_start_row: int | None = None
    columns: dict[str, str] = Field(default_factory=dict)
    transformations: dict[str, str] = Field(default_factory=dict)
    confidence: float = Field(ge=0, le=1)
    notes: list[str] = Field(default_factory=list)


class CaseRecord(BaseModel):
    id: str
    legal_name: str
    gstin: str
    financial_year: str
    status: str
    created_at: datetime
    updated_at: datetime
    file_count: int = 0
    risk_level: str = "Not assessed"


class FileRecord(BaseModel):
    id: str
    case_id: str
    original_name: str
    stored_name: str
    size: int
    sha256: str
    role: DocumentRole = DocumentRole.unknown
    status: str = "uploaded"
    confidence: float = 0
    notes: list[str] = Field(default_factory=list)
    created_at: datetime


class WorkflowState(BaseModel):
    case_id: str
    file_ids: list[str] = Field(default_factory=list)
    profiles: list[dict[str, Any]] = Field(default_factory=list)
    mappings: list[dict[str, Any]] = Field(default_factory=list)
    normalized: list[dict[str, Any]] = Field(default_factory=list)
    validation: list[dict[str, Any]] = Field(default_factory=list)
    result: dict[str, Any] = Field(default_factory=dict)
    reports: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)


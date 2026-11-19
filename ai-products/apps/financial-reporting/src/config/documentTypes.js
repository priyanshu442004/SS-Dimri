// Document Type Configuration
// Maps document types to their expected reports and display settings

export const DOCUMENT_TYPE_CONFIG = {
  bank_statement: {
    label: "Bank Statement",
    reports: [
      "cash_flow_statement",
      "ledger_entries",
      "payment_receipt_summary",
      "anomaly_suspicious_transaction_report",
      "bank_reconciliation"
    ],
    showTransactions: true,
    showCharts: true,
    showRatios: false,
    insights: [
      { key: "total_deposits", label: "Total Credits" },
      { key: "total_withdrawals", label: "Total Debits" },
      { key: "opening_balance", label: "Opening Balance" },
      { key: "closing_balance", label: "Closing Balance" }
    ]
  },
  gst_return: {
    label: "GST Return",
    reports: [
      "gst_reconciliation",
      "itc_utilization_report",
      "output_vs_input_tax_summary",
      "gst_liability_statement",
      "gstr_vs_invoice_match_report"
    ],
    showTransactions: false,
    showCharts: false,
    showRatios: false,
    insights: [
      { key: "total_output_tax", label: "Total Output Tax" },
      { key: "total_input_tax", label: "Total Input Tax" },
      { key: "net_tax_payable", label: "Net Tax Payable" },
      { key: "itc_available", label: "ITC Available" }
    ]
  },
  invoice: {
    label: "Invoice",
    reports: [
      "sales_ledger",
      "customer_outstanding_summary",
      "gst_breakdown",
      "invoice_aging",
      "payment_due_summary"
    ],
    showTransactions: false,
    showCharts: true,
    showRatios: false,
    insights: [
      { key: "total_invoice_amount", label: "Total Invoice Amount" },
      { key: "total_outstanding", label: "Total Outstanding" },
      { key: "total_paid", label: "Total Paid" },
      { key: "total_tax", label: "Total Tax" }
    ]
  },
  purchase_order: {
    label: "Purchase Order",
    reports: [
      "vendor_ledger",
      "purchase_summary",
      "category_spend_report",
      "po_vs_invoice_matching",
      "payables_summary"
    ],
    showTransactions: false,
    showCharts: true,
    showRatios: false,
    insights: [
      { key: "total_purchase_amount", label: "Total Purchase Amount" },
      { key: "total_payables", label: "Total Payables" },
      { key: "total_paid", label: "Total Paid" },
      { key: "total_tax", label: "Total Tax" }
    ]
  },
  salary_slip: {
    label: "Salary Slip",
    reports: [
      "salary_summary",
      "allowances_deductions_report",
      "pf_esi_tds_summary",
      "employee_cost_report",
      "payroll_journal_entries"
    ],
    showTransactions: false,
    showCharts: true,
    showRatios: false,
    insights: [
      { key: "gross_salary", label: "Gross Salary" },
      { key: "total_deductions", label: "Total Deductions" },
      { key: "net_salary", label: "Net Salary" },
      { key: "cost_to_company", label: "Cost to Company" }
    ]
  },
  profit_loss: {
    label: "Profit & Loss Statement",
    reports: [
      "profitability_summary",
      "revenue_vs_expense_analysis",
      "margin_kpis",
      "operating_vs_non_operating_split",
      "period_wise_profit_trend"
    ],
    showTransactions: false,
    showCharts: true,
    showRatios: true,
    insights: [
      { key: "total_revenue", label: "Total Revenue" },
      { key: "total_expenses", label: "Total Expenses" },
      { key: "gross_profit", label: "Gross Profit" },
      { key: "net_profit", label: "Net Profit" }
    ]
  },
  trial_balance: {
    label: "Trial Balance",
    reports: [
      "profit_loss",
      "balance_sheet",
      "cash_flow",
      "accounting_ratios",
      "management_report"
    ],
    showTransactions: false,
    showCharts: true,
    showRatios: true,
    insights: [
      { key: "total_debits", label: "Total Debits" },
      { key: "total_credits", label: "Total Credits" },
      { key: "difference", label: "Difference" },
      { key: "is_balanced", label: "Is Balanced" }
    ]
  },
  balance_sheet: {
    label: "Balance Sheet",
    reports: [
      "asset_liability_schedules",
      "net_worth_statement",
      "solvency_liquidity_summary",
      "equity_movement_statement",
      "financial_position_report"
    ],
    showTransactions: false,
    showCharts: false,
    showRatios: false,
    insights: [
      { key: "total_assets", label: "Total Assets" },
      { key: "total_liabilities", label: "Total Liabilities" },
      { key: "net_worth", label: "Net Worth" },
      { key: "equity", label: "Equity" }
    ]
  },
  audit: {
    label: "Audit",
    reports: [
      "audit_ready_summary",
      "supporting_schedules",
      "adjustment_notes",
      "working_papers",
      "final_audit_pack"
    ],
    showTransactions: false,
    showCharts: false,
    showRatios: false,
    insights: [
      { key: "total_adjustments", label: "Total Adjustments" },
      { key: "key_findings", label: "Key Findings" },
      { key: "audit_status", label: "Audit Status" },
      { key: "compliance_score", label: "Compliance Score" }
    ]
  },
  audit_papers: {
    label: "Audit Papers",
    reports: [
      "audit_ready_summary",
      "supporting_schedules",
      "adjustment_notes",
      "working_papers",
      "final_audit_pack"
    ],
    showTransactions: false,
    showCharts: false,
    showRatios: false,
    insights: [
      { key: "total_adjustments", label: "Total Adjustments" },
      { key: "key_findings", label: "Key Findings" },
      { key: "audit_status", label: "Audit Status" },
      { key: "compliance_score", label: "Compliance Score" }
    ]
  },
  agreement_contract: {
    label: "Agreement/Contract",
    reports: [
      "contract_summary",
      "key_clause_extraction",
      "risk_obligation_analysis",
      "term_compliance_summary"
    ],
    showTransactions: false,
    showCharts: false,
    showRatios: false,
    insights: [
      { key: "contract_type", label: "Contract Type" },
      { key: "total_obligations", label: "Total Obligations" },
      { key: "total_risks", label: "Total Risks" },
      { key: "compliance_status", label: "Compliance Status" }
    ]
  }
};

// Get configuration for a document type
export const getDocumentTypeConfig = (documentType) => {
  return DOCUMENT_TYPE_CONFIG[documentType] || DOCUMENT_TYPE_CONFIG.bank_statement;
};

// Get expected reports for a document type
export const getExpectedReports = (documentType) => {
  const config = getDocumentTypeConfig(documentType);
  return config.reports || [];
};

// Check if a report belongs to a document type
export const isReportForDocumentType = (reportName, documentType) => {
  const expectedReports = getExpectedReports(documentType);
  return expectedReports.includes(reportName);
};


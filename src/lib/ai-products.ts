// The AI products (copied from aiproducts.analytx4t.com into ai-products/apps/). Each one is a
// separate Vite app served by nginx at /ai-products/<slug>/ with its own backend, embedded in
// the ERP at /app/ai-products/<slug>. Released to the AI_PRODUCTS_EMAILS logins only
// (capability "ai_products.use"); nginx asks /api/ai-products/auth before serving any of it.
// Slugs are stable ids shared with the nginx file and PM2 file in ai-products/deploy/.

export type AiProduct = {
  slug: string;
  name: string;
  /** Sidebar label */
  short: string;
  icon: string;
  category: string;
  summary: string;
  /** Path inside the product to open first (relative to its base). */
  entry?: string;
};

export const AI_PRODUCTS: readonly AiProduct[] = [
  {
    slug: "invoice-automation",
    name: "Invoice Automation",
    short: "Invoice Automation",
    icon: "receipt",
    category: "Accounts payable",
    summary: "Drop supplier invoice PDFs: supplier, GSTIN, items and totals are extracted, GST is recalculated, and duplicates and inflated totals are flagged.",
  },
  {
    slug: "bank-reconciliation",
    name: "Bank Reconciliation",
    short: "Bank Reconciliation",
    icon: "landmark",
    category: "Accounting automation",
    summary: "Match bank statement lines against the cash book (exact, amount + date, one-to-many, many-to-one) and explain every rupee of the difference.",
  },
  {
    slug: "financial-reporting",
    name: "Trial Balance",
    short: "Trial Balance",
    icon: "scale",
    category: "Financial statements",
    summary: "Upload a raw trial balance and get the Schedule III balance sheet, profit & loss and notes to accounts, classified by AI and exportable to Excel.",
    entry: "dashboard",
  },
  {
    slug: "virtual-cfo",
    name: "Financial Statement Analysis",
    short: "Financial Statement Analysis",
    icon: "trending",
    category: "Finance intelligence",
    summary: "Upload the Balance Sheet, P&L, Cash Flow and Ratio Analysis for a scored financial health report, then chat with an AI analyst about them.",
  },
  {
    slug: "gst-reconciliation",
    name: "GST Reconciliation",
    short: "GST Reconciliation",
    icon: "percent",
    category: "Indirect tax",
    summary: "Upload the annual GST source package: books are matched against GSTR-1 / 2B / 3B, exceptions explained, and GSTR-9 / 9C workings generated.",
  },
  {
    slug: "tds-return",
    name: "TDS Return Preparation & Reconciliation",
    short: "TDS Returns",
    icon: "receipt-text",
    category: "Direct tax",
    summary: "Check PAN, section and rate for every payment, reconcile challans with TDS booked, and get a review-ready summary by email.",
  },
  {
    slug: "vendor-ledger",
    name: "Vendor Ledger Reconciliation",
    short: "Vendor Ledger",
    icon: "truck",
    category: "Accounts payable",
    summary: "Match your vendor ledger against the supplier's statement of account and get every difference explained with a next action.",
  },
  {
    slug: "customer-ledger",
    name: "Customer Ledger Reconciliation",
    short: "Customer Ledger",
    icon: "handshake",
    category: "Accounts receivable",
    summary: "Match your customer ledger against the customer's statement, explain each difference, and line invoices up for ageing.",
  },
  // Payroll & Compliance (slug "payroll-compliance") is switched off, as on aiproducts.analytx4t.com.
  {
    slug: "fixed-asset-register",
    name: "Fixed Asset Register & Depreciation Computation",
    short: "Fixed Assets & Depreciation",
    icon: "package",
    category: "Fixed assets",
    summary: "Roll the asset register forward with additions and disposals, read capital invoices, and compute book depreciation from the class policy.",
  },
];

export const aiProductBySlug = (slug: string) => AI_PRODUCTS.find((p) => p.slug === slug);

/** Where the product's own site is served (nginx). */
export const aiProductUrl = (p: AiProduct) => `/ai-products/${p.slug}/${p.entry ?? ""}`;

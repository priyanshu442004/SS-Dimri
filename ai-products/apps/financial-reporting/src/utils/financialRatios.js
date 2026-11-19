/**
 * Comprehensive Financial Ratios Calculator
 * Calculates all essential financial ratios for company analysis
 */

/**
 * Calculate all financial ratios from transaction data
 * @param {Object} data - Financial data object
 * @param {Array} transactions - Array of transaction objects
 * @param {Object} summary - Summary statistics
 * @returns {Object} - Object containing all calculated ratios
 */
export function calculateFinancialRatios(data, transactions = [], summary = {}) {
  const totalCredits = summary.total_credits || 0;
  const totalDebits = summary.total_debits || 0;
  const openingBalance = summary.opening_balance || 0;
  const closingBalance = summary.closing_balance || 0;
  const netCashFlow = totalCredits - totalDebits;
  
  // Extract transaction amounts
  const creditTransactions = transactions.filter(t => t.credit || (t.type === 'Credit' && t.amount > 0));
  const debitTransactions = transactions.filter(t => t.debit || (t.type === 'Debit' && t.amount < 0));
  
  const avgCredit = creditTransactions.length > 0 
    ? creditTransactions.reduce((sum, t) => sum + (t.credit || Math.abs(t.amount) || 0), 0) / creditTransactions.length 
    : 0;
  const avgDebit = debitTransactions.length > 0 
    ? debitTransactions.reduce((sum, t) => sum + (t.debit || Math.abs(t.amount) || 0), 0) / debitTransactions.length 
    : 0;

  // Calculate transaction frequency
  const transactionCount = transactions.length || 0;
  const creditCount = creditTransactions.length;
  const debitCount = debitTransactions.length;

  // Calculate ratios
  const ratios = {
    // ========== LIQUIDITY RATIOS ==========
    liquidity: {
      currentRatio: closingBalance > 0 && totalDebits > 0 
        ? (closingBalance / totalDebits).toFixed(2) 
        : 'N/A',
      quickRatio: closingBalance > 0 && totalDebits > 0 
        ? (closingBalance / totalDebits).toFixed(2) 
        : 'N/A',
      cashRatio: closingBalance > 0 && totalDebits > 0 
        ? (closingBalance / totalDebits).toFixed(2) 
        : 'N/A',
      workingCapital: (closingBalance - totalDebits).toFixed(2),
    },

    // ========== PROFITABILITY RATIOS ==========
    profitability: {
      grossProfitMargin: totalCredits > 0 
        ? ((netCashFlow / totalCredits) * 100).toFixed(2) + '%' 
        : 'N/A',
      netProfitMargin: totalCredits > 0 
        ? ((netCashFlow / totalCredits) * 100).toFixed(2) + '%' 
        : 'N/A',
      returnOnEquity: closingBalance > 0 
        ? ((netCashFlow / closingBalance) * 100).toFixed(2) + '%' 
        : 'N/A',
      returnOnAssets: closingBalance > 0 
        ? ((netCashFlow / closingBalance) * 100).toFixed(2) + '%' 
        : 'N/A',
      operatingMargin: totalCredits > 0 
        ? ((netCashFlow / totalCredits) * 100).toFixed(2) + '%' 
        : 'N/A',
    },

    // ========== EFFICIENCY RATIOS ==========
    efficiency: {
      assetTurnover: closingBalance > 0 
        ? (totalCredits / closingBalance).toFixed(2) 
        : 'N/A',
      receivablesTurnover: avgCredit > 0 && transactionCount > 0
        ? (totalCredits / (avgCredit * transactionCount)).toFixed(2)
        : 'N/A',
      payablesTurnover: avgDebit > 0 && transactionCount > 0
        ? (totalDebits / (avgDebit * transactionCount)).toFixed(2)
        : 'N/A',
      cashTurnover: closingBalance > 0
        ? (totalCredits / closingBalance).toFixed(2)
        : 'N/A',
    },

    // ========== LEVERAGE RATIOS ==========
    leverage: {
      debtToEquity: closingBalance > 0
        ? (totalDebits / closingBalance).toFixed(2)
        : 'N/A',
      debtRatio: (totalDebits + closingBalance) > 0
        ? ((totalDebits / (totalDebits + closingBalance)) * 100).toFixed(2) + '%'
        : 'N/A',
      equityRatio: (totalDebits + closingBalance) > 0
        ? ((closingBalance / (totalDebits + closingBalance)) * 100).toFixed(2) + '%'
        : 'N/A',
      debtServiceCoverage: totalDebits > 0
        ? (netCashFlow / totalDebits).toFixed(2)
        : 'N/A',
    },

    // ========== ACTIVITY RATIOS ==========
    activity: {
      workingCapitalTurnover: (closingBalance - totalDebits) > 0
        ? (totalCredits / (closingBalance - totalDebits)).toFixed(2)
        : 'N/A',
      daysSalesOutstanding: avgCredit > 0 && transactionCount > 0
        ? ((avgCredit * transactionCount) / (totalCredits / 30)).toFixed(1)
        : 'N/A',
      daysPayableOutstanding: avgDebit > 0 && transactionCount > 0
        ? ((avgDebit * transactionCount) / (totalDebits / 30)).toFixed(1)
        : 'N/A',
      cashConversionCycle: 'N/A', // Requires inventory data
    },

    // ========== CASH FLOW RATIOS ==========
    cashFlow: {
      operatingCashFlowRatio: totalDebits > 0
        ? (netCashFlow / totalDebits).toFixed(2)
        : 'N/A',
      cashFlowCoverageRatio: totalDebits > 0
        ? (netCashFlow / totalDebits).toFixed(2)
        : 'N/A',
      freeCashFlow: netCashFlow.toFixed(2),
      cashFlowMargin: totalCredits > 0
        ? ((netCashFlow / totalCredits) * 100).toFixed(2) + '%'
        : 'N/A',
    },

    // ========== GROWTH RATIOS ==========
    growth: {
      revenueGrowth: openingBalance > 0
        ? (((closingBalance - openingBalance) / openingBalance) * 100).toFixed(2) + '%'
        : 'N/A',
      profitGrowth: openingBalance > 0 && netCashFlow > 0
        ? ((netCashFlow / openingBalance) * 100).toFixed(2) + '%'
        : 'N/A',
      balanceGrowth: openingBalance > 0
        ? (((closingBalance - openingBalance) / openingBalance) * 100).toFixed(2) + '%'
        : 'N/A',
    },

    // ========== TRANSACTION ANALYSIS ==========
    transaction: {
      averageTransactionSize: transactionCount > 0
        ? ((totalCredits + totalDebits) / transactionCount).toFixed(2)
        : 'N/A',
      creditToDebitRatio: totalDebits > 0
        ? (totalCredits / totalDebits).toFixed(2)
        : 'N/A',
      transactionFrequency: transactionCount,
      creditFrequency: creditCount,
      debitFrequency: debitCount,
    },

    // ========== BALANCE ANALYSIS ==========
    balance: {
      openingBalance: openingBalance.toFixed(2),
      closingBalance: closingBalance.toFixed(2),
      netChange: (closingBalance - openingBalance).toFixed(2),
      percentageChange: openingBalance > 0
        ? (((closingBalance - openingBalance) / openingBalance) * 100).toFixed(2) + '%'
        : 'N/A',
    },
  };

  return ratios;
}

/**
 * Get ratio descriptions and interpretations
 */
export function getRatioDescriptions() {
  return {
    liquidity: {
      currentRatio: {
        name: 'Current Ratio',
        description: 'Measures ability to pay short-term obligations. Ideal: > 1.0',
        formula: 'Current Assets / Current Liabilities',
      },
      quickRatio: {
        name: 'Quick Ratio',
        description: 'Measures immediate liquidity without inventory. Ideal: > 0.5',
        formula: '(Current Assets - Inventory) / Current Liabilities',
      },
      cashRatio: {
        name: 'Cash Ratio',
        description: 'Most conservative liquidity measure. Ideal: > 0.2',
        formula: 'Cash / Current Liabilities',
      },
      workingCapital: {
        name: 'Working Capital',
        description: 'Difference between current assets and liabilities',
        formula: 'Current Assets - Current Liabilities',
      },
    },
    profitability: {
      grossProfitMargin: {
        name: 'Gross Profit Margin',
        description: 'Percentage of revenue remaining after direct costs. Higher is better.',
        formula: '(Revenue - COGS) / Revenue × 100',
      },
      netProfitMargin: {
        name: 'Net Profit Margin',
        description: 'Percentage of revenue as profit. Ideal: > 10%',
        formula: 'Net Income / Revenue × 100',
      },
      returnOnEquity: {
        name: 'Return on Equity (ROE)',
        description: 'Profitability relative to shareholder equity. Ideal: > 15%',
        formula: 'Net Income / Shareholder Equity × 100',
      },
      returnOnAssets: {
        name: 'Return on Assets (ROA)',
        description: 'Efficiency of asset utilization. Ideal: > 5%',
        formula: 'Net Income / Total Assets × 100',
      },
      operatingMargin: {
        name: 'Operating Margin',
        description: 'Operating profit as percentage of revenue',
        formula: 'Operating Income / Revenue × 100',
      },
    },
    efficiency: {
      assetTurnover: {
        name: 'Asset Turnover',
        description: 'Revenue generated per unit of assets. Higher is better.',
        formula: 'Revenue / Total Assets',
      },
      receivablesTurnover: {
        name: 'Receivables Turnover',
        description: 'How quickly receivables are collected. Higher is better.',
        formula: 'Credit Sales / Average Accounts Receivable',
      },
      payablesTurnover: {
        name: 'Payables Turnover',
        description: 'How quickly payables are paid. Lower may indicate cash flow issues.',
        formula: 'Purchases / Average Accounts Payable',
      },
      cashTurnover: {
        name: 'Cash Turnover',
        description: 'Efficiency of cash utilization',
        formula: 'Revenue / Average Cash Balance',
      },
    },
    leverage: {
      debtToEquity: {
        name: 'Debt-to-Equity Ratio',
        description: 'Relative proportion of debt and equity. Ideal: < 2.0',
        formula: 'Total Debt / Total Equity',
      },
      debtRatio: {
        name: 'Debt Ratio',
        description: 'Percentage of assets financed by debt. Ideal: < 60%',
        formula: 'Total Debt / Total Assets × 100',
      },
      equityRatio: {
        name: 'Equity Ratio',
        description: 'Percentage of assets financed by equity. Ideal: > 40%',
        formula: 'Total Equity / Total Assets × 100',
      },
      debtServiceCoverage: {
        name: 'Debt Service Coverage Ratio',
        description: 'Ability to service debt. Ideal: > 1.25',
        formula: 'Operating Income / Debt Service',
      },
    },
    activity: {
      workingCapitalTurnover: {
        name: 'Working Capital Turnover',
        description: 'Efficiency of working capital usage. Higher is better.',
        formula: 'Revenue / Working Capital',
      },
      daysSalesOutstanding: {
        name: 'Days Sales Outstanding (DSO)',
        description: 'Average days to collect receivables. Lower is better.',
        formula: '(Accounts Receivable / Credit Sales) × 30',
      },
      daysPayableOutstanding: {
        name: 'Days Payable Outstanding (DPO)',
        description: 'Average days to pay suppliers. Higher may indicate cash management.',
        formula: '(Accounts Payable / Purchases) × 30',
      },
    },
    cashFlow: {
      operatingCashFlowRatio: {
        name: 'Operating Cash Flow Ratio',
        description: 'Ability to pay debts from operating cash flow. Ideal: > 1.0',
        formula: 'Operating Cash Flow / Current Liabilities',
      },
      cashFlowCoverageRatio: {
        name: 'Cash Flow Coverage Ratio',
        description: 'Ability to cover debt obligations. Ideal: > 1.0',
        formula: 'Operating Cash Flow / Total Debt',
      },
      freeCashFlow: {
        name: 'Free Cash Flow',
        description: 'Cash available after capital expenditures',
        formula: 'Operating Cash Flow - Capital Expenditures',
      },
      cashFlowMargin: {
        name: 'Cash Flow Margin',
        description: 'Operating cash flow as percentage of revenue',
        formula: 'Operating Cash Flow / Revenue × 100',
      },
    },
    growth: {
      revenueGrowth: {
        name: 'Revenue Growth Rate',
        description: 'Year-over-year revenue growth percentage',
        formula: '((Current Revenue - Previous Revenue) / Previous Revenue) × 100',
      },
      profitGrowth: {
        name: 'Profit Growth Rate',
        description: 'Year-over-year profit growth percentage',
        formula: '((Current Profit - Previous Profit) / Previous Profit) × 100',
      },
      balanceGrowth: {
        name: 'Balance Growth Rate',
        description: 'Growth in account balance over period',
        formula: '((Closing Balance - Opening Balance) / Opening Balance) × 100',
      },
    },
  };
}



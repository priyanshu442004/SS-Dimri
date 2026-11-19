import React from 'react';

/**
 * Format value based on type
 */
const formatValue = (value, formatType = 'number') => {
  if (value === null || value === undefined || value === 'N/A' || value === 'NA') {
    return 'N/A';
  }
  
  const numValue = typeof value === 'string' ? parseFloat(value.replace(/[%,₹,]/g, '')) : value;
  
  if (isNaN(numValue)) {
    return value;
  }
  
  if (formatType === 'percentage') {
    return `${numValue.toFixed(1)}%`;
  } else if (formatType === 'currency') {
    // Format Indian currency
    const formatted = Math.abs(numValue).toLocaleString('en-IN', { maximumFractionDigits: 0 });
    return `₹${formatted}`;
  } else if (formatType === 'times') {
    return numValue.toFixed(2);
  } else {
    return numValue.toFixed(1);
  }
};

/**
 * Get value from ratios object
 */
const getRatioValue = (ratios, path) => {
  if (!ratios) return null;
  
  const keys = path.split('.');
  let value = ratios;
  
  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key];
    } else {
      return null;
    }
  }
  
  return value !== null && value !== undefined && value !== 'N/A' && value !== 'NA' ? value : null;
};

/**
 * Calculate derived ratios
 */
const calculateDerivedRatios = (ratios) => {
  const derived = {};
  
  // Quick Ratio = (Current Assets - Inventory) / Current Liabilities
  const currentAssets = getRatioValue(ratios, 'liquidity.currentAssets') || 
                       getRatioValue(ratios, 'balanceSheet.currentAssets');
  const inventory = getRatioValue(ratios, 'balanceSheet.inventory') || 0;
  const currentLiabilities = getRatioValue(ratios, 'liquidity.currentLiabilities') || 
                            getRatioValue(ratios, 'balanceSheet.currentLiabilities');
  if (currentAssets && currentLiabilities) {
    derived.quickRatio = (currentAssets - inventory) / currentLiabilities;
  }
  
  // Cash Ratio = Cash / Current Liabilities
  const cash = getRatioValue(ratios, 'balanceSheet.cash') || 
              (getRatioValue(ratios, 'balanceSheet.cashInHand') || 0) + 
              (getRatioValue(ratios, 'balanceSheet.bankAccount') || 0);
  if (cash && currentLiabilities) {
    derived.cashRatio = cash / currentLiabilities;
  }
  
  // Gross Margin = (Revenue - COGS) / Revenue * 100
  const revenue = getRatioValue(ratios, 'profitability.revenue') || 
                 getRatioValue(ratios, 'incomeStatement.revenue') ||
                 getRatioValue(ratios, 'cashFlow.revenue');
  const cogs = getRatioValue(ratios, 'profitability.cogs') || 
              getRatioValue(ratios, 'incomeStatement.costOfGoodsSold') || 0;
  if (revenue && revenue > 0) {
    derived.grossMargin = ((revenue - cogs) / revenue) * 100;
  }
  
  // EBITDA Margin = EBITDA / Revenue * 100
  const ebitda = getRatioValue(ratios, 'profitability.ebitda') || 
                getRatioValue(ratios, 'incomeStatement.ebitda');
  if (ebitda && revenue && revenue > 0) {
    derived.ebitdaMargin = (ebitda / revenue) * 100;
  }
  
  // ROA = Net Profit / Total Assets * 100
  const netProfit = getRatioValue(ratios, 'profitability.netProfit') || 
                   getRatioValue(ratios, 'incomeStatement.netProfit');
  const totalAssets = getRatioValue(ratios, 'balanceSheet.totalAssets');
  if (netProfit !== null && totalAssets && totalAssets > 0) {
    derived.roa = (netProfit / totalAssets) * 100;
  }
  
  // Asset Turnover = Revenue / Total Assets
  if (revenue && totalAssets && totalAssets > 0) {
    derived.assetTurnover = revenue / totalAssets;
  }
  
  // Working Capital = Current Assets - Current Liabilities
  if (currentAssets && currentLiabilities) {
    derived.workingCapital = currentAssets - currentLiabilities;
  }
  
  // Working Capital Ratio = Current Assets / Current Liabilities (same as Current Ratio)
  if (currentAssets && currentLiabilities) {
    derived.workingCapitalRatio = currentAssets / currentLiabilities;
  }
  
  // Growth calculations (YoY)
  const previousRevenue = getRatioValue(ratios, 'previousYear.profitability.revenue') || 
                         getRatioValue(ratios, 'previousYear.incomeStatement.revenue');
  if (revenue && previousRevenue && previousRevenue > 0) {
    derived.revenueGrowth = ((revenue - previousRevenue) / previousRevenue) * 100;
  }
  
  const previousExpenses = getRatioValue(ratios, 'previousYear.profitability.totalExpenses') || 
                         getRatioValue(ratios, 'previousYear.incomeStatement.totalExpenses');
  const totalExpenses = getRatioValue(ratios, 'profitability.totalExpenses') || 
                       getRatioValue(ratios, 'incomeStatement.totalExpenses');
  if (totalExpenses && previousExpenses && previousExpenses > 0) {
    derived.expenseGrowth = ((totalExpenses - previousExpenses) / previousExpenses) * 100;
  }
  
  const previousNetProfit = getRatioValue(ratios, 'previousYear.profitability.netProfit') || 
                           getRatioValue(ratios, 'previousYear.incomeStatement.netProfit');
  if (netProfit !== null && previousNetProfit !== null && previousNetProfit !== 0) {
    derived.netProfitGrowth = ((netProfit - previousNetProfit) / Math.abs(previousNetProfit)) * 100;
  }
  
  return derived;
};

/**
 * Accounting Ratios Display Component - 3-Column Table Format
 */
export function AccountingRatiosDisplay({ ratios }) {
  const derived = calculateDerivedRatios(ratios);
  
  // Define ratio categories and metrics
  const ratioCategories = [
    {
      category: 'Liquidity',
      metrics: [
        {
          name: 'Current Ratio',
          getValue: () => {
            const val = getRatioValue(ratios, 'liquidity.currentRatio') || 
                       getRatioValue(ratios, 'liquidity.current_ratio');
            return val ? formatValue(val, 'times') : 'N/A';
          }
        },
        {
          name: 'Quick Ratio',
          getValue: () => {
            const val = derived.quickRatio || 
                       getRatioValue(ratios, 'liquidity.quickRatio') || 
                       getRatioValue(ratios, 'liquidity.quick_ratio');
            return val ? formatValue(val, 'times') : 'N/A';
          }
        },
        {
          name: 'Cash Ratio',
          getValue: () => {
            const val = derived.cashRatio || 
                       getRatioValue(ratios, 'liquidity.cashRatio') || 
                       getRatioValue(ratios, 'liquidity.cash_ratio');
            return val ? formatValue(val, 'times') : 'N/A';
          }
        }
      ]
    },
    {
      category: 'Profitability',
      metrics: [
        {
          name: 'Gross Margin (%)',
          getValue: () => {
            const val = derived.grossMargin || 
                       getRatioValue(ratios, 'profitability.grossMargin') || 
                       getRatioValue(ratios, 'profitability.gross_margin');
            return val !== null ? formatValue(val, 'percentage') : 'N/A';
          }
        },
        {
          name: 'EBITDA Margin (%)',
          getValue: () => {
            const val = derived.ebitdaMargin || 
                       getRatioValue(ratios, 'profitability.ebitdaMargin') || 
                       getRatioValue(ratios, 'profitability.ebitda_margin');
            return val !== null ? formatValue(val, 'percentage') : 'N/A';
          }
        },
        {
          name: 'Return on Equity (ROE %)',
          getValue: () => {
            const val = getRatioValue(ratios, 'profitability.roe') || 
                       getRatioValue(ratios, 'profitability.returnOnEquity');
            return val !== null ? formatValue(val, 'percentage') : 'N/A';
          }
        },
        {
          name: 'Return on Assets (ROA %)',
          getValue: () => {
            const val = derived.roa || 
                       getRatioValue(ratios, 'profitability.roa') || 
                       getRatioValue(ratios, 'profitability.returnOnAssets');
            return val !== null ? formatValue(val, 'percentage') : 'N/A';
          }
        }
      ]
    },
    {
      category: 'Efficiency',
      metrics: [
        {
          name: 'Asset Turnover (times)',
          getValue: () => {
            const val = derived.assetTurnover || 
                       getRatioValue(ratios, 'efficiency.assetTurnover') || 
                       getRatioValue(ratios, 'efficiency.asset_turnover');
            return val ? formatValue(val, 'times') : 'N/A';
          }
        },
        {
          name: 'Inventory Turnover (times)',
          getValue: () => {
            const val = getRatioValue(ratios, 'efficiency.inventoryTurnover') || 
                       getRatioValue(ratios, 'efficiency.inventory_turnover');
            return val ? formatValue(val, 'times') : 'N/A';
          }
        }
      ]
    },
    {
      category: 'Solvency',
      metrics: [
        {
          name: 'Debt to Equity Ratio',
          getValue: () => {
            const val = getRatioValue(ratios, 'leverage.debtToEquity') || 
                       getRatioValue(ratios, 'leverage.debt_to_equity') || 
                       getRatioValue(ratios, 'leverage.debtEquityRatio');
            return val ? formatValue(val, 'times') : 'N/A';
          }
        },
        {
          name: 'Interest Coverage Ratio',
          getValue: () => {
            const val = getRatioValue(ratios, 'leverage.interestCoverage') || 
                       getRatioValue(ratios, 'leverage.debtServiceCoverage') || 
                       getRatioValue(ratios, 'leverage.debt_service_coverage');
            return val ? formatValue(val, 'times') : 'N/A';
          }
        }
      ]
    },
    {
      category: 'Working Capital',
      metrics: [
        {
          name: 'Working Capital Amount',
          getValue: () => {
            const val = derived.workingCapital || 
                       getRatioValue(ratios, 'workingCapital.amount');
            return val !== null ? formatValue(val, 'currency') : 'N/A';
          }
        },
        {
          name: 'Working Capital Ratio',
          getValue: () => {
            const val = derived.workingCapitalRatio || 
                       getRatioValue(ratios, 'workingCapital.ratio') ||
                       getRatioValue(ratios, 'liquidity.currentRatio') ||
                       getRatioValue(ratios, 'liquidity.current_ratio');
            return val ? formatValue(val, 'times') : 'N/A';
          }
        }
      ]
    },
    {
      category: 'Growth (YoY)',
      metrics: [
        {
          name: 'Revenue Growth',
          getValue: () => {
            const val = derived.revenueGrowth || 
                       getRatioValue(ratios, 'growth.revenueGrowth');
            return val !== null ? formatValue(val, 'percentage') : 'N/A';
          }
        },
        {
          name: 'Expense Growth',
          getValue: () => {
            const val = derived.expenseGrowth || 
                       getRatioValue(ratios, 'growth.expenseGrowth');
            return val !== null ? formatValue(val, 'percentage') : 'N/A';
          }
        },
        {
          name: 'Net Profit Growth',
          getValue: () => {
            const val = derived.netProfitGrowth || 
                       getRatioValue(ratios, 'growth.netProfitGrowth');
            return val !== null ? formatValue(val, 'percentage') : 'N/A';
          }
        }
      ]
    },
    {
      category: 'Cash Flow',
      metrics: [
        {
          name: 'Cash Flow Health Score',
          getValue: () => {
            const val = getRatioValue(ratios, 'cashFlow.healthScore') || 
                       getRatioValue(ratios, 'cashFlow.health_score');
            return val !== null ? formatValue(val, 'number') : 'N/A';
          }
        },
        {
          name: 'Revenue',
          getValue: () => {
            const val = getRatioValue(ratios, 'cashFlow.revenue') || 
                       getRatioValue(ratios, 'profitability.revenue') || 
                       getRatioValue(ratios, 'incomeStatement.revenue');
            return val !== null ? formatValue(val, 'currency') : 'N/A';
          }
        },
        {
          name: 'Operating Cash Flow',
          getValue: () => {
            const val = getRatioValue(ratios, 'cashFlow.operatingCashFlow') || 
                       getRatioValue(ratios, 'cashFlow.operating_cash_flow');
            return val !== null ? formatValue(val, 'currency') : 'N/A';
          }
        }
      ]
    }
  ];

  // Flatten categories into rows for table display
  const tableRows = [];
  ratioCategories.forEach((category) => {
    category.metrics.forEach((metric, index) => {
      tableRows.push({
        category: index === 0 ? category.category : '',
        metric: metric.name,
        value: metric.getValue()
      });
    });
  });

  return (
    <div className="bg-white p-6 rounded-lg border-2 border-gray-200 shadow-sm">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-gray-800 mb-1">Accounting Ratios</h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="border-b border-gray-200 px-4 py-3 text-left font-bold text-gray-800">Category</th>
              <th className="border-b border-gray-200 px-4 py-3 text-left font-bold text-gray-800">Metric</th>
              <th className="border-b border-gray-200 px-4 py-3 text-right font-bold text-gray-800">Value</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row, index) => (
              <tr key={index} className="hover:bg-gray-50 border-b border-gray-100">
                <td className="px-4 py-3 text-left font-medium text-gray-700">
                  {row.category}
                </td>
                <td className="px-4 py-3 text-left text-gray-700">
                  {row.metric}
                </td>
                <td className="px-4 py-3 text-right font-medium text-gray-800">
                  {row.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

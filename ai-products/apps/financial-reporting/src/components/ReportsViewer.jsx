import React, { useState } from "react";
import { 
  FileText, 
  Table, 
  BarChart3, 
  PieChart, 
  TrendingUp,
  Download,
  ChevronRight,
  ChevronDown
} from "lucide-react";
import { 
  AutoChart, 
  BarChartComponent, 
  PieChartComponent, 
  LineChartComponent, 
  AreaChartComponent,
  ComparisonChart,
  CategoryBreakdownChart,
  AccountingRatiosDisplay
} from "./Charts";
import { IncomeStatementTable, BalanceSheetTable, CashFlowStatementTable, AccountingRatiosTable } from "./Charts";
import { getExpectedReports } from "../config/documentTypes";

const ReportsViewer = ({ reports, documentType, baseResult = null }) => {
  const [expandedReports, setExpandedReports] = useState({});
  const [selectedReport, setSelectedReport] = useState(null);

  if (!reports || Object.keys(reports).length === 0) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-yellow-800">No reports available for this document type.</p>
      </div>
    );
  }

  const toggleReport = (reportName) => {
    setExpandedReports(prev => ({
      ...prev,
      [reportName]: !prev[reportName]
    }));
    setSelectedReport(prev => prev === reportName ? null : reportName);
  };

  // Recursively render nested objects - only show fields with meaningful data
  const renderNestedObject = (obj, depth = 0) => {
    if (depth > 3) return <span className="text-gray-500 text-sm">Too deeply nested</span>;
    
    // Handle non-objects
    if (obj === null || obj === undefined) {
      return <span className="text-gray-500 text-sm">No data available</span>;
    }
    
    // Handle strings - don't treat them as objects
    if (typeof obj === 'string') {
      return <span className="text-gray-900">{obj}</span>;
    }
    
    // Handle arrays
    if (Array.isArray(obj)) {
      if (obj.length === 0) {
        return <span className="text-gray-500 text-sm">No data available</span>;
      }
      // Check if array contains single characters (string split)
      if (obj.length > 0 && typeof obj[0] === 'string' && obj.every(item => typeof item === 'string' && item.length === 1)) {
        return <span className="text-gray-900">{obj.join('')}</span>;
      }
      // Otherwise render as table
      return renderTable(obj);
    }
    
    // Handle non-object primitives
    if (typeof obj !== 'object') {
      return <span className="text-gray-900">{String(obj)}</span>;
    }
    
    // Filter out null, undefined, empty arrays, and zero values
    const meaningfulEntries = Object.entries(obj).filter(([key, value]) => {
      if (value === null || value === undefined) return false;
      if (Array.isArray(value) && value.length === 0) return false;
      if (typeof value === 'number' && value === 0) return false;
      if (typeof value === 'string' && value.trim() === '') return false;
      return true;
    });
    
    if (meaningfulEntries.length === 0) {
      return <span className="text-gray-500 text-sm">No data available</span>;
    }
    
    return (
      <div className={`space-y-2 ${depth > 0 ? 'ml-4 border-l-2 border-gray-200 pl-4' : ''}`}>
        {meaningfulEntries.map(([key, value]) => {
          // If value is an array, check if it's a string split into characters
          if (Array.isArray(value)) {
            // Check if it's an array of single characters (string split)
            if (value.length > 0 && typeof value[0] === 'string' && value.every(item => typeof item === 'string' && item.length === 1)) {
              return (
                <div key={key} className="flex justify-between py-2 border-b border-gray-100">
                  <span className="font-medium text-gray-700 capitalize">{key.replace(/_/g, ' ')}:</span>
                  <span className="text-gray-900">{value.join('')}</span>
                </div>
              );
            }
            return (
              <div key={key} className="mb-4">
                <h5 className="font-semibold text-gray-700 mb-2 capitalize">{key.replace(/_/g, ' ')}</h5>
                {renderTable(value)}
              </div>
            );
          }
          
          // If value is an object, render recursively
          if (typeof value === 'object' && value !== null) {
            return (
              <div key={key} className="mb-3">
                <h5 className="font-semibold text-gray-700 mb-2 capitalize">{key.replace(/_/g, ' ')}</h5>
                {renderNestedObject(value, depth + 1)}
              </div>
            );
          }
          
          // Primitive value
          return (
            <div key={key} className="flex justify-between py-2 border-b border-gray-100">
              <span className="font-medium text-gray-700 capitalize">{key.replace(/_/g, ' ')}:</span>
              <span className="text-gray-900">
                {typeof value === 'number' 
                  ? `₹${value.toLocaleString('en-IN')}` 
                  : typeof value === 'boolean'
                    ? value ? 'Yes' : 'No'
                    : String(value)}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  const renderTable = (data, title) => {
    if (!data || (Array.isArray(data) && data.length === 0)) {
      return <p className="text-gray-500 text-sm">No data available</p>;
    }

    if (Array.isArray(data)) {
      if (data.length === 0) return <p className="text-gray-500 text-sm">No data available</p>;
      
      const headers = Object.keys(data[0] || {});
      if (headers.length === 0) return <p className="text-gray-500 text-sm">No data available</p>;
      
      // Detect if this is financial data (has debit, credit, amount, balance, etc.)
      const isFinancialTable = headers.some(h => 
        ['debit', 'credit', 'amount', 'balance', 'opening_balance', 'closing_balance', 
         'current_year', 'previous_year', 'current_value', 'previous_value'].includes(h.toLowerCase())
      );
      
      // Format number for financial tables
      const formatFinancialValue = (value, header) => {
        if (value === null || value === undefined || value === '') return '-';
        if (typeof value === 'number') {
          // Right-align numeric columns for financial tables
          return `₹${Math.abs(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
        }
        return String(value);
      };
      
      // Determine alignment based on column type
      const getCellAlignment = (header, cellValue) => {
        const headerLower = header.toLowerCase();
        if (isFinancialTable && (headerLower.includes('debit') || headerLower.includes('credit') || 
            headerLower.includes('amount') || headerLower.includes('balance') || 
            headerLower.includes('value') || headerLower.includes('year'))) {
          return 'text-right';
        }
        if (typeof cellValue === 'number') {
          return 'text-right';
        }
        return 'text-left';
      };
      
      return (
        <div className="overflow-x-auto rounded-[14px] border border-[#dde3da] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
          <table className="min-w-full text-sm" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead>
              <tr className="bg-gradient-to-r from-[#f3f5f1] to-[#e8ece5] border-b border-[#dde3da]">
                {headers.map(header => {
                  const headerLower = header.toLowerCase();
                  const isNumeric = isFinancialTable && (headerLower.includes('debit') || headerLower.includes('credit') || 
                    headerLower.includes('amount') || headerLower.includes('balance') || 
                    headerLower.includes('value') || headerLower.includes('year'));
                  return (
                    <th 
                      key={header} 
                      className={`px-5 py-4 font-semibold text-[#0b1a33] text-xs uppercase tracking-wider ${
                        isNumeric ? 'text-right' : 'text-left'
                      }`}
                    >
                      {header.replace(/_/g, ' ')}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#dde3da]">
              {data.map((row, idx) => {
                // Check if this is a total/summary row
                const isTotalRow = headers.some(h => {
                  const val = row[h];
                  return typeof val === 'string' && (
                    val.toLowerCase().includes('total') || 
                    val.toLowerCase().includes('balance') ||
                    val.toLowerCase().includes('sum')
                  );
                }) || idx === data.length - 1;
                
                return (
                  <tr 
                    key={idx} 
                    className={`transition-all duration-200 ${
                      isTotalRow 
                        ? 'bg-gradient-to-r from-[#f3f5f1] to-[#e8ece5] font-semibold border-t-2 border-[#c5ccc6] hover:from-[#eef6f5] hover:to-[#eef6f5]' 
                        : 'bg-white hover:bg-gradient-to-r hover:from-[#f3f5f1] hover:to-[#e8ece5] hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)]'
                    }`}
                  >
                    {headers.map(header => {
                      const cellValue = row[header];
                      let displayValue = '-';
                      const alignment = getCellAlignment(header, cellValue);
                      
                      if (cellValue === null || cellValue === undefined) {
                        displayValue = '-';
                      } else if (typeof cellValue === 'number') {
                        displayValue = isFinancialTable 
                          ? formatFinancialValue(cellValue, header)
                          : `₹${cellValue.toLocaleString('en-IN')}`;
                      } else if (typeof cellValue === 'boolean') {
                        displayValue = cellValue ? 'Yes' : 'No';
                      } else if (typeof cellValue === 'object') {
                        displayValue = JSON.stringify(cellValue);
                      } else {
                        displayValue = String(cellValue);
                      }
                      
                      return (
                        <td 
                          key={header} 
                          className={`px-5 py-3.5 ${alignment} ${
                            isTotalRow ? 'text-[#0b1a33] font-semibold' : 'text-[#3a4659]'
                          }`}
                        >
                          {displayValue}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    }

    // If it's an object, render as nested structure
    return renderNestedObject(data);
  };

  const renderChart = (chartData, type = 'bar') => {
    if (!chartData) return <p className="text-gray-500 text-sm">No chart data available</p>;
    
    // Simple visualization - in production, use Chart.js or Recharts
    if (Array.isArray(chartData)) {
      return (
        <div className="space-y-2">
          {chartData.map((item, idx) => (
            <div key={idx} className="flex items-center space-x-4">
              <div className="w-32 text-sm text-gray-700">{item.category || item.type || item.label || idx}</div>
              <div className="flex-1 bg-gray-200 rounded-full h-6 relative">
                <div 
                  className="bg-blue-500 h-6 rounded-full flex items-center justify-end pr-2"
                  style={{ width: `${Math.min((item.amount || item.value || 0) / 100000 * 100, 100)}%` }}
                >
                  <span className="text-xs text-white font-medium">
                    ₹{(item.amount || item.value || 0).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      );
    }

    return <pre className="text-xs bg-gray-50 p-4 rounded overflow-auto">{JSON.stringify(chartData, null, 2)}</pre>;
  };

  // Extract chartable data from report
  const extractChartData = (reportData, reportName) => {
    const chartData = [];
    
    // Check for explicit chart data
    if (reportData.chart && Array.isArray(reportData.chart)) {
      chartData.push({ type: 'bar', data: reportData.chart, title: `${reportName.replace(/_/g, ' ')} Chart` });
    }
    
    if (reportData.comparison_chart) {
      chartData.push({ type: 'comparison', data: reportData.comparison_chart, title: 'Comparison Chart' });
    }
    
    // Check for category breakdown
    if (reportData.category_breakdown) {
      chartData.push({ type: 'category', data: reportData.category_breakdown, title: 'Category Breakdown' });
    }
    
    // Check for breakdown arrays (asset_breakdown, liability_breakdown, etc.)
    if (reportData.asset_breakdown && Array.isArray(reportData.asset_breakdown) && reportData.asset_breakdown.length > 0) {
      chartData.push({ 
        type: 'auto', 
        data: reportData.asset_breakdown, 
        title: 'Asset Breakdown'
      });
    }
    
    if (reportData.liability_breakdown && Array.isArray(reportData.liability_breakdown) && reportData.liability_breakdown.length > 0) {
      chartData.push({ 
        type: 'auto', 
        data: reportData.liability_breakdown, 
        title: 'Liability Breakdown'
      });
    }
    
    // Check nested structures (e.g., assets.asset_breakdown)
    if (reportData.assets && reportData.assets.asset_breakdown && Array.isArray(reportData.assets.asset_breakdown) && reportData.assets.asset_breakdown.length > 0) {
      chartData.push({ 
        type: 'auto', 
        data: reportData.assets.asset_breakdown, 
        title: 'Asset Breakdown'
      });
    }
    
    if (reportData.liabilities && reportData.liabilities.liability_breakdown && Array.isArray(reportData.liabilities.liability_breakdown) && reportData.liabilities.liability_breakdown.length > 0) {
      chartData.push({ 
        type: 'auto', 
        data: reportData.liabilities.liability_breakdown, 
        title: 'Liability Breakdown'
      });
    }
    
    // Check for arrays that can be charted
    Object.entries(reportData).forEach(([key, value]) => {
      if (key === 'error' || key === 'chart' || key === 'comparison_chart' || key === 'category_breakdown' || 
          key === 'asset_breakdown' || key === 'liability_breakdown' || key === 'assets' || key === 'liabilities') return;
      
      if (Array.isArray(value) && value.length > 0) {
        const firstItem = value[0];
        if (typeof firstItem === 'object' && firstItem !== null) {
          const hasNumeric = Object.values(firstItem).some(v => typeof v === 'number' && v !== 0);
          if (hasNumeric) {
            chartData.push({ 
              type: 'auto', 
              data: value, 
              title: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
            });
          }
        }
      }
    });
    
    return chartData;
  };

  // Format number for cash flow statement (negative in parentheses, right-aligned)
  const formatCashFlowValue = (value) => {
    if (value === null || value === undefined || value === '') return '-';
    const numValue = typeof value === 'string' ? parseFloat(value.replace(/[₹,]/g, '')) : value;
    if (isNaN(numValue)) return value;
    
    const absValue = Math.abs(numValue);
    const formatted = absValue.toLocaleString('en-IN', { maximumFractionDigits: 0 });
    return numValue < 0 ? `(${formatted})` : formatted;
  };

  // Render cash flow statement in financial statement format
  const renderCashFlowStatement = (reportData) => {
    // Extract year information
    const currentYear = reportData.current_year || reportData.year_2024 || reportData.year || '31st March 2024';
    const previousYear = reportData.previous_year || reportData.year_2023 || reportData.previous_year_label || '31st March 2023';
    
    // If data is in array format with particulars, current_year, previous_year fields
    if (Array.isArray(reportData) && reportData.length > 0 && reportData[0].particulars) {
      return (
        <div className="bg-white rounded-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left font-bold text-gray-800">Particulars</th>
                  <th className="px-4 py-3 text-right font-bold text-gray-800">For the year ended {currentYear}</th>
                  <th className="px-4 py-3 text-right font-bold text-gray-800">For the year ended {previousYear}</th>
                </tr>
              </thead>
              <tbody>
                {reportData.map((row, index) => {
                  const isBold = row.is_bold || row.bold || false;
                  const isTotal = row.is_total || row.total || false;
                  const indent = row.indent || 0;
                  const fontWeight = isBold ? 'font-bold' : 'font-normal';
                  const indentClass = indent > 0 ? `pl-${indent * 4}` : '';
                  
                  return (
                    <React.Fragment key={index}>
                      {isTotal && (
                        <tr>
                          <td colSpan="3" className="border-t-2 border-gray-400"></td>
                        </tr>
                      )}
                      <tr className={isTotal ? 'border-b-2 border-gray-400' : ''}>
                        <td className={`px-4 py-2 text-left ${fontWeight} text-gray-700 ${indentClass}`}>
                          {row.particulars || row.label || row.name}
                        </td>
                        <td className="px-4 py-2 text-right font-medium text-gray-800">
                          {formatCashFlowValue(row.current_year || row.current_value || row.value)}
                        </td>
                        <td className="px-4 py-2 text-right font-medium text-gray-800">
                          {formatCashFlowValue(row.previous_year || row.previous_value || row.previous)}
                        </td>
                      </tr>
                      {isTotal && (
                        <tr>
                          <td colSpan="3" className="border-b-2 border-gray-400"></td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      );
    }
    
    // Build rows array from report data
    const rows = [];
    
    // Helper to add a row
    const addRow = (particulars, currentValue, previousValue, isBold = false, isTotal = false, indent = 0) => {
      rows.push({ particulars, currentValue, previousValue, isBold, isTotal, indent });
    };
    
    // A. CASH FLOW FROM OPERATING ACTIVITIES
    if (reportData.operating_activities || reportData.operating) {
      addRow('A CASH FLOW FROM OPERATING ACTIVITIES', '', '', true, false, 0);
      
      const op = reportData.operating_activities || reportData.operating;
      
      // Profit before tax
      if (op.profit_before_tax !== undefined) {
        addRow('Profit before tax', op.profit_before_tax, op.previous_profit_before_tax || op.profit_before_tax_prev, false, false, 1);
      }
      
      // Adjustments for:
      if (op.adjustments) {
        addRow('Adjustments for:', '', '', true, false, 1);
        if (op.adjustments.depreciation) {
          addRow('Depreciation', op.adjustments.depreciation, op.adjustments.previous_depreciation || op.adjustments.depreciation_prev, false, false, 2);
        }
        if (op.adjustments.interest) {
          addRow('Interest', op.adjustments.interest, op.adjustments.previous_interest || op.adjustments.interest_prev, false, false, 2);
        }
        if (op.adjustments.other) {
          addRow('Other', op.adjustments.other, op.adjustments.previous_other || op.adjustments.other_prev, false, false, 2);
        }
      }
      
      // Operating Profit before Working Capital changes
      if (op.operating_profit_before_wc !== undefined) {
        addRow('Operating Profit before Working Capital changes', op.operating_profit_before_wc, op.previous_operating_profit_before_wc || op.operating_profit_before_wc_prev, true, true, 1);
      }
      
      // Changes in Working Capital
      if (op.working_capital_changes) {
        addRow('Changes in Working Capital', '', '', true, false, 1);
        const wc = op.working_capital_changes;
        if (wc.trade_receivables !== undefined) {
          addRow('Trade Receivables', wc.trade_receivables, wc.previous_trade_receivables || wc.trade_receivables_prev, false, false, 2);
        }
        if (wc.inventory !== undefined) {
          addRow('Inventory', wc.inventory, wc.previous_inventory || wc.inventory_prev, false, false, 2);
        }
        if (wc.trade_payables !== undefined) {
          addRow('Trade Payables', wc.trade_payables, wc.previous_trade_payables || wc.trade_payables_prev, false, false, 2);
        }
        if (wc.other !== undefined) {
          addRow('Other', wc.other, wc.previous_other || wc.other_prev, false, false, 2);
        }
      }
      
      // Cash generated / (used) in Operating Activities
      if (op.net_operating !== undefined || op.cash_generated !== undefined) {
        const netOp = op.net_operating || op.cash_generated;
        const prevNetOp = op.previous_net_operating || op.previous_cash_generated || op.net_operating_prev;
        addRow('Cash generated / (used) in Operating Activities', netOp, prevNetOp, true, true, 1);
      }
    }
    
    // B. CASH FLOW FROM INVESTING ACTIVITIES
    if (reportData.investing_activities || reportData.investing) {
      addRow('B CASH FLOW FROM INVESTING ACTIVITIES', '', '', true, false, 0);
      
      const inv = reportData.investing_activities || reportData.investing;
      
      if (inv.purchase_of_assets !== undefined) {
        addRow('Purchase of Assets', inv.purchase_of_assets, inv.previous_purchase_of_assets || inv.purchase_of_assets_prev, false, false, 1);
      }
      if (inv.sale_of_assets !== undefined) {
        addRow('Sale of Assets', inv.sale_of_assets, inv.previous_sale_of_assets || inv.sale_of_assets_prev, false, false, 1);
      }
      if (inv.investments !== undefined) {
        addRow('Investments', inv.investments, inv.previous_investments || inv.investments_prev, false, false, 1);
      }
      
      if (inv.net_investing !== undefined || inv.cash_used !== undefined) {
        const netInv = inv.net_investing || inv.cash_used;
        const prevNetInv = inv.previous_net_investing || inv.previous_cash_used || inv.net_investing_prev;
        addRow('Net Cash generated / (used) from Investing Activities', netInv, prevNetInv, true, true, 1);
      }
    }
    
    // C. CASH FLOW FROM FINANCING ACTIVITIES
    if (reportData.financing_activities || reportData.financing) {
      addRow('C CASH FLOW FROM FINANCING ACTIVITIES', '', '', true, false, 0);
      
      const fin = reportData.financing_activities || reportData.financing;
      
      if (fin.borrowings !== undefined) {
        addRow('Borrowings', fin.borrowings, fin.previous_borrowings || fin.borrowings_prev, false, false, 1);
      }
      if (fin.repayment !== undefined) {
        addRow('Repayment', fin.repayment, fin.previous_repayment || fin.repayment_prev, false, false, 1);
      }
      if (fin.equity !== undefined) {
        addRow('Equity', fin.equity, fin.previous_equity || fin.equity_prev, false, false, 1);
      }
      if (fin.dividends !== undefined) {
        addRow('Dividends', fin.dividends, fin.previous_dividends || fin.dividends_prev, false, false, 1);
      }
      
      if (fin.net_financing !== undefined || fin.cash_generated !== undefined) {
        const netFin = fin.net_financing || fin.cash_generated;
        const prevNetFin = fin.previous_net_financing || fin.previous_cash_generated || fin.net_financing_prev;
        addRow('Net Cash generated / (used) from Financing Activities', netFin, prevNetFin, true, true, 1);
      }
    }
    
    // NET INCREASE / (DECREASE) IN CASH AND CASH EQUIVALENTS
    if (reportData.net_cash_flow !== undefined) {
      addRow('NET INCREASE / (DECREASE) IN CASH AND CASH EQUIVALENTS', 
        reportData.net_cash_flow, 
        reportData.previous_net_cash_flow || reportData.net_cash_flow_prev, 
        true, true, 0);
    }
    
    // Cash and cash equivalents at the beginning of the year
    if (reportData.opening_balance !== undefined) {
      addRow('Cash and cash equivalents at the beginning of the year', 
        reportData.opening_balance, 
        reportData.previous_opening_balance || reportData.opening_balance_prev, 
        false, false, 0);
    }
    
    // Cash and cash equivalents at the end of the year
    if (reportData.closing_balance !== undefined) {
      addRow('Cash and cash equivalents at the end of the year', 
        reportData.closing_balance, 
        reportData.previous_closing_balance || reportData.closing_balance_prev, 
        true, true, 0);
    }
    
    // If no structured data, try to render as table
    if (rows.length === 0) {
      return renderTable(reportData);
    }
    
    return (
      <div className="bg-white rounded-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left font-bold text-gray-800">Particulars</th>
                <th className="px-4 py-3 text-right font-bold text-gray-800">For the year ended {currentYear}</th>
                <th className="px-4 py-3 text-right font-bold text-gray-800">For the year ended {previousYear}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const isSectionHeader = row.particulars && row.particulars.match(/^[A-C] /);
                const isSubtotal = row.isTotal && !isSectionHeader;
                const indentClass = row.indent > 0 ? `pl-${row.indent * 4}` : '';
                const fontWeight = row.isBold ? 'font-bold' : 'font-normal';
                
                return (
                  <React.Fragment key={index}>
                    {isSubtotal && (
                      <tr>
                        <td colSpan="3" className="border-t-2 border-gray-400"></td>
                      </tr>
                    )}
                    <tr className={row.isTotal ? 'border-b-2 border-gray-400' : ''}>
                      <td className={`px-4 py-2 text-left ${fontWeight} text-gray-700 ${indentClass}`}>
                        {row.particulars}
                      </td>
                      <td className="px-4 py-2 text-right font-medium text-gray-800">
                        {formatCashFlowValue(row.currentValue)}
                      </td>
                      <td className="px-4 py-2 text-right font-medium text-gray-800">
                        {formatCashFlowValue(row.previousValue)}
                      </td>
                    </tr>
                    {isSubtotal && (
                      <tr>
                        <td colSpan="3" className="border-b-2 border-gray-400"></td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Helper function to detect if previous year data exists
  const hasPreviousYearData = (data) => {
    if (!data) return false;
    return !!(data.previous_year || data.previousYear || data.year_2023 || data.previous_period || 
              data.previousPeriod || (data.assets && (data.assets.previous_year || data.assets.previousYear)) ||
              (data.liabilities && (data.liabilities.previous_year || data.liabilities.previousYear)) ||
              (data.equity && (data.equity.previous_year || data.equity.previousYear)) ||
              (data.operating_activities && (data.operating_activities.previous_year || data.operating_activities.previousYear)) ||
              (data.investing_activities && (data.investing_activities.previous_year || data.investing_activities.previousYear)) ||
              (data.financing_activities && (data.financing_activities.previous_year || data.financing_activities.previousYear)));
  };

  // Helper function to extract previous period
  const extractPreviousPeriod = (data, currentPeriod) => {
    if (data.previous_period) return data.previous_period;
    if (data.previousPeriod) return data.previousPeriod;
    if (baseResult?.previous_period) return baseResult.previous_period;
    if (data.previous_year_label) return data.previous_year_label;
    if (data.year_2023) return '31st March 2023';
    if (currentPeriod && currentPeriod.match(/\d{4}/)) {
      const year = parseInt(currentPeriod.match(/\d{4}/)[0]);
      return `31st March ${year - 1}`;
    }
    // If previous year data exists but no period specified, default to previous year
    if (hasPreviousYearData(data)) {
      return '31st March 2023';
    }
    return null;
  };

  const renderReportContent = (reportName, reportData) => {
    if (reportData.error) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-600 text-sm font-medium">Error: {reportData.error}</p>
        </div>
      );
    }
    
    // Special handling for accounting_ratios - use PDF format AccountingRatiosTable
    if (reportName === 'accounting_ratios') {
      // Extract period from reportData or use default
      const period = reportData.period || reportData.year || baseResult?.period || 'Current Period';
      const previousPeriod = extractPreviousPeriod(reportData, period);
      const companyName = reportData.company_name || reportData.companyName || baseResult?.company_name || 'XYZ';
      
      // Extract previous year ratios from various formats
      const previousRatios = reportData.previous_year || reportData.previousYear || 
                            reportData.previous_year_ratios || reportData.previousYearRatios || {};
      
      // Helper to parse numeric value from string (handles "23.2%" -> 23.2)
      const parseRatioValue = (value) => {
        if (value === null || value === undefined || value === '') return null;
        if (typeof value === 'number') return value;
        if (typeof value === 'string') {
          // Remove % and parse
          const cleaned = value.replace(/%/g, '').trim();
          const parsed = parseFloat(cleaned);
          return isNaN(parsed) ? null : parsed;
        }
        return null;
      };
      
      // Normalize ratios data - extract nested values and add flat keys for easier access
      const normalizeRatios = (ratios) => {
        if (!ratios || typeof ratios !== 'object') return ratios || {};
        
        const normalized = { ...ratios };
        
        // Parse string percentages in profitability to numbers
        if (ratios.profitability) {
          normalized.profitability = {
            ...ratios.profitability,
            gross_margin: parseRatioValue(ratios.profitability.gross_margin) ?? ratios.profitability.gross_margin,
            ebitda_margin: parseRatioValue(ratios.profitability.ebitda_margin) ?? ratios.profitability.ebitda_margin,
            roe: parseRatioValue(ratios.profitability.roe) ?? ratios.profitability.roe,
            roa: parseRatioValue(ratios.profitability.roa) ?? ratios.profitability.roa,
          };
        }
        
        // Extract from nested liquidity structure
        if (ratios.liquidity) {
          normalized.current_ratio = normalized.current_ratio || ratios.liquidity.current_ratio || ratios.liquidity.currentRatio;
          normalized.currentRatio = normalized.currentRatio || ratios.liquidity.currentRatio || ratios.liquidity.current_ratio;
          normalized.quick_ratio = normalized.quick_ratio || ratios.liquidity.quick_ratio || ratios.liquidity.quickRatio;
          normalized.quickRatio = normalized.quickRatio || ratios.liquidity.quickRatio || ratios.liquidity.quick_ratio;
        }
        
        // Extract from nested profitability structure
        if (ratios.profitability) {
          const roeValue = parseRatioValue(ratios.profitability.roe) ?? parseRatioValue(ratios.profitability.returnOnEquity);
          normalized.return_on_equity = normalized.return_on_equity || roeValue || ratios.profitability.roe || ratios.profitability.returnOnEquity;
          normalized.returnOnEquity = normalized.returnOnEquity || roeValue || ratios.profitability.returnOnEquity || ratios.profitability.roe;
          
          const netMarginValue = parseRatioValue(ratios.profitability.net_profit_margin) ?? parseRatioValue(ratios.profitability.netProfitMargin);
          normalized.net_profit_ratio = normalized.net_profit_ratio || netMarginValue || ratios.profitability.net_profit_margin || ratios.profitability.netProfitMargin;
          normalized.netProfitRatio = normalized.netProfitRatio || netMarginValue || ratios.profitability.netProfitMargin || ratios.profitability.net_profit_margin;
          normalized.net_profit_margin = normalized.net_profit_margin || netMarginValue || ratios.profitability.net_profit_margin || ratios.profitability.netProfitMargin;
        }
        
        // Extract from nested solvency/leverage structure
        if (ratios.solvency) {
          normalized.debt_equity_ratio = normalized.debt_equity_ratio || ratios.solvency.debt_to_equity || ratios.solvency.debtToEquity;
          normalized.debtEquityRatio = normalized.debtEquityRatio || ratios.solvency.debtToEquity || ratios.solvency.debt_to_equity;
          normalized.debt_service_coverage = normalized.debt_service_coverage || ratios.solvency.interest_coverage || ratios.solvency.interestCoverage;
          normalized.debtServiceCoverage = normalized.debtServiceCoverage || ratios.solvency.interestCoverage || ratios.solvency.interest_coverage;
        }
        
        if (ratios.leverage) {
          normalized.debt_equity_ratio = normalized.debt_equity_ratio || ratios.leverage.debtToEquity || ratios.leverage.debt_to_equity;
          normalized.debtEquityRatio = normalized.debtEquityRatio || ratios.leverage.debtToEquity || ratios.leverage.debt_to_equity;
          normalized.debt_service_coverage = normalized.debt_service_coverage || ratios.leverage.debtServiceCoverage || ratios.leverage.debt_service_coverage;
          normalized.debtServiceCoverage = normalized.debtServiceCoverage || ratios.leverage.debtServiceCoverage || ratios.leverage.debt_service_coverage;
        }
        
        // Extract from nested efficiency structure
        if (ratios.efficiency) {
          normalized.inventory_turnover = normalized.inventory_turnover || ratios.efficiency.inventory_turnover || ratios.efficiency.inventoryTurnover;
          normalized.inventoryTurnover = normalized.inventoryTurnover || ratios.efficiency.inventoryTurnover || ratios.efficiency.inventory_turnover;
          normalized.asset_turnover = normalized.asset_turnover || ratios.efficiency.asset_turnover || ratios.efficiency.assetTurnover;
          normalized.assetTurnover = normalized.assetTurnover || ratios.efficiency.assetTurnover || ratios.efficiency.asset_turnover;
        }
        
        // Calculate missing ratios from financial statements if available
        const pl = baseResult?.reports?.profit_loss || baseResult?.reports?.management_report?.financial_statements?.pl_statement || {};
        const bs = baseResult?.reports?.balance_sheet || baseResult?.reports?.management_report?.financial_statements?.balance_sheet || {};
        
        const revenue = pl.revenue || 0;
        const netProfit = pl.net_profit || 0;
        const totalEquity = bs.total_equity || Object.values(bs.equity || {}).reduce((sum, v) => sum + (typeof v === 'number' ? v : 0), 0);
        const totalAssets = bs.total_assets || Object.values(bs.assets || {}).reduce((sum, v) => sum + (typeof v === 'number' ? v : 0), 0);
        const totalLiabilities = bs.total_liabilities || Object.values(bs.liabilities || {}).reduce((sum, v) => sum + (typeof v === 'number' ? v : 0), 0);
        
        // Calculate net profit margin if not present
        if (!normalized.net_profit_ratio && revenue > 0 && netProfit !== null) {
          const netProfitMargin = (netProfit / revenue) * 100;
          normalized.net_profit_ratio = netProfitMargin;
          normalized.netProfitRatio = netProfitMargin;
          normalized.net_profit_margin = netProfitMargin;
          if (!normalized.profitability) normalized.profitability = {};
          normalized.profitability.net_profit_margin = netProfitMargin;
          normalized.profitability.netProfitMargin = netProfitMargin;
        }
        
        // Calculate net capital turnover (Revenue / Net Capital where Net Capital = Total Assets - Total Liabilities)
        if (!normalized.net_capital_turnover && revenue > 0) {
          const netCapital = totalAssets - totalLiabilities;
          if (netCapital > 0) {
            normalized.net_capital_turnover = revenue / netCapital;
            normalized.netCapitalTurnover = revenue / netCapital;
          }
        }
        
        // Calculate ROCE (Return on Capital Employed)
        const currentLiabilities = normalized.liquidity?.current_liabilities || ratios.liquidity?.current_liabilities || totalLiabilities;
        const capitalEmployed = totalAssets - currentLiabilities;
        if (!normalized.return_on_capital_employed && capitalEmployed > 0) {
          const ebit = pl.operating_profit || (pl.gross_profit || 0) - (pl.expenses || 0) || netProfit;
          if (ebit !== null && ebit !== undefined) {
            const roce = (ebit / capitalEmployed) * 100;
            normalized.return_on_capital_employed = roce;
            normalized.returnOnCapitalEmployed = roce;
            if (!normalized.profitability) normalized.profitability = {};
            normalized.profitability.roce = roce;
          }
        }
        
        return normalized;
      };
      
      const normalizedRatios = normalizeRatios(reportData);
      const normalizedPreviousRatios = normalizeRatios(previousRatios);
      
      // Prepare data for AccountingRatiosTable matching PDF format
      // Always calculate previousPeriod (will be shown even if data is missing - will show 0.00)
      const accountingRatiosData = {
        companyName,
        period,
        previousPeriod: previousPeriod || extractPreviousPeriod(reportData, period),
        ratios: normalizedRatios,
        previousRatios: normalizedPreviousRatios
      };
      
      return <AccountingRatiosTable data={accountingRatiosData} />;
    }
    
    // Special handling for profit_loss - use PDF format IncomeStatementTable
    if (reportName === 'profit_loss') {
      // Extract period from reportData or use default
      const period = reportData.period || reportData.year || baseResult?.period || 'Current Period';
      const previousPeriod = extractPreviousPeriod(reportData, period);
      const companyName = reportData.company_name || reportData.companyName || baseResult?.company_name || 'XYZ';
      
      // Extract previous year data
      const prevData = reportData.previous_year || reportData.previousYear || {};
      
      // Prepare data for IncomeStatementTable matching PDF format
      const incomeStatementData = {
        revenue: reportData.revenue || 0,
        cogs: reportData.cogs || reportData.cost_of_material_consumed || 0,
        grossProfit: reportData.gross_profit || reportData.grossProfit || 0,
        opex: reportData.expenses || reportData.opex || 0,
        sales: reportData.sales || reportData.opex_breakdown?.sales || 0,
        marketing: reportData.marketing || reportData.opex_breakdown?.marketing || 0,
        generalAdmin: reportData.general_admin || reportData.generalAdmin || reportData.opex_breakdown?.generalAdmin || reportData.opex_breakdown?.general_admin || 0,
        otherIncome: reportData.other_income || reportData.otherIncome || 0,
        otherExpenses: reportData.other_expenses || reportData.otherExpenses || 0,
        operating: reportData.operating_profit || reportData.operatingProfit || reportData.ebit || 0,
        period,
        previousPeriod: hasPreviousYearData(reportData) ? previousPeriod : null,
        companyName,
        // PDF format fields
        costOfMaterialConsumed: reportData.cost_of_material_consumed || reportData.costOfMaterialConsumed || reportData.cogs || 0,
        employeeBenefitsExpense: reportData.employee_benefits_expense || reportData.employeeBenefitsExpense || 0,
        financeCosts: reportData.finance_costs || reportData.financeCosts || 0,
        depreciationAmortisation: reportData.depreciation_amortisation || reportData.depreciationAmortisation || reportData.depreciation || 0,
        priorPeriodIncomeExpense: reportData.prior_period_income_expense || reportData.priorPeriodIncomeExpense || 0,
        profitBeforeTax: reportData.profit_before_tax || reportData.profitBeforeTax || reportData.operating_profit || reportData.ebit || 0,
        taxAdjustments: reportData.tax_adjustments || reportData.taxAdjustments || reportData.tax || 0,
        profitForYear: reportData.profit_for_year || reportData.profitForYear || reportData.net_profit || reportData.netProfit || 0,
        earningsPerShare: reportData.earnings_per_share || reportData.earningsPerShare || reportData.eps || 0,
        // Previous year values
        prevRevenue: prevData.revenue || 0,
        prevCostOfMaterialConsumed: prevData.cost_of_material_consumed || prevData.cogs || 0,
        prevEmployeeBenefitsExpense: prevData.employee_benefits_expense || 0,
        prevFinanceCosts: prevData.finance_costs || 0,
        prevDepreciationAmortisation: prevData.depreciation_amortisation || prevData.depreciation || 0,
        prevOtherExpenses: prevData.other_expenses || 0,
        prevPriorPeriodIncomeExpense: prevData.prior_period_income_expense || 0,
        prevProfitBeforeTax: prevData.profit_before_tax || prevData.operating_profit || 0,
        prevTaxAdjustments: prevData.tax_adjustments || prevData.tax || 0,
        prevProfitForYear: prevData.profit_for_year || prevData.net_profit || 0,
        prevEarningsPerShare: prevData.earnings_per_share || prevData.eps || 0
      };
      
      return <IncomeStatementTable data={incomeStatementData} />;
    }
    
    // Special handling for balance_sheet - use PDF format BalanceSheetTable
    if (reportName === 'balance_sheet') {
      // Extract period from reportData or use default
      const period = reportData.period || reportData.year || baseResult?.period || 'Current Period';
      const previousPeriod = extractPreviousPeriod(reportData, period);
      const companyName = reportData.company_name || reportData.companyName || baseResult?.company_name || 'XYZ';
      
      // Helper to safely get value (preserves null, only defaults to null if truly missing)
      const getValue = (obj, ...keys) => {
        // Check if obj is actually an object (not a number, string, etc.)
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
          return null;
        }
        for (const key of keys) {
          if (key in obj && obj[key] !== null && obj[key] !== undefined && obj[key] !== '') {
            const val = obj[key];
            // Convert to number if string
            if (typeof val === 'string') {
              const num = parseFloat(val.replace(/[₹,]/g, ''));
              return isNaN(num) ? null : num;
            }
            return typeof val === 'number' ? val : null;
          }
        }
        return null; // Return null if not found, not 0
      };
      
      // Helper to extract from breakdown array
      const extractFromBreakdown = (breakdown, category, subcategory) => {
        if (!breakdown || !Array.isArray(breakdown)) return null;
        for (const item of breakdown) {
          const itemCategory = (item.category || '').toLowerCase();
          const itemSubcategory = (item.subcategory || '').toLowerCase();
          const searchCategory = (category || '').toLowerCase();
          const searchSubcategory = (subcategory || '').toLowerCase();
          
          // Match category (flexible matching)
          const categoryMatch = itemCategory.includes(searchCategory) || searchCategory.includes(itemCategory);
          // Match subcategory if provided
          const subcategoryMatch = !searchSubcategory || itemSubcategory.includes(searchSubcategory) || searchSubcategory.includes(itemSubcategory);
          
          if (categoryMatch && subcategoryMatch) {
            const val = item.amount;
            if (val !== null && val !== undefined && val !== '' && val !== 0) {
              const numVal = typeof val === 'number' ? val : (typeof val === 'string' ? parseFloat(val.replace(/[₹,]/g, '')) : null);
              if (!isNaN(numVal) && numVal !== 0) {
                return numVal;
              }
            }
          }
        }
        return null;
      };
      
      // Also check if assets/liabilities are objects with account names as keys (from trial balance)
      const extractFromDict = (dict, keys) => {
        if (!dict || typeof dict !== 'object' || Array.isArray(dict)) return null;
        for (const key of keys) {
          const val = dict[key];
          if (val !== null && val !== undefined && val !== '' && val !== 0) {
            const numVal = typeof val === 'number' ? val : (typeof val === 'string' ? parseFloat(val.replace(/[₹,]/g, '')) : null);
            if (!isNaN(numVal) && numVal !== 0) {
              return numVal;
            }
          }
        }
        // Try partial key matching
        for (const keyPattern of keys) {
          for (const dictKey in dict) {
            if (dictKey.toLowerCase().includes(keyPattern.toLowerCase()) || keyPattern.toLowerCase().includes(dictKey.toLowerCase())) {
              const val = dict[dictKey];
              if (val !== null && val !== undefined && val !== '' && val !== 0) {
                const numVal = typeof val === 'number' ? val : (typeof val === 'string' ? parseFloat(val.replace(/[₹,]/g, '')) : null);
                if (!isNaN(numVal) && numVal !== 0) {
                  return numVal;
                }
              }
            }
          }
        }
        return null;
      };
      
      // Extract assets and liabilities data
      const assets = reportData.assets || {};
      const liabilities = reportData.liabilities || {};
      const equity = reportData.equity || {};
      const assetBreakdown = assets.asset_breakdown || [];
      const liabilityBreakdown = liabilities.liability_breakdown || [];
      
      // Extract previous year data
      const prevAssets = reportData.previous_year?.assets || reportData.previousYear?.assets || {};
      const prevLiabilities = reportData.previous_year?.liabilities || reportData.previousYear?.liabilities || {};
      const prevEquity = reportData.previous_year?.equity || reportData.previousYear?.equity || {};
      
      // Prepare data for BalanceSheetTable matching PDF format
      // Use getValue to preserve null values, only use breakdown if direct value not available
      const balanceSheetData = {
        companyName,
        period,
        previousPeriod: hasPreviousYearData(reportData) ? previousPeriod : null,
        // Equity and Liabilities
        shareCapital: getValue(equity, 'share_capital', 'shareCapital', 'equity_share_capital') ?? 
                     extractFromDict(equity, ['Share Capital', 'Share capital', 'share capital', 'Capital']) ?? null,
        reservesAndSurplus: getValue(equity, 'reserves_and_surplus', 'reservesAndSurplus', 'reserves') ?? 
                           extractFromDict(equity, ['Reserves', 'Reserves and Surplus', 'Surplus']) ?? null,
        longTermBorrowings: getValue(liabilities, 'long_term_borrowings', 'longTermBorrowings', 'bank_loan', 'loans') ?? 
                           extractFromBreakdown(liabilityBreakdown, 'Long Term', 'Borrowings') ??
                           extractFromDict(liabilities, ['Long Term Borrowings', 'Bank Loan', 'Loans', 'Borrowings']) ?? null,
        deferredTaxLiabilities: getValue(liabilities, 'deferred_tax_liabilities', 'deferredTaxLiabilities') ?? 
                               extractFromBreakdown(liabilityBreakdown, 'Non Current Liabilities', 'Deferred Tax') ?? null,
        longTermProvisions: getValue(liabilities, 'long_term_provisions', 'longTermProvisions') ?? 
                           extractFromBreakdown(liabilityBreakdown, 'Non Current Liabilities', 'Provisions') ?? null,
        otherNonCurrentLiabilities: getValue(liabilities, 'other_non_current_liabilities', 'otherNonCurrentLiabilities') ?? 
                                   extractFromBreakdown(liabilityBreakdown, 'Non Current Liabilities', 'Other') ?? null,
        shortTermBorrowings: getValue(liabilities, 'short_term_borrowings', 'shortTermBorrowings') ?? 
                            extractFromBreakdown(liabilityBreakdown, 'Current Liabilities', 'Borrowings') ?? null,
        tradePayables: getValue(liabilities, 'trade_payables', 'tradePayables', 'accounts_payable', 'creditors') ?? 
                      extractFromBreakdown(liabilityBreakdown, 'Current Liabilities', 'Trade Payables') ?? null,
        otherCurrentLiabilities: getValue(liabilities, 'other_current_liabilities', 'otherCurrentLiabilities') ?? 
                                extractFromBreakdown(liabilityBreakdown, 'Current Liabilities', 'Other') ?? null,
        shortTermProvisions: getValue(liabilities, 'short_term_provisions', 'shortTermProvisions') ?? 
                            extractFromBreakdown(liabilityBreakdown, 'Current Liabilities', 'Provisions') ?? null,
        // Assets
        propertyPlantEquipment: getValue(assets, 'property_plant_equipment', 'propertyPlantEquipment', 'fixed_assets', 'equipment') ?? 
                               extractFromBreakdown(assetBreakdown, 'Non Current', 'Property') ??
                               extractFromBreakdown(assetBreakdown, 'Non Current', 'Plant') ??
                               extractFromBreakdown(assetBreakdown, 'Non Current', 'Equipment') ??
                               extractFromDict(assets, ['Property', 'Plant', 'Equipment', 'Fixed Assets', 'PPE']) ?? null,
        capitalWorkInProgress: getValue(assets, 'capital_work_in_progress', 'capitalWorkInProgress') ?? 
                              extractFromBreakdown(assetBreakdown, 'Non Current Assets', 'Capital Work in Progress') ?? null,
        nonCurrentInvestments: getValue(assets, 'non_current_investments', 'nonCurrentInvestments', 'investments') ?? 
                              extractFromBreakdown(assetBreakdown, 'Non Current Assets', 'Investments') ?? null,
        deferredTaxAssets: getValue(assets, 'deferred_tax_assets', 'deferredTaxAssets') ?? 
                          extractFromBreakdown(assetBreakdown, 'Non Current Assets', 'Deferred Tax') ?? null,
        longTermLoansAndAdvances: getValue(assets, 'long_term_loans_and_advances', 'longTermLoansAndAdvances') ?? 
                                 extractFromBreakdown(assetBreakdown, 'Non Current Assets', 'Loans & Advances') ?? null,
        otherNonCurrentAssets: getValue(assets, 'other_non_current_assets', 'otherNonCurrentAssets') ?? 
                              extractFromBreakdown(assetBreakdown, 'Non Current Assets', 'Other') ?? null,
        inventories: getValue(assets, 'inventories', 'inventory', 'stock') ?? 
                    extractFromBreakdown(assetBreakdown, 'Current Assets', 'Inventories') ?? null,
        tradeReceivables: getValue(assets, 'trade_receivables', 'tradeReceivables', 'accounts_receivable', 'receivables') ?? 
                         extractFromBreakdown(assetBreakdown, 'Current Assets', 'Trade Receivables') ?? null,
        cashAndBankBalances: (getValue(assets, 'cash_and_bank_balances', 'cashAndBankBalances') ?? 
                             getValue(assets, 'cash_in_hand', 'cashInHand') ?? 
                             getValue(assets, 'bank_account', 'bankAccount') ?? 
                             extractFromBreakdown(assetBreakdown, 'Current Assets', 'Cash and Bank') ?? null),
        shortTermLoansAndAdvances: getValue(assets, 'short_term_loans_and_advances', 'shortTermLoansAndAdvances') ?? 
                                  extractFromBreakdown(assetBreakdown, 'Current Assets', 'Loans & Advances') ?? null,
        otherCurrentAssets: getValue(assets, 'other_current_assets', 'otherCurrentAssets') ?? 
                           extractFromBreakdown(assetBreakdown, 'Current Assets', 'Other') ?? null,
        // Previous year values (if available) - use same helper functions
        prevShareCapital: getValue(prevEquity, 'share_capital', 'shareCapital', 'equity_share_capital') ?? null,
        prevReservesAndSurplus: getValue(prevEquity, 'reserves_and_surplus', 'reservesAndSurplus', 'reserves') ?? null,
        prevLongTermBorrowings: getValue(prevLiabilities, 'long_term_borrowings', 'longTermBorrowings', 'bank_loan', 'loans') ?? null,
        prevDeferredTaxLiabilities: getValue(prevLiabilities, 'deferred_tax_liabilities', 'deferredTaxLiabilities') ?? null,
        prevLongTermProvisions: getValue(prevLiabilities, 'long_term_provisions', 'longTermProvisions') ?? null,
        prevOtherNonCurrentLiabilities: getValue(prevLiabilities, 'other_non_current_liabilities', 'otherNonCurrentLiabilities') ?? null,
        prevShortTermBorrowings: getValue(prevLiabilities, 'short_term_borrowings', 'shortTermBorrowings') ?? null,
        prevTradePayables: getValue(prevLiabilities, 'trade_payables', 'tradePayables', 'accounts_payable', 'creditors') ?? null,
        prevOtherCurrentLiabilities: getValue(prevLiabilities, 'other_current_liabilities', 'otherCurrentLiabilities') ?? null,
        prevShortTermProvisions: getValue(prevLiabilities, 'short_term_provisions', 'shortTermProvisions') ?? null,
        prevPropertyPlantEquipment: getValue(prevAssets, 'property_plant_equipment', 'propertyPlantEquipment', 'fixed_assets', 'equipment') ?? null,
        prevCapitalWorkInProgress: getValue(prevAssets, 'capital_work_in_progress', 'capitalWorkInProgress') ?? null,
        prevNonCurrentInvestments: getValue(prevAssets, 'non_current_investments', 'nonCurrentInvestments', 'investments') ?? null,
        prevDeferredTaxAssets: getValue(prevAssets, 'deferred_tax_assets', 'deferredTaxAssets') ?? null,
        prevLongTermLoansAndAdvances: getValue(prevAssets, 'long_term_loans_and_advances', 'longTermLoansAndAdvances') ?? null,
        prevOtherNonCurrentAssets: getValue(prevAssets, 'other_non_current_assets', 'otherNonCurrentAssets') ?? null,
        prevInventories: getValue(prevAssets, 'inventories', 'inventory', 'stock') ?? null,
        prevTradeReceivables: getValue(prevAssets, 'trade_receivables', 'tradeReceivables', 'accounts_receivable', 'receivables') ?? null,
        prevCashAndBankBalances: (getValue(prevAssets, 'cash_and_bank_balances', 'cashAndBankBalances') ?? 
                                 getValue(prevAssets, 'cash_in_hand', 'cashInHand') ?? 
                                 getValue(prevAssets, 'bank_account', 'bankAccount') ?? null),
        prevShortTermLoansAndAdvances: getValue(prevAssets, 'short_term_loans_and_advances', 'shortTermLoansAndAdvances') ?? null,
        prevOtherCurrentAssets: getValue(prevAssets, 'other_current_assets', 'otherCurrentAssets') ?? null
      };
      
      return <BalanceSheetTable data={balanceSheetData} />;
    }
    
    // Special handling for cash_flow - use PDF format CashFlowStatementTable
    if (reportName === 'cash_flow' || reportName === 'cash_flow_statement') {
      // Extract period from reportData or use default
      const period = reportData.period || reportData.year || baseResult?.period || 'Current Period';
      const previousPeriod = extractPreviousPeriod(reportData, period);
      const companyName = reportData.company_name || reportData.companyName || baseResult?.company_name || 'XYZ';
      const cin = reportData.cin || reportData.CIN || '';
      
      // Helper to safely get value (preserves null, only defaults to null if truly missing)
      const getValue = (obj, ...keys) => {
        // Check if obj is actually an object (not a number, string, etc.)
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
          return null;
        }
        for (const key of keys) {
          if (key in obj && obj[key] !== null && obj[key] !== undefined && obj[key] !== '') {
            const val = obj[key];
            // Convert to number if string
            if (typeof val === 'string') {
              const num = parseFloat(val.replace(/[₹,]/g, ''));
              return isNaN(num) ? null : num;
            }
            return typeof val === 'number' ? val : null;
          }
        }
        return null; // Return null if not found, not 0
      };
      
      // Extract operating activities
      const operating = reportData.operating_activities || reportData.operatingActivities || {};
      // Extract investing activities
      const investing = reportData.investing_activities || reportData.investingActivities || {};
      // Extract financing activities
      const financing = reportData.financing_activities || reportData.financingActivities || {};
      
      // Extract previous year activities
      const prevOperating = reportData.previous_year?.operating_activities || reportData.previousYear?.operatingActivities || {};
      const prevInvesting = reportData.previous_year?.investing_activities || reportData.previousYear?.investingActivities || {};
      const prevFinancing = reportData.previous_year?.financing_activities || reportData.previousYear?.financingActivities || {};
      
      // Safely get previous year object (ensure it's an object, not a number)
      const prevYearObj = (reportData.previous_year && typeof reportData.previous_year === 'object' && !Array.isArray(reportData.previous_year)) 
                         ? reportData.previous_year 
                         : (reportData.previousYear && typeof reportData.previousYear === 'object' && !Array.isArray(reportData.previousYear))
                         ? reportData.previousYear
                         : {};
      
      // Prepare data for CashFlowStatementTable matching PDF format
      // Use getValue to preserve null values instead of defaulting to 0
      const cashFlowData = {
        companyName,
        period,
        // Calculate previousPeriod from current period if not available (year - 1)
        previousPeriod: hasPreviousYearData(reportData) ? previousPeriod : null, // null will trigger calculation in component
        cin,
        // Operating Activities
        netProfitBeforeTax: getValue(reportData, 'net_profit_before_tax', 'netProfitBeforeTax') ?? 
                           getValue(operating, 'net_profit_before_tax', 'netProfitBeforeTax') ?? null,
        depreciation: getValue(operating, 'depreciation') ?? getValue(reportData, 'depreciation') ?? null,
        interestOnFDR: getValue(operating, 'interest_on_fdr', 'interestOnFDR') ?? 
                      getValue(investing, 'interest_on_fdr', 'interestOnFDR') ?? null,
        otherInterestIncome: getValue(operating, 'other_interest_income', 'otherInterestIncome') ?? 
                            getValue(investing, 'other_interest_income', 'otherInterestIncome') ?? null,
        interestExpense: getValue(operating, 'interest_expense', 'interestExpense') ?? 
                        getValue(financing, 'interest_expense', 'interestExpense') ?? 
                        getValue(reportData, 'interest_expense') ?? null,
        operatingProfitBeforeWC: getValue(operating, 'operating_profit_before_wc', 'operatingProfitBeforeWC') ?? null,
        // Working Capital Changes
        increaseDecreaseInventories: getValue(operating, 'increase_decrease_inventories', 'increaseDecreaseInventories', 'changes_inventories') ?? null,
        increaseDecreaseTradeReceivables: getValue(operating, 'increase_decrease_trade_receivables', 'increaseDecreaseTradeReceivables', 'changes_trade_receivables') ?? null,
        increaseDecreaseShortTermLoansAdvances: getValue(operating, 'increase_decrease_short_term_loans_advances', 'increaseDecreaseShortTermLoansAdvances', 'changes_short_term_loans') ?? null,
        increaseDecreaseLongTermLoansAdvances: getValue(operating, 'increase_decrease_long_term_loans_advances', 'increaseDecreaseLongTermLoansAdvances') ?? null,
        increaseDecreaseOtherCurrentNonCurrentAssets: getValue(operating, 'increase_decrease_other_assets', 'increaseDecreaseOtherAssets') ?? null,
        increaseDecreaseTradePayables: getValue(operating, 'increase_decrease_trade_payables', 'increaseDecreaseTradePayables', 'changes_trade_payables') ?? null,
        increaseDecreaseOtherCurrentLiabilities: getValue(operating, 'increase_decrease_other_current_liabilities', 'increaseDecreaseOtherCurrentLiabilities') ?? null,
        increaseDecreaseShortTermProvisions: getValue(operating, 'increase_decrease_short_term_provisions', 'increaseDecreaseShortTermProvisions') ?? null,
        increaseDecreaseLongTermProvisions: getValue(operating, 'increase_decrease_long_term_provisions', 'increaseDecreaseLongTermProvisions') ?? null,
        cashGeneratedUsedOperating: getValue(operating, 'cash_generated_used', 'cashGeneratedUsed') ?? 
                                   getValue(reportData, 'cash_from_operating', 'operating_cash_flow') ?? null,
        cashGeneratedUsedExtraordinary: getValue(operating, 'cash_extraordinary', 'cashExtraordinary') ?? null,
        incomeTaxPaid: getValue(operating, 'income_tax_paid', 'incomeTaxPaid') ?? 
                      getValue(reportData, 'income_tax_paid') ?? null,
        // Investing Activities
        proceedsFromFDMaturity: getValue(investing, 'proceeds_from_fd_maturity', 'proceedsFromFDMaturity') ?? null,
        purchaseOfFixedAssets: getValue(investing, 'purchase_fixed_assets', 'purchaseFixedAssets', 'purchase_of_fixed_assets') ?? null,
        proceedsFromSaleFixedAssets: getValue(investing, 'proceeds_from_sale_fixed_assets', 'proceedsFromSaleFixedAssets') ?? null,
        // Financing Activities
        increaseDecreaseLongTermBorrowings: getValue(financing, 'increase_decrease_long_term_borrowings', 'increaseDecreaseLongTermBorrowings') ?? null,
        increaseDecreaseShortTermBorrowings: getValue(financing, 'increase_decrease_short_term_borrowings', 'increaseDecreaseShortTermBorrowings') ?? null,
        interestSubsidyReceivable: getValue(financing, 'interest_subsidy_receivable', 'interestSubsidyReceivable') ?? null,
        netCashGeneratedUsedFinancing: getValue(financing, 'net_cash_generated_used', 'netCashGeneratedUsed') ?? 
                                      getValue(reportData, 'cash_from_financing') ?? null,
        // Summary
        netIncreaseDecreaseCash: getValue(reportData, 'net_increase_decrease_cash', 'netIncreaseDecreaseCash', 'net_cash_flow') ?? null,
        cashAtBeginning: getValue(reportData, 'cash_at_beginning', 'cashAtBeginning', 'opening_balance', 'cash_and_cash_equivalents_at_beginning') ?? null,
        cashAtEnd: getValue(reportData, 'cash_at_end', 'cashAtEnd', 'closing_balance', 'cash_and_cash_equivalents_at_end') ?? null,
        prevDepreciation: getValue(prevOperating, 'depreciation') ?? 
                         getValue(prevYearObj, 'depreciation') ?? null,
        prevInterestOnFDR: getValue(prevInvesting, 'interest_on_fdr', 'interestOnFDR') ?? null,
        prevOtherInterestIncome: getValue(prevInvesting, 'other_interest_income', 'otherInterestIncome') ?? null,
        prevInterestExpense: getValue(prevFinancing, 'interest_expense', 'interestExpense') ?? 
                            getValue(prevYearObj, 'interest_expense') ?? null,
        prevOperatingProfitBeforeWC: getValue(prevOperating, 'operating_profit_before_wc', 'operatingProfitBeforeWC') ?? null,
        prevIncreaseDecreaseInventories: getValue(prevOperating, 'increase_decrease_inventories', 'increaseDecreaseInventories', 'changes_inventories') ?? null,
        prevIncreaseDecreaseTradeReceivables: getValue(prevOperating, 'increase_decrease_trade_receivables', 'increaseDecreaseTradeReceivables', 'changes_trade_receivables') ?? null,
        prevIncreaseDecreaseShortTermLoansAdvances: getValue(prevOperating, 'increase_decrease_short_term_loans_advances', 'increaseDecreaseShortTermLoansAdvances', 'changes_short_term_loans') ?? null,
        prevIncreaseDecreaseLongTermLoansAdvances: getValue(prevOperating, 'increase_decrease_long_term_loans_advances', 'increaseDecreaseLongTermLoansAdvances') ?? null,
        prevIncreaseDecreaseOtherCurrentNonCurrentAssets: getValue(prevOperating, 'increase_decrease_other_assets', 'increaseDecreaseOtherAssets') ?? null,
        prevIncreaseDecreaseTradePayables: getValue(prevOperating, 'increase_decrease_trade_payables', 'increaseDecreaseTradePayables', 'changes_trade_payables') ?? null,
        prevIncreaseDecreaseOtherCurrentLiabilities: getValue(prevOperating, 'increase_decrease_other_current_liabilities', 'increaseDecreaseOtherCurrentLiabilities') ?? null,
        prevIncreaseDecreaseShortTermProvisions: getValue(prevOperating, 'increase_decrease_short_term_provisions', 'increaseDecreaseShortTermProvisions') ?? null,
        prevIncreaseDecreaseLongTermProvisions: getValue(prevOperating, 'increase_decrease_long_term_provisions', 'increaseDecreaseLongTermProvisions') ?? null,
        prevCashGeneratedUsedOperating: getValue(prevOperating, 'cash_generated_used', 'cashGeneratedUsed') ?? 
                                       getValue(prevYearObj, 'cash_from_operating') ?? null,
        prevCashGeneratedUsedExtraordinary: getValue(prevOperating, 'cash_extraordinary', 'cashExtraordinary') ?? null,
        prevIncomeTaxPaid: getValue(prevOperating, 'income_tax_paid', 'incomeTaxPaid') ?? 
                          getValue(prevYearObj, 'income_tax_paid') ?? null,
        prevProceedsFromFDMaturity: getValue(prevInvesting, 'proceeds_from_fd_maturity', 'proceedsFromFDMaturity') ?? null,
        prevPurchaseOfFixedAssets: getValue(prevInvesting, 'purchase_fixed_assets', 'purchaseFixedAssets', 'purchase_of_fixed_assets') ?? null,
        prevProceedsFromSaleFixedAssets: getValue(prevInvesting, 'proceeds_from_sale_fixed_assets', 'proceedsFromSaleFixedAssets') ?? null,
        prevIncreaseDecreaseLongTermBorrowings: getValue(prevFinancing, 'increase_decrease_long_term_borrowings', 'increaseDecreaseLongTermBorrowings') ?? null,
        prevIncreaseDecreaseShortTermBorrowings: getValue(prevFinancing, 'increase_decrease_short_term_borrowings', 'increaseDecreaseShortTermBorrowings') ?? null,
        prevInterestSubsidyReceivable: getValue(prevFinancing, 'interest_subsidy_receivable', 'interestSubsidyReceivable') ?? null,
        prevNetCashGeneratedUsedFinancing: getValue(prevFinancing, 'net_cash_generated_used', 'netCashGeneratedUsed') ?? 
                                          getValue(prevYearObj, 'cash_from_financing') ?? null,
        prevNetIncreaseDecreaseCash: getValue(prevYearObj, 'net_increase_decrease_cash', 'netIncreaseDecreaseCash') ?? 
                                    getValue(reportData, 'previous_net_cash_flow', 'previousNetCashFlow') ?? null,
        prevCashAtBeginning: getValue(prevYearObj, 'cash_at_beginning', 'cashAtBeginning') ?? 
                            getValue(reportData, 'previous_opening_balance', 'previousOpeningBalance') ?? null,
        prevCashAtEnd: getValue(prevYearObj, 'cash_at_end', 'cashAtEnd') ?? 
                      getValue(reportData, 'previous_closing_balance', 'previousClosingBalance') ?? null
      };
      
      return <CashFlowStatementTable data={cashFlowData} />;
    }
    
    // Extract chart data at the beginning
    const chartData = extractChartData(reportData, reportName);
    
    // Debug: Log chart data extraction
    if (chartData.length > 0) {
      console.log(`ReportsViewer - Found ${chartData.length} chart(s) for ${reportName}:`, chartData);
    }

    // Check if reportData has entries/items/breakdown arrays
    if (reportData.entries && Array.isArray(reportData.entries)) {
      return renderTable(reportData.entries);
    }
    if (reportData.items && Array.isArray(reportData.items)) {
      return renderTable(reportData.items);
    }
    if (reportData.anomalies && Array.isArray(reportData.anomalies)) {
      return (
        <div className="space-y-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
            <h4 className="font-semibold text-yellow-800 mb-2">Summary</h4>
            {reportData.summary && renderTable(reportData.summary)}
          </div>
          <div>
            <h4 className="font-semibold text-gray-700 mb-2">Anomalies</h4>
            {renderTable(reportData.anomalies)}
          </div>
          {reportData.recommendations && reportData.recommendations.length > 0 && (
            <div>
              <h4 className="font-semibold text-gray-700 mb-2">Recommendations</h4>
              <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
                {reportData.recommendations.map((rec, idx) => (
                  <li key={idx}>{rec}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      );
    }

    // Special handling for management report (trial balance) - only show Financial Analysis
    if (reportName.includes('management_report')) {
      const analysis = reportData.analysis || reportData.output || '';
      
      return (
        <div className="space-y-6">
          {/* Analysis Text */}
          {analysis ? (
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h4 className="font-semibold text-gray-800 mb-4 text-lg">Financial Analysis</h4>
              <div className="prose max-w-none text-gray-700 whitespace-pre-wrap">
                {analysis}
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
              <p className="text-gray-500 text-sm">No financial analysis available.</p>
            </div>
          )}
        </div>
      );
    }

    // Special handling for equity movement statement
    if (reportName.includes('equity_movement_statement')) {
      // Try to get equity data from report, baseResult, or reportData structure
      const equityData = reportData.equity || (baseResult && baseResult.equity) || {};
      const openingEquity = reportData.opening_equity || (baseResult && baseResult.opening_equity) || 0;
      const shareCapital = equityData.share_capital || reportData.share_capital || (baseResult && baseResult.equity && baseResult.equity.share_capital) || 0;
      const reserves = equityData.reserves || reportData.reserves || (baseResult && baseResult.equity && baseResult.equity.reserves) || 0;
      const retainedEarnings = equityData.retained_earnings !== null && equityData.retained_earnings !== undefined 
        ? equityData.retained_earnings 
        : (reportData.retained_earnings !== null && reportData.retained_earnings !== undefined 
          ? reportData.retained_earnings 
          : (baseResult && baseResult.equity && baseResult.equity.retained_earnings !== null && baseResult.equity.retained_earnings !== undefined
            ? baseResult.equity.retained_earnings
            : 0));
      const closingEquity = equityData.total_equity || reportData.closing_equity || reportData.total_equity || (baseResult && baseResult.equity && baseResult.equity.total_equity) || 0;
      const movement = closingEquity - openingEquity;
      
      const equityTableData = [
        { field: 'Opening Equity', value: openingEquity },
        { field: 'Share Capital', value: shareCapital },
        { field: 'Reserves', value: reserves },
        { field: 'Retained Earnings', value: retainedEarnings },
        { field: 'Closing Equity', value: closingEquity },
        { field: 'Movement', value: movement }
      ];
      
      return (
        <div className="space-y-6">
          {/* Render charts first if available */}
          {chartData && chartData.length > 0 && (
            <div className="space-y-4 mb-6">
              {chartData.map((chart, idx) => (
                <div key={idx}>
                  {chart.type === 'comparison' && <ComparisonChart data={chart.data} title={chart.title} />}
                  {chart.type === 'category' && <CategoryBreakdownChart data={chart.data} title={chart.title} />}
                  {chart.type === 'auto' && <AutoChart data={chart.data} title={chart.title} />}
                </div>
              ))}
            </div>
          )}
          
          {/* Equity Movement Table */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h4 className="font-semibold text-gray-800 mb-4 text-lg">Equity Movement Statement</h4>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Field</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount (₹)</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {equityTableData.map((row, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.field}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right">
                        {typeof row.value === 'number' ? `₹${row.value.toLocaleString('en-IN')}` : row.value || 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          
          {/* Render other equity details - only if there's meaningful data */}
          {equityData && Object.keys(equityData).length > 0 && (() => {
            const hasData = Object.values(equityData).some(v => {
              if (v === null || v === undefined) return false;
              if (Array.isArray(v) && v.length === 0) return false;
              if (typeof v === 'number' && v === 0) return false;
              if (typeof v === 'string' && v.trim() === '') return false;
              return true;
            });
            return hasData ? (
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h4 className="font-semibold text-gray-800 mb-4 text-lg">Equity Details</h4>
                {renderNestedObject(equityData)}
              </div>
            ) : null;
          })()}
        </div>
      );
    }

    // Special handling for asset liability schedules
    if (reportName.includes('asset_liability_schedules')) {
      // Also check baseResult for asset/liability breakdown
      const assetBreakdown = reportData.asset_breakdown || 
                            (baseResult && baseResult.assets && baseResult.assets.asset_breakdown) ||
                            (baseResult && baseResult.dashboard && baseResult.dashboard.tables && baseResult.dashboard.tables.asset_breakdown);
      const liabilityBreakdown = reportData.liability_breakdown || 
                                 (baseResult && baseResult.liabilities && baseResult.liabilities.liability_breakdown) ||
                                 (baseResult && baseResult.dashboard && baseResult.dashboard.tables && baseResult.dashboard.tables.liability_breakdown);
      
      // Add breakdown charts if available
      const allChartData = [...chartData];
      if (assetBreakdown && Array.isArray(assetBreakdown) && assetBreakdown.length > 0) {
        allChartData.push({ type: 'auto', data: assetBreakdown, title: 'Asset Breakdown' });
      }
      if (liabilityBreakdown && Array.isArray(liabilityBreakdown) && liabilityBreakdown.length > 0) {
        allChartData.push({ type: 'auto', data: liabilityBreakdown, title: 'Liability Breakdown' });
      }
      
      return (
        <div className="space-y-6">
          {/* Render charts first if available */}
          {allChartData && allChartData.length > 0 && (
            <div className="space-y-4 mb-6">
              {allChartData.map((chart, idx) => (
                <div key={idx}>
                  {chart.type === 'comparison' && <ComparisonChart data={chart.data} title={chart.title} />}
                  {chart.type === 'category' && <CategoryBreakdownChart data={chart.data} title={chart.title} />}
                  {chart.type === 'auto' && <AutoChart data={chart.data} title={chart.title} />}
                </div>
              ))}
            </div>
          )}
          
          {Object.entries(reportData).map(([key, value]) => {
            if (key === 'error' || key === 'chart' || key === 'comparison_chart' || key === 'category_breakdown' || 
                key === 'asset_breakdown' || key === 'liability_breakdown') return null;
            if (value === null || value === undefined) return null;
            
            // Skip zero values and empty arrays
            if (typeof value === 'number' && value === 0) return null;
            if (Array.isArray(value) && value.length === 0) return null;
            if (typeof value === 'string' && value.trim() === '') return null;
            
            // For objects, check if they have meaningful data
            if (typeof value === 'object' && !Array.isArray(value)) {
              const hasData = Object.values(value).some(v => {
                if (v === null || v === undefined) return false;
                if (Array.isArray(v) && v.length === 0) return false;
                if (typeof v === 'number' && v === 0) return false;
                if (typeof v === 'string' && v.trim() === '') return false;
                return true;
              });
              if (!hasData) return null;
            }
            
            return (
              <div key={key} className="bg-white border border-gray-200 rounded-lg p-4">
                <h4 className="font-semibold text-gray-800 mb-4 text-lg capitalize">{key.replace(/_/g, ' ')}</h4>
                {renderTable(value)}
              </div>
            );
          })}
        </div>
      );
    }

    // Determine report type and render accordingly
    if (reportName.includes('statement') || reportName.includes('summary') || reportName.includes('report') || reportName.includes('schedule')) {
      // Text-based reports with charts
      return (
        <div className="space-y-4">
          {/* Render charts first if available */}
          {chartData && chartData.length > 0 && (
            <div className="space-y-4 mb-6">
              {chartData.map((chart, idx) => (
                <div key={idx}>
                  {chart.type === 'comparison' && <ComparisonChart data={chart.data} title={chart.title} />}
                  {chart.type === 'category' && <CategoryBreakdownChart data={chart.data} title={chart.title} />}
                  {chart.type === 'auto' && <AutoChart data={chart.data} title={chart.title} />}
                </div>
              ))}
            </div>
          )}
          
          {Object.entries(reportData).map(([key, value]) => {
            if (key === 'error' || key === 'chart' || key === 'comparison_chart' || key === 'category_breakdown') return null;
            if (value === null || value === undefined) return null;
            
            if (Array.isArray(value)) {
              if (value.length === 0) return null;
              
              // Check if array has chartable data
              const firstItem = value[0];
              const hasChartableData = typeof firstItem === 'object' && firstItem !== null && 
                                      Object.values(firstItem).some(v => typeof v === 'number' && v !== 0);
              
              return (
                <div key={key} className="bg-white border border-gray-200 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-700 mb-3 capitalize">{key.replace(/_/g, ' ')}</h4>
                  {/* Try to render chart for this array if it has numeric data */}
                  {hasChartableData && (
                    <div className="mb-4">
                      <AutoChart data={value} title={`${key.replace(/_/g, ' ')} Visualization`} />
                    </div>
                  )}
                  {renderTable(value)}
                </div>
              );
            }
            if (typeof value === 'object') {
              return (
                <div key={key} className="bg-white border border-gray-200 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-700 mb-3 capitalize">{key.replace(/_/g, ' ')}</h4>
                  {renderTable(value)}
                </div>
              );
            }
            return (
              <div key={key} className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600 capitalize">{key.replace(/_/g, ' ')}:</span>
                <span className="font-medium text-gray-900">
                  {typeof value === 'number' 
                    ? `₹${value.toLocaleString('en-IN')}` 
                    : typeof value === 'boolean'
                      ? value ? 'Yes' : 'No'
                      : String(value || '-')}
                </span>
              </div>
            );
          })}
        </div>
      );
    }

    if (reportName.includes('chart') || reportName.includes('trend') || reportName.includes('breakdown')) {
      // Chart-based reports
      return (
        <div className="space-y-4">
          {chartData.length > 0 ? (
            chartData.map((chart, idx) => (
              <div key={idx}>
                {chart.type === 'comparison' && <ComparisonChart data={chart.data} title={chart.title} />}
                {chart.type === 'category' && <CategoryBreakdownChart data={chart.data} title={chart.title} />}
                {chart.type === 'auto' && <AutoChart data={chart.data} title={chart.title} />}
              </div>
            ))
          ) : (
            <AutoChart data={reportData} title={reportName.replace(/_/g, ' ')} />
          )}
          {renderTable(reportData)}
        </div>
      );
    }

    // Default: render with charts if available, then table
    return (
      <div className="space-y-4">
        {chartData.length > 0 && (
          <div className="space-y-4 mb-6">
            {chartData.map((chart, idx) => (
              <div key={idx}>
                {chart.type === 'comparison' && <ComparisonChart data={chart.data} title={chart.title} />}
                {chart.type === 'category' && <CategoryBreakdownChart data={chart.data} title={chart.title} />}
                {chart.type === 'auto' && <AutoChart data={chart.data} title={chart.title} />}
              </div>
            ))}
          </div>
        )}
        {renderTable(reportData)}
      </div>
    );
  };

  const getReportIcon = (reportName) => {
    if (reportName.includes('ledger') || reportName.includes('entries')) return <Table className="w-5 h-5" />;
    if (reportName.includes('chart') || reportName.includes('trend')) return <BarChart3 className="w-5 h-5" />;
    if (reportName.includes('breakdown') || reportName.includes('summary')) return <PieChart className="w-5 h-5" />;
    if (reportName.includes('analysis') || reportName.includes('report')) return <TrendingUp className="w-5 h-5" />;
    return <FileText className="w-5 h-5" />;
  };

  const reportNames = {
    // Bank Statement
    'cash_flow_statement': 'Cash Flow Statement',
    'ledger_entries': 'Ledger Entries',
    'payment_receipt_summary': 'Payment & Receipt Summary',
    'anomaly_suspicious_transaction_report': 'Anomaly & Suspicious Transaction Report',
    'bank_reconciliation': 'Bank Reconciliation Sheet',
    
    // GST Return
    'gst_reconciliation': 'GST Reconciliation Sheet',
    'itc_utilization_report': 'ITC Utilization Report',
    'output_vs_input_tax_summary': 'Output vs Input Tax Summary',
    'gst_liability_statement': 'GST Liability Statement',
    'gstr_vs_invoice_match_report': 'GSTR vs Invoice Match Report',
    
    // Invoice
    'sales_ledger': 'Sales Ledger',
    'customer_outstanding_summary': 'Customer Outstanding Summary',
    'gst_breakdown': 'GST Breakdown',
    'invoice_aging': 'Invoice Aging',
    'payment_due_summary': 'Payment Due Summary',
    
    // Purchase Order
    'vendor_ledger': 'Vendor Ledger',
    'purchase_summary': 'Purchase Summary',
    'category_spend_report': 'Category Spend Report',
    'po_vs_invoice_matching': 'PO vs Invoice Matching',
    'payables_summary': 'Payables Summary',
    
    // Salary Slip
    'salary_summary': 'Salary Summary',
    'allowances_deductions_report': 'Allowances & Deductions Report',
    'pf_esi_tds_summary': 'PF/ESI/TDS Summary',
    'employee_cost_report': 'Employee Cost Report',
    'payroll_journal_entries': 'Payroll Journal Entries',
    
    // Profit & Loss
    'profitability_summary': 'Profitability Summary',
    'revenue_vs_expense_analysis': 'Revenue vs Expense Analysis',
    'margin_kpis': 'Margin KPIs',
    'operating_vs_non_operating_split': 'Operating vs Non-Operating Split',
    'period_wise_profit_trend': 'Period-wise Profit Trend',
    
    // Trial Balance
    'profit_loss': 'Profit & Loss',
    'balance_sheet': 'Balance Sheet',
    'cash_flow': 'Cash Flow',
    'accounting_ratios': 'Accounting Ratios',
    'management_report': 'Management Report',
    
    // Balance Sheet
    'asset_liability_schedules': 'Asset & Liability Schedules',
    'net_worth_statement': 'Net Worth Statement',
    'solvency_liquidity_summary': 'Solvency & Liquidity Summary',
    'equity_movement_statement': 'Equity Movement Statement',
    'financial_position_report': 'Financial Position Report',
    
    // Audit Papers
    'audit_ready_summary': 'Audit-Ready Summary',
    'supporting_schedules': 'Supporting Schedules',
    'adjustment_notes': 'Adjustment Notes',
    'working_papers': 'Working Papers',
    'final_audit_pack': 'Final Audit Pack',
    
    // Agreement/Contract
    'contract_summary': 'Contract Summary',
    'key_clause_extraction': 'Key Clause Extraction',
    'risk_obligation_analysis': 'Risk & Obligation Analysis',
    'term_compliance_summary': 'Term Compliance Summary',
    'contract_analysis': 'Contract Analysis'
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-[20px] shadow-[0_8px_24px_rgba(0,0,0,0.08),0_2px_8px_rgba(0,0,0,0.04)] border border-[#dde3da] overflow-hidden">
        <div className="px-6 py-5 bg-gradient-to-r from-[#f3f5f1] to-[#e8ece5] border-b border-[#dde3da]">
          <h2 className="text-2xl font-bold text-[#0b1a33] tracking-[-0.01em] leading-[1.3]">Generated Reports</h2>
          <p className="text-sm text-[#566176] mt-1.5 leading-[1.5]">Click on any report to view detailed financial analysis</p>
        </div>
        
        <div className="py-2">
          {(() => {
            // Get expected reports for this document type - only show these
            const expectedReports = getExpectedReports(documentType);
            
            // Filter to only show expected reports
            const filteredReports = Object.entries(reports).filter(([reportName]) => 
              expectedReports.includes(reportName)
            );
            
            if (filteredReports.length === 0) {
              return (
                <div className="p-8 text-center">
                  <p className="text-[#566176] text-sm">No reports available for this document type.</p>
                </div>
              );
            }
            
            return filteredReports.map(([reportName, reportData], index) => {
              const isExpanded = expandedReports[reportName];
              const displayName = reportNames[reportName] || reportName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
              
              return (
                <div 
                  key={reportName} 
                  className={`transition-all duration-300 ${
                    index < filteredReports.length - 1 ? 'border-b border-[#dde3da]' : ''
                  }`}
                >
                  <button
                    onClick={() => toggleReport(reportName)}
                    className={`group w-full flex items-center justify-between p-5 lg:p-6 text-left transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-[#0b1a33]/20 focus:ring-offset-2 rounded-[20px] mx-2 my-1.5 transform ${
                      isExpanded 
                        ? 'bg-gradient-to-r from-[#eef6f5] to-[#eef6f5] shadow-[0_8px_24px_rgba(30,64,175,0.15)] border-2 border-[#dcefec] scale-[1.01]' 
                        : 'bg-white hover:bg-gradient-to-r hover:from-[#f3f5f1] hover:to-[#e8ece5] hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] border-2 border-[#dde3da] hover:border-[#0b1a33]/30 hover:-translate-y-0.5'
                    }`}
                  >
                    <div className="flex items-center space-x-4 flex-1 min-w-0">
                      <div className={`flex-shrink-0 p-3 rounded-xl transition-all duration-300 ${
                        isExpanded 
                          ? 'bg-gradient-to-br from-[#0b1a33] to-[#4fb3ac] text-white shadow-[0_4px_12px_rgba(30,64,175,0.25)] scale-110 group-hover:scale-115' 
                          : 'bg-gradient-to-br from-[#f3f5f1] to-[#e8ece5] text-[#566176] border border-[#dde3da] group-hover:border-[#c5ccc6] group-hover:shadow-[0_2px_4px_rgba(0,0,0,0.04)]'
                      }`}>
                        <div className="w-5 h-5 flex items-center justify-center">
                          {getReportIcon(reportName)}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className={`font-semibold text-base lg:text-lg tracking-[-0.01em] transition-colors duration-200 mb-1 ${
                          isExpanded ? 'text-[#0b1a33]' : 'text-[#0b1a33]'
                        }`}>
                          {displayName}
                        </h3>
                        <p className={`text-sm transition-colors duration-200 ${
                          reportData.error 
                            ? 'text-red-600 font-medium' 
                            : isExpanded 
                              ? 'text-[#3a4659]' 
                              : 'text-[#566176]'
                        }`}>
                          {reportData.error ? 'Error generating report' : 'Click to view detailed financial analysis'}
                        </p>
                      </div>
                    </div>
                    <div className={`flex-shrink-0 ml-6 transition-all duration-300 ${
                      isExpanded 
                        ? 'transform rotate-180 text-[#0b1a33] scale-110' 
                        : 'text-[#9aa7bd] group-hover:text-[#566176] group-hover:scale-110'
                    }`}>
                      {isExpanded ? (
                        <ChevronDown className="w-5 h-5" />
                      ) : (
                        <ChevronRight className="w-5 h-5" />
                      )}
                    </div>
                  </button>
                  
                  {isExpanded && (
                    <div className="px-2 lg:px-3 pb-5 lg:pb-6 pt-2 bg-gradient-to-b from-transparent to-[#f3f5f1]/20 animate-in slide-in-from-top-2 duration-300">
                      <div className="bg-white rounded-[20px] p-6 lg:p-8 shadow-[0_8px_24px_rgba(0,0,0,0.08),0_2px_8px_rgba(0,0,0,0.04)] border-2 border-[#dde3da] hover:border-[#0b1a33]/20 transition-all duration-300">
                        {renderReportContent(reportName, reportData)}
                      </div>
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </div>
      </div>
    </div>
  );
};

export default ReportsViewer;


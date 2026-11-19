import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Info } from 'lucide-react';
import { getRatioDescriptions } from '../../utils/financialRatios';

export function FinancialRatiosDisplay({ ratios }) {
  const [expandedCategories, setExpandedCategories] = useState({
    liquidity: true,
    profitability: true,
    efficiency: false,
    leverage: false,
    activity: false,
    cashFlow: false,
    growth: false,
    transaction: false,
    balance: false,
  });

  const descriptions = getRatioDescriptions();

  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  const RatioCard = ({ category, ratioKey, value, description }) => {
    const isPositive = typeof value === 'string' && value.includes('%') 
      ? parseFloat(value) > 0 
      : parseFloat(value) > 0;
    
    return (
      <div className="bg-gradient-to-br from-white to-gray-50 p-4 rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1">
            <h4 className="font-semibold text-gray-800 text-sm mb-1">{description.name}</h4>
            <p className="text-xs text-gray-500 mb-2">{description.description}</p>
            <p className="text-xs text-gray-400 font-mono">{description.formula}</p>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-600">Value:</span>
            <span className={`text-lg font-bold ${
              value === 'N/A' 
                ? 'text-gray-400' 
                : isPositive 
                  ? 'text-green-600' 
                  : 'text-red-600'
            }`}>
              {value}
            </span>
          </div>
        </div>
      </div>
    );
  };

  const CategorySection = ({ title, categoryKey, categoryRatios, categoryDescriptions }) => {
    const isExpanded = expandedCategories[categoryKey];
    
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mb-4">
        <button
          onClick={() => toggleCategory(categoryKey)}
          className="w-full px-6 py-4 flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 transition-colors"
        >
          <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-gray-600" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-600" />
          )}
        </button>
        
        {isExpanded && (
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.keys(categoryRatios).map((ratioKey) => (
                <RatioCard
                  key={ratioKey}
                  category={categoryKey}
                  ratioKey={ratioKey}
                  value={categoryRatios[ratioKey]}
                  description={categoryDescriptions[ratioKey] || {
                    name: ratioKey,
                    description: 'Financial metric',
                    formula: 'N/A',
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  if (!ratios) {
    return (
      <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-100 text-center">
        <p className="text-gray-500">No financial data available to calculate ratios.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6 rounded-lg shadow-lg mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Info className="w-6 h-6" />
          <h2 className="text-2xl font-bold">Financial Ratios Analysis</h2>
        </div>
        <p className="text-blue-100">
          Comprehensive financial metrics to evaluate company performance, liquidity, profitability, and efficiency.
        </p>
      </div>

      <CategorySection
        title="💧 Liquidity Ratios"
        categoryKey="liquidity"
        categoryRatios={ratios.liquidity}
        categoryDescriptions={descriptions.liquidity}
      />

      <CategorySection
        title="💰 Profitability Ratios"
        categoryKey="profitability"
        categoryRatios={ratios.profitability}
        categoryDescriptions={descriptions.profitability}
      />

      <CategorySection
        title="⚡ Efficiency Ratios"
        categoryKey="efficiency"
        categoryRatios={ratios.efficiency}
        categoryDescriptions={descriptions.efficiency}
      />

      <CategorySection
        title="📊 Leverage Ratios"
        categoryKey="leverage"
        categoryRatios={ratios.leverage}
        categoryDescriptions={descriptions.leverage}
      />

      <CategorySection
        title="🔄 Activity Ratios"
        categoryKey="activity"
        categoryRatios={ratios.activity}
        categoryDescriptions={descriptions.activity}
      />

      <CategorySection
        title="💵 Cash Flow Ratios"
        categoryKey="cashFlow"
        categoryRatios={ratios.cashFlow}
        categoryDescriptions={descriptions.cashFlow}
      />

      <CategorySection
        title="📈 Growth Ratios"
        categoryKey="growth"
        categoryRatios={ratios.growth}
        categoryDescriptions={descriptions.growth}
      />

      <CategorySection
        title="📋 Transaction Analysis"
        categoryKey="transaction"
        categoryRatios={ratios.transaction}
        categoryDescriptions={{
          averageTransactionSize: {
            name: 'Average Transaction Size',
            description: 'Mean value of transactions',
            formula: 'Total Amount / Transaction Count',
          },
          creditToDebitRatio: {
            name: 'Credit to Debit Ratio',
            description: 'Ratio of credits to debits',
            formula: 'Total Credits / Total Debits',
          },
          transactionFrequency: {
            name: 'Transaction Frequency',
            description: 'Total number of transactions',
            formula: 'Count of all transactions',
          },
          creditFrequency: {
            name: 'Credit Frequency',
            description: 'Number of credit transactions',
            formula: 'Count of credit transactions',
          },
          debitFrequency: {
            name: 'Debit Frequency',
            description: 'Number of debit transactions',
            formula: 'Count of debit transactions',
          },
        }}
      />

      <CategorySection
        title="💼 Balance Analysis"
        categoryKey="balance"
        categoryRatios={ratios.balance}
        categoryDescriptions={{
          openingBalance: {
            name: 'Opening Balance',
            description: 'Starting balance for the period',
            formula: 'Initial account balance',
          },
          closingBalance: {
            name: 'Closing Balance',
            description: 'Ending balance for the period',
            formula: 'Final account balance',
          },
          netChange: {
            name: 'Net Change',
            description: 'Change in balance over period',
            formula: 'Closing Balance - Opening Balance',
          },
          percentageChange: {
            name: 'Percentage Change',
            description: 'Percentage change in balance',
            formula: '((Closing - Opening) / Opening) × 100',
          },
        }}
      />
    </div>
  );
}



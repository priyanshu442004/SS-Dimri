import React from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const COLORS = ['#4fb3ac', '#4fb3ac', '#b26f0b', '#b8432f', '#b5d661', '#b5d661'];

/**
 * Balance Trend Chart - Shows balance over time
 */
export function BalanceTrendChart({ transactions }) {
  if (!transactions || transactions.length === 0) return null;

  const chartData = transactions
    .filter(t => {
      const balance = parseFloat(t.balance) || 0;
      return balance !== undefined && balance !== null && balance !== 0;
    })
    .map(t => ({
      date: t.date || 'N/A',
      balance: parseFloat(t.balance) || 0,
    }))
    .slice(-30); // Last 30 transactions
    
  // Don't show if no valid data
  if (chartData.length === 0 || chartData.every(item => item.balance === 0)) return null;

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Balance Trend</h3>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#dde3da" />
          <XAxis 
            dataKey="date" 
            stroke="#566176"
            fontSize={12}
            angle={-45}
            textAnchor="end"
            height={80}
          />
          <YAxis 
            stroke="#566176"
            fontSize={12}
            tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}k`}
          />
          <Tooltip 
            formatter={(value) => [`₹${value.toLocaleString('en-IN')}`, 'Balance']}
            contentStyle={{ backgroundColor: '#fff', border: '1px solid #dde3da', borderRadius: '8px' }}
          />
          <Area 
            type="monotone" 
            dataKey="balance" 
            stroke="#4fb3ac" 
            fill="#4fb3ac" 
            fillOpacity={0.3}
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Income vs Expense Chart - Bar chart comparing credits and debits
 */
export function IncomeExpenseChart({ summary, transactions }) {
  if (!summary) {
    // Try to calculate from transactions if summary is not available
    if (!transactions || transactions.length === 0) return null;
    
    const credits = transactions.reduce((sum, t) => sum + (parseFloat(t.credit) || 0), 0);
    const debits = transactions.reduce((sum, t) => sum + (parseFloat(t.debit) || 0), 0);
    
    if (credits === 0 && debits === 0) return null;
    
    const chartData = [
      {
        name: 'Credits',
        amount: credits,
        fill: '#4fb3ac',
      },
      {
        name: 'Debits',
        amount: debits,
        fill: '#b8432f',
      },
      {
        name: 'Net',
        amount: credits - debits,
        fill: '#4fb3ac',
      },
    ];
    
    return (
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Income vs Expenses</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#dde3da" />
            <XAxis dataKey="name" stroke="#566176" fontSize={12} />
            <YAxis 
              stroke="#566176"
              fontSize={12}
              tickFormatter={(value) => {
                if (Math.abs(value) >= 1000000) return `₹${(value / 1000000).toFixed(1)}M`;
                if (Math.abs(value) >= 1000) return `₹${(value / 1000).toFixed(0)}k`;
                return `₹${value}`;
              }}
            />
            <Tooltip 
              formatter={(value) => [`₹${value.toLocaleString('en-IN')}`, 'Amount']}
              contentStyle={{ backgroundColor: '#fff', border: '1px solid #dde3da', borderRadius: '8px' }}
            />
            <Bar dataKey="amount" radius={[8, 8, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  const chartData = [
    {
      name: 'Credits',
      amount: summary.total_credits || 0,
      fill: '#4fb3ac',
    },
    {
      name: 'Debits',
      amount: summary.total_debits || 0,
      fill: '#b8432f',
    },
    {
      name: 'Net',
      amount: (summary.total_credits || 0) - (summary.total_debits || 0),
      fill: '#4fb3ac',
    },
  ];
  
  // Don't show chart if all values are zero
  if (chartData.every(item => item.amount === 0)) return null;

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Income vs Expenses</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#dde3da" />
          <XAxis dataKey="name" stroke="#566176" fontSize={12} />
          <YAxis 
            stroke="#566176"
            fontSize={12}
            tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}k`}
          />
          <Tooltip 
            formatter={(value) => [`₹${value.toLocaleString('en-IN')}`, 'Amount']}
            contentStyle={{ backgroundColor: '#fff', border: '1px solid #dde3da', borderRadius: '8px' }}
          />
          <Bar dataKey="amount" radius={[8, 8, 0, 0]}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Transaction Type Distribution - Pie chart
 */
export function TransactionTypeChart({ transactions }) {
  if (!transactions || transactions.length === 0) return null;

  const creditCount = transactions.filter(t => {
    const credit = parseFloat(t.credit) || 0;
    const amount = parseFloat(t.amount) || 0;
    return credit > 0 || (t.type === 'Credit' || t.type === 'credit') && amount > 0;
  }).length;
  
  const debitCount = transactions.filter(t => {
    const debit = parseFloat(t.debit) || 0;
    const amount = parseFloat(t.amount) || 0;
    return debit > 0 || (t.type === 'Debit' || t.type === 'debit') && amount < 0;
  }).length;

  if (creditCount === 0 && debitCount === 0) return null;

  const chartData = [
    { name: 'Credits', value: creditCount, fill: '#4fb3ac' },
    { name: 'Debits', value: debitCount, fill: '#b8432f' },
  ];

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Transaction Distribution</h3>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
            outerRadius={100}
            fill="#4fb3ac"
            dataKey="value"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Monthly Cash Flow Chart - Line chart showing cash flow over time
 */
export function CashFlowChart({ transactions, summary }) {
  if (!transactions || transactions.length === 0) return null;

  // Group transactions by month
  const monthlyData = transactions.reduce((acc, t) => {
    let date;
    try {
      date = new Date(t.date || Date.now());
      if (isNaN(date.getTime())) return acc;
    } catch (e) {
      return acc;
    }
    
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    if (!acc[monthKey]) {
      acc[monthKey] = { month: monthKey, credits: 0, debits: 0, net: 0 };
    }
    
    const credit = parseFloat(t.credit) || 0;
    const debit = parseFloat(t.debit) || 0;
    const amount = parseFloat(t.amount) || 0;
    
    if (credit > 0 || (t.type === 'Credit' || t.type === 'credit') && amount > 0) {
      acc[monthKey].credits += credit || Math.abs(amount);
    } else if (debit > 0 || (t.type === 'Debit' || t.type === 'debit') && amount < 0) {
      acc[monthKey].debits += debit || Math.abs(amount);
    } else if (amount > 0) {
      acc[monthKey].credits += amount;
    } else if (amount < 0) {
      acc[monthKey].debits += Math.abs(amount);
    }
    
    acc[monthKey].net = acc[monthKey].credits - acc[monthKey].debits;
    
    return acc;
  }, {});

  const chartData = Object.values(monthlyData).sort((a, b) => a.month.localeCompare(b.month));
  
  // Don't show if all values are zero
  if (chartData.length === 0 || chartData.every(item => item.credits === 0 && item.debits === 0)) return null;

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Monthly Cash Flow</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#dde3da" />
          <XAxis dataKey="month" stroke="#566176" fontSize={12} />
          <YAxis 
            stroke="#566176"
            fontSize={12}
            tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}k`}
          />
          <Tooltip 
            formatter={(value) => [`₹${value.toLocaleString('en-IN')}`, '']}
            contentStyle={{ backgroundColor: '#fff', border: '1px solid #dde3da', borderRadius: '8px' }}
          />
          <Legend />
          <Line 
            type="monotone" 
            dataKey="credits" 
            stroke="#4fb3ac" 
            strokeWidth={2}
            name="Credits"
            dot={{ r: 4 }}
          />
          <Line 
            type="monotone" 
            dataKey="debits" 
            stroke="#b8432f" 
            strokeWidth={2}
            name="Debits"
            dot={{ r: 4 }}
          />
          <Line 
            type="monotone" 
            dataKey="net" 
            stroke="#4fb3ac" 
            strokeWidth={2}
            name="Net Cash Flow"
            dot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Daily Transaction Volume Chart
 */
export function DailyTransactionChart({ transactions }) {
  if (!transactions || transactions.length === 0) return null;

  // Group by date
  const dailyData = transactions.reduce((acc, t) => {
    const date = t.date || new Date().toISOString().split('T')[0];
    if (!acc[date]) {
      acc[date] = { date, count: 0, amount: 0 };
    }
    acc[date].count += 1;
    acc[date].amount += parseFloat(t.credit || t.debit || (t.amount ? Math.abs(t.amount) : 0));
    return acc;
  }, {});

  const chartData = Object.values(dailyData)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30); // Last 30 days

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Daily Transaction Volume</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#dde3da" />
          <XAxis 
            dataKey="date" 
            stroke="#566176"
            fontSize={12}
            angle={-45}
            textAnchor="end"
            height={80}
          />
          <YAxis 
            stroke="#566176"
            fontSize={12}
          />
          <Tooltip 
            formatter={(value, name) => [
              name === 'count' ? value : `₹${value.toLocaleString('en-IN')}`,
              name === 'count' ? 'Transactions' : 'Amount'
            ]}
            contentStyle={{ backgroundColor: '#fff', border: '1px solid #dde3da', borderRadius: '8px' }}
          />
          <Legend />
          <Bar dataKey="count" fill="#b5d661" radius={[8, 8, 0, 0]} name="Transaction Count" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}



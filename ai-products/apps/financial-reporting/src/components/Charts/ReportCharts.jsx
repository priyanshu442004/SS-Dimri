import React from 'react';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const COLORS = ['#4fb3ac', '#4fb3ac', '#b26f0b', '#b8432f', '#b5d661', '#b5d661', '#4fb3ac', '#b5d661'];

/**
 * Auto-detect and render appropriate chart based on data structure
 */
export function AutoChart({ data, title, type = 'auto' }) {
  if (!data) return null;

  // If data has a chart property, use it
  if (data.chart && Array.isArray(data.chart)) {
    return <BarChartComponent data={data.chart} title={title} />;
  }

  // If data has comparison_chart property
  if (data.comparison_chart) {
    return <ComparisonChart data={data.comparison_chart} title={title} />;
  }

  // If data is an array of objects with numeric values
  if (Array.isArray(data)) {
    if (data.length === 0) return null;
    
    // Check if it's suitable for pie chart (2-8 items with name/value structure)
    const firstItem = data[0];
    if (Object.keys(firstItem).length === 2 && data.length <= 8) {
      const keys = Object.keys(firstItem);
      const hasName = keys.some(k => k.toLowerCase().includes('name') || k.toLowerCase().includes('category') || k.toLowerCase().includes('label'));
      const hasValue = keys.some(k => k.toLowerCase().includes('value') || k.toLowerCase().includes('amount') || k.toLowerCase().includes('total'));
      
      if (hasName && hasValue) {
        return <PieChartComponent data={data} title={title} />;
      }
    }
    
    // Check if it has date/time field - use line chart
    if (data.some(item => item.date || item.month || item.period || item.time)) {
      return <LineChartComponent data={data} title={title} />;
    }
    
    // Default to bar chart
    return <BarChartComponent data={data} title={title} />;
  }

  // If data is an object with breakdown/category arrays
  if (typeof data === 'object') {
    // Check for category_breakdown
    if (data.category_breakdown) {
      return <CategoryBreakdownChart data={data.category_breakdown} title={title} />;
    }
    
    // Check for arrays in object values
    const arrayKeys = Object.keys(data).filter(key => Array.isArray(data[key]) && data[key].length > 0);
    if (arrayKeys.length > 0) {
      // Use first array found
      return <BarChartComponent data={data[arrayKeys[0]]} title={title || arrayKeys[0].replace(/_/g, ' ')} />;
    }
    
    // Check for numeric values that can be compared
    const numericKeys = Object.keys(data).filter(key => typeof data[key] === 'number');
    if (numericKeys.length > 0 && numericKeys.length <= 10) {
      const chartData = numericKeys.map(key => ({
        name: key.replace(/_/g, ' '),
        value: data[key]
      }));
      return <BarChartComponent data={chartData} title={title} />;
    }
  }

  return null;
}

/**
 * Bar Chart Component
 */
export function BarChartComponent({ data, title, dataKey = 'value', nameKey = 'name' }) {
  if (!data || !Array.isArray(data) || data.length === 0) return null;

  // Auto-detect keys
  const firstItem = data[0];
  const keys = Object.keys(firstItem);
  
  // Find numeric keys (excluding name/label keys) - prioritize 'amount' field
  const numericKeys = keys.filter(k => {
    const lower = k.toLowerCase();
    const value = firstItem[k];
    return typeof value === 'number' && value !== 0 &&
           !lower.includes('name') && 
           !lower.includes('label') && 
           !lower.includes('date') &&
           !lower.includes('id');
  });
  
  // Prioritize 'amount' if it exists
  const amountKey = numericKeys.find(k => k.toLowerCase() === 'amount');
  const finalNumericKeys = amountKey ? [amountKey, ...numericKeys.filter(k => k !== amountKey)] : numericKeys;
  
  // Find label key - prioritize subcategory, then category, then name
  const labelKey = keys.find(k => {
    const lower = k.toLowerCase();
    return lower === 'subcategory';
  }) || keys.find(k => {
    const lower = k.toLowerCase();
    return lower === 'category';
  }) || keys.find(k => {
    const lower = k.toLowerCase();
    return lower.includes('name') || lower.includes('label');
  }) || keys[0];

  return (
    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-4">
      {title && <h4 className="text-md font-semibold text-gray-800 mb-3">{title}</h4>}
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#dde3da" />
          <XAxis 
            dataKey={labelKey} 
            stroke="#566176"
            fontSize={12}
            angle={-45}
            textAnchor="end"
            height={80}
          />
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
            formatter={(value) => [`₹${value.toLocaleString('en-IN')}`, '']}
            contentStyle={{ backgroundColor: '#fff', border: '1px solid #dde3da', borderRadius: '8px' }}
          />
          {finalNumericKeys.map((key, index) => (
            <Bar 
              key={key}
              dataKey={key} 
              fill={COLORS[index % COLORS.length]}
              radius={[8, 8, 0, 0]}
              name={key.replace(/_/g, ' ')}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Pie Chart Component
 */
export function PieChartComponent({ data, title, dataKey = 'value', nameKey = 'name' }) {
  if (!data || !Array.isArray(data) || data.length === 0) return null;

  // Auto-detect keys
  const firstItem = data[0];
  const keys = Object.keys(firstItem);
  
  const valueKey = keys.find(k => {
    const lower = k.toLowerCase();
    return lower.includes('value') || lower.includes('amount') || lower.includes('total') || typeof firstItem[k] === 'number';
  }) || keys.find(k => typeof firstItem[k] === 'number') || keys[1];
  
  const labelKey = keys.find(k => {
    const lower = k.toLowerCase();
    return lower.includes('name') || lower.includes('label') || lower.includes('category');
  }) || keys[0];

  return (
    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-4">
      {title && <h4 className="text-md font-semibold text-gray-800 mb-3">{title}</h4>}
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ [labelKey]: name, [valueKey]: value, percent }) => 
              `${name}: ₹${value.toLocaleString('en-IN')} (${(percent * 100).toFixed(0)}%)`
            }
            outerRadius={100}
            fill="#4fb3ac"
            dataKey={valueKey}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip 
            formatter={(value) => [`₹${value.toLocaleString('en-IN')}`, '']}
            contentStyle={{ backgroundColor: '#fff', border: '1px solid #dde3da', borderRadius: '8px' }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Line Chart Component
 */
export function LineChartComponent({ data, title }) {
  if (!data || !Array.isArray(data) || data.length === 0) return null;

  const firstItem = data[0];
  const keys = Object.keys(firstItem);
  
  const labelKey = keys.find(k => {
    const lower = k.toLowerCase();
    return lower.includes('date') || lower.includes('month') || lower.includes('period') || lower.includes('time');
  }) || keys[0];
  
  const numericKeys = keys.filter(k => typeof firstItem[k] === 'number' && k !== labelKey);

  return (
    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-4">
      {title && <h4 className="text-md font-semibold text-gray-800 mb-3">{title}</h4>}
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#dde3da" />
          <XAxis 
            dataKey={labelKey} 
            stroke="#566176"
            fontSize={12}
            angle={-45}
            textAnchor="end"
            height={80}
          />
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
            formatter={(value) => [`₹${value.toLocaleString('en-IN')}`, '']}
            contentStyle={{ backgroundColor: '#fff', border: '1px solid #dde3da', borderRadius: '8px' }}
          />
          <Legend />
          {numericKeys.map((key, index) => (
            <Line 
              key={key}
              type="monotone" 
              dataKey={key} 
              stroke={COLORS[index % COLORS.length]} 
              strokeWidth={2}
              name={key.replace(/_/g, ' ')}
              dot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Area Chart Component
 */
export function AreaChartComponent({ data, title }) {
  if (!data || !Array.isArray(data) || data.length === 0) return null;

  const firstItem = data[0];
  const keys = Object.keys(firstItem);
  
  const labelKey = keys.find(k => {
    const lower = k.toLowerCase();
    return lower.includes('date') || lower.includes('month') || lower.includes('period');
  }) || keys[0];
  
  const numericKeys = keys.filter(k => typeof firstItem[k] === 'number' && k !== labelKey);

  return (
    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-4">
      {title && <h4 className="text-md font-semibold text-gray-800 mb-3">{title}</h4>}
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#dde3da" />
          <XAxis 
            dataKey={labelKey} 
            stroke="#566176"
            fontSize={12}
            angle={-45}
            textAnchor="end"
            height={80}
          />
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
            formatter={(value) => [`₹${value.toLocaleString('en-IN')}`, '']}
            contentStyle={{ backgroundColor: '#fff', border: '1px solid #dde3da', borderRadius: '8px' }}
          />
          <Legend />
          {numericKeys.map((key, index) => (
            <Area 
              key={key}
              type="monotone" 
              dataKey={key} 
              stroke={COLORS[index % COLORS.length]} 
              fill={COLORS[index % COLORS.length]}
              fillOpacity={0.3}
              strokeWidth={2}
              name={key.replace(/_/g, ' ')}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Comparison Chart (for output vs input, etc.)
 */
export function ComparisonChart({ data, title }) {
  if (!data || !data.labels || !Array.isArray(data.labels)) return null;

  const chartData = data.labels.map((label, index) => ({
    name: label,
    ...(data.output && { output: data.output[index] || 0 }),
    ...(data.input && { input: data.input[index] || 0 }),
    ...(data.values && { value: data.values[index] || 0 }),
  }));

  return (
    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-4">
      {title && <h4 className="text-md font-semibold text-gray-800 mb-3">{title}</h4>}
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
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
            formatter={(value) => [`₹${value.toLocaleString('en-IN')}`, '']}
            contentStyle={{ backgroundColor: '#fff', border: '1px solid #dde3da', borderRadius: '8px' }}
          />
          <Legend />
          {data.output && <Bar dataKey="output" fill="#4fb3ac" radius={[8, 8, 0, 0]} name="Output" />}
          {data.input && <Bar dataKey="input" fill="#4fb3ac" radius={[8, 8, 0, 0]} name="Input" />}
          {data.values && <Bar dataKey="value" fill="#b5d661" radius={[8, 8, 0, 0]} name="Value" />}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Category Breakdown Chart
 */
export function CategoryBreakdownChart({ data, title }) {
  if (!data) return null;

  // Handle receipts and payments
  if (data.receipts && Array.isArray(data.receipts)) {
    return (
      <div className="space-y-4">
        <BarChartComponent data={data.receipts} title={title || "Receipts by Category"} />
        {data.payments && Array.isArray(data.payments) && (
          <BarChartComponent data={data.payments} title="Payments by Category" />
        )}
      </div>
    );
  }

  // Handle single array
  if (Array.isArray(data)) {
    return <BarChartComponent data={data} title={title} />;
  }

  return null;
}


import React, { useState } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from 'recharts';

const COLORS = {
  revenue: '#4fb3ac',
  cogs: '#4fb3ac',
  sales: '#0b1a33',
  marketing: '#4fb3ac',
  admin: '#4fb3ac',
  ebitActual: '#4fb3ac',
  ebitTarget: '#4fb3ac',
  opexRatio: '#b5d661',
};

/**
 * Custom Tooltip Component with enhanced interactivity
 */
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-4 rounded-lg shadow-lg border-2 border-blue-200">
        <p className="font-semibold text-gray-800 mb-2">{label}</p>
        {payload.map((entry, index) => (
          <p key={index} className="text-sm" style={{ color: entry.color }}>
            {`${entry.name}: ${typeof entry.value === 'number' 
              ? `₹${entry.value.toLocaleString('en-IN')}` 
              : entry.value}`}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

/**
 * Gauge Chart Component - Circular progress indicator with hover effects
 */
export function GaugeChart({ value, label, maxValue = 100, color = '#4fb3ac' }) {
  const [isHovered, setIsHovered] = useState(false);
  const percentage = Math.min((value / maxValue) * 100, 100);
  const circumference = 2 * Math.PI * 45; // radius = 45
  const strokeDashoffset = circumference - (percentage / 100) * circumference;
  
  // Determine color based on percentage
  let gaugeColor = color;
  if (percentage >= 70) gaugeColor = '#4fb3ac'; // Green
  else if (percentage >= 40) gaugeColor = '#b26f0b'; // Orange
  else gaugeColor = '#b8432f'; // Red

  return (
    <div 
      className={`flex flex-col items-center justify-center p-4 bg-white rounded-lg border-2 border-gray-200 shadow-sm transition-all duration-300 ${
        isHovered ? 'shadow-lg border-blue-400 scale-105' : ''
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="relative w-32 h-32">
        <svg className="transform -rotate-90 w-32 h-32">
          {/* Background circle */}
          <circle
            cx="50%"
            cy="50%"
            r="45"
            stroke="#dde3da"
            strokeWidth="10"
            fill="none"
          />
          {/* Progress circle */}
          <circle
            cx="50%"
            cy="50%"
            r="45"
            stroke={gaugeColor}
            strokeWidth="10"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className={`text-2xl font-bold transition-all duration-300 ${isHovered ? 'scale-110' : ''}`} style={{ color: gaugeColor }}>
              {value}%
            </div>
          </div>
        </div>
      </div>
      <div className={`mt-2 text-sm font-semibold text-gray-700 text-center transition-all duration-300 ${isHovered ? 'text-blue-600 font-bold' : ''}`}>
        {label}
      </div>
    </div>
  );
}

/**
 * Revenue & COGS Month to Month Chart - Always shows data
 */
export function RevenueCOGSChart({ data = [] }) {
  const [hoveredBar, setHoveredBar] = useState(null);

  // Generate default data if none provided
  const chartData = data.length > 0 ? data : (() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months.map((month, idx) => ({
      month: `${month} 2023`,
      revenue: 100000 + (idx * 5000),
      cogs: 20000 + (idx * 2000)
    }));
  })();

  return (
    <div className="bg-white p-6 rounded-lg border-2 border-gray-200 shadow-sm hover:shadow-lg transition-shadow duration-300">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Revenue & COGS (Month to Month)</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart 
          data={chartData} 
          margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
          onMouseMove={(state) => {
            if (state && state.activeTooltipIndex !== undefined) {
              setHoveredBar(state.activeTooltipIndex);
            }
          }}
          onMouseLeave={() => setHoveredBar(null)}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#dde3da" />
          <XAxis 
            dataKey="month" 
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
          <Tooltip content={<CustomTooltip />} />
          <Legend 
            wrapperStyle={{ paddingTop: '20px' }}
            iconType="rect"
          />
          <Bar 
            dataKey="revenue" 
            fill={COLORS.revenue} 
            radius={[8, 8, 0, 0]} 
            name="Actual Revenue"
            className="cursor-pointer transition-opacity duration-200"
            opacity={hoveredBar !== null ? 0.7 : 1}
          />
          <Bar 
            dataKey="cogs" 
            fill={COLORS.cogs} 
            radius={[8, 8, 0, 0]} 
            name="COGS"
            className="cursor-pointer transition-opacity duration-200"
            opacity={hoveredBar !== null ? 0.7 : 1}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * OPEX Breakdown Chart - Enhanced with gradients, labels, and better interactivity
 */
export function OPEXBreakdownChart({ data = {} }) {
  const [selectedSegment, setSelectedSegment] = useState(null);
  const [viewMode, setViewMode] = useState('bar'); // 'bar' or 'pie'
  const { sales = 0, marketing = 0, generalAdmin = 0 } = data;
  const total = sales + marketing + generalAdmin;
  
  // Generate default data if total is 0
  const salesValue = total > 0 ? sales : 615000;
  const marketingValue = total > 0 ? marketing : 270600;
  const adminValue = total > 0 ? generalAdmin : 344400;
  const totalValue = salesValue + marketingValue + adminValue;

  const salesPercent = totalValue > 0 ? ((salesValue / totalValue) * 100).toFixed(1) : 0;
  const marketingPercent = totalValue > 0 ? ((marketingValue / totalValue) * 100).toFixed(1) : 0;
  const adminPercent = totalValue > 0 ? ((adminValue / totalValue) * 100).toFixed(1) : 0;

  const chartData = [
    {
      name: 'OPEX',
      Sales: salesValue,
      Marketing: marketingValue,
      'General & Admin': adminValue,
    }
  ];

  const pieData = [
    { name: 'Sales', value: salesValue, percent: salesPercent, color: COLORS.sales },
    { name: 'Marketing', value: marketingValue, percent: marketingPercent, color: COLORS.marketing },
    { name: 'General & Admin', value: adminValue, percent: adminPercent, color: COLORS.admin },
  ];

  const handleLegendClick = (dataKey) => {
    setSelectedSegment(selectedSegment === dataKey ? null : dataKey);
  };

  // Custom label for bars showing percentage
  const renderLabel = (props) => {
    const { x, y, width, height, value } = props;
    const percent = totalValue > 0 ? ((value / totalValue) * 100).toFixed(1) : 0;
    return (
      <text
        x={x + width / 2}
        y={y - 5}
        fill="#3a4659"
        textAnchor="middle"
        fontSize={11}
        fontWeight="600"
      >
        {percent}%
      </text>
    );
  };

  return (
    <div className="bg-white p-6 rounded-lg border-2 border-gray-200 shadow-sm hover:shadow-lg transition-shadow duration-300">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-800">OPEX Breakdown</h3>
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('bar')}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              viewMode === 'bar' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Bar
          </button>
          <button
            onClick={() => setViewMode('pie')}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              viewMode === 'pie' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Pie
          </button>
        </div>
      </div>
      
      {viewMode === 'bar' ? (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart 
            data={chartData} 
            margin={{ top: 20, right: 20, left: 0, bottom: 5 }}
          >
            <defs>
              <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0b1a33" stopOpacity={1}/>
                <stop offset="100%" stopColor="#4fb3ac" stopOpacity={0.8}/>
              </linearGradient>
              <linearGradient id="marketingGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4fb3ac" stopOpacity={1}/>
                <stop offset="100%" stopColor="#8fcbc5" stopOpacity={0.8}/>
              </linearGradient>
              <linearGradient id="adminGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4fb3ac" stopOpacity={1}/>
                <stop offset="100%" stopColor="#4fb3ac" stopOpacity={0.8}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#dde3da" opacity={0.5} />
            <XAxis 
              dataKey="name" 
              stroke="#566176" 
              fontSize={12}
              width={80}
            />
            <YAxis 
              type="number"
              stroke="#566176"
              fontSize={12}
              tickFormatter={(value) => {
                if (Math.abs(value) >= 1000000) return `₹${(value / 1000000).toFixed(1)}M`;
                if (Math.abs(value) >= 1000) return `₹${(value / 1000).toFixed(0)}k`;
                return `₹${value}`;
              }}
            />
            <Tooltip 
              content={<CustomTooltip />}
              cursor={{ fill: 'rgba(0, 0, 0, 0.05)' }}
            />
            <Legend 
              onClick={handleLegendClick}
              wrapperStyle={{ paddingTop: '10px' }}
              iconType="rect"
            />
            <Bar 
              dataKey="Sales" 
              stackId="a" 
              fill="url(#salesGradient)" 
              name={`Sales (${salesPercent}%)`}
              className="cursor-pointer transition-opacity duration-200"
              opacity={selectedSegment === null || selectedSegment === 'Sales' ? 1 : 0.3}
              radius={[0, 0, 0, 0]}
              label={renderLabel}
              animationDuration={800}
            />
            <Bar 
              dataKey="Marketing" 
              stackId="a" 
              fill="url(#marketingGradient)" 
              name={`Marketing (${marketingPercent}%)`}
              className="cursor-pointer transition-opacity duration-200"
              opacity={selectedSegment === null || selectedSegment === 'Marketing' ? 1 : 0.3}
              radius={[0, 0, 0, 0]}
              label={renderLabel}
              animationDuration={800}
            />
            <Bar 
              dataKey="General & Admin" 
              stackId="a" 
              fill="url(#adminGradient)" 
              name={`General & Admin (${adminPercent}%)`}
              className="cursor-pointer transition-opacity duration-200"
              opacity={selectedSegment === null || selectedSegment === 'General & Admin' ? 1 : 0.3}
              radius={[8, 8, 0, 0]}
              label={renderLabel}
              animationDuration={800}
            />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              labelLine={true}
              label={({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }) => {
                // Calculate label position to prevent overlap
                const RADIAN = Math.PI / 180;
                const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
                const x = cx + radius * Math.cos(-midAngle * RADIAN);
                const y = cy + radius * Math.sin(-midAngle * RADIAN);
                
                // Position label outside the pie with adequate spacing to prevent overlap
                const labelRadius = outerRadius + 30;
                const labelX = cx + labelRadius * Math.cos(-midAngle * RADIAN);
                const labelY = cy + labelRadius * Math.sin(-midAngle * RADIAN);
                
                // Determine text anchor based on position to prevent overlap
                const textAnchor = x > cx ? 'start' : 'end';
                
                // Only show label if segment is large enough (prevents clutter and overlap)
                if (percent < 0.05) return null;
                
                const segmentColor = pieData.find(d => d.name === name)?.color || '#000';
                
                return (
                  <g>
                    <line 
                      x1={x} 
                      y1={y} 
                      x2={labelX} 
                      y2={labelY} 
                      stroke={segmentColor}
                      strokeWidth={1.5}
                      opacity={0.6}
                    />
                    <text
                      x={labelX}
                      y={labelY}
                      textAnchor={textAnchor}
                      fill={segmentColor}
                      fontSize={11}
                      fontWeight="600"
                      dominantBaseline="central"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {`${name}: ${(percent * 100).toFixed(1)}%`}
                    </text>
                  </g>
                );
              }}
              outerRadius={80}
              fill="#4fb3ac"
              dataKey="value"
              animationDuration={800}
            >
              {pieData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={entry.color}
                  opacity={selectedSegment === null || selectedSegment === entry.name ? 1 : 0.3}
                  className="cursor-pointer transition-opacity duration-200"
                  onClick={() => handleLegendClick(entry.name)}
                />
              ))}
            </Pie>
            <Tooltip 
              content={<CustomTooltip />}
              formatter={(value, name) => [
                `₹${value.toLocaleString('en-IN')}`,
                name
              ]}
            />
            <Legend 
              wrapperStyle={{ paddingTop: '10px' }}
              iconType="circle"
            />
          </PieChart>
        </ResponsiveContainer>
      )}
      
      <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <div 
          className={`text-center p-3 rounded-lg transition-all duration-200 cursor-pointer border-2 ${
            selectedSegment === 'Sales' 
              ? 'bg-blue-50 border-blue-400 shadow-md' 
              : 'border-transparent hover:bg-gray-50 hover:border-gray-300'
          }`}
          onClick={() => handleLegendClick('Sales')}
        >
          <div className="font-bold text-base" style={{ color: COLORS.sales }}>Sales</div>
          <div className="text-gray-600 font-semibold mt-1">{salesPercent}%</div>
          <div className="text-gray-500 text-xs mt-1">₹{salesValue.toLocaleString('en-IN')}</div>
        </div>
        <div 
          className={`text-center p-3 rounded-lg transition-all duration-200 cursor-pointer border-2 ${
            selectedSegment === 'Marketing' 
              ? 'bg-blue-50 border-blue-400 shadow-md' 
              : 'border-transparent hover:bg-gray-50 hover:border-gray-300'
          }`}
          onClick={() => handleLegendClick('Marketing')}
        >
          <div className="font-bold text-base" style={{ color: COLORS.marketing }}>Marketing</div>
          <div className="text-gray-600 font-semibold mt-1">{marketingPercent}%</div>
          <div className="text-gray-500 text-xs mt-1">₹{marketingValue.toLocaleString('en-IN')}</div>
        </div>
        <div 
          className={`text-center p-3 rounded-lg transition-all duration-200 cursor-pointer border-2 ${
            selectedSegment === 'General & Admin' 
              ? 'bg-blue-50 border-blue-400 shadow-md' 
              : 'border-transparent hover:bg-gray-50 hover:border-gray-300'
          }`}
          onClick={() => handleLegendClick('General & Admin')}
        >
          <div className="font-bold text-base" style={{ color: COLORS.admin }}>General & Admin</div>
          <div className="text-gray-600 font-semibold mt-1">{adminPercent}%</div>
          <div className="text-gray-500 text-xs mt-1">₹{adminValue.toLocaleString('en-IN')}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * EBIT Chart (Actual vs Target) - Always shows data
 */
export function EBITChart({ data = [] }) {
  const [hoveredIndex, setHoveredIndex] = useState(null);

  // Generate default data if none provided
  const chartData = data.length > 0 ? data : (() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months.map((month, idx) => ({
      month: `${month} 2023`,
      ebitActual: 5000 + (idx * 1000),
      ebitTarget: 10000 + (idx * 1000)
    }));
  })();

  return (
    <div className="bg-white p-6 rounded-lg border-2 border-gray-200 shadow-sm hover:shadow-lg transition-shadow duration-300">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Earning before interest and taxes (EBIT)</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart 
          data={chartData} 
          margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
          onMouseMove={(state) => {
            if (state && state.activeTooltipIndex !== undefined) {
              setHoveredIndex(state.activeTooltipIndex);
            }
          }}
          onMouseLeave={() => setHoveredIndex(null)}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#dde3da" />
          <XAxis 
            dataKey="month" 
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
          <Tooltip content={<CustomTooltip />} />
          <Legend 
            wrapperStyle={{ paddingTop: '20px' }}
            iconType="line"
          />
          <Line 
            type="monotone" 
            dataKey="ebitActual" 
            stroke={COLORS.ebitActual} 
            strokeWidth={3}
            name="EBIT Actual"
            dot={{ r: 5, fill: COLORS.ebitActual }}
            activeDot={{ r: 8, fill: COLORS.ebitActual }}
            className="cursor-pointer"
            animationDuration={1000}
          />
          <Line 
            type="monotone" 
            dataKey="ebitTarget" 
            stroke={COLORS.ebitTarget} 
            strokeWidth={2}
            strokeDasharray="5 5"
            name="EBIT Target"
            dot={{ r: 4, fill: COLORS.ebitTarget }}
            activeDot={{ r: 7, fill: COLORS.ebitTarget }}
            className="cursor-pointer"
            animationDuration={1000}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * OPEX Month to Month Chart - Enhanced with better trends, tooltips, and visualizations
 */
export function OPEXMonthToMonthChart({ data = [] }) {
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [hiddenBars, setHiddenBars] = useState([]);
  const [viewMode, setViewMode] = useState('stacked'); // 'stacked', 'grouped', 'area'

  // Generate default data if none provided
  const chartData = data.length > 0 ? data : (() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months.map((month, idx) => ({
      month: `${month} 2023`,
      sales: 50000 + (idx * 2000),
      marketing: 20000 + (idx * 1000),
      generalAdmin: 30000 + (idx * 1500),
      opexRatio: 60 + (idx * 2),
      total: 100000 + (idx * 4500)
    }));
  })();

  // Calculate percentage changes
  const calculateChange = (current, previous) => {
    if (!previous || previous === 0) return null;
    return ((current - previous) / previous * 100).toFixed(1);
  };

  const handleLegendClick = (dataKey) => {
    setHiddenBars(prev => 
      prev.includes(dataKey) 
        ? prev.filter(key => key !== dataKey)
        : [...prev, dataKey]
    );
  };

  // Enhanced tooltip with trend indicators
  const EnhancedTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const currentData = chartData.find(d => d.month === label);
      const currentIndex = chartData.findIndex(d => d.month === label);
      const previousData = currentIndex > 0 ? chartData[currentIndex - 1] : null;
      
      return (
        <div className="bg-white p-4 rounded-lg shadow-xl border-2 border-blue-200 min-w-[200px]">
          <p className="font-bold text-gray-800 mb-3 border-b pb-2">{label}</p>
          {payload.map((entry, index) => {
            const change = previousData && entry.dataKey !== 'opexRatio' 
              ? calculateChange(entry.value, previousData[entry.dataKey])
              : null;
            const isPositive = change && parseFloat(change) > 0;
            
            return (
              <div key={index} className="mb-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold" style={{ color: entry.color }}>
                    {entry.name}:
                  </span>
                  <span className="text-sm font-bold text-gray-800 ml-2">
                    {entry.dataKey === 'opexRatio' 
                      ? `${entry.value}%`
                      : `₹${entry.value.toLocaleString('en-IN')}`
                    }
                  </span>
                </div>
                {change && (
                  <div className={`text-xs mt-1 ${isPositive ? 'text-red-600' : 'text-green-600'}`}>
                    {isPositive ? '↑' : '↓'} {Math.abs(change)}% vs previous
                  </div>
                )}
              </div>
            );
          })}
          {currentData && (
            <div className="mt-3 pt-2 border-t">
              <div className="text-xs text-gray-600">
                Total OPEX: ₹{(currentData.total || (currentData.sales + currentData.marketing + currentData.generalAdmin)).toLocaleString('en-IN')}
              </div>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white p-6 rounded-lg border-2 border-gray-200 shadow-sm hover:shadow-lg transition-shadow duration-300">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-800">OPEX Month to Month</h3>
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('stacked')}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              viewMode === 'stacked' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Stacked
          </button>
          <button
            onClick={() => setViewMode('grouped')}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              viewMode === 'grouped' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Grouped
          </button>
          <button
            onClick={() => setViewMode('area')}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              viewMode === 'area' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Area
          </button>
        </div>
      </div>
      
      <ResponsiveContainer width="100%" height={350}>
        <ComposedChart 
          data={chartData} 
          margin={{ top: 10, right: 30, left: 0, bottom: 60 }}
          onMouseMove={(state) => {
            if (state && state.activeTooltipIndex !== undefined) {
              setHoveredIndex(state.activeTooltipIndex);
            }
          }}
          onMouseLeave={() => setHoveredIndex(null)}
        >
          <defs>
            <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0b1a33" stopOpacity={0.9}/>
              <stop offset="100%" stopColor="#4fb3ac" stopOpacity={0.6}/>
            </linearGradient>
            <linearGradient id="marketingGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4fb3ac" stopOpacity={0.9}/>
              <stop offset="100%" stopColor="#8fcbc5" stopOpacity={0.6}/>
            </linearGradient>
            <linearGradient id="adminGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4fb3ac" stopOpacity={0.9}/>
              <stop offset="100%" stopColor="#4fb3ac" stopOpacity={0.6}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#dde3da" opacity={0.5} />
          <XAxis 
            dataKey="month" 
            stroke="#566176"
            fontSize={11}
            angle={-45}
            textAnchor="end"
            height={80}
            tick={{ fill: '#566176' }}
          />
          <YAxis 
            yAxisId="left"
            stroke="#566176"
            fontSize={12}
            tickFormatter={(value) => {
              if (Math.abs(value) >= 1000000) return `₹${(value / 1000000).toFixed(1)}M`;
              if (Math.abs(value) >= 1000) return `₹${(value / 1000).toFixed(0)}k`;
              return `₹${value}`;
            }}
          />
          <YAxis 
            yAxisId="right"
            orientation="right"
            stroke="#566176"
            fontSize={12}
            tickFormatter={(value) => `${value}%`}
          />
          <Tooltip content={<EnhancedTooltip />} />
          <Legend 
            onClick={handleLegendClick}
            wrapperStyle={{ paddingTop: '10px' }}
            iconType="rect"
          />
          
          {viewMode === 'area' ? (
            <>
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="sales"
                stackId="a"
                fill="url(#salesGradient)"
                stroke={COLORS.sales}
                strokeWidth={2}
                name="Sales"
                opacity={hiddenBars.includes('sales') ? 0.3 : 0.8}
                animationDuration={800}
              />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="marketing"
                stackId="a"
                fill="url(#marketingGradient)"
                stroke={COLORS.marketing}
                strokeWidth={2}
                name="Marketing"
                opacity={hiddenBars.includes('marketing') ? 0.3 : 0.8}
                animationDuration={800}
              />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="generalAdmin"
                stackId="a"
                fill="url(#adminGradient)"
                stroke={COLORS.admin}
                strokeWidth={2}
                name="General & Admin"
                opacity={hiddenBars.includes('generalAdmin') ? 0.3 : 0.8}
                animationDuration={800}
              />
            </>
          ) : (
            <>
              <Bar 
                dataKey="sales" 
                stackId={viewMode === 'stacked' ? "a" : undefined}
                fill={viewMode === 'stacked' ? "url(#salesGradient)" : COLORS.sales}
                name="Sales"
                className="cursor-pointer transition-opacity duration-200"
                opacity={hiddenBars.includes('sales') ? 0.3 : 1}
                radius={viewMode === 'stacked' ? [0, 0, 0, 0] : [4, 4, 0, 0]}
                animationDuration={800}
              />
              <Bar 
                dataKey="marketing" 
                stackId={viewMode === 'stacked' ? "a" : undefined}
                fill={viewMode === 'stacked' ? "url(#marketingGradient)" : COLORS.marketing}
                name="Marketing"
                className="cursor-pointer transition-opacity duration-200"
                opacity={hiddenBars.includes('marketing') ? 0.3 : 1}
                radius={viewMode === 'stacked' ? [0, 0, 0, 0] : [4, 4, 0, 0]}
                animationDuration={800}
              />
              <Bar 
                dataKey="generalAdmin" 
                stackId={viewMode === 'stacked' ? "a" : undefined}
                fill={viewMode === 'stacked' ? "url(#adminGradient)" : COLORS.admin}
                name="General & Admin"
                className="cursor-pointer transition-opacity duration-200"
                opacity={hiddenBars.includes('generalAdmin') ? 0.3 : 1}
                radius={viewMode === 'stacked' ? [8, 8, 0, 0] : [4, 4, 0, 0]}
                animationDuration={800}
              />
            </>
          )}
          
          <Line 
            yAxisId="right"
            type="monotone" 
            dataKey="opexRatio" 
            stroke={COLORS.opexRatio} 
            strokeWidth={3}
            name="OPEX Ratio"
            dot={{ r: 5, fill: COLORS.opexRatio, strokeWidth: 2, stroke: '#fff' }}
            activeDot={{ r: 8, fill: COLORS.opexRatio, strokeWidth: 2, stroke: '#fff' }}
            className="cursor-pointer"
            animationDuration={1000}
            opacity={hiddenBars.includes('opexRatio') ? 0.3 : 1}
          />
        </ComposedChart>
      </ResponsiveContainer>
      
      {/* Summary stats */}
      <div className="mt-4 grid grid-cols-4 gap-3 text-xs">
        <div className="text-center p-2 bg-gray-50 rounded">
          <div className="text-gray-600">Total OPEX</div>
          <div className="font-bold text-gray-800">
            ₹{chartData.reduce((sum, d) => sum + (d.sales + d.marketing + d.generalAdmin), 0).toLocaleString('en-IN')}
          </div>
        </div>
        <div className="text-center p-2 bg-gray-50 rounded">
          <div className="text-gray-600">Avg Monthly</div>
          <div className="font-bold text-gray-800">
            ₹{Math.round(chartData.reduce((sum, d) => sum + (d.sales + d.marketing + d.generalAdmin), 0) / chartData.length).toLocaleString('en-IN')}
          </div>
        </div>
        <div className="text-center p-2 bg-gray-50 rounded">
          <div className="text-gray-600">Avg Ratio</div>
          <div className="font-bold text-gray-800">
            {chartData.length > 0 
              ? (chartData.reduce((sum, d) => sum + (d.opexRatio || 0), 0) / chartData.length).toFixed(1)
              : 0}%
          </div>
        </div>
        <div className="text-center p-2 bg-gray-50 rounded">
          <div className="text-gray-600">Trend</div>
          <div className="font-bold text-gray-800">
            {chartData.length > 1 && chartData[chartData.length - 1].opexRatio > chartData[0].opexRatio 
              ? '↑ Increasing' 
              : chartData.length > 1 && chartData[chartData.length - 1].opexRatio < chartData[0].opexRatio
              ? '↓ Decreasing'
              : '→ Stable'}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Income Statement Table Component - Matching PDF Format Exactly
 */
export function IncomeStatementTable({ data = {} }) {
  const {
    revenue = 0,
    cogs = 0,
    grossProfit = 0,
    opex = 0,
    sales = 0,
    marketing = 0,
    generalAdmin = 0,
    otherIncome = 0,
    otherExpenses = 0,
    operating = 0,
    period = 'Current Period',
    previousPeriod = null,
    companyName = 'XYZ', // Hardcoded as XYZ
    // Additional fields for PDF format
    costOfMaterialConsumed = 0,
    employeeBenefitsExpense = 0,
    financeCosts = 0,
    depreciationAmortisation = 0,
    priorPeriodIncomeExpense = 0,
    profitBeforeTax = 0,
    taxAdjustments = 0,
    currentTax = 0,
    deferredTax = 0,
    profitForYear = 0,
    earningsPerShare = 0,
    // Previous year values
    prevRevenue = 0,
    prevCostOfMaterialConsumed = 0,
    prevEmployeeBenefitsExpense = 0,
    prevFinanceCosts = 0,
    prevDepreciationAmortisation = 0,
    prevOtherExpenses = 0,
    prevOtherIncome = 0,
    prevPriorPeriodIncomeExpense = 0,
    prevProfitBeforeTax = 0,
    prevTaxAdjustments = 0,
    prevCurrentTax = 0,
    prevDeferredTax = 0,
    prevProfitForYear = 0,
    prevEarningsPerShare = 0
  } = data;

  const formatAmount = (amount) => {
    // If null/undefined/empty, show 0.00 for previous year column
    if (amount === null || amount === undefined || amount === '') return '0.00';
    const num = typeof amount === 'number' ? amount : parseFloat(amount);
    // If parseFloat fails (NaN), return 0.00
    if (isNaN(num)) return '0.00';
    // Format number with 2 decimal places
    return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Format period to match PDF: "for the year ended 31st March 2024"
  const formatPeriod = (periodStr) => {
    if (!periodStr || periodStr === 'Current Period') {
      return 'for the year ended 31st March 2024';
    }
    // Try to extract date from period string
    const dateMatch = periodStr.match(/(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);
    if (dateMatch) {
      const day = parseInt(dateMatch[1]);
      const suffix = day === 1 || day === 21 || day === 31 ? 'st' : day === 2 || day === 22 ? 'nd' : day === 3 || day === 23 ? 'rd' : 'th';
      return `for the year ended ${day}${suffix} ${dateMatch[2]} ${dateMatch[3]}`;
    }
    // Try YYYY-MM-DD format
    const isoMatch = periodStr.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                     'July', 'August', 'September', 'October', 'November', 'December'];
      const monthName = months[parseInt(isoMatch[2]) - 1];
      const day = parseInt(isoMatch[3]);
      const suffix = day === 1 || day === 21 || day === 31 ? 'st' : day === 2 || day === 22 ? 'nd' : day === 3 || day === 23 ? 'rd' : 'th';
      return `for the year ended ${day}${suffix} ${monthName} ${isoMatch[1]}`;
    }
    // Try to extract year and assume March 31
    const yearMatch = periodStr.match(/(\d{4})/);
    if (yearMatch) {
      return `for the year ended 31st March ${yearMatch[1]}`;
    }
    return 'for the year ended 31st March 2024';
  };

  // Extract year from period string
  const extractYear = (periodStr) => {
    if (!periodStr) return null;
    const yearMatch = periodStr.match(/(\d{4})/);
    return yearMatch ? parseInt(yearMatch[1]) : null;
  };

  const formattedPeriod = formatPeriod(period);
  
  // Calculate previous year from current period if not provided
  let formattedPrevPeriod;
  if (previousPeriod) {
    formattedPrevPeriod = formatPeriod(previousPeriod);
  } else {
    // Extract year from current period and subtract 1
    const currentYear = extractYear(period || formattedPeriod);
    if (currentYear) {
      const prevYear = currentYear - 1;
      formattedPrevPeriod = `for the year ended 31st March ${prevYear}`;
    } else {
      // Fallback: try to extract from formattedPeriod string
      const formattedYearMatch = formattedPeriod.match(/(\d{4})/);
      if (formattedYearMatch) {
        const prevYear = parseInt(formattedYearMatch[1]) - 1;
        formattedPrevPeriod = `for the year ended 31st March ${prevYear}`;
      } else {
        formattedPrevPeriod = 'for the year ended 31st March 2023';
      }
    }
  }
  
  // Always show comparative (previous year) - if no previous year data, show zeros
  const showComparative = true;
  
  // Calculate values matching PDF structure - Current Year
  const revenueFromOperations = revenue || 0;
  const totalIncome = revenueFromOperations + (otherIncome || 0);
  
  // Use provided expense breakdown or calculate from available data
  const costOfMaterials = costOfMaterialConsumed || cogs || 0;
  const employeeBenefits = employeeBenefitsExpense || 0;
  const financeCost = financeCosts || 0;
  const depreciation = depreciationAmortisation || 0;
  const otherExp = otherExpenses || (opex - (sales + marketing + generalAdmin)) || 0;
  const totalExpenses = costOfMaterials + employeeBenefits + financeCost + depreciation + otherExp;
  
  const profitFromOrdinaryActivities = totalIncome - totalExpenses;
  const priorPeriod = priorPeriodIncomeExpense || 0;
  const profitBeforeTaxCalc = profitBeforeTax || (profitFromOrdinaryActivities + priorPeriod);
  const currentTaxAmount = currentTax || taxAdjustments || 0;
  const deferredTaxAmount = deferredTax || 0;
  const totalTaxExpenses = currentTaxAmount + deferredTaxAmount;
  const taxAdjust = taxAdjustments || totalTaxExpenses || 0;
  const profitForYearCalc = profitForYear || (profitBeforeTaxCalc - taxAdjust);
  const eps = earningsPerShare || 0;
  
  // Calculate values for Previous Year
  const prevRevenueFromOperations = prevRevenue || 0;
  const prevTotalIncome = prevRevenueFromOperations + (prevOtherIncome || 0);
  const prevCostOfMaterials = prevCostOfMaterialConsumed || 0;
  const prevEmployeeBenefits = prevEmployeeBenefitsExpense || 0;
  const prevFinanceCost = prevFinanceCosts || 0;
  const prevDepreciation = prevDepreciationAmortisation || 0;
  const prevOtherExp = prevOtherExpenses || 0;
  const prevTotalExpenses = prevCostOfMaterials + prevEmployeeBenefits + prevFinanceCost + prevDepreciation + prevOtherExp;
  const prevProfitFromOrdinaryActivities = prevTotalIncome - prevTotalExpenses;
  const prevPriorPeriod = prevPriorPeriodIncomeExpense || 0;
  const prevProfitBeforeTaxCalc = prevProfitBeforeTax || (prevProfitFromOrdinaryActivities + prevPriorPeriod);
  const prevCurrentTaxAmount = prevCurrentTax || prevTaxAdjustments || 0;
  const prevDeferredTaxAmount = prevDeferredTax || 0;
  const prevTotalTaxExpenses = prevCurrentTaxAmount + prevDeferredTaxAmount;
  const prevTaxAdjust = prevTaxAdjustments || prevTotalTaxExpenses || 0;
  const prevProfitForYearCalc = prevProfitForYear || (prevProfitBeforeTaxCalc - prevTaxAdjust);
  const prevEps = prevEarningsPerShare || 0;

  return (
    <div className="bg-white p-8 rounded-lg border-2 border-gray-300 shadow-lg">
      {/* Title matching PDF format exactly */}
      <div className="mb-8 text-center border-b-2 border-gray-400 pb-6">
        <h3 className="text-2xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'serif' }}>
          XYZ
        </h3>
        <h4 className="text-xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'serif' }}>
          Statement of Profit & Loss
        </h4>
        <p className="text-base text-gray-700 font-medium" style={{ fontFamily: 'serif' }}>
          {formattedPeriod}
        </p>
        <p className="text-sm text-gray-600 mt-2" style={{ fontFamily: 'serif' }}>
          (In '000)
        </p>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-base" style={{ borderCollapse: 'separate', borderSpacing: 0, fontFamily: 'Arial, sans-serif' }}>
          <thead>
            <tr className="border-b-2 border-gray-500">
              <th className="py-3 px-6 text-left font-bold text-gray-900" style={{ width: '40%' }}>Particulars</th>
              <th className="py-3 px-6 text-center font-bold text-gray-900" style={{ width: '10%' }}>Note No.</th>
              <th className="py-3 px-6 text-right font-bold text-gray-900" style={{ width: '25%' }}>
                {formattedPeriod} (Amount in Rs.)
              </th>
                <th className="py-3 px-6 text-right font-bold text-gray-900" style={{ width: '25%' }}>
                {formattedPrevPeriod} (Amount in Rs.)
                </th>
            </tr>
          </thead>
          <tbody>
            {/* I. Revenue from Operations */}
            <tr>
              <td colSpan={4} className="py-3 px-6 font-bold text-gray-900 text-lg bg-gray-100">
                I. Revenue from Operations
              </td>
            </tr>
            <tr className="border-b border-gray-300">
              <td className="py-3 px-6 text-gray-800">Revenue from Operations</td>
              <td className="py-3 px-6 text-center text-gray-800">22</td>
              <td className="py-3 px-6 text-right text-gray-800">{formatAmount(revenueFromOperations)}</td>
              <td className="py-3 px-6 text-right text-gray-800">{formatAmount(prevRevenueFromOperations)}</td>
            </tr>
            
            {/* II. Other Income */}
            <tr>
              <td colSpan={4} className="py-3 px-6 font-bold text-gray-900 text-lg bg-gray-100">
                II. Other Income
              </td>
            </tr>
            <tr className="border-b border-gray-300">
              <td className="py-3 px-6 text-gray-800">Other Income</td>
              <td className="py-3 px-6 text-center text-gray-800">23</td>
              <td className="py-3 px-6 text-right text-gray-800">{formatAmount(otherIncome)}</td>
              <td className="py-3 px-6 text-right text-gray-800">{formatAmount(prevOtherIncome)}</td>
            </tr>
            
            {/* III. Total Income */}
            <tr className="border-b-2 border-gray-500 bg-gray-100">
              <td className="py-3 px-6 font-bold text-gray-900 text-lg">III. Total Income (I+II)</td>
              <td className="py-3 px-6 text-center"></td>
              <td className="py-3 px-6 text-right font-bold text-gray-900 text-lg">{formatAmount(totalIncome)}</td>
                <td className="py-3 px-6 text-right font-bold text-gray-900 text-lg">{formatAmount(prevTotalIncome)}</td>
            </tr>
            
            {/* Expenses Section Header */}
            <tr>
              <td colSpan={4} className="py-3 px-6 font-bold text-gray-900 text-lg bg-gray-100">Expenses</td>
            </tr>
            
            <tr className="border-b border-gray-300">
              <td className="py-3 px-6 pl-8 text-gray-800">(a) Cost of Material Consumed</td>
              <td className="py-3 px-6 text-center text-gray-800">24</td>
              <td className="py-3 px-6 text-right text-gray-800">{formatAmount(costOfMaterials)}</td>
                <td className="py-3 px-6 text-right text-gray-800">{formatAmount(prevCostOfMaterials)}</td>
            </tr>
            
            <tr className="border-b border-gray-300">
              <td className="py-3 px-6 pl-8 text-gray-800">(b) Employee Benefits Expense</td>
              <td className="py-3 px-6 text-center text-gray-800">25</td>
              <td className="py-3 px-6 text-right text-gray-800">{formatAmount(employeeBenefits)}</td>
                <td className="py-3 px-6 text-right text-gray-800">{formatAmount(prevEmployeeBenefits)}</td>
            </tr>
            
            <tr className="border-b border-gray-300">
              <td className="py-3 px-6 pl-8 text-gray-800">(c) Finance Costs</td>
              <td className="py-3 px-6 text-center text-gray-800">26</td>
              <td className="py-3 px-6 text-right text-gray-800">{formatAmount(financeCost)}</td>
                <td className="py-3 px-6 text-right text-gray-800">{formatAmount(prevFinanceCost)}</td>
            </tr>
            
            <tr className="border-b border-gray-300">
              <td className="py-3 px-6 pl-8 text-gray-800">(d) Depreciation and Amortisation Expense</td>
              <td className="py-3 px-6 text-center text-gray-800">12</td>
              <td className="py-3 px-6 text-right text-gray-800">{formatAmount(depreciation)}</td>
                <td className="py-3 px-6 text-right text-gray-800">{formatAmount(prevDepreciation)}</td>
            </tr>
            
            <tr className="border-b border-gray-300">
              <td className="py-3 px-6 pl-8 text-gray-800">(e) Other Expenses</td>
              <td className="py-3 px-6 text-center text-gray-800">27</td>
              <td className="py-3 px-6 text-right text-gray-800">{formatAmount(otherExp)}</td>
                <td className="py-3 px-6 text-right text-gray-800">{formatAmount(prevOtherExp)}</td>
            </tr>
            
            {/* IV. Total Expenses */}
            <tr className="border-b-2 border-gray-500 bg-gray-100">
              <td className="py-3 px-6 font-bold text-gray-900 text-lg">IV. Total Expenses</td>
              <td className="py-3 px-6 text-center"></td>
              <td className="py-3 px-6 text-right font-bold text-gray-900 text-lg">{formatAmount(totalExpenses)}</td>
                <td className="py-3 px-6 text-right font-bold text-gray-900 text-lg">{formatAmount(prevTotalExpenses)}</td>
            </tr>
            
            {/* V. Profit/(Loss) from Ordinary Activities before tax */}
            <tr className="border-b-2 border-gray-500 bg-gray-100">
              <td className="py-3 px-6 font-bold text-gray-900 text-lg">V. Profit/(Loss) from Ordinary Activities before tax (III-IV)</td>
              <td className="py-3 px-6 text-center"></td>
              <td className={`py-3 px-6 text-right font-bold text-lg ${
                profitFromOrdinaryActivities >= 0 ? 'text-gray-900' : 'text-red-700'
              }`}>
                {formatAmount(profitFromOrdinaryActivities)}
              </td>
                <td className={`py-3 px-6 text-right font-bold text-lg ${
                  prevProfitFromOrdinaryActivities >= 0 ? 'text-gray-900' : 'text-red-700'
                }`}>
                  {formatAmount(prevProfitFromOrdinaryActivities)}
                </td>
            </tr>
            
            {/* VI. Prior Period Income/(Expense) */}
            <tr className="border-b border-gray-300">
              <td className="py-3 px-6 text-gray-800">VI. Prior Period Income/(Expense)</td>
              <td className="py-3 px-6 text-center"></td>
              <td className={`py-3 px-6 text-right ${
                priorPeriod >= 0 ? 'text-gray-800' : 'text-red-700'
              }`}>
                {priorPeriod === 0 ? '-' : formatAmount(priorPeriod)}
              </td>
                <td className={`py-3 px-6 text-right ${
                  prevPriorPeriod >= 0 ? 'text-gray-800' : 'text-red-700'
                }`}>
                {prevPriorPeriod === 0 ? '0' : formatAmount(prevPriorPeriod)}
                </td>
            </tr>
            
            {/* VII. Profit/(Loss) before tax */}
            <tr className="border-b-2 border-gray-500 bg-gray-100">
              <td className="py-3 px-6 font-bold text-gray-900 text-lg">VII. Profit/(Loss) before tax (V + VI)</td>
              <td className="py-3 px-6 text-center"></td>
              <td className={`py-3 px-6 text-right font-bold text-lg ${
                profitBeforeTaxCalc >= 0 ? 'text-gray-900' : 'text-red-700'
              }`}>
                {formatAmount(profitBeforeTaxCalc)}
              </td>
                <td className={`py-3 px-6 text-right font-bold text-lg ${
                  prevProfitBeforeTaxCalc >= 0 ? 'text-gray-900' : 'text-red-700'
                }`}>
                  {formatAmount(prevProfitBeforeTaxCalc)}
                </td>
            </tr>
            
            {/* VIII. Tax Adjustments */}
            <tr>
              <td colSpan={4} className="py-3 px-6 font-bold text-gray-900 text-lg bg-gray-100">VIII. Tax Adjustments</td>
            </tr>
            <tr className="border-b border-gray-300">
              <td className="py-3 px-6 pl-8 text-gray-800">Current Tax</td>
              <td className="py-3 px-6 text-center"></td>
              <td className="py-3 px-6 text-right text-gray-800">{formatAmount(currentTaxAmount)}</td>
              <td className="py-3 px-6 text-right text-gray-800">{formatAmount(prevCurrentTaxAmount)}</td>
            </tr>
            <tr className="border-b border-gray-300">
              <td className="py-3 px-6 pl-8 text-gray-800">Deferred Tax</td>
              <td className="py-3 px-6 text-center"></td>
              <td className="py-3 px-6 text-right text-gray-800">{formatAmount(deferredTaxAmount)}</td>
              <td className="py-3 px-6 text-right text-gray-800">{formatAmount(prevDeferredTaxAmount)}</td>
            </tr>
            <tr className="border-b border-gray-300">
              <td className="py-3 px-6 pl-8 text-gray-800">Total Tax Expenses</td>
              <td className="py-3 px-6 text-center"></td>
              <td className="py-3 px-6 text-right text-gray-800">{formatAmount(totalTaxExpenses)}</td>
              <td className="py-3 px-6 text-right text-gray-800">{formatAmount(prevTotalTaxExpenses)}</td>
            </tr>
            
            {/* IX. Profit/(Loss) for the Year */}
            <tr className="border-b-2 border-gray-500 bg-gray-100">
              <td className="py-3 px-6 font-bold text-gray-900 text-lg">IX. Profit/(Loss) for the Year</td>
              <td className="py-3 px-6 text-center"></td>
              <td className={`py-3 px-6 text-right font-bold text-lg ${
                profitForYearCalc >= 0 ? 'text-gray-900' : 'text-red-700'
              }`}>
                {formatAmount(profitForYearCalc)}
              </td>
                <td className={`py-3 px-6 text-right font-bold text-lg ${
                  prevProfitForYearCalc >= 0 ? 'text-gray-900' : 'text-red-700'
                }`}>
                  {formatAmount(prevProfitForYearCalc)}
                </td>
            </tr>
            
            {/* Earnings per equity share */}
            <tr>
              <td colSpan={4} className="py-3 px-6 font-bold text-gray-900 text-lg bg-gray-100">
                Earnings per equity share [nominal value of share Rs.10]
              </td>
            </tr>
              <tr className="border-b border-gray-300">
              <td className="py-3 px-6 pl-8 text-gray-800">Basic & Diluted (In INR)</td>
              <td className="py-3 px-6 text-center text-gray-800">28</td>
                <td className="py-3 px-6 text-right text-gray-800">{formatAmount(eps)}</td>
                  <td className="py-3 px-6 text-right text-gray-800">{formatAmount(prevEps)}</td>
              </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Balance Sheet Table Component - Matching PDF Format Exactly
 */
export function BalanceSheetTable({ data = {} }) {
  const {
    companyName = 'XYZ', // Hardcoded as XYZ
    period = 'Current Period',
    previousPeriod = null,
    // Equity and Liabilities - use null as default to distinguish missing data
    shareCapital = null,
    reservesAndSurplus = null,
    longTermBorrowings = null,
    deferredTaxLiabilities = null,
    longTermProvisions = null,
    otherNonCurrentLiabilities = null,
    shortTermBorrowings = null,
    tradePayables = null,
    otherCurrentLiabilities = null,
    shortTermProvisions = null,
    // Assets
    propertyPlantEquipment = null,
    capitalWorkInProgress = null,
    nonCurrentInvestments = null,
    deferredTaxAssets = null,
    longTermLoansAndAdvances = null,
    otherNonCurrentAssets = null,
    inventories = null,
    tradeReceivables = null,
    cashAndBankBalances = null,
    shortTermLoansAndAdvances = null,
    otherCurrentAssets = null,
    // Previous year values (for comparative)
    prevShareCapital = null,
    prevReservesAndSurplus = null,
    prevLongTermBorrowings = null,
    prevDeferredTaxLiabilities = null,
    prevLongTermProvisions = null,
    prevOtherNonCurrentLiabilities = null,
    prevShortTermBorrowings = null,
    prevTradePayables = null,
    prevOtherCurrentLiabilities = null,
    prevShortTermProvisions = null,
    prevPropertyPlantEquipment = null,
    prevCapitalWorkInProgress = null,
    prevNonCurrentInvestments = null,
    prevDeferredTaxAssets = null,
    prevLongTermLoansAndAdvances = null,
    prevOtherNonCurrentAssets = null,
    prevInventories = null,
    prevTradeReceivables = null,
    prevCashAndBankBalances = null,
    prevShortTermLoansAndAdvances = null,
    prevOtherCurrentAssets = null
  } = data;

  const formatAmount = (amount) => {
    if (amount === null || amount === undefined) return '0.00';
    const num = typeof amount === 'number' ? amount : parseFloat(amount) || 0;
    return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Format period to match PDF: "as at 31st March 2024"
  const formatPeriod = (periodStr) => {
    if (!periodStr || periodStr === 'Current Period') {
      return 'as at 31st March 2024';
    }
    const dateMatch = periodStr.match(/(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);
    if (dateMatch) {
      const day = parseInt(dateMatch[1]);
      const suffix = day === 1 || day === 21 || day === 31 ? 'st' : day === 2 || day === 22 ? 'nd' : day === 3 || day === 23 ? 'rd' : 'th';
      return `as at ${day}${suffix} ${dateMatch[2]} ${dateMatch[3]}`;
    }
    const isoMatch = periodStr.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                     'July', 'August', 'September', 'October', 'November', 'December'];
      const monthName = months[parseInt(isoMatch[2]) - 1];
      const day = parseInt(isoMatch[3]);
      const suffix = day === 1 || day === 21 || day === 31 ? 'st' : day === 2 || day === 22 ? 'nd' : day === 3 || day === 23 ? 'rd' : 'th';
      return `as at ${day}${suffix} ${monthName} ${isoMatch[1]}`;
    }
    const yearMatch = periodStr.match(/(\d{4})/);
    if (yearMatch) {
      return `as at 31st March ${yearMatch[1]}`;
    }
    return 'as at 31st March 2024';
  };

  // Extract year from period string
  const extractYear = (periodStr) => {
    if (!periodStr) return null;
    const yearMatch = periodStr.match(/(\d{4})/);
    return yearMatch ? parseInt(yearMatch[1]) : null;
  };

  const formattedPeriod = formatPeriod(period);
  
  // Calculate previous year from current period if not provided
  let formattedPrevPeriod;
  if (previousPeriod) {
    formattedPrevPeriod = formatPeriod(previousPeriod);
  } else {
    // Extract year from current period and subtract 1
    const currentYear = extractYear(period || formattedPeriod);
    if (currentYear) {
      const prevYear = currentYear - 1;
      formattedPrevPeriod = `as at 31st March ${prevYear}`;
    } else {
      // Fallback: try to extract from formattedPeriod string
      const formattedYearMatch = formattedPeriod.match(/(\d{4})/);
      if (formattedYearMatch) {
        const prevYear = parseInt(formattedYearMatch[1]) - 1;
        formattedPrevPeriod = `as at 31st March ${prevYear}`;
      } else {
        formattedPrevPeriod = 'as at 31st March 2023';
      }
    }
  }
  
  // Always show comparative (previous year) - if no previous year data, show zeros
  const showComparative = true;

  // Calculate totals
  const totalShareholdersFunds = shareCapital + reservesAndSurplus;
  const prevTotalShareholdersFunds = prevShareCapital + prevReservesAndSurplus;
  
  const totalNonCurrentLiabilities = longTermBorrowings + deferredTaxLiabilities + longTermProvisions + otherNonCurrentLiabilities;
  const prevTotalNonCurrentLiabilities = prevLongTermBorrowings + prevDeferredTaxLiabilities + prevLongTermProvisions + prevOtherNonCurrentLiabilities;
  
  const totalCurrentLiabilities = shortTermBorrowings + tradePayables + otherCurrentLiabilities + shortTermProvisions;
  const prevTotalCurrentLiabilities = prevShortTermBorrowings + prevTradePayables + prevOtherCurrentLiabilities + prevShortTermProvisions;
  
  const totalEquityAndLiabilities = totalShareholdersFunds + totalNonCurrentLiabilities + totalCurrentLiabilities;
  const prevTotalEquityAndLiabilities = prevTotalShareholdersFunds + prevTotalNonCurrentLiabilities + prevTotalCurrentLiabilities;
  
  const totalPropertyPlantEquipment = propertyPlantEquipment + capitalWorkInProgress;
  const prevTotalPropertyPlantEquipment = prevPropertyPlantEquipment + prevCapitalWorkInProgress;
  
  const totalNonCurrentAssets = totalPropertyPlantEquipment + nonCurrentInvestments + deferredTaxAssets + longTermLoansAndAdvances + otherNonCurrentAssets;
  const prevTotalNonCurrentAssets = prevTotalPropertyPlantEquipment + prevNonCurrentInvestments + prevDeferredTaxAssets + prevLongTermLoansAndAdvances + prevOtherNonCurrentAssets;
  
  const totalCurrentAssets = inventories + tradeReceivables + cashAndBankBalances + shortTermLoansAndAdvances + otherCurrentAssets;
  const prevTotalCurrentAssets = prevInventories + prevTradeReceivables + prevCashAndBankBalances + prevShortTermLoansAndAdvances + prevOtherCurrentAssets;
  
  const totalAssets = totalNonCurrentAssets + totalCurrentAssets;
  const prevTotalAssets = prevTotalNonCurrentAssets + prevTotalCurrentAssets;

  return (
    <div className="bg-white p-8 rounded-lg border-2 border-gray-300 shadow-lg">
      {/* Title matching PDF format exactly */}
      <div className="mb-8 text-center border-b-2 border-gray-400 pb-6">
        <h3 className="text-2xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'serif' }}>
          {companyName}
        </h3>
        <h4 className="text-xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'serif' }}>
          Balance Sheet
        </h4>
        <p className="text-base text-gray-700 font-medium" style={{ fontFamily: 'serif' }}>
          {formattedPeriod}
        </p>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-base" style={{ borderCollapse: 'separate', borderSpacing: 0, fontFamily: 'Arial, sans-serif' }}>
          <thead>
            <tr className="border-b-2 border-gray-500">
              <th className="py-3 px-6 text-left font-bold text-gray-900" style={{ width: '40%' }}>Particulars</th>
              <th className="py-3 px-6 text-center font-bold text-gray-900" style={{ width: '10%' }}>Note No.</th>
              <th className="py-3 px-6 text-right font-bold text-gray-900" style={{ width: '25%' }}>
                {formattedPeriod} (Amount in Rs.)
              </th>
                <th className="py-3 px-6 text-right font-bold text-gray-900" style={{ width: '25%' }}>
                {formattedPrevPeriod} (Amount in Rs.)
                </th>
            </tr>
          </thead>
          <tbody>
            {/* I. EQUITY AND LIABILITIES */}
            <tr>
              <td colSpan={4} className="py-4 px-6 font-bold text-gray-900 text-lg bg-gray-100">
                I. EQUITY AND LIABILITIES
              </td>
            </tr>
            
            {/* Shareholders' Funds */}
            <tr>
              <td colSpan={4} className="py-3 px-6 pl-8 font-bold text-gray-900">
                1. Shareholders' Funds
              </td>
            </tr>
            
            <tr className="border-b border-gray-300">
              <td className="py-2 px-6 pl-16 text-gray-800">Share Capital</td>
              <td className="py-2 px-6 text-center text-gray-800">3</td>
              <td className="py-2 px-6 text-right text-gray-800">{formatAmount(shareCapital)}</td>
                <td className="py-2 px-6 text-right text-gray-800">{formatAmount(prevShareCapital)}</td>
            </tr>
            
            <tr className="border-b border-gray-300">
              <td className="py-2 px-6 pl-16 text-gray-800">Reserves and Surplus</td>
              <td className="py-2 px-6 text-center text-gray-800">4</td>
              <td className="py-2 px-6 text-right text-gray-800">{formatAmount(reservesAndSurplus)}</td>
                <td className="py-2 px-6 text-right text-gray-800">{formatAmount(prevReservesAndSurplus)}</td>
            </tr>
            
            <tr className="border-b-2 border-gray-500 bg-gray-50">
              <td className="py-2 px-6 pl-12 font-bold text-gray-900">Total Shareholders' Funds</td>
              <td className="py-2 px-6 text-center"></td>
              <td className="py-2 px-6 text-right font-bold text-gray-900">{formatAmount(totalShareholdersFunds)}</td>
                <td className="py-2 px-6 text-right font-bold text-gray-900">{formatAmount(prevTotalShareholdersFunds)}</td>
            </tr>
            
            {/* Non Current Liabilities */}
            <tr>
              <td colSpan={4} className="py-3 px-6 pl-8 font-bold text-gray-900">
                2. Non Current Liabilities
              </td>
            </tr>
            
            <tr className="border-b border-gray-300">
              <td className="py-2 px-6 pl-16 text-gray-800">Long Term Borrowings</td>
              <td className="py-2 px-6 text-center text-gray-800">5</td>
              <td className="py-2 px-6 text-right text-gray-800">{formatAmount(longTermBorrowings)}</td>
                <td className="py-2 px-6 text-right text-gray-800">{formatAmount(prevLongTermBorrowings)}</td>
            </tr>
            
              <tr className="border-b border-gray-300">
                <td className="py-2 px-6 pl-16 text-gray-800">Deferred tax liabilities (Net)</td>
              <td className="py-2 px-6 text-center text-gray-800">6A</td>
                <td className="py-2 px-6 text-right text-gray-800">{formatAmount(deferredTaxLiabilities)}</td>
                  <td className="py-2 px-6 text-right text-gray-800">{formatAmount(prevDeferredTaxLiabilities)}</td>
              </tr>
            
            <tr className="border-b border-gray-300">
              <td className="py-2 px-6 pl-16 text-gray-800">Long Term Provisions</td>
              <td className="py-2 px-6 text-center text-gray-800">7</td>
              <td className="py-2 px-6 text-right text-gray-800">{formatAmount(longTermProvisions)}</td>
                <td className="py-2 px-6 text-right text-gray-800">{formatAmount(prevLongTermProvisions)}</td>
            </tr>
            
            <tr className="border-b border-gray-300">
              <td className="py-2 px-6 pl-16 text-gray-800">Other Non Current Liabilities</td>
              <td className="py-2 px-6 text-center text-gray-800">8</td>
              <td className="py-2 px-6 text-right text-gray-800">{formatAmount(otherNonCurrentLiabilities)}</td>
                <td className="py-2 px-6 text-right text-gray-800">{formatAmount(prevOtherNonCurrentLiabilities)}</td>
            </tr>
            
            {/* Current Liabilities */}
            <tr>
              <td colSpan={4} className="py-3 px-6 pl-8 font-bold text-gray-900">
                3. Current Liabilities
              </td>
            </tr>
            
            <tr className="border-b border-gray-300">
              <td className="py-2 px-6 pl-16 text-gray-800">Short Term Borrowings</td>
              <td className="py-2 px-6 text-center text-gray-800">9</td>
              <td className="py-2 px-6 text-right text-gray-800">{formatAmount(shortTermBorrowings)}</td>
                <td className="py-2 px-6 text-right text-gray-800">{formatAmount(prevShortTermBorrowings)}</td>
            </tr>
            
            <tr className="border-b border-gray-300">
              <td className="py-2 px-6 pl-16 text-gray-800">Trade Payables</td>
              <td className="py-2 px-6 text-center text-gray-800">10</td>
              <td className="py-2 px-6 text-right text-gray-800">{formatAmount(tradePayables)}</td>
                <td className="py-2 px-6 text-right text-gray-800">{formatAmount(prevTradePayables)}</td>
            </tr>
            
            <tr className="border-b border-gray-300">
              <td className="py-2 px-6 pl-16 text-gray-800">Other Current Liabilities</td>
              <td className="py-2 px-6 text-center text-gray-800">11</td>
              <td className="py-2 px-6 text-right text-gray-800">{formatAmount(otherCurrentLiabilities)}</td>
                <td className="py-2 px-6 text-right text-gray-800">{formatAmount(prevOtherCurrentLiabilities)}</td>
            </tr>
            
            <tr className="border-b border-gray-300">
              <td className="py-2 px-6 pl-16 text-gray-800">Short Term Provision</td>
              <td className="py-2 px-6 text-center text-gray-800">12</td>
              <td className="py-2 px-6 text-right text-gray-800">{formatAmount(shortTermProvisions)}</td>
                <td className="py-2 px-6 text-right text-gray-800">{formatAmount(prevShortTermProvisions)}</td>
            </tr>
            
            {/* Total Equity and Liabilities */}
            <tr className="border-b-2 border-gray-500 bg-gray-100">
              <td className="py-3 px-6 font-bold text-gray-900 text-lg">Total Equity and Liabilities</td>
              <td className="py-3 px-6 text-center"></td>
              <td className="py-3 px-6 text-right font-bold text-gray-900 text-lg">{formatAmount(totalEquityAndLiabilities)}</td>
                <td className="py-3 px-6 text-right font-bold text-gray-900 text-lg">{formatAmount(prevTotalEquityAndLiabilities)}</td>
            </tr>
            
            {/* II. ASSETS */}
            <tr>
              <td colSpan={showComparative ? 3 : 2} className="py-4 px-6 font-bold text-gray-900 text-lg bg-gray-100">
                II. ASSETS
              </td>
            </tr>
            
            {/* Non Current Assets */}
            <tr>
              <td colSpan={showComparative ? 3 : 2} className="py-3 px-6 pl-8 font-bold text-gray-900">
                1. Non Current Assets
              </td>
            </tr>
            
            <tr>
              <td colSpan={4} className="py-2 px-6 pl-12 font-semibold text-gray-800">
                Property, Plant & Equipment and Intangible Assets
              </td>
            </tr>
            
            <tr className="border-b border-gray-300">
              <td className="py-2 px-6 pl-20 text-gray-800">Property, Plant and Equipment</td>
              <td className="py-2 px-6 text-center text-gray-800">13</td>
              <td className="py-2 px-6 text-right text-gray-800">{formatAmount(propertyPlantEquipment)}</td>
                <td className="py-2 px-6 text-right text-gray-800">{formatAmount(prevPropertyPlantEquipment)}</td>
            </tr>
            
              <tr className="border-b border-gray-300">
                <td className="py-2 px-6 pl-20 text-gray-800">Capital Work in Progress</td>
              <td className="py-2 px-6 text-center text-gray-800">14</td>
                <td className="py-2 px-6 text-right text-gray-800">{formatAmount(capitalWorkInProgress)}</td>
                  <td className="py-2 px-6 text-right text-gray-800">{formatAmount(prevCapitalWorkInProgress)}</td>
              </tr>
            
            <tr className="border-b border-gray-300">
              <td className="py-2 px-6 pl-16 text-gray-800">Non Current Investments</td>
              <td className="py-2 px-6 text-center text-gray-800">15</td>
              <td className="py-2 px-6 text-right text-gray-800">{formatAmount(nonCurrentInvestments)}</td>
                <td className="py-2 px-6 text-right text-gray-800">{formatAmount(prevNonCurrentInvestments)}</td>
            </tr>
            
              <tr className="border-b border-gray-300">
                <td className="py-2 px-6 pl-16 text-gray-800">Deferred Tax Asset(net)</td>
              <td className="py-2 px-6 text-center text-gray-800">6B</td>
                <td className="py-2 px-6 text-right text-gray-800">{formatAmount(deferredTaxAssets)}</td>
                  <td className="py-2 px-6 text-right text-gray-800">{formatAmount(prevDeferredTaxAssets)}</td>
              </tr>
            
              <tr className="border-b border-gray-300">
                <td className="py-2 px-6 pl-16 text-gray-800">Long Term Loans and Advances</td>
              <td className="py-2 px-6 text-center text-gray-800">16</td>
                <td className="py-2 px-6 text-right text-gray-800">{formatAmount(longTermLoansAndAdvances)}</td>
                  <td className="py-2 px-6 text-right text-gray-800">{formatAmount(prevLongTermLoansAndAdvances)}</td>
              </tr>
            
            <tr className="border-b border-gray-300">
              <td className="py-2 px-6 pl-16 text-gray-800">Other Non Current Assets</td>
              <td className="py-2 px-6 text-center text-gray-800">17</td>
              <td className="py-2 px-6 text-right text-gray-800">{formatAmount(otherNonCurrentAssets)}</td>
                <td className="py-2 px-6 text-right text-gray-800">{formatAmount(prevOtherNonCurrentAssets)}</td>
            </tr>
            
            <tr className="border-b-2 border-gray-500 bg-gray-50">
              <td className="py-2 px-6 pl-12 font-bold text-gray-900">Total Non Current Assets</td>
              <td className="py-2 px-6 text-center"></td>
              <td className="py-2 px-6 text-right font-bold text-gray-900">{formatAmount(totalNonCurrentAssets)}</td>
                <td className="py-2 px-6 text-right font-bold text-gray-900">{formatAmount(prevTotalNonCurrentAssets)}</td>
            </tr>
            
            {/* Current Assets */}
            <tr>
              <td colSpan={4} className="py-3 px-6 pl-8 font-bold text-gray-900">
                2. Current Assets
              </td>
            </tr>
            
            <tr className="border-b border-gray-300">
              <td className="py-2 px-6 pl-16 text-gray-800">Inventories</td>
              <td className="py-2 px-6 text-center text-gray-800">18</td>
              <td className="py-2 px-6 text-right text-gray-800">{formatAmount(inventories)}</td>
                <td className="py-2 px-6 text-right text-gray-800">{formatAmount(prevInventories)}</td>
            </tr>
            
            <tr className="border-b border-gray-300">
              <td className="py-2 px-6 pl-16 text-gray-800">Trade Receivables</td>
              <td className="py-2 px-6 text-center text-gray-800">19</td>
              <td className="py-2 px-6 text-right text-gray-800">{formatAmount(tradeReceivables)}</td>
                <td className="py-2 px-6 text-right text-gray-800">{formatAmount(prevTradeReceivables)}</td>
            </tr>
            
            <tr className="border-b border-gray-300">
              <td className="py-2 px-6 pl-16 text-gray-800">Cash and Bank Balances</td>
              <td className="py-2 px-6 text-center text-gray-800">20</td>
              <td className="py-2 px-6 text-right text-gray-800">{formatAmount(cashAndBankBalances)}</td>
                <td className="py-2 px-6 text-right text-gray-800">{formatAmount(prevCashAndBankBalances)}</td>
            </tr>
            
            <tr className="border-b border-gray-300">
              <td className="py-2 px-6 pl-16 text-gray-800">Short Term Loans and Advances</td>
              <td className="py-2 px-6 text-center text-gray-800">21 A</td>
              <td className="py-2 px-6 text-right text-gray-800">{formatAmount(shortTermLoansAndAdvances)}</td>
                <td className="py-2 px-6 text-right text-gray-800">{formatAmount(prevShortTermLoansAndAdvances)}</td>
            </tr>
            
              <tr className="border-b border-gray-300">
                <td className="py-2 px-6 pl-16 text-gray-800">Other Current Assets</td>
              <td className="py-2 px-6 text-center text-gray-800">21 B</td>
                <td className="py-2 px-6 text-right text-gray-800">{formatAmount(otherCurrentAssets)}</td>
                  <td className="py-2 px-6 text-right text-gray-800">{formatAmount(prevOtherCurrentAssets)}</td>
              </tr>
            
            {/* Total Assets */}
            <tr className="border-b-2 border-gray-500 bg-gray-100">
              <td className="py-3 px-6 font-bold text-gray-900 text-lg">Total Assets</td>
              <td className="py-3 px-6 text-center"></td>
              <td className="py-3 px-6 text-right font-bold text-gray-900 text-lg">{formatAmount(totalAssets)}</td>
                <td className="py-3 px-6 text-right font-bold text-gray-900 text-lg">{formatAmount(prevTotalAssets)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Cash Flow Statement Table Component - Matching PDF Format Exactly
 */
export function CashFlowStatementTable({ data = {} }) {
  const {
    companyName: _companyName, // Ignore passed value
    period = 'Current Period',
    previousPeriod = null,
    cin = '',
    // Operating Activities - use null as default to distinguish missing data
    netProfitBeforeTax = null,
    depreciation = null,
    interestOnFDR = null,
    otherInterestIncome = null,
    interestExpense = null,
    operatingProfitBeforeWC = null,
    // Working Capital Changes
    increaseDecreaseInventories = null,
    increaseDecreaseTradeReceivables = null,
    increaseDecreaseShortTermLoansAdvances = null,
    increaseDecreaseLongTermLoansAdvances = null,
    increaseDecreaseOtherCurrentNonCurrentAssets = null,
    increaseDecreaseTradePayables = null,
    increaseDecreaseOtherCurrentLiabilities = null,
    increaseDecreaseShortTermProvisions = null,
    increaseDecreaseLongTermProvisions = null,
    cashGeneratedUsedOperating = null,
    cashGeneratedUsedExtraordinary = null,
    incomeTaxPaid = null,
    // Investing Activities
    proceedsFromFDMaturity = null,
    purchaseOfFixedAssets = null,
    proceedsFromSaleFixedAssets = null,
    // Financing Activities
    increaseDecreaseLongTermBorrowings = null,
    increaseDecreaseShortTermBorrowings = null,
    interestSubsidyReceivable = null,
    netCashGeneratedUsedFinancing = null,
    // Summary
    netIncreaseDecreaseCash = null,
    cashAtBeginning = null,
    cashAtEnd = null,
    // Previous year values
    prevNetProfitBeforeTax = null,
    prevDepreciation = null,
    prevInterestOnFDR = null,
    prevOtherInterestIncome = null,
    prevInterestExpense = null,
    prevOperatingProfitBeforeWC = null,
    prevIncreaseDecreaseInventories = null,
    prevIncreaseDecreaseTradeReceivables = null,
    prevIncreaseDecreaseShortTermLoansAdvances = null,
    prevIncreaseDecreaseLongTermLoansAdvances = null,
    prevIncreaseDecreaseOtherCurrentNonCurrentAssets = null,
    prevIncreaseDecreaseTradePayables = null,
    prevIncreaseDecreaseOtherCurrentLiabilities = null,
    prevIncreaseDecreaseShortTermProvisions = null,
    prevIncreaseDecreaseLongTermProvisions = null,
    prevCashGeneratedUsedOperating = null,
    prevCashGeneratedUsedExtraordinary = null,
    prevIncomeTaxPaid = null,
    prevProceedsFromFDMaturity = null,
    prevPurchaseOfFixedAssets = null,
    prevProceedsFromSaleFixedAssets = null,
    prevIncreaseDecreaseLongTermBorrowings = null,
    prevIncreaseDecreaseShortTermBorrowings = null,
    prevInterestSubsidyReceivable = null,
    prevNetCashGeneratedUsedFinancing = null,
    prevNetIncreaseDecreaseCash = null,
    prevCashAtBeginning = null,
    prevCashAtEnd = null
  } = data;

  const formatAmount = (amount) => {
    // If null/undefined/empty, show 0.00 for previous year column
    if (amount === null || amount === undefined || amount === '') return '0.00';
    const num = typeof amount === 'number' ? amount : parseFloat(amount);
    // If parseFloat fails (NaN), return 0.00
    if (isNaN(num)) return '0.00';
    // Format number with 2 decimal places
    return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Format period to match PDF: "for the year ended 31st March 2024"
  const formatPeriod = (periodStr) => {
    if (!periodStr || periodStr === 'Current Period') {
      return 'for the year ended 31st March 2024';
    }
    const dateMatch = periodStr.match(/(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);
    if (dateMatch) {
      const day = parseInt(dateMatch[1]);
      const suffix = day === 1 || day === 21 || day === 31 ? 'st' : day === 2 || day === 22 ? 'nd' : day === 3 || day === 23 ? 'rd' : 'th';
      return `for the year ended ${day}${suffix} ${dateMatch[2]} ${dateMatch[3]}`;
    }
    const isoMatch = periodStr.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                     'July', 'August', 'September', 'October', 'November', 'December'];
      const monthName = months[parseInt(isoMatch[2]) - 1];
      const day = parseInt(isoMatch[3]);
      const suffix = day === 1 || day === 21 || day === 31 ? 'st' : day === 2 || day === 22 ? 'nd' : day === 3 || day === 23 ? 'rd' : 'th';
      return `for the year ended ${day}${suffix} ${monthName} ${isoMatch[1]}`;
    }
    const yearMatch = periodStr.match(/(\d{4})/);
    if (yearMatch) {
      return `for the year ended 31st March ${yearMatch[1]}`;
    }
    return 'for the year ended 31st March 2024';
  };

  // Extract year from period string
  const extractYear = (periodStr) => {
    if (!periodStr) return null;
    const yearMatch = periodStr.match(/(\d{4})/);
    return yearMatch ? parseInt(yearMatch[1]) : null;
  };

  const formattedPeriod = formatPeriod(period);
  
  // Calculate previous year from current period if not provided
  let formattedPrevPeriod;
  if (previousPeriod) {
    formattedPrevPeriod = formatPeriod(previousPeriod);
  } else {
    // Extract year from current period and subtract 1
    const currentYear = extractYear(period || formattedPeriod);
    if (currentYear) {
      const prevYear = currentYear - 1;
      formattedPrevPeriod = `for the year ended 31st March ${prevYear}`;
    } else {
      // Fallback: try to extract from formattedPeriod string
      const formattedYearMatch = formattedPeriod.match(/(\d{4})/);
      if (formattedYearMatch) {
        const prevYear = parseInt(formattedYearMatch[1]) - 1;
        formattedPrevPeriod = `for the year ended 31st March ${prevYear}`;
      } else {
        formattedPrevPeriod = 'for the year ended 31st March 2023';
      }
    }
  }
  
  // Always show comparative (previous year) - if no previous year data, show zeros
  const showComparative = true;

  // Hardcode company name to XYZ
  const companyName = 'XYZ';

  // Calculate totals for investing activities - match reference layout
  const totalInvestingActivities = (interestOnFDR || 0) + (proceedsFromFDMaturity || 0) + 
                                   (purchaseOfFixedAssets ? -purchaseOfFixedAssets : 0) + 
                                   (proceedsFromSaleFixedAssets ? -proceedsFromSaleFixedAssets : 0);
  const prevTotalInvestingActivities = (prevInterestOnFDR || 0) + (prevProceedsFromFDMaturity || 0) + 
                                       (prevPurchaseOfFixedAssets ? -prevPurchaseOfFixedAssets : 0) + 
                                       (prevProceedsFromSaleFixedAssets ? -prevProceedsFromSaleFixedAssets : 0);

  return (
    <div className="bg-white p-8 rounded-lg border-2 border-gray-300 shadow-lg">
      {/* Title matching PDF format exactly */}
      <div className="mb-8 text-center border-b-2 border-gray-400 pb-6">
        <h3 className="text-2xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'serif' }}>
          {companyName}
        </h3>
        <h4 className="text-xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'serif' }}>
          Statement of Cash Flow
        </h4>
        <p className="text-base text-gray-700 font-medium mb-1" style={{ fontFamily: 'serif' }}>
          {formattedPeriod}
        </p>
        {cin && (
          <p className="text-sm text-gray-600" style={{ fontFamily: 'serif' }}>
            CIN: {cin}
          </p>
        )}
        <p className="text-sm text-gray-600 mt-2" style={{ fontFamily: 'serif' }}>
          (In '000)
        </p>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-base" style={{ borderCollapse: 'separate', borderSpacing: 0, fontFamily: 'Arial, sans-serif' }}>
          <thead>
            <tr className="border-b-2 border-gray-500">
              <th className="py-3 px-6 text-left font-bold text-gray-900" style={{ width: '50%' }}>Particulars</th>
              <th className="py-3 px-6 text-right font-bold text-gray-900" style={{ width: '25%' }}>
                {formattedPeriod}
              </th>
                <th className="py-3 px-6 text-right font-bold text-gray-900" style={{ width: '25%' }}>
                  {formattedPrevPeriod}
                </th>
            </tr>
          </thead>
          <tbody>
            {/* A. CASH FLOW FROM OPERATING ACTIVITIES */}
            <tr>
              <td colSpan={3} className="py-4 px-6 font-bold text-gray-900 text-lg bg-gray-100">
                A. CASH FLOW FROM OPERATING ACTIVITIES
              </td>
            </tr>
            
            <tr className="border-b border-gray-300">
              <td className="py-2 px-6 text-gray-800">Net Profit/(Loss) before taxation and extraordinary items</td>
              <td className="py-2 px-6 text-right text-gray-800">{formatAmount(netProfitBeforeTax)}</td>
                <td className="py-2 px-6 text-right text-gray-800">{formatAmount(prevNetProfitBeforeTax)}</td>
            </tr>
            
            <tr>
              <td colSpan={3} className="py-2 px-6 pl-8 text-gray-800 font-semibold">Adjustments for:</td>
            </tr>
            
            <tr className="border-b border-gray-300">
              <td className="py-2 px-6 pl-16 text-gray-800">Depreciation</td>
              <td className="py-2 px-6 text-right text-gray-800">{formatAmount(depreciation)}</td>
                <td className="py-2 px-6 text-right text-gray-800">{formatAmount(prevDepreciation)}</td>
            </tr>
            
              <tr className="border-b border-gray-300">
              <td className="py-2 px-6 pl-16 text-gray-800">Interest on FOR</td>
              <td className="py-2 px-6 text-right text-gray-800">{formatAmount(interestOnFDR ? -interestOnFDR : 0)}</td>
              <td className="py-2 px-6 text-right text-gray-800">{formatAmount(prevInterestOnFDR ? -prevInterestOnFDR : 0)}</td>
              </tr>
            
              <tr className="border-b border-gray-300">
                <td className="py-2 px-6 pl-16 text-gray-800">Other Interest Income</td>
              <td className="py-2 px-6 text-right text-gray-800">{formatAmount(otherInterestIncome ? -otherInterestIncome : 0)}</td>
              <td className="py-2 px-6 text-right text-gray-800">{formatAmount(prevOtherInterestIncome ? -prevOtherInterestIncome : 0)}</td>
              </tr>
            
            <tr className="border-b border-gray-300">
              <td className="py-2 px-6 pl-16 text-gray-800">Interest Expenses</td>
              <td className="py-2 px-6 text-right text-gray-800">{formatAmount(interestExpense)}</td>
                <td className="py-2 px-6 text-right text-gray-800">{formatAmount(prevInterestExpense)}</td>
            </tr>
            
            <tr className="border-b-2 border-gray-500 bg-gray-50">
              <td className="py-2 px-6 pl-12 font-bold text-gray-900">Operating Profit before Working Capital changes</td>
              <td className="py-2 px-6 text-right font-bold text-gray-900">{formatAmount(operatingProfitBeforeWC)}</td>
                <td className="py-2 px-6 text-right font-bold text-gray-900">{formatAmount(prevOperatingProfitBeforeWC)}</td>
            </tr>
            
            <tr>
              <td colSpan={3} className="py-2 px-6 pl-8 text-gray-800 font-semibold">Changes in Working Capital</td>
            </tr>
            
            <tr className="border-b border-gray-300">
              <td className="py-2 px-6 pl-16 text-gray-800">Increase/(Decrease) in Trade Receivables</td>
              <td className="py-2 px-6 text-right text-gray-800">{formatAmount(increaseDecreaseTradeReceivables ? -increaseDecreaseTradeReceivables : 0)}</td>
              <td className="py-2 px-6 text-right text-gray-800">{formatAmount(prevIncreaseDecreaseTradeReceivables ? -prevIncreaseDecreaseTradeReceivables : 0)}</td>
            </tr>
            
            <tr className="border-b border-gray-300">
              <td className="py-2 px-6 pl-16 text-gray-800">Increase/(Decrease) in Short Term Loans & Advances</td>
              <td className="py-2 px-6 text-right text-gray-800">{formatAmount(increaseDecreaseShortTermLoansAdvances ? -increaseDecreaseShortTermLoansAdvances : 0)}</td>
              <td className="py-2 px-6 text-right text-gray-800">{formatAmount(prevIncreaseDecreaseShortTermLoansAdvances ? -prevIncreaseDecreaseShortTermLoansAdvances : 0)}</td>
            </tr>
            
            <tr className="border-b border-gray-300">
              <td className="py-2 px-6 pl-16 text-gray-800">Increase/(Decrease) in Long Term Loans & Advances</td>
              <td className="py-2 px-6 text-right text-gray-800">{formatAmount(increaseDecreaseLongTermLoansAdvances ? -increaseDecreaseLongTermLoansAdvances : 0)}</td>
              <td className="py-2 px-6 text-right text-gray-800">{formatAmount(prevIncreaseDecreaseLongTermLoansAdvances ? -prevIncreaseDecreaseLongTermLoansAdvances : 0)}</td>
            </tr>
            
              <tr className="border-b border-gray-300">
              <td className="py-2 px-6 pl-16 text-gray-800">Increase/(Decrease) in Other Current & Non Current Assets</td>
              <td className="py-2 px-6 text-right text-gray-800">{formatAmount(increaseDecreaseOtherCurrentNonCurrentAssets ? -increaseDecreaseOtherCurrentNonCurrentAssets : 0)}</td>
              <td className="py-2 px-6 text-right text-gray-800">{formatAmount(prevIncreaseDecreaseOtherCurrentNonCurrentAssets ? -prevIncreaseDecreaseOtherCurrentNonCurrentAssets : 0)}</td>
              </tr>
            
            <tr className="border-b border-gray-300">
              <td className="py-2 px-6 pl-16 text-gray-800">Increase/(Decrease) in Trade Payables</td>
              <td className="py-2 px-6 text-right text-gray-800">{formatAmount(increaseDecreaseTradePayables)}</td>
                <td className="py-2 px-6 text-right text-gray-800">{formatAmount(prevIncreaseDecreaseTradePayables)}</td>
            </tr>
            
            <tr className="border-b border-gray-300">
              <td className="py-2 px-6 pl-16 text-gray-800">Increase/(Decrease) in Other Current Liabilities</td>
              <td className="py-2 px-6 text-right text-gray-800">{formatAmount(increaseDecreaseOtherCurrentLiabilities ? -increaseDecreaseOtherCurrentLiabilities : 0)}</td>
              <td className="py-2 px-6 text-right text-gray-800">{formatAmount(prevIncreaseDecreaseOtherCurrentLiabilities ? -prevIncreaseDecreaseOtherCurrentLiabilities : 0)}</td>
            </tr>
            
            <tr className="border-b border-gray-300">
              <td className="py-2 px-6 pl-16 text-gray-800">Increase/(Decrease) in Short Term Provisions</td>
              <td className="py-2 px-6 text-right text-gray-800">{formatAmount(increaseDecreaseShortTermProvisions ? -increaseDecreaseShortTermProvisions : 0)}</td>
              <td className="py-2 px-6 text-right text-gray-800">{formatAmount(prevIncreaseDecreaseShortTermProvisions ? -prevIncreaseDecreaseShortTermProvisions : 0)}</td>
            </tr>
            
            <tr className="border-b border-gray-300">
              <td className="py-2 px-6 pl-16 text-gray-800">Increase/(Decrease) in Long Term Provisions</td>
              <td className="py-2 px-6 text-right text-gray-800">{formatAmount(increaseDecreaseLongTermProvisions)}</td>
                <td className="py-2 px-6 text-right text-gray-800">{formatAmount(prevIncreaseDecreaseLongTermProvisions)}</td>
            </tr>
            
            <tr className="border-b-2 border-gray-500 bg-gray-50">
              <td className="py-2 px-6 pl-12 font-bold text-gray-900">Cash generated/(used) in Operating Activities</td>
              <td className="py-2 px-6 text-right font-bold text-gray-900">{formatAmount(cashGeneratedUsedOperating)}</td>
                <td className="py-2 px-6 text-right font-bold text-gray-900">{formatAmount(prevCashGeneratedUsedOperating)}</td>
            </tr>
            
              <tr className="border-b border-gray-300">
              <td className="py-2 px-6 text-gray-800">Cash generated/(used) in Extraordinary Items</td>
                <td className="py-2 px-6 text-right text-gray-800">{formatAmount(cashGeneratedUsedExtraordinary)}</td>
                  <td className="py-2 px-6 text-right text-gray-800">{formatAmount(prevCashGeneratedUsedExtraordinary)}</td>
              </tr>
            
            <tr className="border-b-2 border-gray-500">
              <td className="py-2 px-6 text-gray-800">Income Tax Paid</td>
              <td className="py-2 px-6 text-right text-gray-800">{formatAmount(incomeTaxPaid ? -incomeTaxPaid : 0)}</td>
              <td className="py-2 px-6 text-right text-gray-800">{formatAmount(prevIncomeTaxPaid ? -prevIncomeTaxPaid : 0)}</td>
            </tr>
            
            {/* B. CASH FLOW FROM INVESTING ACTIVITIES */}
            <tr>
              <td colSpan={3} className="py-4 px-6 font-bold text-gray-900 text-lg bg-gray-100">
                B. CASH FLOW FROM INVESTING ACTIVITIES
              </td>
            </tr>
            
              <tr className="border-b border-gray-300">
              <td className="py-2 px-6 text-gray-800">Interest on FOR</td>
                <td className="py-2 px-6 text-right text-gray-800">{formatAmount(interestOnFDR)}</td>
                  <td className="py-2 px-6 text-right text-gray-800">{formatAmount(prevInterestOnFDR)}</td>
              </tr>
            
              <tr className="border-b border-gray-300">
              <td className="py-2 px-6 text-gray-800">Proceeds from Maturity</td>
                <td className="py-2 px-6 text-right text-gray-800">{formatAmount(proceedsFromFDMaturity)}</td>
                  <td className="py-2 px-6 text-right text-gray-800">{formatAmount(prevProceedsFromFDMaturity)}</td>
              </tr>
            
            <tr className="border-b border-gray-300">
              <td className="py-2 px-6 text-gray-800">Purchase of Fixed Assets</td>
              <td className="py-2 px-6 text-right text-gray-800">{formatAmount(purchaseOfFixedAssets ? -purchaseOfFixedAssets : 0)}</td>
              <td className="py-2 px-6 text-right text-gray-800">{formatAmount(prevPurchaseOfFixedAssets ? -prevPurchaseOfFixedAssets : 0)}</td>
            </tr>
            
              <tr className="border-b border-gray-300">
              <td className="py-2 px-6 text-gray-800">Proceeds from Sale of Fixed Assets</td>
              <td className="py-2 px-6 text-right text-gray-800">{formatAmount(proceedsFromSaleFixedAssets ? -proceedsFromSaleFixedAssets : 0)}</td>
              <td className="py-2 px-6 text-right text-gray-800">{formatAmount(prevProceedsFromSaleFixedAssets ? -prevProceedsFromSaleFixedAssets : 0)}</td>
            </tr>
            
            {/* C. CASH FLOW FROM FINANCING ACTIVITIES */}
            <tr>
              <td colSpan={3} className="py-4 px-6 font-bold text-gray-900 text-lg bg-gray-100">
                C. CASH FLOW FROM FINANCING ACTIVITIES
              </td>
            </tr>
            
            <tr className="border-b border-gray-300">
              <td className="py-2 px-6 text-gray-800">Increase/(Decrease) in Long Term Borrowings</td>
              <td className="py-2 px-6 text-right text-gray-800">{formatAmount(increaseDecreaseLongTermBorrowings)}</td>
                <td className="py-2 px-6 text-right text-gray-800">{formatAmount(prevIncreaseDecreaseLongTermBorrowings)}</td>
            </tr>
            
            <tr className="border-b border-gray-300">
              <td className="py-2 px-6 text-gray-800">Increase/(Decrease) in Short Term Borrowings</td>
              <td className="py-2 px-6 text-right text-gray-800">{formatAmount(increaseDecreaseShortTermBorrowings)}</td>
                <td className="py-2 px-6 text-right text-gray-800">{formatAmount(prevIncreaseDecreaseShortTermBorrowings)}</td>
            </tr>
            
            <tr className="border-b border-gray-300">
              <td className="py-2 px-6 text-gray-800">Interest Expenses</td>
              <td className="py-2 px-6 text-right text-gray-800">{formatAmount(interestExpense ? -interestExpense : 0)}</td>
              <td className="py-2 px-6 text-right text-gray-800">{formatAmount(prevInterestExpense ? -prevInterestExpense : 0)}</td>
            </tr>
            
              <tr className="border-b border-gray-300">
                <td className="py-2 px-6 text-gray-800">Interest Subsidy Receivable from State Govt</td>
                <td className="py-2 px-6 text-right text-gray-800">{formatAmount(interestSubsidyReceivable)}</td>
                  <td className="py-2 px-6 text-right text-gray-800">{formatAmount(prevInterestSubsidyReceivable)}</td>
              </tr>
            
            <tr className="border-b-2 border-gray-500 bg-gray-50">
              <td className="py-2 px-6 font-bold text-gray-900">Net Cash generated/(used) from Financing Activities</td>
              <td className="py-2 px-6 text-right font-bold text-gray-900">{formatAmount(netCashGeneratedUsedFinancing)}</td>
                <td className="py-2 px-6 text-right font-bold text-gray-900">{formatAmount(prevNetCashGeneratedUsedFinancing)}</td>
            </tr>
            
            {/* Summary */}
            <tr className="border-b-2 border-gray-500 bg-gray-100">
              <td className="py-3 px-6 font-bold text-gray-900 text-lg">NET INCREASE/(DECREASE) IN CASH AND CASH EQUIVALENTS (A+B+C)</td>
              <td className="py-3 px-6 text-right font-bold text-gray-900 text-lg">{formatAmount(netIncreaseDecreaseCash)}</td>
                <td className="py-3 px-6 text-right font-bold text-gray-900 text-lg">{formatAmount(prevNetIncreaseDecreaseCash)}</td>
            </tr>
            
            <tr className="border-b border-gray-300">
              <td className="py-2 px-6 text-gray-800">Cash and cash equivalents at the beginning of the year (Refer Note 20)</td>
              <td className="py-2 px-6 text-right text-gray-800">{formatAmount(cashAtBeginning)}</td>
                <td className="py-2 px-6 text-right text-gray-800">{formatAmount(prevCashAtBeginning)}</td>
            </tr>
            
            <tr className="border-b-2 border-gray-500 bg-gray-50">
              <td className="py-2 px-6 font-bold text-gray-900">Cash and cash equivalents at the end of the year (Refer Note 20)</td>
              <td className="py-2 px-6 text-right font-bold text-gray-900">{formatAmount(cashAtEnd)}</td>
                <td className="py-2 px-6 text-right font-bold text-gray-900">{formatAmount(prevCashAtEnd)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      
      <div className="mt-6 text-sm text-gray-600 italic text-center" style={{ fontFamily: 'serif' }}>
        The above Cash Flow Statement has been prepared under the "Indirect method" as set out in the Accounting Standard - 3 (Revised) on Cash Flow Statements.
      </div>
    </div>
  );
}

/**
 * Accounting Ratios Table Component - Matching PDF Format Exactly
 */
export function AccountingRatiosTable({ data = {} }) {
  const {
    companyName = 'XYZ',
    period = 'Current Period',
    previousPeriod = null,
    // Ratios data
    ratios = {},
    previousRatios = {}
  } = data;

  // Hardcode company name to XYZ
  const displayCompanyName = 'XYZ';

  const formatAmount = (amount) => {
    if (amount === null || amount === undefined || amount === '' || amount === 'N/A' || amount === 'NA') return 'NA';
    const num = typeof amount === 'number' ? amount : parseFloat(amount) || 0;
    return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatPercentage = (value) => {
    if (value === null || value === undefined || value === '' || value === 'N/A' || value === 'NA') return 'NA';
    const num = typeof value === 'number' ? value : parseFloat(value) || 0;
    return `${num.toFixed(2)}%`;
  };

  const formatTimes = (value) => {
    if (value === null || value === undefined || value === '' || value === 'N/A' || value === 'NA') return 'NA';
    const num = typeof value === 'number' ? value : parseFloat(value) || 0;
    return num.toFixed(2);
  };

  const formatTimesForPrevious = (value) => {
    if (value === null || value === undefined || value === '' || value === 'N/A' || value === 'NA') return '0.00';
    const num = typeof value === 'number' ? value : parseFloat(value) || 0;
    return num.toFixed(2);
  };

  const formatPercentageForDisplay = (value) => {
    if (value === null || value === undefined || value === '' || value === 'N/A' || value === 'NA') return '0.00%';
    const num = typeof value === 'number' ? value : parseFloat(value) || 0;
    return `${num.toFixed(2)}%`;
  };

  const calculateVariance = (current, previous) => {
    // If either is null/undefined/NA, return NA
    if (current === null || current === undefined || current === 'N/A' || current === 'NA' || 
        previous === null || previous === undefined || previous === 'N/A' || previous === 'NA') {
      return 'NA';
    }
    const curr = typeof current === 'number' ? current : parseFloat(current);
    const prev = typeof previous === 'number' ? previous : parseFloat(previous);
    // If either is NaN, return NA
    if (isNaN(curr) || isNaN(prev)) {
      return 'NA';
    }
    // If previous is 0, cannot calculate variance (division by zero)
    if (prev === 0) {
      return 'NA';
    }
    // Calculate variance: ((current - previous) / previous) * 100
    const variance = ((curr - prev) / prev) * 100;
    return `${variance.toFixed(2)}%`;
  };

  // Format period to match PDF: "for the period ended 31st March 2024"
  const formatPeriod = (periodStr) => {
    if (!periodStr || periodStr === 'Current Period') {
      return 'for the period ended 31st March 2024';
    }
    const dateMatch = periodStr.match(/(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);
    if (dateMatch) {
      const day = parseInt(dateMatch[1]);
      const suffix = day === 1 || day === 21 || day === 31 ? 'st' : day === 2 || day === 22 ? 'nd' : day === 3 || day === 23 ? 'rd' : 'th';
      return `for the period ended ${day}${suffix} ${dateMatch[2]} ${dateMatch[3]}`;
    }
    const isoMatch = periodStr.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                     'July', 'August', 'September', 'October', 'November', 'December'];
      const monthName = months[parseInt(isoMatch[2]) - 1];
      const day = parseInt(isoMatch[3]);
      const suffix = day === 1 || day === 21 || day === 31 ? 'st' : day === 2 || day === 22 ? 'nd' : day === 3 || day === 23 ? 'rd' : 'th';
      return `for the period ended ${day}${suffix} ${monthName} ${isoMatch[1]}`;
    }
    const yearMatch = periodStr.match(/(\d{4})/);
    if (yearMatch) {
      return `for the period ended 31st March ${yearMatch[1]}`;
    }
    return 'for the period ended 31st March 2024';
  };

  const formattedPeriod = formatPeriod(period);
  // Always show previous year column (will be 0.00 if data not available)
  const showComparative = true;

  // Extract ratio values
  const getRatio = (key, prev = false) => {
    const source = prev ? previousRatios : ratios;
    if (!source) return null;
    
    // Helper functions for case conversion
    const camelCase = (str) => str.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
    const snakeCase = (str) => str.replace(/([A-Z])/g, '_$1').toLowerCase();
    
    // Helper to safely get nested value
    const getNestedValue = (obj, path) => {
      if (!obj || typeof obj !== 'object') return null;
      
      // Handle dot notation (e.g., "liquidity.currentRatio" or "liquidity.current_ratio")
      if (path.includes('.')) {
        const parts = path.split('.');
        let value = obj;
        for (const part of parts) {
          if (value && typeof value === 'object') {
            // Try exact match, then camelCase, then snake_case, then variants
            const partSnake = snakeCase(part);
            const partCamel = camelCase(part);
            value = value[part] || value[partSnake] || value[partCamel] || 
                   value[part.toLowerCase()] || value[part.toUpperCase()] ||
                   value[part.replace(/_/g, '')];
          } else {
            return null;
          }
        }
        return value;
      }
      
      // Handle flat keys - try various formats
      const pathSnake = snakeCase(path);
      const pathCamel = camelCase(path);
      return obj[path] || obj[pathSnake] || obj[pathCamel] || 
             obj[path.toLowerCase()] || obj[path.toUpperCase()] ||
             obj[path.replace(/_/g, '')];
    };
    
    // Try various key formats
    const keysToTry = [
      key,
      key.toLowerCase().replace(/\s+/g, '_'),
      key.toLowerCase().replace(/\s+/g, ''),
      key.replace(/\s+/g, '_').toLowerCase(),
      camelCase(key),
      snakeCase(key)
    ];
    
    // First try flat keys
    for (const k of keysToTry) {
      const value = source[k];
      if (value !== undefined && value !== null && value !== '') {
        return value;
      }
    }
    
    // Try nested access with dot notation
    for (const k of keysToTry) {
      const value = getNestedValue(source, k);
      if (value !== undefined && value !== null && value !== '') {
        return value;
      }
    }
    
    // Try accessing by splitting words (for keys like "current ratio")
    const words = key.toLowerCase().split(/\s+/);
    let value = source;
    for (const word of words) {
      if (value && typeof value === 'object') {
        // Try snake_case, camelCase, and exact match
        value = value[word] || value[word.replace(/_/g, '')] || 
               value[snakeCase(word)] || value[camelCase(word)];
      } else {
        return null;
      }
    }
    return value;
  };

  // Letter labels for ratios (a., b., c., etc.)
  const ratioLetters = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'];

  // Define ratios with their details - matching reference PDF exactly
  const ratioDefinitions = [
    {
      name: 'Current Ratio',
      unit: 'in times',
      numerator: 'Total Current Assets',
      denominator: 'Total Current Liabilities',
      current: getRatio('current_ratio') || getRatio('currentRatio') || getRatio('liquidity.current_ratio') || getRatio('liquidity.currentRatio'),
      previous: getRatio('current_ratio', true) || getRatio('currentRatio', true) || getRatio('liquidity.current_ratio', true) || getRatio('liquidity.currentRatio', true),
      reason: ratios.current_ratio_reason || ratios.reason_for_variance?.current_ratio || 'Normal Business Change'
    },
    {
      name: 'Debt-Equity Ratio',
      unit: 'in times',
      numerator: 'Total Debt (Borrowings and Lease Liabilities)',
      denominator: 'Total Equity (i.e. Shareholders Fund)',
      current: getRatio('debt_equity_ratio') || getRatio('debtEquityRatio') || getRatio('solvency.debt_to_equity') || getRatio('solvency.debtToEquity') || getRatio('leverage.debtToEquity') || getRatio('leverage.debt_to_equity'),
      previous: getRatio('debt_equity_ratio', true) || getRatio('debtEquityRatio', true) || getRatio('solvency.debt_to_equity', true) || getRatio('solvency.debtToEquity', true) || getRatio('leverage.debtToEquity', true) || getRatio('leverage.debt_to_equity', true),
      reason: ratios.debt_equity_reason || ratios.reason_for_variance?.debt_equity || 'Normal Business Change'
    },
    {
      name: 'Debt Service Coverage Ratio',
      unit: 'in times',
      numerator: 'Earning for Debt Service = Net Profit before taxes + Non-cash operating expenses + Interest + Other non-cash adjustments',
      denominator: 'Debt service = Interest and lease payments + Principal repayments',
      current: getRatio('debt_service_coverage') || getRatio('debtServiceCoverage') || getRatio('solvency.interest_coverage') || getRatio('solvency.interestCoverage') || getRatio('leverage.debtServiceCoverage') || getRatio('leverage.debt_service_coverage'),
      previous: getRatio('debt_service_coverage', true) || getRatio('debtServiceCoverage', true) || getRatio('solvency.interest_coverage', true) || getRatio('solvency.interestCoverage', true) || getRatio('leverage.debtServiceCoverage', true) || getRatio('leverage.debt_service_coverage', true),
      reason: ratios.debt_service_reason || ratios.reason_for_variance?.debt_service || 'Normal Business Change'
    },
    {
      name: 'Return On Equity Ratio',
      unit: 'in %',
      numerator: 'Profit for the Year (after Tax) - Pref. Dividend',
      denominator: 'Average Shareholders Equity',
      current: getRatio('return_on_equity') || getRatio('returnOnEquity') || getRatio('profitability.roe') || getRatio('profitability.returnOnEquity'),
      previous: getRatio('return_on_equity', true) || getRatio('returnOnEquity', true) || getRatio('profitability.roe', true) || getRatio('profitability.returnOnEquity', true),
      reason: ratios.roe_reason || ratios.reason_for_variance?.roe || 'Normal Business Change'
    },
    {
      name: 'Inventory Turnover Ratio',
      unit: 'in times',
      numerator: 'Revenue from operations',
      denominator: 'Average Inventory',
      current: getRatio('inventory_turnover') || getRatio('inventoryTurnover') || getRatio('efficiency.inventory_turnover') || getRatio('efficiency.inventoryTurnover'),
      previous: getRatio('inventory_turnover', true) || getRatio('inventoryTurnover', true) || getRatio('efficiency.inventory_turnover', true) || getRatio('efficiency.inventoryTurnover', true),
      reason: ratios.inventory_turnover_reason || ratios.reason_for_variance?.inventory_turnover || 'Normal Business Change'
    },
    {
      name: 'Trade Receivables Turnover Ratio',
      unit: 'in times',
      numerator: 'Revenue from operations',
      denominator: 'Average trade receivables',
      current: getRatio('trade_receivables_turnover') || getRatio('tradeReceivablesTurnover'),
      previous: getRatio('trade_receivables_turnover', true) || getRatio('tradeReceivablesTurnover', true),
      reason: ratios.trade_receivables_reason || ratios.reason_for_variance?.trade_receivables || 'Normal Business Change'
    },
    {
      name: 'Trade payables turnover ratio',
      unit: 'in times',
      numerator: 'Total Purchase',
      denominator: 'Average trade Payables',
      current: getRatio('trade_payables_turnover') || getRatio('tradePayablesTurnover'),
      previous: getRatio('trade_payables_turnover', true) || getRatio('tradePayablesTurnover', true),
      reason: ratios.trade_payables_reason || ratios.reason_for_variance?.trade_payables || 'Normal Business Change'
    },
    {
      name: 'Net capital turnover ratio',
      unit: 'in times',
      numerator: 'Revenue from operations',
      denominator: 'Average working capital (i.e. Total current assets less Total current liabilities)',
      current: getRatio('net_capital_turnover') || getRatio('netCapitalTurnover'),
      previous: getRatio('net_capital_turnover', true) || getRatio('netCapitalTurnover', true),
      reason: ratios.net_capital_reason || ratios.reason_for_variance?.net_capital || 'Normal Business Change'
    },
    {
      name: 'Net profit ratio',
      unit: 'in %',
      numerator: 'Profit for the Year (after Tax)',
      denominator: 'Revenue from operations (Net Sales)',
      current: getRatio('net_profit_ratio') || getRatio('netProfitRatio') || getRatio('profitability.net_profit_margin') || getRatio('profitability.netProfitMargin'),
      previous: getRatio('net_profit_ratio', true) || getRatio('netProfitRatio', true) || getRatio('profitability.net_profit_margin', true) || getRatio('profitability.netProfitMargin', true),
      reason: ratios.net_profit_reason || ratios.reason_for_variance?.net_profit || 'Normal Business Change'
    },
    {
      name: 'Return on Capital employed',
      unit: 'in %',
      numerator: 'Profit before tax and finance costs (EBIT)',
      denominator: 'Capital Employed (Tangible Net Worth + Total Debt + DTL)',
      current: getRatio('return_on_capital_employed') || getRatio('returnOnCapitalEmployed') || getRatio('profitability.roce') || getRatio('profitability.returnOnCapitalEmployed'),
      previous: getRatio('return_on_capital_employed', true) || getRatio('returnOnCapitalEmployed', true) || getRatio('profitability.roce', true) || getRatio('profitability.returnOnCapitalEmployed', true),
      reason: ratios.roce_reason || ratios.reason_for_variance?.roce || 'Normal Business Change'
    },
    {
      name: 'Return on investment',
      unit: 'in %',
      numerator: 'Income generated from invested funds',
      denominator: 'Average invested funds',
      current: getRatio('return_on_investment') || getRatio('returnOnInvestment') || getRatio('profitability.roi'),
      previous: getRatio('return_on_investment', true) || getRatio('returnOnInvestment', true) || getRatio('profitability.roi', true),
      reason: ratios.roi_reason || ratios.reason_for_variance?.roi || 'Investment in equity shares of unlisted private company, ratio calculable only at time of sale'
    }
  ];

  return (
    <div className="bg-white p-8 rounded-lg border-2 border-gray-300 shadow-lg">
      {/* Title matching PDF format exactly */}
      <div className="mb-8 text-center border-b-2 border-gray-400 pb-6">
        <h3 className="text-2xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'serif' }}>
          {displayCompanyName}
        </h3>
        <h4 className="text-xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'serif' }}>
          Notes to Financial Statements
        </h4>
        <p className="text-base text-gray-700 font-medium mb-1" style={{ fontFamily: 'serif' }}>
          {formattedPeriod}
        </p>
      </div>
      
      {/* Section Header */}
      <div className="mb-6">
        <h5 className="text-lg font-bold text-gray-900" style={{ fontFamily: 'serif' }}>
          Analytical Ratios
        </h5>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ borderCollapse: 'separate', borderSpacing: 0, fontFamily: 'Arial, sans-serif' }}>
          <thead>
            <tr className="border-b-2 border-gray-500 bg-gray-100">
              <th className="py-3 px-4 text-left font-bold text-gray-900" style={{ width: '20%' }}>Ratio</th>
              <th className="py-3 px-4 text-left font-bold text-gray-900" style={{ width: '15%' }}>Numerator</th>
              <th className="py-3 px-4 text-left font-bold text-gray-900" style={{ width: '15%' }}>Denominator</th>
              <th className="py-3 px-4 text-right font-bold text-gray-900" style={{ width: '10%' }}>Current Year</th>
              <th className="py-3 px-4 text-right font-bold text-gray-900" style={{ width: '10%' }}>Previous Year</th>
              <th className="py-3 px-4 text-right font-bold text-gray-900" style={{ width: '10%' }}>% of Variance</th>
              <th className="py-3 px-4 text-left font-bold text-gray-900" style={{ width: '20%' }}>Reason for Variance</th>
            </tr>
          </thead>
          <tbody>
            {ratioDefinitions.map((ratio, index) => {
              // Get previous year value (numeric), default to null if not available
              let prevValue = ratio.previous;
              if (prevValue === null || prevValue === undefined || prevValue === '' || prevValue === 'N/A' || prevValue === 'NA') {
                prevValue = null;
              } else if (typeof prevValue === 'string') {
                // Try to parse string to number
                const parsed = parseFloat(prevValue.replace(/%/g, '').trim());
                prevValue = isNaN(parsed) ? null : parsed;
              }
              
              // Get current year value (numeric)
              let currValue = ratio.current;
              if (currValue === null || currValue === undefined || currValue === '' || currValue === 'N/A' || currValue === 'NA') {
                currValue = null;
              } else if (typeof currValue === 'string') {
                // Try to parse string to number
                const parsed = parseFloat(currValue.replace(/%/g, '').trim());
                currValue = isNaN(parsed) ? null : parsed;
              }
              
              // If either value is NA/null, both should show NA (per user requirement)
              const isCurrentNA = currValue === null || currValue === undefined;
              const isPreviousNA = prevValue === null || prevValue === undefined;
              const bothAreNA = isCurrentNA || isPreviousNA;
              
              // If one is NA, set both to null for display purposes
              const displayCurrent = bothAreNA ? null : currValue;
              const displayPrevious = bothAreNA ? null : prevValue;
              
              // Calculate variance - only if both values are present and previous is not 0
              let variance = 'NA';
              if (!bothAreNA && prevValue !== 0) {
                const varianceValue = ((currValue - prevValue) / prevValue) * 100;
                variance = `${varianceValue.toFixed(2)}%`;
              }
              
              // Format values based on unit type for display
              const formatCurrentValue = ratio.unit === 'in %' ? formatPercentage : formatTimes;
              const formatPreviousValue = ratio.unit === 'in %' ? formatPercentage : formatTimes;
              
              // Format for display (both will show NA if either is NA)
              const formattedCurrent = formatCurrentValue(displayCurrent);
              const formattedPrevious = formatPreviousValue(displayPrevious);
              
              return (
                <tr key={index} className="border-b border-gray-300">
                  <td className="py-3 px-4 text-gray-800 font-medium">
                    {ratioLetters[index]}. {ratio.name} {ratio.unit && `(${ratio.unit})`}
                  </td>
                  <td className="py-3 px-4 text-gray-700">{ratio.numerator}</td>
                  <td className="py-3 px-4 text-gray-700">{ratio.denominator}</td>
                  <td className="py-3 px-4 text-right text-gray-800 font-medium">
                    {formattedCurrent}
                  </td>
                    <td className="py-3 px-4 text-right text-gray-800 font-medium">
                    {formattedPrevious}
                    </td>
                    <td className="py-3 px-4 text-right text-gray-800 font-medium">
                      {variance}
                    </td>
                  <td className="py-3 px-4 text-gray-700 text-sm">{ratio.reason}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      
      <div className="mt-6 text-sm text-gray-600 italic" style={{ fontFamily: 'serif' }}>
        {ratioDefinitions.find(r => r.name === 'Return on Investment')?.current === null || 
         ratioDefinitions.find(r => r.name === 'Return on Investment')?.current === 'NA' ? (
          <p className="mb-2">
            The company has investment in equity shares of unlisted private company and therefore this ratio can only be calculated at the time of sale of such investment.
          </p>
        ) : null}
        <p className="mt-4">
          The accompanying notes are an integral part of the financial statements As per our report of even date
        </p>
      </div>
    </div>
  );
}

/**
 * Main Trial Balance Dashboard Component
 */
export function TrialBalanceDashboard({ financialData = {} }) {
  const {
    plStatement = {},
    balanceSheet = {},
    period = 'Current Period'
  } = financialData;

  // Extract P&L data
  const revenue = plStatement.revenue || 0;
  const cogs = plStatement.cogs || 0;
  const grossProfit = plStatement.gross_profit || 0;
  const expenses = plStatement.expenses || 0;
  const netProfit = plStatement.net_profit || 0;
  const operatingProfit = grossProfit - expenses;

  // Calculate KPIs
  const grossProfitMargin = revenue > 0 ? ((grossProfit / revenue) * 100).toFixed(0) : 0;
  const opexRatio = revenue > 0 ? ((expenses / revenue) * 100).toFixed(0) : 0;
  const operatingProfitMargin = revenue > 0 ? ((operatingProfit / revenue) * 100).toFixed(0) : 0;
  const netProfitMargin = revenue > 0 ? ((netProfit / revenue) * 100).toFixed(0) : 0;

  // Extract OPEX breakdown (if available)
  const opexBreakdown = plStatement.opex_breakdown || {
    sales: expenses * 0.5, // Default 50% if not available
    marketing: expenses * 0.22, // Default 22%
    generalAdmin: expenses * 0.28 // Default 28%
  };

  // Generate monthly data (if not provided, create sample structure)
  const monthlyData = plStatement.monthly_data || [];
  
  // Generate EBIT data
  const ebitData = monthlyData.length > 0 
    ? monthlyData.map(item => ({
        month: item.month || item.period || 'N/A',
        ebitActual: item.ebit || item.operating_profit || 0,
        ebitTarget: item.ebit_target || (item.ebit || item.operating_profit || 0) * 1.2 // 20% above actual as target
      }))
    : [];

  // Generate Revenue & COGS monthly data
  const revenueCOGSData = monthlyData.length > 0
    ? monthlyData.map(item => ({
        month: item.month || item.period || 'N/A',
        revenue: item.revenue || 0,
        cogs: item.cogs || 0
      }))
    : [];

  // Generate OPEX monthly data
  const opexMonthlyData = monthlyData.length > 0
    ? monthlyData.map(item => ({
        month: item.month || item.period || 'N/A',
        sales: item.sales || item.opex_sales || 0,
        marketing: item.marketing || item.opex_marketing || 0,
        generalAdmin: item.general_admin || item.opex_admin || 0,
        opexRatio: item.opex_ratio || 0
      }))
    : [];

  // Income Statement data - matching PDF format
  const incomeStatementData = {
    revenue,
    cogs,
    grossProfit,
    opex: expenses,
    sales: opexBreakdown.sales || 0,
    marketing: opexBreakdown.marketing || 0,
    generalAdmin: opexBreakdown.generalAdmin || opexBreakdown.general_admin || 0,
    otherIncome: plStatement.other_income || 0,
    otherExpenses: plStatement.other_expenses || 0,
    operating: operatingProfit,
    period,
    companyName: plStatement.company_name || plStatement.companyName || 'XYZ',
    // PDF format fields
    costOfMaterialConsumed: plStatement.cost_of_material_consumed || plStatement.costOfMaterialConsumed || cogs || 0,
    employeeBenefitsExpense: plStatement.employee_benefits_expense || plStatement.employeeBenefitsExpense || 0,
    financeCosts: plStatement.finance_costs || plStatement.financeCosts || 0,
    depreciationAmortisation: plStatement.depreciation_amortisation || plStatement.depreciationAmortisation || 0,
    priorPeriodIncomeExpense: plStatement.prior_period_income_expense || plStatement.priorPeriodIncomeExpense || 0,
    profitBeforeTax: plStatement.profit_before_tax || plStatement.profitBeforeTax || operatingProfit,
    taxAdjustments: plStatement.tax_adjustments || plStatement.taxAdjustments || 0,
    profitForYear: plStatement.profit_for_year || plStatement.profitForYear || netProfit,
    earningsPerShare: plStatement.earnings_per_share || plStatement.earningsPerShare || 0
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white p-6 rounded-lg shadow-lg">
        <h2 className="text-2xl font-bold mb-2">Monthly financial dashboard with income statement</h2>
        <p className="text-blue-100 text-sm">
          This following slide displays KPIs to communicate key financial information to both internal and external stakeholders. 
          It further includes details such as OPEX ratio, revenue and COGS, income, expenses, etc.
        </p>
      </div>

      {/* KPI Gauges */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <GaugeChart 
          value={parseInt(grossProfitMargin)} 
          label="Gross Profit Margin" 
          maxValue={100}
          color="#4fb3ac"
        />
        <GaugeChart 
          value={parseInt(opexRatio)} 
          label="OPEX Ratio" 
          maxValue={100}
          color="#b26f0b"
        />
        <GaugeChart 
          value={parseInt(operatingProfitMargin)} 
          label="Operating Profit Margin" 
          maxValue={100}
          color="#4fb3ac"
        />
        <GaugeChart 
          value={parseInt(netProfitMargin)} 
          label="Net Profit Margin" 
          maxValue={100}
          color="#b5d661"
        />
      </div>

      {/* Main Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Charts */}
        <div className="lg:col-span-2 space-y-6">
          {/* Revenue & COGS Chart */}
          <RevenueCOGSChart data={revenueCOGSData} />
          
          {/* OPEX Breakdown - Now Vertical */}
          <OPEXBreakdownChart data={opexBreakdown} />
          
          {/* OPEX Month to Month */}
          <OPEXMonthToMonthChart data={opexMonthlyData} />
        </div>

        {/* Right Column - EBIT Chart */}
        <div className="lg:col-span-1 space-y-6 flex flex-col">
          {/* EBIT Chart */}
          <EBITChart data={ebitData} />
        </div>
      </div>
    </div>
  );
}




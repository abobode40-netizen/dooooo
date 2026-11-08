import React, { useState, useMemo } from 'react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend 
} from 'recharts';
import { 
  TrendingUp, 
  Calendar, 
  CreditCard, 
  Coins, 
  FileText, 
  Layers, 
  BarChart3, 
  LineChart, 
  CheckCircle2,
  DollarSign
} from 'lucide-react';
import { Sale } from '../types';

interface SalesMovementChartProps {
  sales: Sale[];
  className?: string;
}

type ChartType = 'area' | 'bar' | 'breakdown';

export const SalesMovementChart: React.FC<SalesMovementChartProps> = ({ sales, className = '' }) => {
  const [chartType, setChartType] = useState<ChartType>('area');

  // Generate the last 7 days data structure (from 6 days ago up to today)
  const last7DaysData = useMemo(() => {
    const result = [];
    const arabicDays = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

    const today = new Date();
    // Normalize to local date string YYYY-MM-DD
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateKey = `${year}-${month}-${day}`;

      const dayName = arabicDays[d.getDay()];
      const isToday = i === 0;
      const isYesterday = i === 1;
      const displayLabel = isToday ? 'اليوم' : isYesterday ? 'أمس' : dayName;
      const shortDate = `${day}/${month}`;

      result.push({
        dateKey,
        dayName,
        shortDate,
        label: `${displayLabel} (${shortDate})`,
        displayLabel,
        totalSales: 0,
        cashSales: 0,
        debtSales: 0,
        visaSales: 0,
        invoicesCount: 0,
        totalItemsCount: 0,
      });
    }

    // Populate data from sales
    const dateMap = new Map(result.map((item, index) => [item.dateKey, index]));

    (sales || []).forEach(sale => {
      if (!sale || !sale.created_at) return;
      // Get YYYY-MM-DD from created_at
      const saleDateStr = typeof sale.created_at === 'string' 
        ? sale.created_at.split('T')[0] 
        : new Date(sale.created_at).toISOString().split('T')[0];

      if (dateMap.has(saleDateStr)) {
        const index = dateMap.get(saleDateStr)!;
        const entry = result[index];
        const amount = Number(sale.final_amount) || 0;
        
        entry.totalSales += amount;
        entry.invoicesCount += 1;

        if (sale.payment_type === 'cash') {
          entry.cashSales += amount;
        } else if (sale.payment_type === 'debt') {
          entry.debtSales += amount;
        } else if (sale.payment_type === 'visa') {
          entry.visaSales += amount;
        }

        if (Array.isArray(sale.items)) {
          entry.totalItemsCount += sale.items.reduce((sum, item) => sum + (Number(item?.quantity) || 1), 0);
        }
      }
    });

    return result;
  }, [sales]);

  // Summary statistics for the 7 days
  const stats = useMemo(() => {
    let totalSales = 0;
    let totalInvoices = 0;
    let totalCash = 0;
    let totalDebt = 0;
    let maxDay = { label: 'لا يوجد', amount: 0 };

    last7DaysData.forEach(d => {
      totalSales += d.totalSales;
      totalInvoices += d.invoicesCount;
      totalCash += d.cashSales;
      totalDebt += d.debtSales;

      if (d.totalSales > maxDay.amount) {
        maxDay = { label: d.label, amount: d.totalSales };
      }
    });

    const averageDaily = Math.round(totalSales / 7);

    return {
      totalSales,
      totalInvoices,
      totalCash,
      totalDebt,
      averageDaily,
      maxDay
    };
  }, [last7DaysData]);

  // Custom Tooltip component in Arabic
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-900/95 backdrop-blur-md text-white p-3 rounded-xl shadow-xl border border-slate-700 text-xs min-w-[210px] space-y-1.5 font-sans" dir="rtl">
          <div className="flex items-center justify-between border-b border-slate-700 pb-1.5 font-bold">
            <span className="text-blue-300 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {data.label}
            </span>
            <span className="text-[11px] text-slate-300 font-mono">
              {data.invoicesCount} فاتورة
            </span>
          </div>

          <div className="space-y-1 pt-0.5">
            <div className="flex justify-between items-center text-emerald-400 font-black text-sm">
              <span>إجمالي المبيعات:</span>
              <span className="font-mono">{(data.totalSales || 0).toLocaleString()} ج.م</span>
            </div>

            <div className="flex justify-between items-center text-slate-300 text-[11px]">
              <span className="flex items-center gap-1">
                <Coins className="w-3 h-3 text-emerald-400" />
                مبيعات كاش (نقدي):
              </span>
              <span className="font-mono font-bold text-white">{(data.cashSales || 0).toLocaleString()} ج.م</span>
            </div>

            <div className="flex justify-between items-center text-slate-300 text-[11px]">
              <span className="flex items-center gap-1">
                <CreditCard className="w-3 h-3 text-amber-400" />
                مبيعات آجل (شكك):
              </span>
              <span className="font-mono font-bold text-white">{(data.debtSales || 0).toLocaleString()} ج.م</span>
            </div>

            {data.totalItemsCount > 0 && (
              <div className="flex justify-between items-center text-slate-400 text-[10px] pt-1 border-t border-slate-800">
                <span>إجمالي قطع الأصناف المباعة:</span>
                <span className="font-mono font-bold text-slate-200">{data.totalItemsCount} قطعة</span>
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-4 ${className}`} dir="rtl">
      {/* Chart Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-sm shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-black text-slate-900 flex items-center gap-2">
              <span>حركة المبيعات خلال الـ 7 أيام الأخيرة</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold border border-blue-200">
                مباشر تفاعلي
              </span>
            </h3>
            <p className="text-xs text-slate-500">
              رسم بياني تفاعلي يوضح تطور حجم المبيعات ونسبة الكاش والآجل يومياً
            </p>
          </div>
        </div>

        {/* Chart View Switcher */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setChartType('area')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
              chartType === 'area'
                ? 'bg-white text-blue-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="رسم بياني مساحي انسيابي"
          >
            <LineChart className="w-3.5 h-3.5" />
            <span>مساحي</span>
          </button>

          <button
            type="button"
            onClick={() => setChartType('bar')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
              chartType === 'bar'
                ? 'bg-white text-blue-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="رسم بياني بالأعمدة"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>أعمدة</span>
          </button>

          <button
            type="button"
            onClick={() => setChartType('breakdown')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
              chartType === 'breakdown'
                ? 'bg-white text-blue-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="مقارنة مبيعات الكاش والآجل"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>كاش مقابل آجل</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 text-xs">
        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
          <div className="text-[11px] text-slate-500 font-bold flex items-center gap-1 mb-1">
            <Coins className="w-3.5 h-3.5 text-blue-600" />
            <span>إجمالي مبيعات 7 أيام</span>
          </div>
          <div className="text-sm sm:text-base font-black text-slate-900 font-mono">
            {stats.totalSales.toLocaleString()} <span className="text-[10px] text-slate-500">ج.م</span>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
          <div className="text-[11px] text-slate-500 font-bold flex items-center gap-1 mb-1">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
            <span>متوسط المبيعات اليومية</span>
          </div>
          <div className="text-sm sm:text-base font-black text-emerald-700 font-mono">
            {stats.averageDaily.toLocaleString()} <span className="text-[10px] text-slate-500">ج.م/يوم</span>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
          <div className="text-[11px] text-slate-500 font-bold flex items-center gap-1 mb-1">
            <FileText className="w-3.5 h-3.5 text-indigo-600" />
            <span>عدد الفواتير الصادرة</span>
          </div>
          <div className="text-sm sm:text-base font-black text-indigo-900 font-mono">
            {stats.totalInvoices} <span className="text-[10px] text-slate-500">فاتورة</span>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
          <div className="text-[11px] text-slate-500 font-bold flex items-center gap-1 mb-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />
            <span>أعلى يوم مبيعات</span>
          </div>
          <div className="text-sm sm:text-base font-black text-amber-900 truncate" title={`${stats.maxDay.label}: ${stats.maxDay.amount.toLocaleString()} ج.م`}>
            {stats.maxDay.amount > 0 ? (
              <>
                <span className="font-mono">{stats.maxDay.amount.toLocaleString()}</span> <span className="text-[10px] text-slate-500">ج.م ({stats.maxDay.label.split(' ')[0]})</span>
              </>
            ) : (
              <span className="text-xs text-slate-400 font-normal">لا توجد حركة</span>
            )}
          </div>
        </div>
      </div>

      {/* Interactive Recharts Container */}
      <div className="h-64 sm:h-72 w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'area' ? (
            <AreaChart data={last7DaysData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563eb" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis 
                dataKey="displayLabel" 
                tick={{ fontSize: 11, fill: '#64748b' }} 
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
              />
              <YAxis 
                tick={{ fontSize: 10, fill: '#64748b' }} 
                axisLine={false}
                tickLine={false}
                tickFormatter={(val) => val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area 
                type="monotone" 
                dataKey="totalSales" 
                name="إجمالي المبيعات"
                stroke="#2563eb" 
                strokeWidth={3}
                fillOpacity={1} 
                fill="url(#salesGradient)" 
                activeDot={{ r: 6, stroke: '#2563eb', strokeWidth: 2, fill: '#ffffff' }}
              />
            </AreaChart>
          ) : chartType === 'bar' ? (
            <BarChart data={last7DaysData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis 
                dataKey="displayLabel" 
                tick={{ fontSize: 11, fill: '#64748b' }} 
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
              />
              <YAxis 
                tick={{ fontSize: 10, fill: '#64748b' }} 
                axisLine={false}
                tickLine={false}
                tickFormatter={(val) => val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar 
                dataKey="totalSales" 
                name="إجمالي المبيعات" 
                fill="#3b82f6" 
                radius={[6, 6, 0, 0]} 
                maxBarSize={45}
              />
            </BarChart>
          ) : (
            <BarChart data={last7DaysData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis 
                dataKey="displayLabel" 
                tick={{ fontSize: 11, fill: '#64748b' }} 
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
              />
              <YAxis 
                tick={{ fontSize: 10, fill: '#64748b' }} 
                axisLine={false}
                tickLine={false}
                tickFormatter={(val) => val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                verticalAlign="top" 
                height={36} 
                formatter={(val) => <span className="text-xs font-bold text-slate-700">{val}</span>} 
              />
              <Bar 
                dataKey="cashSales" 
                name="مبيعات كاش (نقدي)" 
                fill="#10b981" 
                stackId="a"
                radius={[0, 0, 0, 0]} 
                maxBarSize={40}
              />
              <Bar 
                dataKey="debtSales" 
                name="مبيعات آجل (شكك)" 
                fill="#f59e0b" 
                stackId="a"
                radius={[6, 6, 0, 0]} 
                maxBarSize={40}
              />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Mini day pills quick-look summary */}
      <div className="grid grid-cols-7 gap-1 pt-2 border-t border-slate-100 text-center">
        {last7DaysData.map((d) => (
          <div key={d.dateKey} className="bg-slate-50/80 hover:bg-blue-50/60 p-1.5 rounded-lg border border-slate-200/60 transition-colors">
            <span className="block text-[10px] text-slate-500 font-bold truncate">{d.displayLabel}</span>
            <span className="block text-[11px] font-black text-slate-800 font-mono truncate">
              {d.totalSales > 0 ? `${(d.totalSales).toLocaleString()}` : '0'}
            </span>
            <span className="block text-[9px] text-slate-400">
              {d.invoicesCount} ف
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

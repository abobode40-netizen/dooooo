import React, { useState, useMemo } from 'react';
import { 
  Coins, 
  Save, 
  RotateCcw, 
  DollarSign, 
  Calendar, 
  CheckCircle2, 
  AlertCircle, 
  Layers, 
  History,
  TrendingUp
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { CashCounterSession } from '../types';

const DENOMINATIONS = [200, 100, 50, 20, 10, 5, 1, 0.5];

export const CashDrawerView: React.FC = () => {
  const { sales, cashSessions, saveCashSession, showToast } = useApp();

  const todayStr = new Date().toISOString().split('T')[0];
  const [counts, setCounts] = useState<Record<number, number>>({
    200: 0,
    100: 0,
    50: 0,
    20: 0,
    10: 0,
    5: 0,
    1: 0,
    0.5: 0
  });

  const [openingBalance, setOpeningBalance] = useState<number>(1000);
  const [cashierName, setCashierName] = useState('كاشير 1');
  const [sessionNotes, setSessionNotes] = useState('');

  // Calculate today's cash sales
  const todayCashSales = useMemo(() => {
    if (!sales || !Array.isArray(sales)) return 0;
    return sales
      .filter(s => s && s.payment_type === 'cash' && typeof s.created_at === 'string' && s.created_at.startsWith(todayStr))
      .reduce((sum, s) => sum + (Number(s?.final_amount) || 0), 0);
  }, [sales, todayStr]);

  // Counted Cash Breakdown
  const countedBreakdown = useMemo(() => {
    let total = 0;
    const details = DENOMINATIONS.map(denom => {
      const count = counts[denom] || 0;
      const subtotal = count * denom;
      total += subtotal;
      return { denom, count, subtotal };
    });
    return { total, details };
  }, [counts]);

  const expectedTotal = openingBalance + todayCashSales;
  const difference = countedBreakdown.total - expectedTotal;

  const handleCountChange = (denom: number, val: string) => {
    const parsed = parseInt(val) || 0;
    setCounts(prev => ({ ...prev, [denom]: Math.max(0, parsed) }));
  };

  const handleSaveSession = (e: React.FormEvent) => {
    e.preventDefault();
    const newSession: CashCounterSession = {
      id: 'sess-' + Date.now(),
      session_date: todayStr,
      opened_at: new Date().toISOString(),
      closed_at: new Date().toISOString(),
      opening_balance: openingBalance,
      cash_sales: todayCashSales,
      total_cash_counted: countedBreakdown.total,
      difference: difference,
      notes: sessionNotes.trim() || 'إغلاق ومطابقة الخزينة اليومية',
      cashier_name: cashierName.trim() || 'كاشير رئيسي',
      denominations: counts,
      status: 'closed'
    };

    saveCashSession(newSession);
    showToast('تم حفظ جلسة الإغلاق ومطابقة الخزينة بنجاح', 'success');
  };

  const handleReset = () => {
    setCounts({
      200: 0,
      100: 0,
      50: 0,
      20: 0,
      10: 0,
      5: 0,
      1: 0,
      0.5: 0
    });
    showToast('تم تصفير عداد الفئات', 'info');
  };

  return (
    <div className="space-y-4 font-sans text-slate-800 animate-in fade-in duration-150">
      {/* Header */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm">
            <Coins className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              درج النقدية وحساب الفئات (التفقيط اليومي)
            </h2>
            <p className="text-xs text-slate-500">حصر وتفقيط فئات الجنيه المصري ومطابقة المبيعات النقدية مع رصيد الخزينة</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg border border-slate-300 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4 text-blue-600" />
            تصفير العداد
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Denominations Counter (Left Side) */}
        <div className="lg:col-span-7 bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2 pb-2 border-b border-slate-100">
            <Layers className="w-4 h-4 text-blue-600" />
            تفقيط وعد فئات النقدية (الجنيه المصري)
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {DENOMINATIONS.map(denom => {
              const count = counts[denom] || 0;
              const subtotal = count * denom;

              return (
                <div
                  key={denom}
                  className="bg-slate-50 rounded-xl p-3 border border-slate-200 flex items-center justify-between gap-3 hover:border-slate-300 transition-all"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center font-black text-xs text-blue-700 font-mono">
                      {denom}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900">فئة {denom} ج.م</div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {count} ورقة = {subtotal.toLocaleString()} ج.م
                      </div>
                    </div>
                  </div>

                  <div className="w-24">
                    <input
                      type="number"
                      min="0"
                      value={count || ''}
                      onChange={e => handleCountChange(denom, e.target.value)}
                      placeholder="0"
                      className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-center text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-600"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-3.5 bg-blue-50/70 rounded-xl border border-blue-200 flex items-center justify-between">
            <span className="text-xs text-blue-900 font-bold">إجمالي النقدية المحصورة بالدرج:</span>
            <span className="text-base font-black text-blue-900 font-mono">
              {countedBreakdown.total.toLocaleString()} ج.م
            </span>
          </div>
        </div>

        {/* Reconciliation and Closing Report (Right Side) */}
        <div className="lg:col-span-5 bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2 pb-2 border-b border-slate-100">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            مطابقة الخزينة وتقرير الإغلاق
          </h3>

          <form onSubmit={handleSaveSession} className="space-y-3.5">
            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">اسم الكاشير / المسؤول</label>
              <input
                type="text"
                value={cashierName}
                onChange={e => setCashierName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 font-bold focus:bg-white focus:outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">الرصيد الافتتاحي للدرج (الفكة الصباحية)</label>
              <input
                type="number"
                value={openingBalance}
                onChange={e => setOpeningBalance(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 font-mono font-bold focus:bg-white focus:outline-none focus:border-blue-600"
              />
            </div>

            {/* Reconciliation Box */}
            <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>الرصيد الافتتاحي:</span>
                <span className="font-bold font-mono text-slate-900">{openingBalance.toLocaleString()} ج.م</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>مبيعات الكاش المسجلة اليوم:</span>
                <span className="font-bold text-emerald-700 font-mono">+{todayCashSales.toLocaleString()} ج.م</span>
              </div>
              <div className="flex justify-between text-slate-700 border-t border-slate-200 pt-1.5 font-bold">
                <span>الرصيد المفترض توفره:</span>
                <span className="font-mono text-slate-900">{expectedTotal.toLocaleString()} ج.م</span>
              </div>
              <div className="flex justify-between text-slate-700 font-bold">
                <span>الرصيد الفعلي المحسوب:</span>
                <span className="font-mono text-blue-700 font-black">{countedBreakdown.total.toLocaleString()} ج.م</span>
              </div>

              {/* Difference Status */}
              <div className="flex justify-between items-center border-t border-slate-200 pt-2 font-black text-xs">
                <span className="text-slate-800">حالة الخزينة:</span>
                {difference === 0 ? (
                  <span className="text-emerald-700 flex items-center gap-1 font-bold">
                    <CheckCircle2 className="w-4 h-4" />
                    متطابقة تماماً (0 ج.م)
                  </span>
                ) : difference > 0 ? (
                  <span className="text-blue-700 font-mono">
                    زيادة في الخزينة: +{difference.toLocaleString()} ج.م
                  </span>
                ) : (
                  <span className="text-rose-700 font-mono">
                    عجز في الخزينة: {difference.toLocaleString()} ج.م
                  </span>
                )}
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">ملاحظات الإغلاق</label>
              <input
                type="text"
                value={sessionNotes}
                onChange={e => setSessionNotes(e.target.value)}
                placeholder="ملاحظات وردية اليوم..."
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              حفظ واعتماد جلسة الإغلاق
            </button>
          </form>

          {/* Historical Saved Sessions */}
          <div className="pt-3 border-t border-slate-200 space-y-2">
            <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-blue-600" />
              جلسات الإغلاق السابقة ({cashSessions.length})
            </h4>

            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
              {cashSessions.map(sess => (
                <div
                  key={sess.id}
                  className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-bold text-slate-900">{sess.session_date} ({sess.cashier_name})</div>
                    <div className="text-[10px] text-slate-500">{sess.notes}</div>
                  </div>
                  <div className="text-left font-mono">
                    <div className="font-bold text-slate-900">{sess.total_cash_counted.toLocaleString()} ج.م</div>
                    <div className={`text-[10px] font-bold ${sess.difference === 0 ? 'text-emerald-700' : sess.difference > 0 ? 'text-blue-700' : 'text-rose-700'}`}>
                      {sess.difference === 0 ? 'متطابق' : sess.difference > 0 ? `+${sess.difference}` : sess.difference} ج.م
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

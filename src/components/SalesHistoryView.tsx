import React, { useState, useMemo } from 'react';
import { 
  Receipt, 
  Search, 
  Printer, 
  Eye, 
  X, 
  Calendar, 
  DollarSign, 
  CreditCard, 
  Layers,
  ArrowDownLeft,
  FileText
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Sale } from '../types';

export const SalesHistoryView: React.FC = () => {
  const { sales } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

  const filteredSales = useMemo(() => {
    return (sales || []).filter(sale => {
      const matchSearch =
        !searchQuery ||
        (sale.invoice_number && sale.invoice_number.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (sale.customer_name && sale.customer_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (sale.customer_phone && sale.customer_phone.includes(searchQuery));
      const matchPay = paymentFilter === 'all' || sale.payment_type === paymentFilter;
      return matchSearch && matchPay;
    });
  }, [sales, searchQuery, paymentFilter]);

  const totalSalesSum = useMemo(() => {
    if (!filteredSales || !Array.isArray(filteredSales)) return 0;
    return filteredSales.reduce((sum, s) => sum + (Number(s?.final_amount) || 0), 0);
  }, [filteredSales]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-800/80 rounded-2xl p-5 border border-slate-700 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Receipt className="w-5 h-5 text-amber-400" />
            سجل فواتير المبيعات
          </h2>
          <p className="text-xs text-slate-400">أرشيف الفواتير الصادرة وتفاصيل الدفع (نقدي / آجل / فيزا)</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-3.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs">
            <span className="text-slate-400">إجمالي مبيعات الفلتر: </span>
            <span className="font-bold text-emerald-400 font-mono">{(totalSalesSum || 0).toLocaleString()} ج.م</span>
          </div>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="bg-slate-800/80 rounded-2xl p-4 border border-slate-700 shadow-lg flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="ابحث برقم الفاتورة أو اسم العميل أو الهاتف..."
            className="w-full bg-slate-900 border border-slate-700 rounded-xl pr-10 pl-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
          />
        </div>

        <div className="w-full sm:w-56">
          <select
            value={paymentFilter}
            onChange={e => setPaymentFilter(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
          >
            <option value="all">جميع طرق الدفع</option>
            <option value="cash">نقدي (كاش)</option>
            <option value="debt">آجل (على الحساب)</option>
            <option value="visa">فيزا / شبكة</option>
          </select>
        </div>
      </div>

      {/* Sales Invoices Table */}
      <div className="bg-slate-800/80 rounded-2xl border border-slate-700 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse text-xs">
            <thead>
              <tr className="bg-slate-900/90 text-slate-400 font-semibold border-b border-slate-700">
                <th className="py-3 px-4">رقم الفاتورة</th>
                <th className="py-3 px-4">تاريخ الفاتورة</th>
                <th className="py-3 px-4">العميل</th>
                <th className="py-3 px-4">طريقة الدفع</th>
                <th className="py-3 px-4">الأصناف</th>
                <th className="py-3 px-4">الصافي</th>
                <th className="py-3 px-4 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {filteredSales.map(sale => (
                <tr key={sale.id} className="hover:bg-slate-700/30 transition-colors">
                  <td className="py-3 px-4 font-mono font-bold text-amber-400">
                    {sale.invoice_number}
                  </td>
                  <td className="py-3 px-4 text-slate-300">
                    {new Date(sale.created_at).toLocaleDateString('ar-EG', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </td>
                  <td className="py-3 px-4 font-bold text-white">
                    {sale.customer_name}
                    {sale.customer_phone && (
                      <span className="block text-[10px] text-slate-400 font-normal font-mono">
                        {sale.customer_phone}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        sale.payment_type === 'cash'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : sale.payment_type === 'debt'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          : 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                      }`}
                    >
                      {sale.payment_type === 'cash'
                        ? 'نقدي'
                        : sale.payment_type === 'debt'
                        ? 'آجل'
                        : 'فيزا'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-300">
                    {sale.items.length} صنف ({sale.items.reduce((s, i) => s + i.quantity, 0)} قطعة)
                  </td>
                  <td className="py-3 px-4 font-black text-amber-400 font-mono text-sm">
                    {sale.final_amount.toLocaleString()} ج.م
                  </td>
                  <td className="py-3 px-4 text-center">
                    <button
                      onClick={() => setSelectedSale(sale)}
                      className="px-3 py-1 bg-slate-700 hover:bg-amber-500 hover:text-slate-950 text-slate-200 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1.5"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      عرض الفاتورة
                    </button>
                  </td>
                </tr>
              ))}

              {filteredSales.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    لا توجد فواتير مبيعات مسجلة حتى الآن
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invoice Details & Reprint Modal */}
      {selectedSale && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between p-4 bg-slate-800 border-b border-slate-700">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Receipt className="w-4 h-4 text-amber-400" />
                تفاصيل الفاتورة {selectedSale.invoice_number}
              </h3>
              <button
                onClick={() => setSelectedSale(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 bg-white text-slate-900 text-xs font-mono space-y-3">
              <div className="text-center border-b pb-3 border-dashed border-slate-300">
                <h2 className="text-base font-black text-slate-900">سوبرماركت / مخزن المواد الغذائية</h2>
                <div className="text-[11px] font-bold mt-1">رقم الفاتورة: {selectedSale.invoice_number}</div>
                <div className="text-[10px] text-slate-500">{new Date(selectedSale.created_at).toLocaleString('ar-EG')}</div>
              </div>

              <div className="space-y-1 text-[11px] border-b pb-2 border-dashed border-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-600">العميل:</span>
                  <span className="font-bold">{selectedSale.customer_name}</span>
                </div>
                {selectedSale.customer_phone && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">الهاتف:</span>
                    <span>{selectedSale.customer_phone}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-600">طريقة الدفع:</span>
                  <span className="font-bold">
                    {selectedSale.payment_type === 'cash' ? 'نقدي (كاش)' : selectedSale.payment_type === 'debt' ? 'آجل (حساب)' : 'فيزا'}
                  </span>
                </div>
              </div>

              {/* Items */}
              <div className="space-y-1.5 border-b pb-3 border-dashed border-slate-300">
                <div className="flex justify-between font-bold text-[10px] text-slate-500 pb-1">
                  <span>الصنف والوحدة</span>
                  <span>الكمية × السعر</span>
                  <span>الإجمالي</span>
                </div>
                {selectedSale.items.map((it, idx) => (
                  <div key={idx} className="flex justify-between items-center text-[11px]">
                    <div className="w-1/2 truncate font-semibold">
                      {it.product_name} ({it.unit})
                    </div>
                    <div className="text-center text-slate-600">
                      {it.quantity} × {it.unit_price}
                    </div>
                    <div className="font-bold text-left">{it.total_price} ج.م</div>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="space-y-1 pt-1 font-bold">
                <div className="flex justify-between text-xs">
                  <span>المجموع:</span>
                  <span>{selectedSale.total_amount.toLocaleString()} ج.م</span>
                </div>
                {selectedSale.discount > 0 && (
                  <div className="flex justify-between text-xs text-rose-600">
                    <span>الخصم:</span>
                    <span>-{selectedSale.discount.toLocaleString()} ج.م</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-black border-t pt-2 border-slate-900">
                  <span>الصافي:</span>
                  <span>{selectedSale.final_amount.toLocaleString()} ج.م</span>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-800 border-t border-slate-700 flex gap-2">
              <button
                onClick={handlePrint}
                className="flex-1 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl flex items-center justify-center gap-2"
              >
                <Printer className="w-4 h-4" />
                طباعة الفاتورة
              </button>
              <button
                onClick={() => setSelectedSale(null)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded-xl font-semibold"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

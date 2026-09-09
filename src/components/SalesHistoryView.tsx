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
import { InvoicePrintModal } from './InvoicePrintModal';

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

  return (
    <div className="space-y-4 font-sans text-slate-800 animate-in fade-in duration-150">
      {/* Header */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              سجل فواتير المبيعات الصادرة
            </h2>
            <p className="text-xs text-slate-500">أرشيف الفواتير، طرق الدفع، وطباعة أذون الصرف</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-3.5 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-xs">
            <span className="text-blue-700 font-bold">إجمالي مبيعات القائمة: </span>
            <span className="font-black text-blue-900 font-mono">{(totalSalesSum || 0).toLocaleString()} ج.م</span>
          </div>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="ابحث برقم الفاتورة أو اسم العميل أو الهاتف..."
            className="w-full bg-slate-50 border border-slate-300 rounded-lg pr-9 pl-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
          />
        </div>

        <div className="w-full sm:w-56">
          <select
            value={paymentFilter}
            onChange={e => setPaymentFilter(e.target.value)}
            className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 font-bold focus:bg-white focus:outline-none focus:border-blue-600"
          >
            <option value="all">جميع طرق الدفع</option>
            <option value="cash">نقدي (كاش)</option>
            <option value="debt">آجل (على الحساب)</option>
            <option value="visa">فيزا / شبكة</option>
          </select>
        </div>
      </div>

      {/* Sales Invoices Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse text-xs">
            <thead>
              <tr className="bg-slate-800 text-white font-bold border-b border-slate-700 text-[11px]">
                <th className="py-2.5 px-3 text-center w-28">رقم الفاتورة</th>
                <th className="py-2.5 px-3 text-center w-36">تاريخ الفاتورة</th>
                <th className="py-2.5 px-4">اسم العميل</th>
                <th className="py-2.5 px-3 text-center w-28">طريقة الدفع</th>
                <th className="py-2.5 px-3 text-center w-28">عدد الأصناف</th>
                <th className="py-2.5 px-3 text-center w-32">الصافي النهائي</th>
                <th className="py-2.5 px-3 text-center w-28">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredSales.map((sale, idx) => (
                <tr
                  key={sale.id}
                  className={`hover:bg-slate-50 transition-colors ${
                    idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                  }`}
                >
                  <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-800">
                    {sale.invoice_number}
                  </td>
                  <td className="py-2.5 px-3 text-center text-slate-500 font-mono text-[11px]">
                    {new Date(sale.created_at).toLocaleDateString('ar-EG', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </td>
                  <td className="py-2.5 px-4 font-bold text-slate-900">
                    <div>{sale.customer_name}</div>
                    {sale.customer_phone && (
                      <span className="block text-[10px] text-slate-400 font-normal font-mono">
                        {sale.customer_phone}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        sale.payment_type === 'cash'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : sale.payment_type === 'debt'
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : 'bg-blue-50 text-blue-700 border border-blue-200'
                      }`}
                    >
                      {sale.payment_type === 'cash'
                        ? 'نقدي'
                        : sale.payment_type === 'debt'
                        ? 'آجل'
                        : 'فيزا'}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-center text-slate-600 font-bold font-mono">
                    {sale.items.length} صنف
                  </td>
                  <td className="py-2.5 px-3 text-center font-black text-slate-900 font-mono text-xs">
                    {sale.final_amount.toLocaleString()} ج.م
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <button
                      onClick={() => setSelectedSale(sale)}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-900 text-white rounded-md text-xs font-bold transition-colors inline-flex items-center gap-1 cursor-pointer shadow-xs"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      معاينة
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

      {/* Printable Invoice Modal */}
      <InvoicePrintModal
        isOpen={!!selectedSale}
        onClose={() => setSelectedSale(null)}
        sale={selectedSale}
      />
    </div>
  );
};

import React, { useRef } from 'react';
import { 
  Printer, 
  X, 
  Building2, 
  Phone, 
  Calendar, 
  User, 
  Receipt, 
  CheckCircle2, 
  MapPin, 
  CreditCard,
  FileSpreadsheet,
  Download
} from 'lucide-react';
import { Sale } from '../types';

interface InvoicePrintModalProps {
  sale: Sale | null;
  isOpen: boolean;
  onClose: () => void;
  previousBalance?: number; // الحساب السابق للعميل
  storeInfo?: {
    name?: string;
    activity?: string;
    phone?: string;
    address?: string;
    commercialReg?: string;
  };
}

export const InvoicePrintModal: React.FC<InvoicePrintModalProps> = ({
  sale,
  isOpen,
  onClose,
  previousBalance = 0,
  storeInfo = {
    name: 'مؤسسة البركة لتجارة المواد الغذائية والجملة',
    activity: 'بيع وتوزيع المواد الغذائية والمنظفات ومستلزمات السوبرماركت بالجملة والقطاعي',
    phone: '01012345678 - 01198765432',
    address: 'شارع الجمهورية الرئيسي - المخزن والفرع المركزي',
    commercialReg: 'س.ت: 89412 - ب.ض: 432-110-985'
  }
}) => {
  const printableRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !sale) return null;

  const handlePrint = () => {
    window.print();
  };

  const invoiceDate = new Date(sale.created_at || Date.now());
  const formattedDate = invoiceDate.toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const formattedTime = invoiceDate.toLocaleTimeString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit'
  });

  const finalAmount = Number(sale.final_amount) || 0;
  const currentTotalDebt = (previousBalance || 0) + (sale.payment_type === 'debt' ? finalAmount : 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto print:p-0 print:bg-white print:static">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col max-h-[96vh] animate-in fade-in zoom-in duration-200 print:max-h-none print:w-full print:border-none print:shadow-none print:rounded-none">
        
        {/* Top bar (Hidden when printing) */}
        <div className="flex items-center justify-between p-4 bg-slate-900 text-white border-b border-slate-800 print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                معاينة وطباعة فاتورة المبيعات #{sale.invoice_number}
              </h2>
              <p className="text-[11px] text-slate-300">
                تصميم مطابق للفاتورة الرسمية بجدول البنود (م، كود الصنف، اسم الصنف، الوحدة، الكمية، السعر، القيمة)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-sm flex items-center gap-2 transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              طباعة الفاتورة الآن (Ctrl + P)
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Invoice Printable Viewport */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-slate-950/40 print:p-0 print:bg-white print:overflow-visible">
          <div 
            ref={printableRef}
            id="printable-official-invoice"
            className="bg-white text-slate-950 mx-auto max-w-3xl p-6 sm:p-8 rounded-2xl shadow-xl border border-slate-300 font-sans print:border-none print:shadow-none print:p-4 print:max-w-full"
            style={{ direction: 'rtl' }}
          >
            {/* Header / ترويسة الفاتورة */}
            <div className="border-b-2 border-slate-900 pb-4 mb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                {/* Store Branding */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-slate-900 text-amber-400 flex items-center justify-center font-black text-sm">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                      {storeInfo.name}
                    </h1>
                  </div>
                  <p className="text-xs text-slate-600 font-medium">
                    {storeInfo.activity}
                  </p>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 pt-0.5">
                    {storeInfo.phone && <span>📞 هاتف: {storeInfo.phone}</span>}
                    {storeInfo.address && <span>📍 {storeInfo.address}</span>}
                  </div>
                </div>

                {/* Invoice Title & Number Stamp */}
                <div className="text-left bg-slate-100 border border-slate-300 rounded-xl p-3 min-w-[200px] flex flex-col justify-center">
                  <div className="text-center font-black text-sm sm:text-base text-slate-900 border-b border-slate-300 pb-1 mb-1">
                    فاتورة مبيعات {sale.payment_type === 'debt' ? '(آجل)' : sale.payment_type === 'visa' ? '(شبكة)' : '(نقدي)'}
                  </div>
                  <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-800">
                    <span>رقم الفاتورة:</span>
                    <span className="text-amber-700 text-sm font-black">{sale.invoice_number}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-600">
                    <span>التاريخ:</span>
                    <span className="font-mono">{formattedDate} - {formattedTime}</span>
                  </div>
                </div>
              </div>

              {/* Customer & Transaction Meta Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                <div>
                  <span className="text-slate-500 block text-[10px] font-semibold">كود العميل:</span>
                  <span className="font-mono font-bold text-slate-900">
                    {sale.customer_code || 'CUST-01'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] font-semibold">اسم العميل / المستلم:</span>
                  <span className="font-bold text-slate-900 truncate block" title={sale.customer_name}>
                    {sale.customer_name || 'عميل نقدي'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] font-semibold">رقم الهاتف:</span>
                  <span className="font-mono text-slate-800">
                    {sale.customer_phone || '-'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] font-semibold">الكاشير / الموظف:</span>
                  <span className="font-medium text-slate-800">
                    {sale.cashier_name || 'الكاشير الرئيسي'}
                  </span>
                </div>
              </div>
            </div>

            {/* INVOICE ITEMS TABLE - EXACT MATCH TO REQUEST */}
            <div className="mb-4 overflow-x-auto">
              <table className="w-full text-right border-collapse border border-slate-300 text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white font-bold text-[11px]">
                    <th className="py-2.5 px-2 border border-slate-700 text-center w-8">م</th>
                    <th className="py-2.5 px-2.5 border border-slate-700 text-center w-20">كود الصنف</th>
                    <th className="py-2.5 px-3 border border-slate-700">اسم الصنف والبيان</th>
                    <th className="py-2.5 px-2.5 border border-slate-700 text-center w-16">الوحدة</th>
                    <th className="py-2.5 px-2.5 border border-slate-700 text-center w-16">الكمية</th>
                    <th className="py-2.5 px-2.5 border border-slate-700 text-center w-20">السعر</th>
                    <th className="py-2.5 px-3 border border-slate-700 text-left w-24">القيمة (ج.م)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-900">
                  {sale.items.map((item, index) => {
                    const itemTotal = Number(item.total_price) || (Number(item.quantity) * Number(item.unit_price));
                    return (
                      <tr 
                        key={index} 
                        className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}
                      >
                        <td className="py-2 px-2 border border-slate-200 text-center font-mono text-[11px] font-semibold text-slate-600">
                          {index + 1}
                        </td>
                        <td className="py-2 px-2.5 border border-slate-200 text-center font-mono font-bold text-slate-800 text-[11px]">
                          {item.code || `100${index + 1}`}
                        </td>
                        <td className="py-2 px-3 border border-slate-200 font-bold text-slate-900">
                          {item.product_name}
                        </td>
                        <td className="py-2 px-2.5 border border-slate-200 text-center text-slate-700">
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px]">
                            {item.unit || 'قطعة'}
                          </span>
                        </td>
                        <td className="py-2 px-2.5 border border-slate-200 text-center font-mono font-bold text-slate-900">
                          {item.quantity}
                        </td>
                        <td className="py-2 px-2.5 border border-slate-200 text-center font-mono text-slate-800">
                          {Number(item.unit_price).toFixed(2)}
                        </td>
                        <td className="py-2 px-3 border border-slate-200 text-left font-mono font-black text-slate-950">
                          {itemTotal.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* INVOICE TOTALS & SUMMARY SECTION */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 pt-2">
              {/* Left/Notes and Signature Box */}
              <div className="sm:col-span-6 space-y-3 flex flex-col justify-between">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                  <span className="font-bold text-slate-800 block text-[11px]">ملاحظات الفاتورة:</span>
                  <p className="text-slate-600 text-[11px] leading-relaxed">
                    {sale.notes || 'البضاعة المباعة لا ترد ولا تستبدل بعد 14 يوماً من تاريخ الفاتورة. شكراً لتعاملكم معنا.'}
                  </p>
                </div>

                {/* Signatures */}
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200 text-center text-xs text-slate-600">
                  <div>
                    <div className="border-b border-dashed border-slate-400 pb-6 mb-1"></div>
                    <span className="font-bold text-slate-800">توقيع المستلم / العميل</span>
                  </div>
                  <div>
                    <div className="border-b border-dashed border-slate-400 pb-6 mb-1"></div>
                    <span className="font-bold text-slate-800">توقيع المسؤول / الكاشير</span>
                  </div>
                </div>
              </div>

              {/* Right Totals Box */}
              <div className="sm:col-span-6 bg-slate-50 border border-slate-300 rounded-2xl p-4 space-y-2.5">
                <div className="flex items-center justify-between text-xs text-slate-700">
                  <span>إجمالي قيمة الأصناف:</span>
                  <span className="font-mono font-bold text-slate-900">
                    {Number(sale.total_amount || 0).toLocaleString()} ج.م
                  </span>
                </div>

                {Number(sale.discount) > 0 && (
                  <div className="flex items-center justify-between text-xs text-rose-700 font-semibold">
                    <span>قيمة الخصم الممنوح:</span>
                    <span className="font-mono font-bold">
                      -{Number(sale.discount).toLocaleString()} ج.م
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between py-2 border-y-2 border-slate-900 text-base font-black text-slate-950">
                  <span>صافي الفاتورة المطلوب:</span>
                  <span className="font-mono text-lg text-emerald-800">
                    {Number(sale.final_amount || 0).toLocaleString()} ج.م
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-600 pt-1">
                  <span>طريقة الدفع المسجلة:</span>
                  <span className="font-bold text-slate-900">
                    {sale.payment_type === 'cash' ? '💵 نقدي بالكامل' : sale.payment_type === 'debt' ? '📑 آجل على الحساب' : '💳 شبكة فيزا'}
                  </span>
                </div>

                {sale.payment_type === 'debt' && (
                  <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl space-y-1 text-xs text-rose-900">
                    <div className="flex justify-between">
                      <span>الرصيد السابق للعميل:</span>
                      <span className="font-mono font-bold">{(previousBalance || 0).toLocaleString()} ج.م</span>
                    </div>
                    <div className="flex justify-between font-bold border-t border-rose-200 pt-1">
                      <span>إجمالي الحساب المستحق بعد الفاتورة:</span>
                      <span className="font-mono font-black">{currentTotalDebt.toLocaleString()} ج.م</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer Notice */}
            <div className="text-center pt-6 mt-4 border-t border-slate-200 text-[10px] text-slate-500">
              طُبعت الفاتورة عبر نظام إدارة المخازن والمبيعات • {new Date().toLocaleString('ar-EG')}
            </div>
          </div>
        </div>

        {/* Modal Footer Actions (Hidden on Print) */}
        <div className="p-4 bg-slate-800 border-t border-slate-700 flex items-center justify-between gap-3 print:hidden">
          <div className="text-xs text-slate-400">
            عدد البنود بالفاتورة: <strong className="text-white font-mono">{sale.items.length}</strong> صنف
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white font-semibold text-xs rounded-xl transition-colors"
            >
              إغلاق
            </button>
            <button
              onClick={handlePrint}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all"
            >
              <Printer className="w-4 h-4" />
              طباعة الفاتورة
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

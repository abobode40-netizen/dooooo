import React, { useRef, useState } from 'react';
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
  Download,
  FileDown,
  RefreshCw,
  FileText
} from 'lucide-react';
import { Sale } from '../types';
import { exportInvoiceElementPDF, exportSaleInvoiceDirectPDF } from '../utils/pdfExport';

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
  const [pageSize, setPageSize] = useState<'a4' | 'a5'>('a4');
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  if (!isOpen || !sale) return null;

  const isA5 = pageSize === 'a5';

  const handlePrint = () => {
    window.print();
  };

  const handleExportInvoicePdf = async (sizeToExport: 'a4' | 'a5' = pageSize) => {
    if (!sale) return;
    try {
      setIsExportingPdf(true);
      if (printableRef.current && pageSize === sizeToExport) {
        await exportInvoiceElementPDF(printableRef.current, sale.invoice_number, sizeToExport);
      } else {
        await exportSaleInvoiceDirectPDF(sale, {
          pageSize: sizeToExport,
          previousBalance,
          storeInfo
        });
      }
    } catch (err) {
      console.error('Error generating invoice PDF:', err);
    } finally {
      setIsExportingPdf(false);
    }
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
      <style>
        {`
          @page {
            size: ${pageSize.toUpperCase()};
            margin: ${isA5 ? '5mm' : '8mm'};
          }
          @media print {
            body {
              background: #ffffff !important;
              color: #000000 !important;
            }
          }
        `}
      </style>

      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col max-h-[96vh] animate-in fade-in zoom-in duration-200 print:max-h-none print:w-full print:border-none print:shadow-none print:rounded-none">
        
        {/* Top bar (Hidden when printing) */}
        <div className="flex flex-wrap items-center justify-between p-4 bg-slate-900 text-white border-b border-slate-800 gap-3 print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white">
                  معاينة وطباعة فاتورة المبيعات #{sale.invoice_number}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-900/80 text-blue-300 border border-blue-600">
                  {isA5 ? 'مقاس ورق A5 (مدمج)' : 'مقاس ورق A4 (قياسي)'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                توليد ملفات PDF وتنسيقات طباعة جاهزة بمقاس A4 ومقاس A5
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Paper Format Switcher */}
            <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs font-bold">
              <button
                type="button"
                onClick={() => setPageSize('a4')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                  pageSize === 'a4' 
                    ? 'bg-blue-600 text-white shadow-sm' 
                    : 'text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>ورق A4</span>
              </button>
              <button
                type="button"
                onClick={() => setPageSize('a5')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                  pageSize === 'a5' 
                    ? 'bg-blue-600 text-white shadow-sm' 
                    : 'text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>ورق A5</span>
              </button>
            </div>

            {/* Quick Export PDF buttons */}
            <button
              onClick={() => handleExportInvoicePdf('a4')}
              disabled={isExportingPdf}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-bold text-xs rounded-lg shadow-sm flex items-center gap-1.5 transition-all cursor-pointer border border-slate-700"
              title="تصدير وتحميل الفاتورة كـ PDF بمقاس A4"
            >
              {isExportingPdf ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
              ) : (
                <FileDown className="w-3.5 h-3.5 text-emerald-400" />
              )}
              <span>PDF (A4)</span>
            </button>

            <button
              onClick={() => handleExportInvoicePdf('a5')}
              disabled={isExportingPdf}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-bold text-xs rounded-lg shadow-sm flex items-center gap-1.5 transition-all cursor-pointer border border-slate-700"
              title="تصدير وتحميل الفاتورة كـ PDF بمقاس A5"
            >
              {isExportingPdf ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
              ) : (
                <FileDown className="w-3.5 h-3.5 text-amber-400" />
              )}
              <span>PDF (A5)</span>
            </button>

            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-sm flex items-center gap-2 transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              طباعة فورية
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
            className={`bg-white text-slate-950 mx-auto rounded-2xl shadow-xl border border-slate-300 font-sans print:border-none print:shadow-none print:p-0 print:max-w-full ${
              isA5 ? 'max-w-xl p-4 sm:p-6' : 'max-w-3xl p-6 sm:p-8'
            }`}
            style={{ direction: 'rtl' }}
          >
            {/* Header / ترويسة الفاتورة */}
            <div className={`border-b-2 border-slate-900 ${isA5 ? 'pb-3 mb-3' : 'pb-4 mb-4'}`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                {/* Store Branding */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-slate-900 text-amber-400 flex items-center justify-center font-black text-sm">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <h1 className={`${isA5 ? 'text-base sm:text-lg' : 'text-lg sm:text-xl'} font-black text-slate-900 tracking-tight`}>
                      {storeInfo.name}
                    </h1>
                  </div>
                  <p className={`text-slate-600 font-medium ${isA5 ? 'text-[10px]' : 'text-xs'}`}>
                    {storeInfo.activity}
                  </p>
                  <div className={`flex flex-wrap items-center gap-3 text-slate-500 pt-0.5 ${isA5 ? 'text-[9px]' : 'text-[11px]'}`}>
                    {storeInfo.phone && <span>📞 هاتف: {storeInfo.phone}</span>}
                    {storeInfo.address && <span>📍 {storeInfo.address}</span>}
                  </div>
                </div>

                {/* Invoice Title & Number Stamp */}
                <div className={`text-left bg-slate-100 border border-slate-300 rounded-xl flex flex-col justify-center ${isA5 ? 'p-2.5 min-w-[170px]' : 'p-3 min-w-[200px]'}`}>
                  <div className={`text-center font-black text-slate-900 border-b border-slate-300 ${isA5 ? 'text-xs pb-0.5 mb-1' : 'text-sm sm:text-base pb-1 mb-1'}`}>
                    فاتورة مبيعات {sale.payment_type === 'debt' ? '(آجل)' : sale.payment_type === 'visa' ? '(شبكة)' : '(نقدي)'}
                  </div>
                  <div className={`flex items-center justify-between font-mono font-bold text-slate-800 ${isA5 ? 'text-[11px]' : 'text-xs'}`}>
                    <span>رقم الفاتورة:</span>
                    <span className="text-amber-700 font-black">{sale.invoice_number}</span>
                  </div>
                  <div className={`flex items-center justify-between text-slate-600 ${isA5 ? 'text-[10px]' : 'text-[11px]'}`}>
                    <span>التاريخ:</span>
                    <span className="font-mono">{formattedDate} - {formattedTime}</span>
                  </div>
                  <div className={`flex items-center justify-between text-blue-700 font-bold border-t border-slate-200 mt-1 pt-0.5 ${isA5 ? 'text-[9px]' : 'text-[10px]'}`}>
                    <span>المقاس:</span>
                    <span>ورق {isA5 ? 'A5 (مدمج)' : 'A4 (كامل)'}</span>
                  </div>
                </div>
              </div>

              {/* Customer & Transaction Meta Grid */}
              <div className={`grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 ${isA5 ? 'p-2 text-[10px]' : 'p-3 text-xs'}`}>
                <div>
                  <span className="text-slate-500 block text-[10px] font-semibold">كود العميل:</span>
                  <span className="font-mono font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 inline-block">
                    {sale.customer_code || '94'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] font-semibold">اسم العميل / المستلم:</span>
                  <span className="font-bold text-slate-900 truncate block" title={sale.customer_name}>
                    {sale.customer_name || 'عميل نقدي عام'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] font-semibold">رقم الهاتف:</span>
                  <span className="font-mono text-slate-800">
                    {sale.customer_phone || '-'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] font-semibold">العنوان:</span>
                  <span className="text-slate-800 truncate block" title={sale.customer_address || '-'}>
                    {sale.customer_address || '-'}
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

            {/* INVOICE ITEMS TABLE */}
            <div className={`overflow-x-auto ${isA5 ? 'mb-3' : 'mb-4'}`}>
              <table className={`w-full text-right border-collapse border border-slate-300 ${isA5 ? 'text-[10px]' : 'text-xs'}`}>
                <thead>
                  <tr className="bg-slate-900 text-white font-bold">
                    <th className={`border border-slate-700 text-center ${isA5 ? 'py-1.5 px-1 w-7' : 'py-2.5 px-2 w-8'}`}>م</th>
                    <th className={`border border-slate-700 text-center ${isA5 ? 'py-1.5 px-1.5 w-16' : 'py-2.5 px-2.5 w-20'}`}>كود الصنف</th>
                    <th className={`border border-slate-700 ${isA5 ? 'py-1.5 px-2' : 'py-2.5 px-3'}`}>اسم الصنف والبيان</th>
                    <th className={`border border-slate-700 text-center ${isA5 ? 'py-1.5 px-1 w-12' : 'py-2.5 px-2.5 w-16'}`}>الوحدة</th>
                    <th className={`border border-slate-700 text-center ${isA5 ? 'py-1.5 px-1 w-12' : 'py-2.5 px-2.5 w-16'}`}>الكمية</th>
                    <th className={`border border-slate-700 text-center ${isA5 ? 'py-1.5 px-1.5 w-16' : 'py-2.5 px-2.5 w-20'}`}>السعر</th>
                    <th className={`border border-slate-700 text-left ${isA5 ? 'py-1.5 px-2 w-20' : 'py-2.5 px-3 w-24'}`}>القيمة (ج.م)</th>
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
                        <td className={`border border-slate-200 text-center font-mono font-semibold text-slate-600 ${isA5 ? 'py-1 px-1' : 'py-2 px-2'}`}>
                          {index + 1}
                        </td>
                        <td className={`border border-slate-200 text-center font-mono font-bold text-slate-800 ${isA5 ? 'py-1 px-1.5 text-[10px]' : 'py-2 px-2.5 text-[11px]'}`}>
                          {item.code || `100${index + 1}`}
                        </td>
                        <td className={`border border-slate-200 font-bold text-slate-900 ${isA5 ? 'py-1 px-2' : 'py-2 px-3'}`}>
                          {item.product_name}
                        </td>
                        <td className={`border border-slate-200 text-center text-slate-700 ${isA5 ? 'py-1 px-1' : 'py-2 px-2.5'}`}>
                          <span className="px-1 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px]">
                            {item.unit || 'قطعة'}
                          </span>
                        </td>
                        <td className={`border border-slate-200 text-center font-mono font-bold text-slate-900 ${isA5 ? 'py-1 px-1' : 'py-2 px-2.5'}`}>
                          {item.quantity}
                        </td>
                        <td className={`border border-slate-200 text-center font-mono text-slate-800 ${isA5 ? 'py-1 px-1.5' : 'py-2 px-2.5'}`}>
                          {Number(item.unit_price).toFixed(2)}
                        </td>
                        <td className={`border border-slate-200 text-left font-mono font-black text-slate-950 ${isA5 ? 'py-1 px-2' : 'py-2 px-3'}`}>
                          {itemTotal.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* INVOICE TOTALS & SUMMARY SECTION */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-1">
              {/* Left/Notes and Signature Box */}
              <div className="sm:col-span-6 space-y-2 flex flex-col justify-between">
                <div className={`bg-slate-50 border border-slate-200 rounded-xl space-y-1 ${isA5 ? 'p-2 text-[10px]' : 'p-3 text-xs'}`}>
                  <span className="font-bold text-slate-800 block text-[11px]">ملاحظات الفاتورة:</span>
                  <p className="text-slate-600 leading-relaxed">
                    {sale.notes || 'البضاعة المباعة لا ترد ولا تستبدل بعد 14 يوماً من تاريخ الفاتورة. شكراً لتعاملكم معنا.'}
                  </p>
                </div>

                {/* Signatures */}
                <div className={`grid grid-cols-2 gap-3 pt-2 border-t border-slate-200 text-center text-slate-600 ${isA5 ? 'text-[9px]' : 'text-xs'}`}>
                  <div>
                    <div className="border-b border-dashed border-slate-400 pb-4 mb-1"></div>
                    <span className="font-bold text-slate-800">توقيع المستلم / العميل</span>
                  </div>
                  <div>
                    <div className="border-b border-dashed border-slate-400 pb-4 mb-1"></div>
                    <span className="font-bold text-slate-800">توقيع المسؤول / الكاشير</span>
                  </div>
                </div>
              </div>

              {/* Right Totals Box */}
              <div className={`sm:col-span-6 bg-slate-50 border border-slate-300 rounded-2xl space-y-2 ${isA5 ? 'p-3' : 'p-4'}`}>
                <div className={`flex items-center justify-between text-slate-700 ${isA5 ? 'text-[11px]' : 'text-xs'}`}>
                  <span>إجمالي قيمة الأصناف:</span>
                  <span className="font-mono font-bold text-slate-900">
                    {Number(sale.total_amount || 0).toLocaleString()} ج.م
                  </span>
                </div>

                {Number(sale.discount) > 0 && (
                  <div className={`flex items-center justify-between text-rose-700 font-semibold ${isA5 ? 'text-[11px]' : 'text-xs'}`}>
                    <span>قيمة الخصم الممنوح:</span>
                    <span className="font-mono font-bold">
                      -{Number(sale.discount).toLocaleString()} ج.م
                    </span>
                  </div>
                )}

                <div className={`flex items-center justify-between py-1.5 border-y-2 border-slate-900 font-black text-slate-950 ${isA5 ? 'text-sm' : 'text-base'}`}>
                  <span>صافي الفاتورة المطلوب:</span>
                  <span className={`font-mono text-emerald-800 ${isA5 ? 'text-base' : 'text-lg'}`}>
                    {Number(sale.final_amount || 0).toLocaleString()} ج.م
                  </span>
                </div>

                <div className={`flex items-center justify-between text-slate-600 pt-0.5 ${isA5 ? 'text-[10px]' : 'text-xs'}`}>
                  <span>طريقة الدفع المسجلة:</span>
                  <span className="font-bold text-slate-900">
                    {sale.payment_type === 'cash' ? '💵 نقدي بالكامل' : sale.payment_type === 'debt' ? '📑 آجل على الحساب' : '💳 شبكة فيزا'}
                  </span>
                </div>

                {sale.payment_type === 'debt' && (
                  <div className={`bg-rose-50 border border-rose-200 rounded-xl space-y-1 text-rose-900 ${isA5 ? 'p-2 text-[10px]' : 'p-2.5 text-xs'}`}>
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
            <div className={`text-center pt-4 mt-3 border-t border-slate-200 text-slate-500 ${isA5 ? 'text-[8px]' : 'text-[10px]'}`}>
              طُبعت الفاتورة عبر نظام إدارة المخازن ونقاط البيع (ورق {pageSize.toUpperCase()}) • {new Date().toLocaleString('ar-EG')}
            </div>
          </div>
        </div>

        {/* Modal Footer Actions (Hidden on Print) */}
        <div className="p-4 bg-slate-800 border-t border-slate-700 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="text-xs text-slate-400 flex items-center gap-3">
            <span>عدد البنود بالفاتورة: <strong className="text-white font-mono">{sale.items.length}</strong> صنف</span>
            <span className="text-slate-600">|</span>
            <span>المقاس النشط: <strong className="text-amber-400 font-bold">{pageSize.toUpperCase()}</strong></span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white font-semibold text-xs rounded-xl transition-colors cursor-pointer"
            >
              إغلاق
            </button>
            <button
              onClick={() => handleExportInvoicePdf(pageSize)}
              disabled={isExportingPdf}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-sm transition-all cursor-pointer"
            >
              <FileDown className="w-4 h-4" />
              <span>توليد PDF ({pageSize.toUpperCase()})</span>
            </button>
            <button
              onClick={handlePrint}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة فورية ({pageSize.toUpperCase()})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

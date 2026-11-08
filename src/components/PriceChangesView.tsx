import React, { useState, useMemo } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Plus, 
  Search, 
  Printer, 
  Download, 
  FileSpreadsheet, 
  RotateCcw,
  AlertCircle,
  PackagePlus,
  Trash2,
  Calendar,
  X,
  Check,
  FileDown
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useApp } from '../context/AppContext';
import { PriceChangeItem, Product } from '../types';
import { matchProductSearch } from '../utils/productImportExport';

interface PriceChangesViewProps {
  onNavigateTab?: (tab: string) => void;
}

export const PriceChangesView: React.FC<PriceChangesViewProps> = ({ onNavigateTab }) => {
  const { 
    priceChangeDays = [], 
    priceChangeItems = [], 
    products = [], 
    clearPriceChanges, 
    showToast 
  } = useApp();

  const [selectedDayId, setSelectedDayId] = useState<string>('all');
  const [filterType, setFilterType] = useState<'all' | 'increase' | 'decrease' | 'new'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [confirmClearChecked, setConfirmClearChecked] = useState(false);

  // Safe normalized items list strictly linked to products
  const safeItems: PriceChangeItem[] = useMemo(() => {
    if (!products || products.length === 0) {
      return [];
    }

    const productsById = new Map<string, Product>();
    const productsByCode = new Map<string, Product>();
    products.forEach(p => {
      if (p.id) productsById.set(p.id, p);
      if (p.code) productsByCode.set(String(p.code).trim().toLowerCase(), p);
    });

    const items: PriceChangeItem[] = [];
    const processedCodes = new Set<string>();

    // 1. Process items from recorded priceChangeItems
    (priceChangeItems || []).forEach((item: any, idx: number) => {
      const pId = String(item?.product_id || item?.productId || '');
      const rawCode = String(item?.code || item?.item_code || '').trim();
      const codeKey = rawCode.toLowerCase();

      const matchedProduct = (pId ? productsById.get(pId) : undefined) || 
                             (codeKey ? productsByCode.get(codeKey) : undefined);

      if (!matchedProduct) return;

      const rawName = String(item?.product_name || item?.name || '').trim();
      const resolvedName = (rawName && !rawName.startsWith('صنف غير مسمى'))
        ? rawName
        : (matchedProduct.name || rawName || 'صنف بدون اسم');

      const resolvedCode = rawCode || matchedProduct.code || '';
      const wNew = Number(item?.price_wholesale ?? matchedProduct.price_wholesale ?? 0);
      const rNew = Number(item?.price_retail ?? matchedProduct.price ?? 0);
      const wOld = Number(item?.old_price_wholesale ?? 0);
      const rOld = Number(item?.old_price_retail ?? 0);

      items.push({
        id: String(item?.id || `item-${idx}`),
        day_id: String(item?.day_id || ''),
        product_id: matchedProduct.id,
        product_name: resolvedName,
        code: resolvedCode,
        price_wholesale: isNaN(wNew) ? 0 : wNew,
        price_retail: isNaN(rNew) ? 0 : rNew,
        old_price_wholesale: isNaN(wOld) ? 0 : wOld,
        old_price_retail: isNaN(rOld) ? 0 : rOld,
        created_at: typeof item?.created_at === 'string' ? item.created_at : new Date().toISOString(),
        is_new: Boolean(item?.is_new ?? item?.isNew)
      });

      if (resolvedCode) {
        processedCodes.add(resolvedCode.toLowerCase());
      }
    });

    // 2. Also check if products themselves have price_change_type or is_new that wasn't in logged batch
    products.forEach((prod, idx) => {
      const cKey = String(prod.code || '').trim().toLowerCase();
      if (cKey && processedCodes.has(cKey)) return;

      const hasChangeType = prod.price_change_type === 'increase' || prod.price_change_type === 'decrease';
      const isNewProd = Boolean(prod.is_new);
      const hasOldPrice = prod.old_price !== undefined && prod.old_price !== prod.price;

      if (hasChangeType || isNewProd || hasOldPrice) {
        items.push({
          id: `prod-change-${prod.id || idx}`,
          day_id: 'current',
          product_id: prod.id,
          product_name: prod.name,
          code: prod.code,
          price_wholesale: prod.price_wholesale || prod.price || 0,
          price_retail: prod.price || 0,
          old_price_wholesale: prod.old_price_wholesale || 0,
          old_price_retail: prod.old_price || 0,
          created_at: prod.updated_at || prod.created_at || new Date().toISOString(),
          is_new: isNewProd
        });
      }
    });

    return items;
  }, [priceChangeItems, products]);

  // Filter items by type and search query
  const filteredItems = useMemo(() => {
    return safeItems.filter(item => {
      if (selectedDayId !== 'all' && item.day_id !== selectedDayId) {
        return false;
      }

      const wholesaleDiff = item.price_wholesale - item.old_price_wholesale;
      const retailDiff = item.price_retail - item.old_price_retail;

      if (filterType === 'new') {
        if (!item.is_new) return false;
      } else if (filterType === 'increase') {
        if (item.is_new || (wholesaleDiff <= 0 && retailDiff <= 0)) return false;
      } else if (filterType === 'decrease') {
        if (item.is_new || (wholesaleDiff >= 0 && retailDiff >= 0)) return false;
      }

      if (searchQuery.trim()) {
        const dummyProduct = {
          id: item.product_id,
          name: item.product_name,
          code: item.code,
          price: item.price_retail,
          price_wholesale: item.price_wholesale,
          unit: 'كرتونه'
        };
        if (!matchProductSearch(dummyProduct as any, searchQuery)) {
          return false;
        }
      }

      return true;
    });
  }, [safeItems, selectedDayId, filterType, searchQuery]);

  // Statistics
  const stats = useMemo(() => {
    let increases = 0;
    let decreases = 0;
    let newItems = 0;

    safeItems.forEach(i => {
      if (i.is_new) {
        newItems++;
      } else {
        const wDiff = i.price_wholesale - i.old_price_wholesale;
        const rDiff = i.price_retail - i.old_price_retail;
        if (wDiff > 0 || rDiff > 0) increases++;
        else if (wDiff < 0 || rDiff < 0) decreases++;
      }
    });

    return {
      total: safeItems.length,
      increases,
      decreases,
      newItems
    };
  }, [safeItems]);

  // Export to Excel
  const handleExportExcel = () => {
    if (filteredItems.length === 0) {
      showToast('لا توجد بيانات لتصديرها في القائمة المحددة', 'error');
      return;
    }

    try {
      const exportRows = filteredItems.map((item, index) => {
        const wDiff = item.price_wholesale - item.old_price_wholesale;
        const rDiff = item.price_retail - item.old_price_retail;

        let changeType = 'ثابت';
        if (item.is_new) changeType = 'صنف جديد مضاف 🆕';
        else if (wDiff > 0 || rDiff > 0) changeType = 'زيادة في السعر 🔺';
        else if (wDiff < 0 || rDiff < 0) changeType = 'تخفيض في السعر 🔻';

        return {
          'م': index + 1,
          'كود الصنف': item.code,
          'اسم الصنف': item.product_name,
          'حالة التغير': changeType,
          'سعر الجملة القديم': item.old_price_wholesale > 0 ? item.old_price_wholesale : '-',
          'سعر الجملة الجديد': item.price_wholesale,
          'فرق الجملة': item.is_new ? '-' : (wDiff > 0 ? `+${wDiff.toFixed(1)}` : wDiff.toFixed(1)),
          'سعر القطاعي القديم': item.old_price_retail > 0 ? item.old_price_retail : '-',
          'سعر القطاعي الجديد': item.price_retail,
          'فرق القطاعي': item.is_new ? '-' : (rDiff > 0 ? `+${rDiff.toFixed(1)}` : rDiff.toFixed(1)),
          'تاريخ التعديل': item.created_at?.split('T')[0] || ''
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(exportRows);
      worksheet['!cols'] = [
        { wch: 6 },
        { wch: 14 },
        { wch: 38 },
        { wch: 20 },
        { wch: 16 },
        { wch: 16 },
        { wch: 14 },
        { wch: 16 },
        { wch: 16 },
        { wch: 14 },
        { wch: 14 }
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'الزيادات_والنواقص');

      const dateStr = new Date().toISOString().split('T')[0];
      XLSX.writeFile(workbook, `سجل_الزيادات_والنواقص_بالكود_${dateStr}.xlsx`);
      showToast('تم تصدير ملف إكسيل فروق الأسعار بنجاح', 'success');
    } catch (err) {
      console.error(err);
      showToast('حدث خطأ أثناء تصدير ملف الإكسيل', 'error');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-4 font-sans text-slate-800 animate-in fade-in duration-150">
      {/* Top Banner */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-slate-900">
                قائمة الزيادات والنواقص بناء على الاسترداد من ملف الإكسيل بالكود
              </h2>
              <span className="text-xs font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">
                {safeItems.length} صنف
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              إذا تغير السعر، اسم الصنف بالكود يتغير. وإذا زاد أو قل أو أضيف صنف يظهر في هذه القائمة فقط دون تكرار.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onNavigateTab && (
            <button
              type="button"
              onClick={() => onNavigateTab('import')}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
              title="استيراد وتحديث ملف إكسيل جديد"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>استرداد وتحديث إكسيل</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-300"
            title="تصدير القائمة كملف إكسيل"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            <span>تصدير Excel</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-300"
            title="طباعة القائمة"
          >
            <Printer className="w-4 h-4 text-blue-600" />
            <span>طباعة</span>
          </button>

          {safeItems.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setConfirmClearChecked(false);
                setIsClearModalOpen(true);
              }}
              className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-lg flex items-center gap-1 transition-colors cursor-pointer border border-rose-200"
              title="تصفير ومسح سجل الزيادات والنواقص"
            >
              <Trash2 className="w-4 h-4 text-rose-600" />
              <span>تصفير السجل</span>
            </button>
          )}
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => setFilterType('all')}
          className={`p-3.5 rounded-xl border text-right transition-all cursor-pointer ${
            filterType === 'all'
              ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
              : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800'
          }`}
        >
          <span className={`text-xs block ${filterType === 'all' ? 'text-blue-100' : 'text-slate-500'}`}>
            إجمالي التغيرات بالكود
          </span>
          <strong className="text-xl font-mono font-black mt-1 block">
            {stats.total}
          </strong>
        </button>

        <button
          type="button"
          onClick={() => setFilterType('increase')}
          className={`p-3.5 rounded-xl border text-right transition-all cursor-pointer ${
            filterType === 'increase'
              ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
              : 'bg-white hover:bg-rose-50/50 border-rose-200 text-rose-900'
          }`}
        >
          <span className={`text-xs flex items-center gap-1 ${filterType === 'increase' ? 'text-rose-100' : 'text-rose-700'}`}>
            <TrendingUp className="w-4 h-4" />
            <span>الزيادات في الأسعار 🔺</span>
          </span>
          <strong className="text-xl font-mono font-black mt-1 block">
            {stats.increases}
          </strong>
        </button>

        <button
          type="button"
          onClick={() => setFilterType('decrease')}
          className={`p-3.5 rounded-xl border text-right transition-all cursor-pointer ${
            filterType === 'decrease'
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
              : 'bg-white hover:bg-emerald-50/50 border-emerald-200 text-emerald-900'
          }`}
        >
          <span className={`text-xs flex items-center gap-1 ${filterType === 'decrease' ? 'text-emerald-100' : 'text-emerald-700'}`}>
            <TrendingDown className="w-4 h-4" />
            <span>النواقص والتخفيضات 🔻</span>
          </span>
          <strong className="text-xl font-mono font-black mt-1 block">
            {stats.decreases}
          </strong>
        </button>

        <button
          type="button"
          onClick={() => setFilterType('new')}
          className={`p-3.5 rounded-xl border text-right transition-all cursor-pointer ${
            filterType === 'new'
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
              : 'bg-white hover:bg-indigo-50/50 border-indigo-200 text-indigo-900'
          }`}
        >
          <span className={`text-xs flex items-center gap-1 ${filterType === 'new' ? 'text-indigo-100' : 'text-indigo-700'}`}>
            <PackagePlus className="w-4 h-4" />
            <span>أصناف جديدة مضافة 🆕</span>
          </span>
          <strong className="text-xl font-mono font-black mt-1 block">
            {stats.newItems}
          </strong>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="w-full sm:flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="ابحث بالاسم أو كود الصنف لرصد تغير السعر..."
            className="w-full bg-slate-50 border border-slate-300 rounded-xl pr-10 pl-10 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-medium"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute left-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {priceChangeDays.length > 0 && (
          <div className="flex items-center gap-1.5 shrink-0 w-full sm:w-auto">
            <Calendar className="w-4 h-4 text-slate-400" />
            <select
              value={selectedDayId}
              onChange={e => setSelectedDayId(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800"
            >
              <option value="all">جميع دفعات الاسترداد والتحديث</option>
              {priceChangeDays.map(day => (
                <option key={day.id} value={day.id}>
                  {day.title || day.day_date}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-800 text-white font-bold text-[11px]">
              <tr>
                <th className="py-3 px-3 text-center w-12">م</th>
                <th className="py-3 px-3 w-28">كود الصنف</th>
                <th className="py-3 px-3">اسم الصنف</th>
                <th className="py-3 px-3 text-center w-28">حالة السعر</th>
                <th className="py-3 px-3 text-left w-24">جملة قديم</th>
                <th className="py-3 px-3 text-left w-24">جملة جديد</th>
                <th className="py-3 px-3 text-left w-24">فرق الجملة</th>
                <th className="py-3 px-3 text-left w-24">قطاعي قديم</th>
                <th className="py-3 px-3 text-left w-24">قطاعي جديد</th>
                <th className="py-3 px-3 text-left w-24">فرق القطاعي</th>
                <th className="py-3 px-3 text-center w-28">تاريخ التحديث</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400">
                    <TrendingUp className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                    <p className="font-bold text-sm text-slate-700">لا توجد تغيرات أسعار مطابقة للبحث أو التصفية الحالية</p>
                    <p className="text-xs text-slate-500 mt-1">
                      عند استرداد أي ملف إكسيل جديد بالكود، ستظهر جميع الزيادات والنواقص والجديد هنا تلقائياً.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredItems.map((item, index) => {
                  const wDiff = item.price_wholesale - item.old_price_wholesale;
                  const rDiff = item.price_retail - item.old_price_retail;

                  return (
                    <tr key={item.id} className="hover:bg-blue-50/50 transition-colors">
                      <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px]">
                        {index + 1}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                        <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded border border-slate-200">
                          #{item.code}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-900">
                        {item.product_name}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {item.is_new ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-50 text-indigo-700 border border-indigo-200">
                            صنف جديد 🆕
                          </span>
                        ) : (wDiff > 0 || rDiff > 0) ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-50 text-rose-700 border border-rose-200">
                            زيادة سعر 🔺
                          </span>
                        ) : (wDiff < 0 || rDiff < 0) ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                            نقصان سعر 🔻
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">سعر ثابت</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-left font-mono text-slate-500">
                        {item.old_price_wholesale > 0 ? `${item.old_price_wholesale} ج.م` : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-left font-mono font-bold text-slate-900">
                        {item.price_wholesale} ج.م
                      </td>
                      <td className="py-2.5 px-3 text-left font-mono font-bold">
                        {item.is_new ? (
                          <span className="text-slate-400">-</span>
                        ) : wDiff > 0 ? (
                          <span className="text-rose-600">+{wDiff.toFixed(1)}</span>
                        ) : wDiff < 0 ? (
                          <span className="text-emerald-600">{wDiff.toFixed(1)}</span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-left font-mono text-slate-500">
                        {item.old_price_retail > 0 ? `${item.old_price_retail} ج.م` : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-left font-mono font-bold text-blue-700">
                        {item.price_retail} ج.م
                      </td>
                      <td className="py-2.5 px-3 text-left font-mono font-bold">
                        {item.is_new ? (
                          <span className="text-slate-400">-</span>
                        ) : rDiff > 0 ? (
                          <span className="text-rose-600">+{rDiff.toFixed(1)}</span>
                        ) : rDiff < 0 ? (
                          <span className="text-emerald-600">{rDiff.toFixed(1)}</span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono text-slate-500 text-[11px]">
                        {item.created_at?.split('T')[0] || ''}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="p-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between">
          <span>سجل الأسعار مربوط آلياً مع دليل الأصناف واسترداد الإكسيل</span>
          <span className="font-bold text-slate-700">عدد السجلات المعروضة: {filteredItems.length}</span>
        </div>
      </div>

      {/* Clear Confirmation Modal */}
      {isClearModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-md shadow-xl overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="p-4 bg-rose-600 text-white flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Trash2 className="w-4 h-4" />
                تأكيد تصفير سجل الزيادة والنقصان
              </h3>
              <button 
                type="button"
                onClick={() => setIsClearModalOpen(false)}
                className="text-white/80 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <p className="text-slate-700 leading-relaxed">
                هل أنت متأكد من رغبتك في تصفير سجل وتاريخ الزيادة والنقصان في الأسعار؟ هذا الإجراء سيفرغ السجل التاريخي دون حذف أصنافك أو أسعارها الحالية في المخزن.
              </p>

              <label className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmClearChecked}
                  onChange={e => setConfirmClearChecked(e.target.checked)}
                  className="rounded text-rose-600 w-4 h-4"
                />
                <span className="font-bold text-slate-800">أؤكد رغبتي في مسح وتصفير السجل</span>
              </label>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsClearModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  disabled={!confirmClearChecked}
                  onClick={() => {
                    clearPriceChanges();
                    setIsClearModalOpen(false);
                  }}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white font-bold rounded-lg"
                >
                  تأكيد التصفير
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

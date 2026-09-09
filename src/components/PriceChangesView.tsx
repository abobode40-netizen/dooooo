import React, { useState, useMemo } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Plus, 
  Calendar, 
  Search, 
  Sparkles, 
  ArrowRight, 
  X, 
  Check, 
  Layers,
  Printer,
  Download,
  Filter,
  Percent,
  FileSpreadsheet,
  PackagePlus
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { PriceChangeDay, PriceChangeItem, Product } from '../types';
import { exportPriceChangesToExcel } from '../utils/productImportExport';

export const PriceChangesView: React.FC = () => {
  const { 
    priceChangeDays, 
    priceChangeItems, 
    products, 
    recordPriceChangeDay, 
    showToast 
  } = useApp();

  const [selectedDayId, setSelectedDayId] = useState<string>('all');
  const [filterType, setFilterType] = useState<'all' | 'increase' | 'decrease' | 'new'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State for manual price update batch
  const [newDayDate, setNewDayDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [editedPrices, setEditedPrices] = useState<Record<string, { wholesale: number; retail: number }>>({});
  const [formSearch, setFormSearch] = useState('');

  // Active day filter
  const activeDay = useMemo(() => {
    if (selectedDayId === 'all') return null;
    return priceChangeDays.find(d => d.id === selectedDayId) || null;
  }, [priceChangeDays, selectedDayId]);

  // Filtered Items
  const filteredItems = useMemo(() => {
    return priceChangeItems.filter(item => {
      // Day filter
      if (selectedDayId !== 'all' && item.day_id !== selectedDayId) return false;

      // Type filter
      const wholesaleDiff = (item.price_wholesale || 0) - (item.old_price_wholesale || 0);
      const retailDiff = (item.price_retail || 0) - (item.old_price_retail || 0);

      if (filterType === 'new') {
        if (!item.is_new) return false;
      } else if (filterType === 'increase') {
        if (item.is_new || (wholesaleDiff <= 0 && retailDiff <= 0)) return false;
      } else if (filterType === 'decrease') {
        if (item.is_new || (wholesaleDiff >= 0 && retailDiff >= 0)) return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = item.product_name.toLowerCase().includes(q);
        const matchCode = item.code?.toLowerCase().includes(q);
        if (!matchName && !matchCode) return false;
      }

      return true;
    });
  }, [priceChangeItems, selectedDayId, filterType, searchQuery]);

  // Statistics across current view or all
  const stats = useMemo(() => {
    const baseItems = selectedDayId === 'all' 
      ? priceChangeItems 
      : priceChangeItems.filter(i => i.day_id === selectedDayId);

    let increases = 0;
    let decreases = 0;
    let newItems = 0;

    baseItems.forEach(i => {
      if (i.is_new) {
        newItems++;
      } else {
        const wDiff = (i.price_wholesale || 0) - (i.old_price_wholesale || 0);
        const rDiff = (i.price_retail || 0) - (i.old_price_retail || 0);
        if (wDiff > 0 || rDiff > 0) increases++;
        else if (wDiff < 0 || rDiff < 0) decreases++;
      }
    });

    return {
      total: baseItems.length,
      increases,
      decreases,
      newItems
    };
  }, [priceChangeItems, selectedDayId]);

  // Products available to edit in manual modal
  const selectableProducts = useMemo(() => {
    return products.filter(p =>
      !formSearch ||
      p.name.toLowerCase().includes(formSearch.toLowerCase()) ||
      p.code.toLowerCase().includes(formSearch.toLowerCase())
    );
  }, [products, formSearch]);

  const toggleSelectProduct = (p: Product) => {
    if (selectedProductIds.includes(p.id)) {
      setSelectedProductIds(prev => prev.filter(id => id !== p.id));
      setEditedPrices(prev => {
        const next = { ...prev };
        delete next[p.id];
        return next;
      });
    } else {
      setSelectedProductIds(prev => [...prev, p.id]);
      setEditedPrices(prev => ({
        ...prev,
        [p.id]: {
          wholesale: p.price_wholesale,
          retail: p.price
        }
      }));
    }
  };

  const handlePriceFieldChange = (productId: string, field: 'wholesale' | 'retail', value: number) => {
    setEditedPrices(prev => ({
      ...prev,
      [productId]: {
        wholesale: field === 'wholesale' ? value : prev[productId]?.wholesale || 0,
        retail: field === 'retail' ? value : prev[productId]?.retail || 0
      }
    }));
  };

  const handleSubmitBatch = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedProductIds.length === 0) {
      showToast('يرجى اختيار صنف واحد على الأقل لتعديل سعره', 'error');
      return;
    }

    const changes = selectedProductIds.map(pId => {
      const prod = products.find(p => p.id === pId)!;
      const edits = editedPrices[pId] || { wholesale: prod.price_wholesale, retail: prod.price };
      return {
        productId: prod.id,
        productName: prod.name,
        code: prod.code,
        newWholesale: edits.wholesale,
        newRetail: edits.retail,
        oldWholesale: prod.price_wholesale,
        oldRetail: prod.price,
        isNew: false
      };
    });

    recordPriceChangeDay(newDayDate, changes);
    setSelectedProductIds([]);
    setEditedPrices({});
    setIsModalOpen(false);
  };

  // Export to CSV / Excel
  const handleExportChanges = () => {
    if (filteredItems.length === 0) {
      showToast('لا توجد بيانات لتصديرها في القائمة المحددة', 'error');
      return;
    }

    const exportRows = filteredItems.map(item => {
      const wDiff = (item.price_wholesale || 0) - (item.old_price_wholesale || 0);
      const rDiff = (item.price_retail || 0) - (item.old_price_retail || 0);
      let changeType = 'تعديل سعر';
      if (item.is_new) changeType = 'صنف جديد مضاف';
      else if (wDiff > 0 || rDiff > 0) changeType = 'زيادة في السعر 🔺';
      else if (wDiff < 0 || rDiff < 0) changeType = 'تخفيض في السعر 🔻';

      return {
        'كود الصنف': item.code,
        'اسم الصنف': item.product_name,
        'نوع التغير': changeType,
        'سعر الجملة القديم': item.old_price_wholesale,
        'سعر الجملة الجديد': item.price_wholesale,
        'فرق الجملة': wDiff,
        'سعر القطاعي القديم': item.old_price_retail,
        'سعر القطاعي الجديد': item.price_retail,
        'فرق القطاعي': rDiff,
        'تاريخ التعديل': item.created_at?.split('T')[0] || ''
      };
    });

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + 
      Object.keys(exportRows[0]).join(",") + "\n" +
      exportRows.map(e => Object.values(e).map(val => `"${val}"`).join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `تقرير_فروق_الأسعار_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('تم تصدير ملف فروق الأسعار بنجاح');
  };

  return (
    <div className="space-y-4 font-sans text-slate-800 animate-in fade-in duration-150">
      {/* Top Header Card */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              قائمة الزيادة والنقصان في الأسعار
            </h2>
            <p className="text-xs text-slate-500">
              سجل مفصل يوثق كافة الزيادات والتخفيضات الناتجة عن استرداد الإكسيل والتعديلات اليدوية
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportChanges}
            disabled={filteredItems.length === 0}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-800 text-xs font-bold rounded-lg border border-slate-300 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            تصدير الفروق (Excel)
          </button>

          <button
            onClick={() => window.print()}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
          >
            <Printer className="w-4 h-4 text-blue-400" />
            طباعة القائمة
          </button>

          <button
            onClick={() => {
              setSelectedProductIds([]);
              setEditedPrices({});
              setIsModalOpen(true);
            }}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
          >
            <Plus className="w-4 h-4" />
            تعديل أسعار يدوي
          </button>
        </div>
      </div>

      {/* 4 Crisp Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        {/* Total Changes */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-slate-500 block text-[11px]">إجمالي سجلات الأسعار</span>
            <span className="text-lg font-black text-slate-900">{stats.total} صنف</span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
            <Layers className="w-4 h-4" />
          </div>
        </div>

        {/* Increases */}
        <div className="bg-white p-3.5 rounded-xl border border-rose-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-rose-600 font-bold block text-[11px]">أصناف زاد سعرها (🔺 زيادة)</span>
            <span className="text-lg font-black text-rose-700">{stats.increases} صنف</span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center text-rose-600">
            <TrendingUp className="w-4 h-4" />
          </div>
        </div>

        {/* Decreases */}
        <div className="bg-white p-3.5 rounded-xl border border-emerald-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-emerald-700 font-bold block text-[11px]">أصناف انخفض سعرها (🔻 نقصان)</span>
            <span className="text-lg font-black text-emerald-800">{stats.decreases} صنف</span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-700">
            <TrendingDown className="w-4 h-4" />
          </div>
        </div>

        {/* New Products */}
        <div className="bg-white p-3.5 rounded-xl border border-blue-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-blue-700 font-bold block text-[11px]">أصناف جديدة مضافة (🆕)</span>
            <span className="text-lg font-black text-blue-800">{stats.newItems} صنف</span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-700">
            <PackagePlus className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Filter and Search Bar */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Quick Filter Buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                filterType === 'all' ? 'bg-slate-800 text-white shadow-xs' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
            >
              جميع التغييرات ({stats.total})
            </button>
            <button
              onClick={() => setFilterType('increase')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                filterType === 'increase' ? 'bg-rose-600 text-white shadow-xs' : 'bg-white border border-slate-300 text-rose-700 hover:bg-rose-50'
              }`}
            >
              🔺 الزيادات فقط ({stats.increases})
            </button>
            <button
              onClick={() => setFilterType('decrease')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                filterType === 'decrease' ? 'bg-emerald-700 text-white shadow-xs' : 'bg-white border border-slate-300 text-emerald-800 hover:bg-emerald-50'
              }`}
            >
              🔻 النقصان فقط ({stats.decreases})
            </button>
            <button
              onClick={() => setFilterType('new')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                filterType === 'new' ? 'bg-blue-600 text-white shadow-xs' : 'bg-white border border-slate-300 text-blue-700 hover:bg-blue-50'
              }`}
            >
              🆕 أصناف جديدة ({stats.newItems})
            </button>
          </div>

          {/* Search & Date Selector */}
          <div className="flex items-center gap-2 flex-1 max-w-md justify-end">
            <select
              value={selectedDayId}
              onChange={e => setSelectedDayId(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-600"
            >
              <option value="all">كافة تواريخ الاسترداد ({priceChangeDays.length} دفعة)</option>
              {priceChangeDays.map(day => (
                <option key={day.id} value={day.id}>
                  تحديث: {day.day_date}
                </option>
              ))}
            </select>

            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="بحث في الأصناف..."
                className="w-full bg-white border border-slate-300 rounded-lg pr-8 pl-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-blue-600"
              />
            </div>
          </div>
        </div>

        {/* Detailed High-Contrast White Table */}
        <div className="overflow-x-auto min-h-[300px]">
          <table className="w-full text-right border-collapse text-xs">
            <thead>
              <tr className="bg-slate-800 text-white font-bold border-b border-slate-700 text-[11px]">
                <th className="py-2.5 px-3 text-center w-12">م</th>
                <th className="py-2.5 px-3 text-center w-28">كود الصنف</th>
                <th className="py-2.5 px-4">اسم الصنف</th>
                <th className="py-2.5 px-3 text-center w-32">حالة التغير</th>
                <th className="py-2.5 px-3 text-center">جملة قديم</th>
                <th className="py-2.5 px-3 text-center">جملة جديد</th>
                <th className="py-2.5 px-3 text-center">فرق الجملة</th>
                <th className="py-2.5 px-3 text-center">قطاعي قديم</th>
                <th className="py-2.5 px-3 text-center">قطاعي جديد</th>
                <th className="py-2.5 px-3 text-center">فرق القطاعي</th>
                <th className="py-2.5 px-3 text-center w-28">تاريخ التعديل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400">
                    <TrendingUp className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                    <p className="font-bold text-slate-600 text-sm">لا توجد تغيرات أسعار مسجلة في هذا التحديد</p>
                    <p className="text-xs text-slate-400">
                      عند استرداد ملف إكسيل أو تعديل الأسعار، ستظهر الفروق بالتفصيل هنا فوراً
                    </p>
                  </td>
                </tr>
              ) : (
                filteredItems.map((item, index) => {
                  const wDiff = (item.price_wholesale || 0) - (item.old_price_wholesale || 0);
                  const rDiff = (item.price_retail || 0) - (item.old_price_retail || 0);
                  const isNew = item.is_new;
                  const isIncrease = !isNew && (wDiff > 0 || rDiff > 0);
                  const isDecrease = !isNew && (wDiff < 0 || rDiff < 0);

                  return (
                    <tr
                      key={`${item.id}-${index}`}
                      className={`hover:bg-slate-50 transition-colors ${
                        index % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                      }`}
                    >
                      {/* م */}
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-500 text-xs">
                        {index + 1}
                      </td>

                      {/* كود الصنف */}
                      <td className="py-2.5 px-3 text-center">
                        <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono font-bold text-slate-700 text-xs">
                          {item.code}
                        </span>
                      </td>

                      {/* اسم الصنف */}
                      <td className="py-2.5 px-4 font-bold text-slate-900">
                        {item.product_name}
                      </td>

                      {/* حالة التغير */}
                      <td className="py-2.5 px-3 text-center">
                        {isNew ? (
                          <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold border border-blue-200 text-[11px]">
                            🆕 صنف جديد مضاف
                          </span>
                        ) : isIncrease ? (
                          <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 font-bold border border-rose-200 text-[11px] flex items-center justify-center gap-1">
                            <TrendingUp className="w-3 h-3" />
                            ارتفاع في السعر
                          </span>
                        ) : isDecrease ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold border border-emerald-200 text-[11px] flex items-center justify-center gap-1">
                            <TrendingDown className="w-3 h-3" />
                            تخفيض في السعر
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-bold text-[11px]">
                            ثابت دون تغيير
                          </span>
                        )}
                      </td>

                      {/* جملة قديم */}
                      <td className="py-2.5 px-3 text-center text-slate-500 font-mono">
                        {item.old_price_wholesale > 0 ? `${item.old_price_wholesale} ج.م` : '-'}
                      </td>

                      {/* جملة جديد */}
                      <td className="py-2.5 px-3 text-center font-bold text-slate-900 font-mono">
                        {item.price_wholesale} ج.م
                      </td>

                      {/* فرق الجملة */}
                      <td className="py-2.5 px-3 text-center font-bold font-mono">
                        {isNew ? (
                          <span className="text-slate-400">-</span>
                        ) : wDiff > 0 ? (
                          <span className="text-rose-600">+{wDiff.toFixed(1)} ج.م</span>
                        ) : wDiff < 0 ? (
                          <span className="text-emerald-700">{wDiff.toFixed(1)} ج.م</span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>

                      {/* قطاعي قديم */}
                      <td className="py-2.5 px-3 text-center text-slate-500 font-mono">
                        {item.old_price_retail > 0 ? `${item.old_price_retail} ج.م` : '-'}
                      </td>

                      {/* قطاعي جديد */}
                      <td className="py-2.5 px-3 text-center font-bold text-slate-900 font-mono">
                        {item.price_retail} ج.م
                      </td>

                      {/* فرق القطاعي */}
                      <td className="py-2.5 px-3 text-center font-bold font-mono">
                        {isNew ? (
                          <span className="text-slate-400">-</span>
                        ) : rDiff > 0 ? (
                          <span className="text-rose-600">+{rDiff.toFixed(1)} ج.م</span>
                        ) : rDiff < 0 ? (
                          <span className="text-emerald-700">{rDiff.toFixed(1)} ج.م</span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>

                      {/* تاريخ التعديل */}
                      <td className="py-2.5 px-3 text-center text-slate-500 font-mono text-[11px]">
                        {item.created_at?.split('T')[0] || '-'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual Price Change Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 w-full max-w-3xl shadow-xl overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-400" />
                تسجيل دفعة تعديل أسعار يدوية
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white text-xs font-bold px-2 py-1"
              >
                إغلاق (Esc)
              </button>
            </div>

            <form onSubmit={handleSubmitBatch} className="p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">تاريخ دفعة التعديل</label>
                  <input
                    type="date"
                    value={newDayDate}
                    onChange={e => setNewDayDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-bold focus:outline-none focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">بحث في قائمة الأصناف</label>
                  <input
                    type="text"
                    value={formSearch}
                    onChange={e => setFormSearch(e.target.value)}
                    placeholder="ابحث بالاسم أو الكود..."
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="border border-slate-200 rounded-lg max-h-60 overflow-y-auto divide-y divide-slate-100 text-xs">
                {selectableProducts.slice(0, 20).map(prod => {
                  const isChecked = selectedProductIds.includes(prod.id);
                  const currentEdits = editedPrices[prod.id] || {
                    wholesale: prod.price_wholesale,
                    retail: prod.price
                  };

                  return (
                    <div
                      key={prod.id}
                      className={`p-2.5 flex items-center justify-between gap-3 ${
                        isChecked ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectProduct(prod)}
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                        />
                        <span className="font-mono font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">
                          {prod.code}
                        </span>
                        <span className="font-bold text-slate-900">{prod.name}</span>
                      </div>

                      {isChecked && (
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1">
                            <span className="text-[11px] text-slate-500">جملة:</span>
                            <input
                              type="number"
                              step="0.5"
                              value={currentEdits.wholesale}
                              onChange={e => handlePriceFieldChange(prod.id, 'wholesale', Number(e.target.value))}
                              className="w-20 bg-white border border-slate-300 rounded px-2 py-1 text-center font-bold text-slate-900"
                            />
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-[11px] text-slate-500">قطاعي:</span>
                            <input
                              type="number"
                              step="0.5"
                              value={currentEdits.retail}
                              onChange={e => handlePriceFieldChange(prod.id, 'retail', Number(e.target.value))}
                              className="w-20 bg-white border border-slate-300 rounded px-2 py-1 text-center font-bold text-slate-900"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <span className="text-xs text-slate-500">
                  تم تحديد {selectedProductIds.length} صنف لتعديل أسعارهم
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={selectedProductIds.length === 0}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-sm"
                  >
                    حفظ وتوثيق التعديلات
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

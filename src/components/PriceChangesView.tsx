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
  Layers
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { PriceChangeDay, PriceChangeItem, Product } from '../types';

export const PriceChangesView: React.FC = () => {
  const { priceChangeDays, priceChangeItems, products, recordPriceChangeDay, showToast } = useApp();
  const [selectedDayId, setSelectedDayId] = useState<string>(
    priceChangeDays[0]?.id || ''
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Form State for new price update batch
  const [newDayDate, setNewDayDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [editedPrices, setEditedPrices] = useState<Record<string, { wholesale: number; retail: number }>>({});
  const [formSearch, setFormSearch] = useState('');

  const activeDay = useMemo(() => {
    return priceChangeDays.find(d => d.id === selectedDayId) || priceChangeDays[0] || null;
  }, [priceChangeDays, selectedDayId]);

  const itemsForDay = useMemo(() => {
    if (!activeDay) return [];
    return priceChangeItems.filter(item => {
      const matchDay = item.day_id === activeDay.id;
      const matchSearch =
        !searchQuery ||
        item.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.code.toLowerCase().includes(searchQuery.toLowerCase());
      return matchDay && matchSearch;
    });
  }, [priceChangeItems, activeDay, searchQuery]);

  // Products available to edit in modal
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-800/80 rounded-2xl p-5 border border-slate-700 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-amber-400" />
            سجل حركة وتغيرات الأسعار
          </h2>
          <p className="text-xs text-slate-400">توثيق ومتابعة جميع تقلبات أسعار الجملة والقطاعي عبر الأيام</p>
        </div>

        <button
          onClick={() => {
            setSelectedProductIds([]);
            setEditedPrices({});
            setIsModalOpen(true);
          }}
          className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-500/20 transition-all flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          تسجيل تحديث أسعار جديد
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Dates Sidebar */}
        <div className="lg:col-span-4 bg-slate-800/80 rounded-2xl p-4 border border-slate-700 shadow-xl space-y-3">
          <h3 className="text-xs font-bold text-slate-300 flex items-center gap-2 pb-2 border-b border-slate-700">
            <Calendar className="w-4 h-4 text-amber-400" />
            أيام تعديل الأسعار ({priceChangeDays.length} يوم)
          </h3>

          <div className="space-y-1.5 max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
            {priceChangeDays.map(day => {
              const isSelected = activeDay?.id === day.id;
              const countInDay = priceChangeItems.filter(i => i.day_id === day.id).length;

              return (
                <div
                  key={day.id}
                  onClick={() => setSelectedDayId(day.id)}
                  className={`cursor-pointer rounded-xl p-3 border transition-all flex items-center justify-between ${
                    isSelected
                      ? 'bg-amber-500/10 border-amber-500/60 shadow-md'
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                        isSelected ? 'bg-amber-500 text-slate-950 font-black' : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      <TrendingUp className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className={`text-xs font-bold ${isSelected ? 'text-amber-400' : 'text-slate-200'}`}>
                        {day.day_date}
                      </h4>
                      <p className="text-[10px] text-slate-400">
                        {countInDay} صنف تم تعديل سعره
                      </p>
                    </div>
                  </div>

                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                    {countInDay} صنف
                  </span>
                </div>
              );
            })}

            {priceChangeDays.length === 0 && (
              <p className="text-xs text-slate-500 text-center py-6">لا توجد سجلات تعديل أسعار</p>
            )}
          </div>
        </div>

        {/* Changes Table for Selected Day */}
        <div className="lg:col-span-8 bg-slate-800/80 rounded-2xl p-5 border border-slate-700 shadow-xl space-y-4">
          {activeDay ? (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-700">
                <div>
                  <span className="text-xs px-2.5 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40">
                    تعديلات يوم: {activeDay.day_date}
                  </span>
                  <p className="text-xs text-slate-400 mt-1">
                    عدد الأصناف المعدلة: <strong className="text-white">{itemsForDay.length}</strong> صنف
                  </p>
                </div>

                <div className="relative w-full sm:w-60">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="ابحث في أصناف هذا اليوم..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl pr-9 pl-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Price Changes Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900/90 text-slate-400 font-semibold border-b border-slate-700">
                      <th className="py-2.5 px-3">الكود</th>
                      <th className="py-2.5 px-3">اسم الصنف</th>
                      <th className="py-2.5 px-3">سعر الجملة (القديم ➔ الجديد)</th>
                      <th className="py-2.5 px-3">سعر القطاعي (القديم ➔ الجديد)</th>
                      <th className="py-2.5 px-3 text-center">الفرق</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {itemsForDay.map(item => {
                      const wholesaleDiff = item.price_wholesale - item.old_price_wholesale;
                      const retailDiff = item.price_retail - item.old_price_retail;

                      return (
                        <tr key={item.id} className="hover:bg-slate-700/30 transition-colors">
                          <td className="py-3 px-3 font-mono font-bold text-amber-400">
                            #{item.code}
                          </td>
                          <td className="py-3 px-3 font-bold text-slate-100">
                            {item.product_name}
                            {item.is_new && (
                              <span className="mr-1.5 px-1.5 py-0.5 text-[9px] rounded bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/40">
                                صنف جديد
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-500 line-through">
                                {item.old_price_wholesale}
                              </span>
                              <span className="text-slate-400 font-mono">➔</span>
                              <span className="font-bold text-amber-300 font-mono">
                                {item.price_wholesale} ج.م
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-500 line-through">
                                {item.old_price_retail}
                              </span>
                              <span className="text-slate-400 font-mono">➔</span>
                              <span className="font-bold text-emerald-400 font-mono">
                                {item.price_retail} ج.م
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-center">
                            {wholesaleDiff > 0 ? (
                              <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-rose-400">
                                <TrendingUp className="w-3.5 h-3.5" />
                                +{wholesaleDiff} ج.م
                              </span>
                            ) : wholesaleDiff < 0 ? (
                              <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-emerald-400">
                                <TrendingDown className="w-3.5 h-3.5" />
                                {wholesaleDiff} ج.م
                              </span>
                            ) : (
                              <span className="text-slate-500 text-[10px]">ثابت</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}

                    {itemsForDay.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-slate-400">
                          لا توجد تعديلات مسجلة أو مطابقة للبحث في هذا اليوم
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="py-16 text-center text-slate-400">
              يرجى اختيار يوم لعرض تغيرات الأسعار
            </div>
          )}
        </div>
      </div>

      {/* Record New Price Change Batch Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between p-4 bg-slate-800 border-b border-slate-700">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-amber-400" />
                تسجيل تحديث أسعار أصناف (دفعة يومية)
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitBatch} className="p-5 flex-1 overflow-y-auto space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">تاريخ التحديث</label>
                <input
                  type="date"
                  required
                  value={newDayDate}
                  onChange={e => setNewDayDate(e.target.value)}
                  className="w-full sm:w-48 bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  اختر الأصناف المراد تعديل أسعارها:
                </label>
                <div className="relative mb-2">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={formSearch}
                    onChange={e => setFormSearch(e.target.value)}
                    placeholder="ابحث في الأصناف لإضافتها للتعديل..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl pr-9 pl-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="max-h-36 overflow-y-auto space-y-1 border border-slate-800 rounded-xl p-1 bg-slate-950/60">
                  {selectableProducts.slice(0, 30).map(p => {
                    const isSelected = selectedProductIds.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => toggleSelectProduct(p)}
                        className={`w-full text-right p-2 rounded-lg text-xs flex items-center justify-between transition-colors ${
                          isSelected
                            ? 'bg-amber-500 text-slate-950 font-bold'
                            : 'hover:bg-slate-800 text-slate-200'
                        }`}
                      >
                        <span className="truncate">{p.name}</span>
                        <div className="flex items-center gap-2 text-[10px]">
                          <span>جملة: {p.price_wholesale} | قطاعي: {p.price}</span>
                          <span className="font-mono">#{p.code}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Selected Items Price Editor */}
              {selectedProductIds.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <label className="text-xs font-bold text-amber-400 block">
                    الأصناف المختارة للتعديل ({selectedProductIds.length} صنف):
                  </label>

                  <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                    {selectedProductIds.map(pId => {
                      const prod = products.find(p => p.id === pId)!;
                      const edits = editedPrices[pId] || { wholesale: prod.price_wholesale, retail: prod.price };

                      return (
                        <div
                          key={pId}
                          className="bg-slate-800/80 rounded-xl p-3 border border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                        >
                          <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-slate-100 truncate">{prod.name}</h4>
                            <span className="text-[10px] text-slate-400">
                              السابق: جملة {prod.price_wholesale} ج.م | قطاعي {prod.price} ج.م
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <div>
                              <label className="text-[10px] text-amber-400 block mb-0.5 font-bold">سعر جملة جديد:</label>
                              <input
                                type="number"
                                step="any"
                                value={edits.wholesale}
                                onChange={e => handlePriceFieldChange(pId, 'wholesale', parseFloat(e.target.value) || 0)}
                                className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-bold text-right focus:outline-none focus:border-amber-500"
                              />
                            </div>

                            <div>
                              <label className="text-[10px] text-emerald-400 block mb-0.5 font-bold">سعر قطاعي جديد:</label>
                              <input
                                type="number"
                                step="any"
                                value={edits.retail}
                                onChange={e => handlePriceFieldChange(pId, 'retail', parseFloat(e.target.value) || 0)}
                                className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-bold text-right focus:outline-none focus:border-emerald-500"
                              />
                            </div>

                            <button
                              type="button"
                              onClick={() => toggleSelectProduct(prod)}
                              className="text-slate-500 hover:text-rose-400 p-1 mt-3"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-3 border-t border-slate-800">
                <button
                  type="submit"
                  disabled={selectedProductIds.length === 0}
                  className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-bold text-xs rounded-xl transition-colors"
                >
                  اعتماد وتحديث الأسعار
                </button>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-800 text-slate-300 text-xs rounded-xl font-semibold hover:bg-slate-700 transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

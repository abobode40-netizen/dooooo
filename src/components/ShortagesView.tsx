import React, { useState, useMemo } from 'react';
import { 
  AlertTriangle, 
  Plus, 
  CheckCircle2, 
  Circle, 
  Trash2, 
  Calendar, 
  Copy, 
  Share2, 
  Search, 
  Check, 
  X,
  FileSpreadsheet,
  Layers
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ShortageList, ShortageItem } from '../types';

export const ShortagesView: React.FC = () => {
  const { 
    shortageLists, 
    shortageItems, 
    products, 
    createShortageList, 
    deleteShortageList, 
    addShortageItem, 
    toggleShortageItemArrived, 
    deleteShortageItem,
    showToast
  } = useApp();

  const [selectedListId, setSelectedListId] = useState<string>(
    shortageLists[0]?.id || ''
  );
  const [newListDate, setNewListDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [isAddListModalOpen, setIsAddListModalOpen] = useState(false);
  const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);

  // New Item Form
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [customItemName, setCustomItemName] = useState('');
  const [itemNotes, setItemNotes] = useState('');
  const [productSearch, setProductSearch] = useState('');

  // Selected List
  const activeList = useMemo(() => {
    return shortageLists.find(l => l.id === selectedListId) || shortageLists[0] || null;
  }, [shortageLists, selectedListId]);

  // Items for selected list
  const currentItems = useMemo(() => {
    if (!activeList) return [];
    return shortageItems.filter(item => item.list_id === activeList.id);
  }, [shortageItems, activeList]);

  // Statistics
  const totalInList = currentItems.length;
  const arrivedCount = currentItems.filter(i => i.arrived).length;
  const pendingCount = totalInList - arrivedCount;

  // Filtered products for modal picker
  const filteredProducts = useMemo(() => {
    if (!productSearch) return products.slice(0, 15);
    return products.filter(p =>
      p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.code.toLowerCase().includes(productSearch.toLowerCase())
    ).slice(0, 20);
  }, [products, productSearch]);

  const handleCreateList = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListDate) return;
    const id = createShortageList(newListDate);
    setSelectedListId(id);
    setIsAddListModalOpen(false);
  };

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeList) return;

    let nameToAdd = customItemName.trim();
    let pId: string | null = null;

    if (selectedProductId) {
      const prod = products.find(p => p.id === selectedProductId);
      if (prod) {
        nameToAdd = prod.name;
        pId = prod.id;
      }
    }

    if (!nameToAdd) {
      showToast('يرجى اختيار صنف أو كتابة اسم الصنف الناقص', 'error');
      return;
    }

    addShortageItem(activeList.id, nameToAdd, itemNotes.trim(), pId);
    setSelectedProductId('');
    setCustomItemName('');
    setItemNotes('');
    setProductSearch('');
    setIsAddItemModalOpen(false);
  };

  const copyForWhatsApp = () => {
    if (!activeList || currentItems.length === 0) {
      showToast('لا توجد نواقص في القائمة لنسخها', 'info');
      return;
    }

    const unreceived = currentItems.filter(i => !i.arrived);
    let text = `📋 *قائمة طلب النواقص - ${activeList.list_date}*\n`;
    text += `إجمالي الأصناف المطلوبة: ${unreceived.length}\n`;
    text += `------------------------------------\n`;
    unreceived.forEach((item, idx) => {
      text += `${idx + 1}. ${item.product_name}${item.notes ? ` (${item.notes})` : ''}\n`;
    });
    text += `------------------------------------\nيرجى تجهيز الطلب وإرساله. شكراً.`;

    navigator.clipboard.writeText(text);
    showToast('تم نسخ تقرير النواقص إلى الحافظة بنجاح، يمكنك لصقه في واتساب للموردين');
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-slate-800/80 rounded-2xl p-5 border border-slate-700 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            سجل وقوائم النواقص اليومية
          </h2>
          <p className="text-xs text-slate-400">متابعة البضائع الناقصة وتحديد الأصناف التي تم استلامها وتوريدها</p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setIsAddListModalOpen(true)}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-100 font-bold text-xs rounded-xl transition-all flex items-center gap-2 border border-slate-600"
          >
            <Calendar className="w-4 h-4 text-amber-400" />
            إنشاء قائمة تاريخ جديد
          </button>

          {activeList && (
            <>
              <button
                onClick={() => setIsAddItemModalOpen(true)}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-500/20 transition-all flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                إضافة صنف ناقص
              </button>

              <button
                onClick={copyForWhatsApp}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition-all flex items-center gap-2 shadow-md shadow-emerald-600/20"
                title="نسخ نص التقرير لإرساله للتاجر أو المندوب عبر واتساب"
              >
                <Share2 className="w-4 h-4" />
                نسخ للموردين (واتساب)
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Date Lists Sidebar */}
        <div className="lg:col-span-4 bg-slate-800/80 rounded-2xl p-4 border border-slate-700 shadow-xl space-y-3">
          <h3 className="text-xs font-bold text-slate-300 flex items-center gap-2 pb-2 border-b border-slate-700">
            <Calendar className="w-4 h-4 text-amber-400" />
            تواريخ قوائم النواقص ({shortageLists.length})
          </h3>

          <div className="space-y-1.5 max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
            {shortageLists.map(list => {
              const isSelected = activeList?.id === list.id;
              const itemsInList = shortageItems.filter(i => i.list_id === list.id);
              const pendingInList = itemsInList.filter(i => !i.arrived).length;

              return (
                <div
                  key={list.id}
                  onClick={() => setSelectedListId(list.id)}
                  className={`cursor-pointer rounded-xl p-3 border transition-all flex items-center justify-between group ${
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
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className={`text-xs font-bold ${isSelected ? 'text-amber-400' : 'text-slate-200'}`}>
                        {list.list_date}
                      </h4>
                      <p className="text-[10px] text-slate-400">
                        {itemsInList.length} صنف مسجل
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {pendingInList > 0 ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        {pendingInList} معلق
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        مكتمل
                      </span>
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`هل أنت متأكد من حذف قائمة نواقص ${list.list_date}؟`)) {
                          deleteShortageList(list.id);
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-rose-500/20 hover:text-rose-400 text-slate-500 transition-all"
                      title="حذف القائمة"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}

            {shortageLists.length === 0 && (
              <p className="text-xs text-slate-500 text-center py-6">لا توجد قوائم نواقص بعد</p>
            )}
          </div>
        </div>

        {/* Selected List Items Details */}
        <div className="lg:col-span-8 bg-slate-800/80 rounded-2xl p-5 border border-slate-700 shadow-xl space-y-4">
          {activeList ? (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-700">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2.5 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40">
                      قائمة يوم: {activeList.list_date}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    إجمالي الأصناف: <strong className="text-white">{totalInList}</strong> | تم الاستلام: <strong className="text-emerald-400">{arrivedCount}</strong> | بانتظار التوريد: <strong className="text-amber-400">{pendingCount}</strong>
                  </p>
                </div>

                <div className="w-full sm:w-48 bg-slate-900 rounded-full h-2.5 overflow-hidden border border-slate-700">
                  <div 
                    className="bg-emerald-500 h-full transition-all duration-300"
                    style={{ width: totalInList > 0 ? `${(arrivedCount / totalInList) * 100}%` : '0%' }}
                  />
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-2.5">
                {currentItems.map((item, idx) => (
                  <div
                    key={item.id}
                    className={`rounded-xl p-3.5 border transition-all flex items-center justify-between gap-3 ${
                      item.arrived
                        ? 'bg-emerald-950/20 border-emerald-800/40 text-slate-400'
                        : 'bg-slate-900/90 border-slate-700 text-slate-100 hover:border-amber-500/40'
                    }`}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <button
                        onClick={() => toggleShortageItemArrived(item.id)}
                        className={`p-1 rounded-lg transition-transform active:scale-90 ${
                          item.arrived ? 'text-emerald-400 hover:text-emerald-300' : 'text-slate-500 hover:text-amber-400'
                        }`}
                        title={item.arrived ? 'تعليم كغير مستلم' : 'تعليم كتم الاستلام'}
                      >
                        {item.arrived ? (
                          <CheckCircle2 className="w-5 h-5 fill-emerald-500/20" />
                        ) : (
                          <Circle className="w-5 h-5" />
                        )}
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-slate-500">#{idx + 1}</span>
                          <h4 className={`text-xs font-bold truncate ${item.arrived ? 'line-through text-slate-400' : 'text-slate-100'}`}>
                            {item.product_name}
                          </h4>
                        </div>
                        {item.notes && (
                          <p className="text-[11px] text-amber-400/80 mt-0.5">
                            ملاحظات: {item.notes}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          item.arrived
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-amber-500/20 text-amber-300'
                        }`}
                      >
                        {item.arrived ? 'تم التوريد والاستلام' : 'مطلوب توفيره'}
                      </span>

                      <button
                        onClick={() => deleteShortageItem(item.id)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                        title="حذف"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}

                {currentItems.length === 0 && (
                  <div className="py-12 text-center bg-slate-900/40 rounded-xl border border-dashed border-slate-700">
                    <AlertTriangle className="w-10 h-10 text-slate-600 mx-auto mb-2 opacity-60" />
                    <p className="text-xs text-slate-400">لا توجد نواقص مسجلة في هذه القائمة حتى الآن</p>
                    <button
                      onClick={() => setIsAddItemModalOpen(true)}
                      className="mt-3 px-3.5 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs rounded-lg font-bold transition-colors inline-flex items-center gap-1.5 border border-amber-500/30"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      إضافة صنف ناقص الآن
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="py-16 text-center text-slate-400">
              يرجى اختيار قائمة نواقص أو إنشاء قائمة جديدة
            </div>
          )}
        </div>
      </div>

      {/* Create New List Modal */}
      {isAddListModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between p-4 bg-slate-800 border-b border-slate-700">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-400" />
                إنشاء قائمة نواقص جديدة
              </h3>
              <button
                onClick={() => setIsAddListModalOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateList} className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">اختر التاريخ</label>
                <input
                  type="date"
                  required
                  value={newListDate}
                  onChange={e => setNewListDate(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-500 text-right"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition-colors"
                >
                  إنشاء القائمة
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddListModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-800 text-slate-300 text-xs rounded-xl font-semibold hover:bg-slate-700 transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Shortage Item Modal */}
      {isAddItemModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between p-4 bg-slate-800 border-b border-slate-700">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-amber-400" />
                إضافة صنف إلى قائمة النواقص
              </h3>
              <button
                onClick={() => setIsAddItemModalOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddItem} className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  اختر من دليل الأصناف (أو اكتب اسماً يدوياً بالأسفل)
                </label>
                <div className="relative mb-2">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={productSearch}
                    onChange={e => setProductSearch(e.target.value)}
                    placeholder="ابحث في الأصناف..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl pr-9 pl-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="max-h-40 overflow-y-auto space-y-1 border border-slate-800 rounded-xl p-1 bg-slate-950/60">
                  {filteredProducts.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setSelectedProductId(p.id);
                        setCustomItemName('');
                      }}
                      className={`w-full text-right p-2 rounded-lg text-xs flex items-center justify-between transition-colors ${
                        selectedProductId === p.id
                          ? 'bg-amber-500 text-slate-950 font-bold'
                          : 'hover:bg-slate-800 text-slate-200'
                      }`}
                    >
                      <span className="truncate">{p.name}</span>
                      <span className="text-[10px] font-mono opacity-70">#{p.code}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  أو اكتب اسم صنف مخصص (غير موجود في الدليل):
                </label>
                <input
                  type="text"
                  value={customItemName}
                  onChange={e => {
                    setCustomItemName(e.target.value);
                    if (e.target.value) setSelectedProductId('');
                  }}
                  placeholder="مثال: مناديل جود كير 550 منديل"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">ملاحظات / الكمية المطلوبة (اختياري)</label>
                <input
                  type="text"
                  value={itemNotes}
                  onChange={e => setItemNotes(e.target.value)}
                  placeholder="مثال: مطلوب 10 كراتين عاجل"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-800">
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition-colors"
                >
                  إضافة للنواقص
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddItemModalOpen(false)}
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

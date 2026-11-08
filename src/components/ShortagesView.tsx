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
  Layers,
  Printer
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
  const [shortageCategoryTab, setShortageCategoryTab] = useState<'all' | 'without_unit' | 'with_unit'>('all');

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

  // Main List Category Filter State
  const [mainListFilter, setMainListFilter] = useState<'all' | 'without_unit' | 'with_unit' | 'standalone'>('all');

  // Quick lookup map for products
  const productsMap = useMemo(() => {
    const map = new Map<string, typeof products[0]>();
    products.forEach(p => map.set(p.id, p));
    return map;
  }, [products]);

  // Determine shortage item category
  const getItemCategory = (item: typeof currentItems[0]): 'without_unit' | 'with_unit' | 'standalone' => {
    if (!item.product_id) return 'standalone';
    const prod = productsMap.get(item.product_id);
    if (!prod || !prod.unit || prod.unit.trim() === '' || prod.unit === 'عام' || prod.unit === 'غير محدد') {
      return 'without_unit';
    }
    return 'with_unit';
  };

  // Counts for current list categories
  const listCounts = useMemo(() => {
    let withoutUnit = 0;
    let withUnit = 0;
    let standalone = 0;
    currentItems.forEach(item => {
      const cat = getItemCategory(item);
      if (cat === 'without_unit') withoutUnit++;
      else if (cat === 'with_unit') withUnit++;
      else standalone++;
    });
    return { withoutUnit, withUnit, standalone };
  }, [currentItems, productsMap]);

  // Filtered current items based on category tabs
  const displayedItems = useMemo(() => {
    if (mainListFilter === 'all') return currentItems;
    return currentItems.filter(item => getItemCategory(item) === mainListFilter);
  }, [currentItems, mainListFilter, productsMap]);

  // Quick action to add all products lacking units to current shortage list
  const handleAddAllWithoutUnitToShortages = () => {
    if (!activeList) return;
    const withoutUnitProducts = products.filter(p => !p.unit || p.unit.trim() === '' || p.unit === 'عام' || p.unit === 'غير محدد');
    if (withoutUnitProducts.length === 0) {
      showToast('لا توجد أصناف في الدليل بدون وحدة', 'info');
      return;
    }
    const existingProductIds = new Set(currentItems.map(i => i.product_id).filter(Boolean));
    let addedCount = 0;
    withoutUnitProducts.forEach(p => {
      if (!existingProductIds.has(p.id)) {
        addShortageItem(
          activeList.id,
          p.name,
          'صنف بدون وحدة مسترد',
          p.id
        );
        addedCount++;
      }
    });
    if (addedCount > 0) {
      showToast(`تمت إضافة ${addedCount} صنف بدون وحدة إلى قائمة النواقص بنجاح`, 'success');
    } else {
      showToast('جميع الأصناف التي ليس لها وحدة موجودة بالفعل في قائمة النواقص', 'info');
    }
  };

  // Filtered products for modal picker categorized
  const categorizedProducts = useMemo(() => {
    let base = products;
    if (productSearch.trim()) {
      const q = productSearch.toLowerCase();
      base = products.filter(p =>
        String(p.name || '').toLowerCase().includes(q) ||
        String(p.code || '').toLowerCase().includes(q) ||
        String(p.unit || '').toLowerCase().includes(q)
      );
    }

    const withoutUnit = base.filter(p => !p.unit || String(p.unit).trim() === '' || String(p.unit).trim() === 'عام' || String(p.unit).trim() === 'غير محدد');
    const withUnit = base.filter(p => p.unit && String(p.unit).trim() !== '' && String(p.unit).trim() !== 'عام' && String(p.unit).trim() !== 'غير محدد');

    return {
      withoutUnit,
      withUnit
    };
  }, [products, productSearch]);

  const handleCreateList = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListDate) return;
    const id = createShortageList(newListDate);
    setSelectedListId(id);
    setIsAddListModalOpen(false);
    showToast('تم إنشاء قائمة نواقص جديدة بنجاح', 'success');
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
    showToast('تمت إضافة الصنف الناقص إلى القائمة', 'success');
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
    <div className="space-y-4 font-sans text-slate-800 animate-in fade-in duration-150">
      {/* Top Header Card */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              سجل وقوائم النواقص اليومية
            </h2>
            <p className="text-xs text-slate-500">
              حصر البضائع والطلبات الناقصة ومتابعة ما تم توريده واستلامه
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsAddListModalOpen(true)}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-lg border border-slate-300 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Calendar className="w-4 h-4 text-blue-600" />
            إنشاء قائمة تاريخ جديد
          </button>

          {activeList && (
            <>
              <button
                onClick={() => setIsAddItemModalOpen(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                إضافة صنف ناقص
              </button>

              <button
                onClick={copyForWhatsApp}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                title="نسخ نص التقرير لإرساله للتاجر أو المندوب عبر واتساب"
              >
                <Share2 className="w-4 h-4" />
                نسخ للموردين (واتساب)
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Date Lists Sidebar */}
        <div className="lg:col-span-4 bg-white rounded-xl p-4 border border-slate-200 shadow-sm space-y-3">
          <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2 pb-2 border-b border-slate-100">
            <Calendar className="w-4 h-4 text-blue-600" />
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
                  className={`cursor-pointer rounded-lg p-2.5 border transition-all flex items-center justify-between group ${
                    isSelected
                      ? 'bg-blue-50 border-blue-400 shadow-xs'
                      : 'bg-slate-50/70 border-slate-200 hover:border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-7 h-7 rounded-md flex items-center justify-center font-bold text-xs ${
                        isSelected ? 'bg-blue-600 text-white font-black' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      <Calendar className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <h4 className={`text-xs font-bold ${isSelected ? 'text-blue-900' : 'text-slate-800'}`}>
                        {list.list_date}
                      </h4>
                      <p className="text-[10px] text-slate-500">
                        {itemsInList.length} صنف مسجل
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {pendingInList > 0 ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                        {pendingInList} معلق
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        مكتمل
                      </span>
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`هل أنت متأكد من حذف قائمة نواقص ${list.list_date}؟`)) {
                          deleteShortageList(list.id);
                          showToast('تم حذف القائمة بنجاح', 'info');
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-rose-50 hover:text-rose-600 text-slate-400 transition-all cursor-pointer"
                      title="حذف القائمة"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}

            {shortageLists.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-6">لا توجد قوائم نواقص بعد</p>
            )}
          </div>
        </div>

        {/* Selected List Items Details */}
        <div className="lg:col-span-8 bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-4">
          {activeList ? (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2.5 py-0.5 rounded-lg bg-blue-50 text-blue-700 font-bold border border-blue-200">
                      قائمة يوم: {activeList.list_date}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    إجمالي الأصناف: <strong className="text-slate-900">{totalInList}</strong> | تم الاستلام: <strong className="text-emerald-700">{arrivedCount}</strong> | بانتظار التوريد: <strong className="text-rose-600">{pendingCount}</strong>
                  </p>
                </div>

                <div className="w-full sm:w-48 bg-slate-100 rounded-full h-2.5 overflow-hidden border border-slate-200">
                  <div 
                    className="bg-emerald-600 h-full transition-all duration-300"
                    style={{ width: totalInList > 0 ? `${(arrivedCount / totalInList) * 100}%` : '0%' }}
                  />
                </div>
              </div>

              {/* Shortage Category Filter Buttons & Quick Add */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setMainListFilter('all')}
                    className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                      mainListFilter === 'all'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    الكل ({totalInList})
                  </button>

                  <button
                    type="button"
                    onClick={() => setMainListFilter('without_unit')}
                    className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      mainListFilter === 'without_unit'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'bg-amber-50 text-amber-900 hover:bg-amber-100 border border-amber-200'
                    }`}
                  >
                    <span>الأصناف التي ليس لها وحدة</span>
                    <span className="font-mono px-1.5 py-0.2 bg-white/80 text-amber-950 rounded-md text-[11px]">
                      {listCounts.withoutUnit}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMainListFilter('with_unit')}
                    className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      mainListFilter === 'with_unit'
                        ? 'bg-teal-600 text-white shadow-xs'
                        : 'bg-teal-50 text-teal-900 hover:bg-teal-100 border border-teal-200'
                    }`}
                  >
                    <span>الأصناف التي لها وحدة</span>
                    <span className="font-mono px-1.5 py-0.2 bg-white/80 text-teal-950 rounded-md text-[11px]">
                      {listCounts.withUnit}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMainListFilter('standalone')}
                    className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      mainListFilter === 'standalone'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-indigo-50 text-indigo-900 hover:bg-indigo-100 border border-indigo-200'
                    }`}
                  >
                    <span>الأصناف التي أضيفت لوحدها</span>
                    <span className="font-mono px-1.5 py-0.2 bg-white/80 text-indigo-950 rounded-md text-[11px]">
                      {listCounts.standalone}
                    </span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleAddAllWithoutUnitToShortages}
                  className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded-lg text-xs font-black transition-colors flex items-center justify-center gap-1.5 cursor-pointer shrink-0 shadow-2xs"
                  title="استدعاء وإضافة كافة أصناف الدليل التي تفتقد للوحدة إلى قائمة النواقص هذه"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                  <span>+ جلب الأصناف التي ليس لها وحدة</span>
                </button>
              </div>

              {/* Items List */}
              <div className="space-y-2">
                {displayedItems.map((item, idx) => {
                  const itemCat = getItemCategory(item);
                  const itemProd = item.product_id ? productsMap.get(item.product_id) : null;

                  return (
                    <div
                      key={item.id}
                      className={`rounded-lg p-3 border transition-colors flex items-center justify-between gap-3 ${
                        item.arrived
                          ? 'bg-emerald-50/40 border-emerald-200 text-slate-500'
                          : 'bg-white border-slate-200 text-slate-900 hover:border-blue-300'
                      }`}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <button
                          onClick={() => toggleShortageItemArrived(item.id)}
                          className={`p-1 rounded-lg transition-transform active:scale-90 cursor-pointer ${
                            item.arrived ? 'text-emerald-600 hover:text-emerald-700' : 'text-slate-400 hover:text-blue-600'
                          }`}
                          title={item.arrived ? 'تعليم كغير مستلم' : 'تعليم كتم الاستلام والتوريد'}
                        >
                          {item.arrived ? (
                            <CheckCircle2 className="w-5 h-5 fill-emerald-100 text-emerald-600" />
                          ) : (
                            <Circle className="w-5 h-5" />
                          )}
                        </button>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-mono text-slate-400 font-bold">#{idx + 1}</span>
                            <h4 className={`text-xs font-bold truncate ${item.arrived ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                              {item.product_name}
                            </h4>

                            {/* Category Badge */}
                            {itemCat === 'without_unit' && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                                ليس لها وحدة
                              </span>
                            )}
                            {itemCat === 'with_unit' && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200">
                                الوحدة: {itemProd?.unit}
                              </span>
                            )}
                            {itemCat === 'standalone' && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200">
                                أضيف لوحده
                              </span>
                            )}
                          </div>
                          {item.notes && (
                            <p className="text-[11px] text-amber-700 font-medium mt-0.5">
                              ملاحظة: {item.notes}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            item.arrived
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {item.arrived ? 'تم التوريد والاستلام' : 'مطلوب توفيره'}
                        </span>

                        <button
                          onClick={() => deleteShortageItem(item.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="حذف"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {displayedItems.length === 0 && (
                  <div className="py-12 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300">
                    <AlertTriangle className="w-10 h-10 text-slate-400 mx-auto mb-2 opacity-60" />
                    {totalInList > 0 ? (
                      <>
                        <p className="text-xs text-slate-500 font-bold">لا توجد أصناف في هذا التصنيف</p>
                        <button
                          type="button"
                          onClick={() => setMainListFilter('all')}
                          className="mt-2 text-xs text-blue-600 hover:underline font-bold cursor-pointer"
                        >
                          عرض جميع أصناف القائمة ({totalInList})
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-slate-500 font-bold">لا توجد نواقص مسجلة في هذه القائمة حتى الآن</p>
                        <button
                          onClick={() => setIsAddItemModalOpen(true)}
                          className="mt-3 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-lg font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          إضافة صنف ناقص الآن
                        </button>
                      </>
                    )}
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
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-sm overflow-hidden shadow-xl animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between p-4 bg-slate-900 text-white">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-400" />
                إنشاء قائمة نواقص جديدة
              </h3>
              <button
                onClick={() => setIsAddListModalOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateList} className="p-5 space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">اختر التاريخ</label>
                <input
                  type="date"
                  required
                  value={newListDate}
                  onChange={e => setNewListDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-bold focus:bg-white focus:outline-none focus:border-blue-600 text-right"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-sm transition-colors cursor-pointer"
                >
                  إنشاء القائمة
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddListModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition-colors cursor-pointer"
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
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md overflow-hidden shadow-xl animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between p-4 bg-slate-900 text-white">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Plus className="w-4 h-4 text-blue-400" />
                إضافة صنف إلى قائمة النواقص
              </h3>
              <button
                onClick={() => setIsAddItemModalOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddItem} className="p-5 space-y-4 text-xs">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-bold text-slate-800 text-xs">
                    اختر من دليل الأصناف:
                  </label>
                  <span className="text-[11px] text-slate-500 font-bold">
                    إجمالي الأصناف: {products.length}
                  </span>
                </div>

                <div className="relative mb-2">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={productSearch}
                    onChange={e => setProductSearch(e.target.value)}
                    placeholder="ابحث بالاسم أو الكود أو الوحدة..."
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg pr-9 pl-3 py-1.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                  />
                </div>

                {/* Filter Tabs inside modal */}
                <div className="flex flex-wrap bg-slate-100 p-1 rounded-lg border border-slate-200 gap-1 mb-2 text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => setShortageCategoryTab('all')}
                    className={`flex-1 py-1 px-2 rounded-md transition-colors text-center cursor-pointer ${
                      shortageCategoryTab === 'all'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                    }`}
                  >
                    الكل ({products.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setShortageCategoryTab('without_unit')}
                    className={`flex-1 py-1 px-2 rounded-md transition-colors text-center cursor-pointer ${
                      shortageCategoryTab === 'without_unit'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'text-slate-700 hover:text-slate-900 hover:bg-amber-100/60'
                    }`}
                  >
                    بدون وحدة ({categorizedProducts.withoutUnit.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setShortageCategoryTab('with_unit')}
                    className={`flex-1 py-1 px-2 rounded-md transition-colors text-center cursor-pointer ${
                      shortageCategoryTab === 'with_unit'
                        ? 'bg-teal-600 text-white shadow-xs'
                        : 'text-slate-700 hover:text-slate-900 hover:bg-emerald-100/60'
                    }`}
                  >
                    بوحدة ({categorizedProducts.withUnit.length})
                  </button>
                </div>

                {/* Products List Box */}
                <div className="max-h-48 overflow-y-auto space-y-1 border border-slate-200 rounded-lg p-1.5 bg-slate-50">
                  {/* Category: Without unit */}
                  {(shortageCategoryTab === 'all' || shortageCategoryTab === 'without_unit') && (
                    <div className="mb-2">
                      <div className="px-2 py-1 bg-amber-100/80 text-amber-900 font-bold text-[10px] rounded mb-1 flex items-center justify-between">
                        <span>الأصناف التي ليس لها وحدة ({categorizedProducts.withoutUnit.length}):</span>
                        <span className="font-mono">بدون وحدة</span>
                      </div>
                      {categorizedProducts.withoutUnit.length === 0 ? (
                        <p className="text-[11px] text-slate-400 px-2 py-1">لا توجد أصناف بدون وحدة</p>
                      ) : (
                        categorizedProducts.withoutUnit.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setSelectedProductId(p.id);
                              setCustomItemName('');
                            }}
                            className={`w-full text-right p-2 rounded-md text-xs flex items-center justify-between transition-colors cursor-pointer mb-0.5 ${
                              selectedProductId === p.id
                                ? 'bg-blue-600 text-white font-bold'
                                : 'hover:bg-slate-200 text-slate-800'
                            }`}
                          >
                            <span className="truncate">{p.name}</span>
                            <span className="text-[10px] font-mono opacity-80 shrink-0">#{p.code} (بدون وحدة)</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}

                  {/* Category: With unit */}
                  {(shortageCategoryTab === 'all' || shortageCategoryTab === 'with_unit') && (
                    <div>
                      <div className="px-2 py-1 bg-emerald-100/80 text-emerald-900 font-bold text-[10px] rounded mb-1 flex items-center justify-between">
                        <span>الأصناف بوحداتها المحددة ({categorizedProducts.withUnit.length}):</span>
                        <span className="font-mono">لها وحدة</span>
                      </div>
                      {categorizedProducts.withUnit.length === 0 ? (
                        <p className="text-[11px] text-slate-400 px-2 py-1">لا توجد أصناف بوحدة</p>
                      ) : (
                        categorizedProducts.withUnit.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setSelectedProductId(p.id);
                              setCustomItemName('');
                            }}
                            className={`w-full text-right p-2 rounded-md text-xs flex items-center justify-between transition-colors cursor-pointer mb-0.5 ${
                              selectedProductId === p.id
                                ? 'bg-blue-600 text-white font-bold'
                                : 'hover:bg-slate-200 text-slate-800'
                            }`}
                          >
                            <span className="truncate">{p.name}</span>
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.2 rounded font-bold">
                                {p.unit}
                              </span>
                              <span className="text-[10px] font-mono opacity-80">#{p.code}</span>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Category 3: Custom item added alone */}
              <div className="pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-900 block text-xs flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                    أو إضافة صنف يدوياً أضيف لوحده (غير موجود بالدليل):
                  </label>
                  <span className="text-[10px] bg-blue-50 text-blue-800 px-2 py-0.5 rounded font-bold border border-blue-200">
                    أُضيف لوحده
                  </span>
                </div>
                <input
                  type="text"
                  value={customItemName}
                  onChange={e => {
                    setCustomItemName(e.target.value);
                    if (e.target.value) setSelectedProductId('');
                  }}
                  placeholder="اكتب اسم الصنف الناقص المضاف لوحده..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-bold"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">ملاحظات / الكمية المطلوبة (اختياري)</label>
                <input
                  type="text"
                  value={itemNotes}
                  onChange={e => setItemNotes(e.target.value)}
                  placeholder="مثال: مطلوب 10 كراتين عاجل"
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <button
                  type="submit"
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-sm transition-colors cursor-pointer"
                >
                  إضافة للنواقص
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddItemModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition-colors cursor-pointer"
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

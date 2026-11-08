import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Edit3, 
  Trash2, 
  Package, 
  ArrowUpDown, 
  Layers, 
  Check, 
  X, 
  DollarSign, 
  Hash, 
  AlertCircle,
  Download,
  Printer,
  FileSpreadsheet,
  FileText,
  Sliders,
  Mic,
  MicOff,
  RotateCcw,
  Barcode,
  TrendingUp,
  TrendingDown,
  Tag,
  CheckCircle2,
  FolderKanban
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Product } from '../types';
import { matchProductSearch } from '../utils/productImportExport';

interface ProductsViewProps {
  onNavigateTab?: (tab: any) => void;
}

export const ProductsView: React.FC<ProductsViewProps> = ({ onNavigateTab }) => {
  const { 
    products, 
    addProduct, 
    updateProduct, 
    deleteProduct, 
    fixSwappedProductsCodeAndName, 
    showToast 
  } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedUnit, setSelectedUnit] = useState<string>('all');
  const [priceStatusFilter, setPriceStatusFilter] = useState<'all' | 'increase' | 'decrease' | 'new'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'price' | 'price_wholesale' | 'code' | 'stock' | 'profit'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Search autocomplete & focus
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Close search suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPdfPrintOpen, setIsPdfPrintOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Helper to accurately identify price increases compared to previous import
  const isProductIncrease = (p: Product) => {
    if (p.price_change_type === 'increase') return true;
    const retailInc = p.old_price !== undefined && p.old_price > 0 && p.price > p.old_price;
    const wholesaleInc = p.old_price_wholesale !== undefined && p.old_price_wholesale > 0 && (p.price_wholesale || 0) > p.old_price_wholesale;
    return retailInc || wholesaleInc;
  };

  // Helper to accurately identify price decreases compared to previous import
  const isProductDecrease = (p: Product) => {
    if (p.price_change_type === 'decrease') return true;
    const retailDec = p.old_price !== undefined && p.old_price > 0 && p.price < p.old_price;
    const wholesaleDec = p.old_price_wholesale !== undefined && p.old_price_wholesale > 0 && (p.price_wholesale || 0) < p.old_price_wholesale;
    return retailDec || wholesaleDec;
  };

  // Helper to identify newly added products from recent import
  const isProductNew = (p: Product) => {
    return Boolean(p.is_new);
  };

  // Statistics for price change buttons direct from products list
  const priceChangeStats = useMemo(() => {
    let increases = 0;
    let decreases = 0;
    let newItems = 0;

    products.forEach(p => {
      if (isProductIncrease(p)) increases++;
      else if (isProductDecrease(p)) decreases++;

      if (isProductNew(p)) newItems++;
    });

    return { increases, decreases, newItems };
  }, [products]);

  // Auto-detect products with swapped code and name
  const invertedProductsCount = useMemo(() => {
    return products.filter(p => {
      const nameVal = String(p.name || '').trim();
      const codeVal = String(p.code || '').trim();
      const nameIsDigits = /^\d+$/.test(nameVal);
      const codeIsDigits = /^\d+$/.test(codeVal);
      const nameHasArabic = /[\u0600-\u06FF]/.test(nameVal);
      const codeHasArabic = /[\u0600-\u06FF]/.test(codeVal);
      const nameIsCodePattern = /^(p|prd|itm|code|c)[-_]?\d+/i.test(nameVal);

      return (nameIsDigits && !codeIsDigits) || (!nameHasArabic && codeHasArabic) || (nameIsCodePattern && codeHasArabic) || (codeVal.length > nameVal.length && codeVal.includes(' ') && !nameVal.includes(' ') && !codeIsDigits);
    }).length;
  }, [products]);

  // Voice Search State
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Form Fields
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formUnit, setFormUnit] = useState('كرتونه');
  const [formCategory, setFormCategory] = useState('مواد غذائية أساسية');
  const [formRetailPrice, setFormRetailPrice] = useState<number | ''>('');
  const [formWholesalePrice, setFormWholesalePrice] = useState<number | ''>('');
  const [formStock, setFormStock] = useState<number | ''>(50);
  const [formBarcode, setFormBarcode] = useState('');

  // Units list
  const units = useMemo(() => {
    const u = new Set<string>();
    products.forEach(p => {
      if (p.unit) u.add(p.unit);
    });
    return Array.from(u);
  }, [products]);

  // Category stats with counts
  const categoryStats = useMemo(() => {
    const counts = new Map<string, number>();
    products.forEach(p => {
      const cat = (p.category && String(p.category).trim()) || 'عام';
      counts.set(cat, (counts.get(cat) || 0) + 1);
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [products]);

  // Clean list of categories
  const categories = useMemo(() => {
    return categoryStats.map(([name]) => name);
  }, [categoryStats]);

  // Live Instant Search Suggestions (matches as user types)
  const searchSuggestions = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return [];
    return products.filter(p => matchProductSearch(p, q)).slice(0, 7);
  }, [products, searchQuery]);

  // Check if search has matches outside current active category
  const matchesOutsideCategory = useMemo(() => {
    const q = searchQuery.trim();
    if (!q || selectedCategory === 'all') return 0;
    return products.filter(p => {
      const cat = (p.category && String(p.category).trim()) || 'عام';
      return cat !== selectedCategory && matchProductSearch(p, q);
    }).length;
  }, [products, searchQuery, selectedCategory]);

  // Voice recognition toggle
  const toggleVoiceSearch = () => {
    const SpeechRecognition = typeof window !== 'undefined'
      ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
      : null;

    if (!SpeechRecognition) {
      showToast('المتصفح الحالي لا يدعم ميزة التعرف الصوتي المباشر، يرجى كتابة النص يدوياً', 'error');
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'ar-EG';
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        const text = event.results[0][0].transcript;
        setSearchQuery(text);
        setIsListening(false);
        setIsSearchFocused(false);
        showToast(`تم التعرف الصوتي على: "${text}"`, 'success');
      };

      recognition.onerror = (e: any) => {
        setIsListening(false);
        if (e.error === 'not-allowed') {
          showToast('يرجى السماح بصلاحية الميكروفون لاستخدام البحث بالصوت', 'error');
        } else {
          showToast('لم نتمكن من التقاط الصوت بوضوح، يرجى المحاولة ثانية', 'error');
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsListening(false);
      showToast('تعذر تشغيل الميكروفون حالياً', 'error');
    }
  };

  // Filtered & Sorted Products
  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim();
    return products
      .filter(p => {
        // Fast, intelligent Arabic-normalized search
        const matchSearch = matchProductSearch(p, q);
        if (!matchSearch) return false;

        // Category filter
        const productCat = (p.category && String(p.category).trim()) || 'عام';
        const matchCat = selectedCategory === 'all' || productCat === selectedCategory;

        // Unit filter
        const matchUnit = selectedUnit === 'all' || p.unit === selectedUnit;

        // Price changes filter (direct from product fields)
        let matchPriceStatus = true;
        if (priceStatusFilter === 'increase') {
          matchPriceStatus = isProductIncrease(p);
        } else if (priceStatusFilter === 'decrease') {
          matchPriceStatus = isProductDecrease(p);
        } else if (priceStatusFilter === 'new') {
          matchPriceStatus = isProductNew(p);
        }

        return matchCat && matchUnit && matchPriceStatus;
      })
      .sort((a, b) => {
        if (sortBy === 'profit') {
          const profitA = (a.price || 0) - (a.price_wholesale || a.price || 0);
          const profitB = (b.price || 0) - (b.price_wholesale || b.price || 0);
          return sortOrder === 'asc' ? profitA - profitB : profitB - profitA;
        }

        let valA = a[sortBy as 'name' | 'price' | 'price_wholesale' | 'code' | 'stock'];
        let valB = b[sortBy as 'name' | 'price' | 'price_wholesale' | 'code' | 'stock'];
        if (typeof valA === 'string') {
          return sortOrder === 'asc'
            ? valA.localeCompare(valB as string, 'ar')
            : (valB as string).localeCompare(valA, 'ar');
        }
        return sortOrder === 'asc' ? (Number(valA) || 0) - (Number(valB) || 0) : (Number(valB) || 0) - (Number(valA) || 0);
      });
  }, [products, searchQuery, selectedCategory, selectedUnit, sortBy, sortOrder, priceStatusFilter]);

  const openAddModal = () => {
    setEditingProduct(null);
    setFormName('');
    setFormCode((Math.floor(10000 + Math.random() * 90000)).toString());
    setFormUnit('كرتونه');
    setFormCategory('مواد غذائية أساسية');
    setFormRetailPrice('');
    setFormWholesalePrice('');
    setFormStock(50);
    setFormBarcode('');
    setIsModalOpen(true);
  };

  const openEditModal = (p: Product) => {
    setEditingProduct(p);
    setFormName(p.name);
    setFormCode(p.code);
    setFormUnit(p.unit || 'كرتونه');
    setFormCategory(p.category || 'مواد غذائية أساسية');
    setFormRetailPrice(p.price || 0);
    setFormWholesalePrice(p.price_wholesale || p.price || 0);
    setFormStock(p.stock ?? 0);
    setFormBarcode(p.barcode || '');
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formCode.trim()) {
      showToast('يرجى ملء اسم الصنف وكوده بشكل صحيح', 'error');
      return;
    }

    const retail = Number(formRetailPrice) || 0;
    const wholesale = Number(formWholesalePrice) || retail;

    if (editingProduct) {
      updateProduct(editingProduct.id, {
        name: formName.trim(),
        code: formCode.trim(),
        unit: formUnit.trim(),
        category: formCategory.trim() || null,
        price: retail,
        price_wholesale: wholesale,
        stock: Number(formStock) || 0,
        barcode: formBarcode.trim() || null
      });
      showToast('تم تحديث بيانات الصنف بنجاح', 'success');
    } else {
      addProduct({
        name: formName.trim(),
        code: formCode.trim(),
        unit: formUnit.trim(),
        category: formCategory.trim() || null,
        price: retail,
        price_wholesale: wholesale,
        cost: 0,
        stock: Number(formStock) || 0,
        barcode: formBarcode.trim() || null
      });
      showToast('تمت إضافة الصنف الجديد بنجاح', 'success');
    }

    setIsModalOpen(false);
  };

  const commonUnits = ['كرتونه', 'بالتة', 'شكاره', 'علبة', 'ربطة', 'طرد', 'صفيحة', 'جركن', 'كيلو', 'قطعة', 'شريط', 'كيس', 'حصيرة'];

  return (
    <div className="space-y-4 font-sans text-slate-800 animate-in fade-in duration-150">
      {/* Header with Title and Dedicated Actions Menu */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-slate-900">
                  دليل الأصناف والمخزون
                </h2>
                <span className="text-[11px] font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">
                  {products.length} صنف
                </span>
                {filteredProducts.length !== products.length && (
                  <span className="text-[11px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                    المطابق: {filteredProducts.length}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                إدارة البضائع، أسعار الجملة والقطاعي، الأرصدة، وتوثيق الأكواد
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Primary Add Product Button */}
            <button
              onClick={openAddModal}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              إضافة صنف جديد
            </button>
          </div>
        </div>
      </div>

      {/* Standalone Search Card with Live Instant Autocomplete & Category Pills */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm space-y-3">
        {/* Main Search Row with Autocomplete Anchor */}
        <div ref={searchContainerRef} className="relative flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          {/* Input with Search icon, Clear, and Voice Search inside */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onFocus={() => setIsSearchFocused(true)}
              onChange={e => {
                setSearchQuery(e.target.value);
                setIsSearchFocused(true);
              }}
              placeholder="ابحث باسم الصنف، الكود، الباركود، التصنيف، أو تحدث بالصوت..."
              className="w-full bg-slate-50 hover:bg-slate-50/80 focus:bg-white border border-slate-300 rounded-xl pr-10 pl-24 py-2.5 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600 transition-all shadow-2xs font-medium"
            />

            {/* Clear text button */}
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setIsSearchFocused(false);
                }}
                className="absolute left-20 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 rounded-md cursor-pointer transition-colors"
                title="مسح البحث"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            {/* Voice Search (بحث بالصوت) Button */}
            <button
              type="button"
              onClick={toggleVoiceSearch}
              title={isListening ? 'إيقاف الاستماع' : 'بحث بالصوت (تحدث باسم الصنف)'}
              className={`absolute left-2 top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                isListening
                  ? 'bg-rose-600 text-white animate-pulse shadow-sm'
                  : 'bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200'
              }`}
            >
              {isListening ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-white animate-ping"></span>
                  <MicOff className="w-3.5 h-3.5" />
                  <span className="text-[11px]">استماع...</span>
                </>
              ) : (
                <>
                  <Mic className="w-3.5 h-3.5 text-blue-600" />
                  <span className="text-[11px] hidden xs:inline">صوت</span>
                </>
              )}
            </button>
          </div>

          {/* Quick Results Summary / Reset Button */}
          {(searchQuery || selectedCategory !== 'all' || selectedUnit !== 'all' || priceStatusFilter !== 'all') ? (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('all');
                setSelectedUnit('all');
                setPriceStatusFilter('all');
                setIsSearchFocused(false);
              }}
              className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0 border border-slate-200"
              title="إعادة ضبط البحث والتصنيف والتصفية"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              <span>إعادة ضبط ({filteredProducts.length} صنف)</span>
            </button>
          ) : (
            <div className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 text-slate-600 text-xs font-bold rounded-xl shrink-0 text-center">
              إجمالي الأصناف: <span className="font-mono text-blue-700 font-bold">{products.length}</span>
            </div>
          )}

          {/* Live Instant Autocomplete Dropdown (أول ما أكتب اسم الصنف يظهر اسم الصنف فوراً) */}
          {isSearchFocused && searchQuery.trim().length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1.5 z-40 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden divide-y divide-slate-100 animate-in fade-in zoom-in-95 duration-100">
              <div className="p-2.5 bg-slate-50 flex items-center justify-between text-[11px] font-bold text-slate-600 border-b border-slate-200">
                <span className="flex items-center gap-1.5">
                  <Search className="w-3.5 h-3.5 text-blue-600" />
                  <span>نتائج مطابقة فورية أثناء الكتابة ({searchSuggestions.length})</span>
                </span>
                <span className="text-[10px] text-slate-400">اضغط لاختيار الصنف مباشرة</span>
              </div>

              {searchSuggestions.length > 0 ? (
                <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                  {searchSuggestions.map((prod) => (
                    <button
                      key={prod.id}
                      type="button"
                      onClick={() => {
                        setSearchQuery(prod.name);
                        setIsSearchFocused(false);
                      }}
                      className="w-full text-right p-3 hover:bg-blue-50/80 transition-colors flex items-center justify-between gap-3 cursor-pointer group"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-900 group-hover:text-blue-700 truncate">
                            {prod.name}
                          </span>
                          <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200 shrink-0">
                            #{prod.code}
                          </span>
                          {prod.category && (
                            <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-100 shrink-0">
                              {prod.category}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-3">
                          <span>الوحدة: <strong className="text-slate-700">{prod.unit || 'كرتونه'}</strong></span>
                          <span>المخزون: <strong className={(prod.stock ?? 0) <= 5 ? 'text-rose-600' : 'text-slate-700'}>{prod.stock ?? 0}</strong></span>
                        </div>
                      </div>

                      <div className="text-left shrink-0">
                        <div className="text-xs font-mono font-black text-blue-700">
                          {prod.price} ج.م
                        </div>
                        <div className="text-[10px] font-mono text-slate-400">
                          جملة: {prod.price_wholesale || prod.price} ج.م
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-4 text-center text-xs text-slate-500">
                  لا توجد أصناف مطابقة لكلمة البحث "{searchQuery}"
                </div>
              )}

              {searchSuggestions.length > 0 && (
                <div 
                  className="p-2 bg-slate-50 text-center text-[11px] text-blue-600 font-bold hover:bg-blue-100 transition-colors cursor-pointer"
                  onClick={() => setIsSearchFocused(false)}
                >
                  عرض جميع النتائج المطابقة في الجدول أدناه ({filteredProducts.length} صنف)
                </div>
              )}
            </div>
          )}
        </div>

        {/* Listening Status Banner */}
        {isListening && (
          <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between text-xs text-rose-800 animate-pulse">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-600 animate-ping"></span>
              <span className="font-bold">الميكروفون نشط! تحدث الآن باسم الصنف أو كوده بوضوح...</span>
            </div>
            <button
              type="button"
              onClick={() => setIsListening(false)}
              className="px-2.5 py-1 bg-rose-600 text-white text-xs font-bold rounded-lg cursor-pointer hover:bg-rose-700 transition-colors"
            >
              إيقاف
            </button>
          </div>
        )}

        {/* Prominent Category Chips Bar (تصنيفات الأصناف - تفعيل مباشر بضغطة زر) */}
        <div className="space-y-1.5 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <Layers className="w-4 h-4 text-blue-600" />
              <span>تصنيفات الأصناف ({categoryStats.length}):</span>
            </div>
            {selectedCategory !== 'all' && (
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className="text-[11px] text-blue-600 hover:text-blue-800 font-bold cursor-pointer transition-colors"
              >
                إلغاء تصفية التصنيف (عرض كل الأصناف)
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-thin">
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                selectedCategory === 'all'
                  ? 'bg-blue-600 text-white shadow-xs ring-2 ring-blue-600/30'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
              }`}
            >
              <span>جميع الأصناف</span>
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                selectedCategory === 'all' ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-700'
              }`}>
                {products.length}
              </span>
            </button>

            {categoryStats.map(([catName, count]) => {
              const isSelected = selectedCategory === catName;
              return (
                <button
                  key={catName}
                  type="button"
                  onClick={() => setSelectedCategory(prev => prev === catName ? 'all' : catName)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-xs ring-2 ring-blue-600/30'
                      : 'bg-white hover:bg-blue-50 text-slate-700 border border-slate-200'
                  }`}
                >
                  <span>{catName}</span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                    isSelected ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Notice if search matches products in other categories */}
        {matchesOutsideCategory > 0 && filteredProducts.length === 0 && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between text-xs text-blue-900 animate-in fade-in">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-blue-600 shrink-0" />
              <span>
                تم العثور على <strong>{matchesOutsideCategory}</strong> صنف مطابق في تصنيفات أخرى (التصنيف المحدد حالياً: <strong>{selectedCategory}</strong>)
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer shrink-0"
            >
              عرض في كل التصنيفات
            </button>
          </div>
        )}

        {/* Price status filter buttons */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
          <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
            <Tag className="w-3.5 h-3.5 text-blue-600" />
            تصفية الأصناف والأسعار:
          </span>
          <button
            type="button"
            onClick={() => setPriceStatusFilter('all')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              priceStatusFilter === 'all'
                ? 'bg-slate-900 text-white shadow-xs ring-2 ring-slate-900/20'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            جميع الأصناف ({products.length})
          </button>
          <button
            type="button"
            onClick={() => setPriceStatusFilter(prev => prev === 'increase' ? 'all' : 'increase')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              priceStatusFilter === 'increase'
                ? 'bg-rose-600 text-white shadow-sm ring-2 ring-rose-600/30'
                : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200'
            }`}
            title="عرض الأصناف التي ارتفع سعرها فقط مقارنة بالاسترداد السابق"
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>الأصناف التي زادت أسعارها ({priceChangeStats.increases})</span>
            {priceStatusFilter === 'increase' && (
              <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setPriceStatusFilter(prev => prev === 'decrease' ? 'all' : 'decrease')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              priceStatusFilter === 'decrease'
                ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-600/30'
                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200'
            }`}
            title="عرض الأصناف التي انخفض سعرها فقط مقارنة بالاسترداد السابق"
          >
            <TrendingDown className="w-3.5 h-3.5" />
            <span>الأصناف التي نقصت أسعارها ({priceChangeStats.decreases})</span>
            {priceStatusFilter === 'decrease' && (
              <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setPriceStatusFilter(prev => prev === 'new' ? 'all' : 'new')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              priceStatusFilter === 'new'
                ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-600/30'
                : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200'
            }`}
            title="عرض الأصناف الجديدة المضافة فقط من الاسترداد"
          >
            <span>🆕</span>
            <span>الأصناف التي أضيفت جديدة ({priceChangeStats.newItems})</span>
            {priceStatusFilter === 'new' && (
              <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
            )}
          </button>
        </div>

        {/* Filters and Sorting Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 pt-2 border-t border-slate-100">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">التصنيف:</label>
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 font-bold focus:bg-white focus:outline-none focus:border-blue-600"
            >
              <option value="all">جميع التصنيفات</option>
              {categories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">الوحدة:</label>
            <select
              value={selectedUnit}
              onChange={e => setSelectedUnit(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 font-bold focus:bg-white focus:outline-none focus:border-blue-600"
            >
              <option value="all">جميع الوحدات</option>
              {units.map(u => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">ترتيب حسب:</label>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 font-bold focus:bg-white focus:outline-none focus:border-blue-600"
            >
              <option value="name">اسم الصنف</option>
              <option value="price">سعر القطاعي (المستهلك)</option>
              <option value="price_wholesale">سعر الجملة</option>
              <option value="code">كود الصنف</option>
              <option value="stock">الرصيد بالمخزن</option>
              <option value="profit">أعلى هامش ربح</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">الاتجاه:</label>
            <button
              type="button"
              onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
              className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 font-bold flex items-center justify-between cursor-pointer transition-colors"
            >
              <span>{sortOrder === 'asc' ? 'تصاعدي (الأصغر أولاً)' : 'تنازلي (الأكبر أولاً)'}</span>
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
            </button>
          </div>
        </div>
      </div>

      {/* Active Price Status Filter Alert Banner */}
      {priceStatusFilter !== 'all' && (
        <div className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-xs animate-in fade-in duration-100 ${
          priceStatusFilter === 'increase'
            ? 'bg-rose-50/90 border-rose-200 text-rose-900'
            : priceStatusFilter === 'decrease'
            ? 'bg-emerald-50/90 border-emerald-200 text-emerald-900'
            : 'bg-blue-50/90 border-blue-200 text-blue-900'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white shrink-0 ${
              priceStatusFilter === 'increase'
                ? 'bg-rose-600'
                : priceStatusFilter === 'decrease'
                ? 'bg-emerald-600'
                : 'bg-blue-600'
            }`}>
              {priceStatusFilter === 'increase' && <TrendingUp className="w-4 h-4" />}
              {priceStatusFilter === 'decrease' && <TrendingDown className="w-4 h-4" />}
              {priceStatusFilter === 'new' && <span>🆕</span>}
            </div>
            <div>
              <h4 className="font-black text-xs sm:text-sm">
                {priceStatusFilter === 'increase' && `تم تفعيل عرض الأصناف التي زادت أسعارها عن الاسترداد السابق`}
                {priceStatusFilter === 'decrease' && `تم تفعيل عرض الأصناف التي نقصت أسعارها عن الاسترداد السابق`}
                {priceStatusFilter === 'new' && `تم تفعيل عرض الأصناف الجديدة التي أضيفت في الاسترداد`}
              </h4>
              <p className="text-[11px] opacity-80 mt-0.5">
                القائمة الحالية تعرض فقط هذه الأصناف ({filteredProducts.length} صنف من أصل {products.length}) مع توضيح السعر السابق ومقدار التغير.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setPriceStatusFilter('all')}
            className="px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-lg font-bold text-xs shadow-2xs transition-colors cursor-pointer self-start sm:self-auto shrink-0 flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>عرض جميع الأصناف</span>
          </button>
        </div>
      )}

      {/* Products Table (Clean White & High Contrast) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse text-xs">
            <thead>
              <tr className="bg-slate-800 text-white font-bold border-b border-slate-700 text-[11px]">
                <th className="py-2.5 px-3 text-center w-14">م</th>
                <th className="py-2.5 px-3 text-center w-28">كود الصنف</th>
                <th className="py-2.5 px-4">اسم الصنف والتصنيف</th>
                <th className="py-2.5 px-3 text-center w-24">الوحدة</th>
                <th className="py-2.5 px-3 text-center">سعر الجملة</th>
                <th className="py-2.5 px-3 text-center">سعر القطاعي</th>
                <th className="py-2.5 px-3 text-center">الرصيد بالمخزن</th>
                <th className="py-2.5 px-3 text-center w-24">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredProducts.map((product, idx) => {
                const isInc = isProductIncrease(product);
                const isDec = isProductDecrease(product);
                const isNew = isProductNew(product);

                return (
                  <tr
                    key={product.id}
                    className={`hover:bg-slate-50 transition-colors ${
                      isInc && priceStatusFilter === 'increase'
                        ? 'bg-rose-50/30'
                        : isDec && priceStatusFilter === 'decrease'
                        ? 'bg-emerald-50/30'
                        : isNew && priceStatusFilter === 'new'
                        ? 'bg-blue-50/30'
                        : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                    }`}
                  >
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-400">
                      {idx + 1}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono font-bold text-slate-800 text-xs">
                        #{product.code}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 font-bold text-slate-900">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span>{product.name}</span>
                        {(() => {
                          if (!isInc && !isDec && !isNew) return null;

                          const oldRetail = product.old_price !== undefined ? product.old_price : product.price;
                          const diff = Math.abs(product.price - oldRetail);

                          return (
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-bold inline-flex items-center gap-0.5 ${
                                isInc
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                  : isDec
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-blue-50 text-blue-700 border border-blue-200'
                              }`}
                              title={
                                isInc || isDec
                                  ? `السعر السابق: ${oldRetail} ج.م | السعر الحالي: ${product.price} ج.م`
                                  : 'صنف جديد مضاف'
                              }
                            >
                              {isInc && (
                                <>
                                  <TrendingUp className="w-3 h-3 text-rose-600" />
                                  <span>زادت {diff > 0 ? `(+${diff.toFixed(2)})` : ''}</span>
                                </>
                              )}
                              {isDec && (
                                <>
                                  <TrendingDown className="w-3 h-3 text-emerald-600" />
                                  <span>نقصت {diff > 0 ? `(-${diff.toFixed(2)})` : ''}</span>
                                </>
                              )}
                              {isNew && (
                                <span>جديد 🆕</span>
                              )}
                            </span>
                          );
                        })()}
                      </div>
                      {product.category && (
                        <button
                          type="button"
                          onClick={() => setSelectedCategory(product.category || 'all')}
                          className="text-[10px] text-blue-600 hover:text-blue-800 hover:underline font-normal inline-flex items-center gap-1 mt-0.5 cursor-pointer"
                          title={`تصفية سريعة حسب تصنيف: ${product.category}`}
                        >
                          <FolderKanban className="w-2.5 h-2.5" />
                          <span>{product.category}</span>
                        </button>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold border border-slate-200 text-[11px]">
                        {product.unit}
                      </span>
                    </td>
                    {/* Wholesale Price with Previous Price comparison */}
                    <td className="py-2.5 px-3 text-center">
                      <div className="flex flex-col items-center justify-center">
                        <span className="font-bold text-slate-900 font-mono text-xs">
                          {product.price_wholesale} ج.م
                        </span>
                        {product.old_price_wholesale !== undefined && product.old_price_wholesale !== product.price_wholesale && (
                          <div className="flex items-center gap-1 text-[10px] mt-0.5">
                            <span className="line-through text-slate-400 font-mono" title="السعر السابق للجملة">
                              {product.old_price_wholesale}
                            </span>
                            {(product.price_wholesale || 0) > product.old_price_wholesale ? (
                              <span className="text-rose-600 font-black font-mono" title="مقدار الزيادة">
                                (+{((product.price_wholesale || 0) - product.old_price_wholesale).toFixed(2)})
                              </span>
                            ) : (
                              <span className="text-emerald-600 font-black font-mono" title="مقدار الانخفاض">
                                (-{(product.old_price_wholesale - (product.price_wholesale || 0)).toFixed(2)})
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    {/* Retail Price with Previous Price comparison */}
                    <td className="py-2.5 px-3 text-center">
                      <div className="flex flex-col items-center justify-center">
                        <span className="font-bold text-blue-700 font-mono text-xs">
                          {product.price} ج.م
                        </span>
                        {product.old_price !== undefined && product.old_price !== product.price && (
                          <div className="flex items-center gap-1 text-[10px] mt-0.5">
                            <span className="line-through text-slate-400 font-mono" title="السعر السابق للمستهلك">
                              {product.old_price}
                            </span>
                            {product.price > product.old_price ? (
                              <span className="text-rose-600 font-black font-mono" title="مقدار الزيادة">
                                (+{(product.price - product.old_price).toFixed(2)})
                              </span>
                            ) : (
                              <span className="text-emerald-600 font-black font-mono" title="مقدار الانخفاض">
                                (-{(product.old_price - product.price).toFixed(2)})
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`font-black font-mono px-2 py-0.5 rounded ${
                        (product.stock ?? 0) <= 5
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : 'text-slate-800'
                      }`}>
                        {product.stock ?? 0}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openEditModal(product)}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-700 transition-colors cursor-pointer"
                          title="تعديل الصنف"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm(`هل أنت متأكد من حذف الصنف "${product.name}"؟`)) {
                              deleteProduct(product.id);
                              showToast('تم حذف الصنف بنجاح', 'info');
                            }
                          }}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-600 hover:text-white text-slate-700 transition-colors cursor-pointer"
                          title="حذف الصنف"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Tag className="w-8 h-8 text-slate-300" />
                      <p className="text-sm font-bold text-slate-700">
                        {priceStatusFilter === 'increase' && 'لا توجد أصناف زادت أسعارها في الاسترداد الأخير'}
                        {priceStatusFilter === 'decrease' && 'لا توجد أصناف نقصت أسعارها في الاسترداد الأخير'}
                        {priceStatusFilter === 'new' && 'لا توجد أصناف جديدة مضافة في الاسترداد الأخير'}
                        {priceStatusFilter === 'all' && (
                          searchQuery.trim()
                            ? `لا توجد نتائج مطابقة لكلمة البحث: "${searchQuery}"`
                            : 'لا توجد أصناف مطابقة لخيارات الفرز والتصفية المحددة'
                        )}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        {(searchQuery || selectedCategory !== 'all' || selectedUnit !== 'all' || priceStatusFilter !== 'all') && (
                          <button
                            type="button"
                            onClick={() => {
                              setSearchQuery('');
                              setSelectedCategory('all');
                              setSelectedUnit('all');
                              setPriceStatusFilter('all');
                              setIsSearchFocused(false);
                            }}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>عرض جميع الأصناف ({products.length})</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>إجمالي الأصناف المعروضة: <strong className="text-slate-900">{filteredProducts.length}</strong> من أصل {products.length} صنف</span>
          <span className="text-[11px] text-slate-400">
            لاسترداد وتحديث ملف الأصناف والأسعار (Excel)، انتقل إلى الإعدادات
          </span>
        </div>
      </div>

      {/* Add/Edit Product Modal (Clean White & Blue theme) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg overflow-hidden shadow-xl animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between p-4 bg-slate-900 text-white">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-400" />
                {editingProduct ? 'تعديل بيانات صنف' : 'إضافة صنف جديد إلى المخزون'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">اسم الصنف بالكامل *</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="مثال: سكر ابيض 900جرام *10كيس"
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-bold focus:bg-white focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">كود الصنف *</label>
                  <input
                    type="text"
                    required
                    value={formCode}
                    onChange={e => setFormCode(e.target.value)}
                    placeholder="10006"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono font-bold focus:bg-white focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">الوحدة *</label>
                  <input
                    type="text"
                    list="units-list"
                    required
                    value={formUnit}
                    onChange={e => setFormUnit(e.target.value)}
                    placeholder="كرتونه / بالتة / شكاره"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-bold focus:bg-white focus:outline-none focus:border-blue-600"
                  />
                  <datalist id="units-list">
                    {commonUnits.map(u => (
                      <option key={u} value={u} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">سعر الجملة (ج.م) *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={formWholesalePrice}
                    onChange={e => setFormWholesalePrice(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    placeholder="210"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono font-bold focus:bg-white focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">سعر القطاعي (ج.م) *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={formRetailPrice}
                    onChange={e => setFormRetailPrice(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    placeholder="212"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-blue-700 font-mono font-bold focus:bg-white focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">التصنيف</label>
                  <input
                    type="text"
                    list="categories-list"
                    value={formCategory}
                    onChange={e => setFormCategory(e.target.value)}
                    placeholder="مواد غذائية / منظفات..."
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                  />
                  <datalist id="categories-list">
                    {categories.map(c => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">الرصيد المبدئي</label>
                  <input
                    type="number"
                    value={formStock}
                    onChange={e => setFormStock(e.target.value === '' ? '' : parseInt(e.target.value))}
                    placeholder="50"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono font-bold focus:bg-white focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-100">
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer shadow-sm"
                >
                  {editingProduct ? 'حفظ التعديلات' : 'إضافة الصنف'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs rounded-lg font-bold transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable PDF Modal */}
      {isPdfPrintOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full p-6 space-y-4 max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-black text-slate-900">كشف أسعار وأصناف المخزن (PDF)</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Printer className="w-4 h-4" />
                  طباعة الآن / حفظ كـ PDF
                </button>
                <button
                  onClick={() => setIsPdfPrintOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 border border-slate-200 rounded-xl p-4 bg-white print:border-none print:p-0">
              <div className="text-center pb-4 border-b border-slate-200 mb-4">
                <h2 className="text-xl font-black text-slate-900">قائمة أسعار الأصناف والمخزون</h2>
                <p className="text-xs text-slate-500 mt-1">تاريخ الكشف: {new Date().toLocaleDateString('ar-EG')} - إجمالي الأصناف: {filteredProducts.length}</p>
              </div>

              <table className="w-full text-right text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-300 text-slate-800 font-bold">
                    <th className="py-2 px-3">#</th>
                    <th className="py-2 px-3">كود الصنف</th>
                    <th className="py-2 px-3">اسم الصنف</th>
                    <th className="py-2 px-3">الوحدة</th>
                    <th className="py-2 px-3">سعر الجملة</th>
                    <th className="py-2 px-3">سعر التجزئة</th>
                    <th className="py-2 px-3">الرصيد</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredProducts.map((p, idx) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 text-slate-400 font-mono">{idx + 1}</td>
                      <td className="py-2 px-3 font-mono font-bold text-blue-700">#{p.code}</td>
                      <td className="py-2 px-3 font-bold text-slate-900">{p.name}</td>
                      <td className="py-2 px-3 text-slate-600">{p.unit}</td>
                      <td className="py-2 px-3 font-mono font-bold text-blue-800">{p.price_wholesale || p.price} ج.م</td>
                      <td className="py-2 px-3 font-mono font-bold text-emerald-700">{p.price} ج.م</td>
                      <td className="py-2 px-3 font-mono">{p.stock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                onClick={() => setIsPdfPrintOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg cursor-pointer"
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

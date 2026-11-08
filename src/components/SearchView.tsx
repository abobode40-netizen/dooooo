import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Search, 
  X, 
  Copy, 
  Check, 
  TrendingUp, 
  TrendingDown, 
  Tag, 
  Package, 
  DollarSign, 
  Hash, 
  Printer, 
  Edit3, 
  Mic, 
  MicOff,
  Plus,
  ArrowRight,
  Filter
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Product } from '../types';
import { matchProductSearch } from '../utils/productImportExport';

interface SearchViewProps {
  onNavigateTab?: (tab: string) => void;
}

export const SearchView: React.FC<SearchViewProps> = ({ onNavigateTab }) => {
  const { products, updateProduct, showToast, theme } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'increase' | 'decrease' | 'new'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Quick edit modal
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editRetailPrice, setEditRetailPrice] = useState<number | ''>('');
  const [editWholesalePrice, setEditWholesalePrice] = useState<number | ''>('');
  const [editStock, setEditStock] = useState<number | ''>('');

  // Voice Search
  const [isListening, setIsListening] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Autofocus search on view mount
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  const isRedDark = theme === 'red_dark';
  const isDark = theme === 'dark';

  // Helper functions for price change status
  const isIncrease = (p: Product) => {
    if (p.price_change_type === 'increase') return true;
    const retailInc = p.old_price !== undefined && p.old_price > 0 && p.price > p.old_price;
    const wholesaleInc = p.old_price_wholesale !== undefined && p.old_price_wholesale > 0 && (p.price_wholesale || 0) > p.old_price_wholesale;
    return retailInc || wholesaleInc;
  };

  const isDecrease = (p: Product) => {
    if (p.price_change_type === 'decrease') return true;
    const retailDec = p.old_price !== undefined && p.old_price > 0 && p.price < p.old_price;
    const wholesaleDec = p.old_price_wholesale !== undefined && p.old_price_wholesale > 0 && (p.price_wholesale || 0) < p.old_price_wholesale;
    return retailDec || wholesaleDec;
  };

  const isNew = (p: Product) => Boolean(p.is_new);

  // Stats
  const stats = useMemo(() => {
    let inc = 0;
    let dec = 0;
    let nw = 0;
    products.forEach(p => {
      if (isIncrease(p)) inc++;
      else if (isDecrease(p)) dec++;
      if (isNew(p)) nw++;
    });
    return { increases: inc, decreases: dec, newItems: nw, total: products.length };
  }, [products]);

  // Unique categories
  const categories = useMemo(() => {
    const s = new Set<string>();
    products.forEach(p => {
      if (p.category && p.category.trim()) s.add(p.category.trim());
    });
    return Array.from(s);
  }, [products]);

  // Filtered products based on search query & filters
  const results = useMemo(() => {
    const q = searchQuery.trim();
    return products.filter(p => {
      // 1. Text search
      if (q && !matchProductSearch(p, q)) return false;

      // 2. Status filter
      if (activeFilter === 'increase' && !isIncrease(p)) return false;
      if (activeFilter === 'decrease' && !isDecrease(p)) return false;
      if (activeFilter === 'new' && !isNew(p)) return false;

      // 3. Category filter
      if (selectedCategory !== 'all' && (p.category || 'عام') !== selectedCategory) return false;

      return true;
    });
  }, [products, searchQuery, activeFilter, selectedCategory]);

  const handleCopyCode = (code: string) => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    showToast(`تم نسخ الكود: ${code}`, 'success');
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleOpenEdit = (p: Product) => {
    setEditingProduct(p);
    setEditRetailPrice(p.price);
    setEditWholesalePrice(p.price_wholesale ?? p.price);
    setEditStock(p.stock);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;

    const retail = typeof editRetailPrice === 'number' ? editRetailPrice : parseFloat(String(editRetailPrice)) || 0;
    const wholesale = typeof editWholesalePrice === 'number' ? editWholesalePrice : parseFloat(String(editWholesalePrice)) || 0;
    const stock = typeof editStock === 'number' ? editStock : parseInt(String(editStock), 10) || 0;

    const oldRetail = editingProduct.price;
    const oldWholesale = editingProduct.price_wholesale ?? editingProduct.price;

    let changeType = editingProduct.price_change_type;
    if (retail > oldRetail || wholesale > oldWholesale) {
      changeType = 'increase';
    } else if (retail < oldRetail || wholesale < oldWholesale) {
      changeType = 'decrease';
    }

    updateProduct(editingProduct.id, {
      price: retail,
      price_wholesale: wholesale,
      stock,
      old_price: oldRetail,
      old_price_wholesale: oldWholesale,
      price_change_type: changeType
    });

    showToast(`تم تحديث سعر وبيانات الصنف "${editingProduct.name}" بنجاح`, 'success');
    setEditingProduct(null);
  };

  // Voice Search Toggle
  const toggleVoiceSearch = () => {
    const SpeechRecognition = typeof window !== 'undefined'
      ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
      : null;

    if (!SpeechRecognition) {
      showToast('المتصفح لا يدعم ميزة البحث بالصوت، اكتب النص مباشرة', 'error');
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'ar-EG';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => setIsListening(true);
      recognition.onresult = (e: any) => {
        const text = e.results[0][0].transcript;
        setSearchQuery(text);
        setIsListening(false);
        showToast(`تم التعرف الصوتي: "${text}"`, 'success');
      };
      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);

      recognition.start();
    } catch {
      setIsListening(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-4 max-w-6xl mx-auto pb-10" dir="rtl">
      {/* Search Header Banner */}
      <div className={`p-4 sm:p-6 rounded-2xl border shadow-xs transition-colors ${
        isRedDark || isDark 
          ? 'bg-slate-900/90 border-slate-800' 
          : 'bg-white border-slate-200'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
                <Search className="w-5 h-5" />
              </span>
              <h2 className="text-lg sm:text-xl font-black">
                البحث السريع في الأصناف
              </h2>
            </div>
            <p className={`text-xs sm:text-sm ${isRedDark || isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              ابحث بكود الصنف، بالاسم، بالباركود، أو بالتصنيف مع ظهور فوري للنتائج والأسعار
            </p>
          </div>

          <div className="flex items-center gap-2">
            {onNavigateTab && (
              <button
                type="button"
                onClick={() => onNavigateTab('products')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors flex items-center gap-1.5 cursor-pointer ${
                  isRedDark || isDark 
                    ? 'border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200' 
                    : 'border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                <Package className="w-4 h-4" />
                <span>إدارة الأصناف الكاملة</span>
              </button>
            )}

            <button
              type="button"
              onClick={handlePrint}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors flex items-center gap-1.5 cursor-pointer ${
                isRedDark || isDark 
                  ? 'border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200' 
                  : 'border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              <Printer className="w-4 h-4" />
              <span>طباعة النتائج</span>
            </button>
          </div>
        </div>

        {/* The Main Search Input Box */}
        <div className="mt-4 relative">
          <div className="relative flex items-center">
            <Search className="w-5 h-5 absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="اكتب كود الصنف أو اسمه للبحث الفوري... (مثال: 101 أو جبنة أو زيت)"
              className={`w-full py-3.5 pr-12 pl-24 text-base sm:text-lg font-bold rounded-xl border outline-none transition-all shadow-inner ${
                isRedDark || isDark
                  ? 'bg-slate-950/70 border-slate-700 text-white placeholder-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
                  : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-500/20'
              }`}
            />

            {/* Clear button & Voice Search inside Input */}
            <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                  title="مسح البحث"
                >
                  <X className="w-4 h-4" />
                </button>
              )}

              <button
                type="button"
                onClick={toggleVoiceSearch}
                className={`p-1.5 rounded-lg transition-colors ${
                  isListening 
                    ? 'bg-red-500 text-white animate-pulse' 
                    : 'text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-slate-800'
                }`}
                title="البحث الصوتي"
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Quick Filter Badges */}
        <div className="mt-3.5 flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-800/80">
          <button
            type="button"
            onClick={() => setActiveFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeFilter === 'all'
                ? 'bg-blue-600 text-white shadow-xs'
                : (isRedDark || isDark ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200')
            }`}
          >
            الكل ({stats.total})
          </button>

          {stats.increases > 0 && (
            <button
              type="button"
              onClick={() => setActiveFilter('increase')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                activeFilter === 'increase'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>الزيادات ({stats.increases})</span>
            </button>
          )}

          {stats.decreases > 0 && (
            <button
              type="button"
              onClick={() => setActiveFilter('decrease')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                activeFilter === 'decrease'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900'
              }`}
            >
              <TrendingDown className="w-3.5 h-3.5" />
              <span>النواقص ({stats.decreases})</span>
            </button>
          )}

          {stats.newItems > 0 && (
            <button
              type="button"
              onClick={() => setActiveFilter('new')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                activeFilter === 'new'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900'
              }`}
            >
              <Tag className="w-3.5 h-3.5" />
              <span>جديد ({stats.newItems})</span>
            </button>
          )}

          {/* Categories dropdown filter */}
          {categories.length > 0 && (
            <div className="mr-auto flex items-center gap-1.5">
              <span className={`text-[11px] font-bold ${isRedDark || isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                التصنيف:
              </span>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className={`py-1 px-2.5 rounded-lg text-xs font-bold border outline-none cursor-pointer ${
                  isRedDark || isDark 
                    ? 'bg-slate-800 border-slate-700 text-slate-200' 
                    : 'bg-slate-100 border-slate-300 text-slate-800'
                }`}
              >
                <option value="all">جميع التصنيفات</option>
                {categories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Results Header Info */}
      <div className="flex items-center justify-between text-xs font-bold px-1">
        <span className={isRedDark || isDark ? 'text-slate-400' : 'text-slate-600'}>
          {searchQuery ? `نتائج البحث لـ "${searchQuery}":` : 'الأصناف المتاحة:'} 
          <span className="text-blue-500 mr-1 text-sm font-black">{results.length}</span> صنف
        </span>
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="text-blue-500 hover:underline cursor-pointer"
          >
            إعادة ضبط البحث
          </button>
        )}
      </div>

      {/* Results List */}
      {results.length === 0 ? (
        <div className={`p-12 text-center rounded-2xl border ${
          isRedDark || isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <Search className="w-12 h-12 mx-auto text-slate-400 mb-3 opacity-60" />
          <h3 className="text-base font-bold mb-1">لا توجد نتائج مطابقة للبحث</h3>
          <p className={`text-xs max-w-md mx-auto mb-4 ${isRedDark || isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            {searchQuery 
              ? `لم نعثر على أي صنف يطابق "${searchQuery}". تأكد من صحة الكود أو اسم الصنف.`
              : 'لا توجد أصناف تطابق الفلاتر المحددة حالياً.'}
          </p>
          <div className="flex justify-center gap-3">
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer"
              >
                عرض كل الأصناف
              </button>
            )}
            {onNavigateTab && (
              <button
                type="button"
                onClick={() => onNavigateTab('products')}
                className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold hover:bg-slate-300 dark:hover:bg-slate-700 cursor-pointer"
              >
                الذهاب لإضافة صنف جديد
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {results.map((product) => {
            const hasInc = isIncrease(product);
            const hasDec = isDecrease(product);
            const hasNew = isNew(product);
            const wholesale = product.price_wholesale ?? product.price;

            return (
              <div
                key={product.id}
                className={`p-4 rounded-2xl border transition-all hover:shadow-md flex flex-col justify-between ${
                  isRedDark || isDark 
                    ? 'bg-slate-900/80 border-slate-800 hover:border-slate-700' 
                    : 'bg-white border-slate-200 hover:border-blue-300'
                }`}
              >
                <div>
                  {/* Top: Code & Badges */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* Code Badge */}
                      <button
                        type="button"
                        onClick={() => handleCopyCode(product.code)}
                        className={`px-2 py-0.5 rounded-lg text-xs font-black tracking-wider flex items-center gap-1 cursor-pointer transition-colors ${
                          copiedCode === product.code
                            ? 'bg-emerald-500 text-white'
                            : (isRedDark || isDark ? 'bg-slate-800 text-blue-400 hover:bg-slate-700' : 'bg-blue-50 text-blue-700 hover:bg-blue-100')
                        }`}
                        title="انقر لنسخ الكود"
                      >
                        <Hash className="w-3 h-3 opacity-70" />
                        <span>{product.code || 'بدون كود'}</span>
                        {copiedCode === product.code ? (
                          <Check className="w-3 h-3 text-white" />
                        ) : (
                          <Copy className="w-3 h-3 opacity-50" />
                        )}
                      </button>

                      {/* Unit Badge */}
                      <span className={`px-2 py-0.5 rounded-lg text-[11px] font-bold ${
                        isRedDark || isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {product.unit || 'قطعة'}
                      </span>
                    </div>

                    {/* Price Change Pill */}
                    {hasInc && (
                      <span className="px-2 py-0.5 rounded-lg bg-rose-500/10 text-rose-500 text-[11px] font-black flex items-center gap-0.5 shrink-0 border border-rose-500/20">
                        <TrendingUp className="w-3 h-3" />
                        زيادة
                      </span>
                    )}
                    {hasDec && (
                      <span className="px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-500 text-[11px] font-black flex items-center gap-0.5 shrink-0 border border-emerald-500/20">
                        <TrendingDown className="w-3 h-3" />
                        نقص
                      </span>
                    )}
                    {hasNew && !hasInc && !hasDec && (
                      <span className="px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-500 text-[11px] font-black flex items-center gap-0.5 shrink-0 border border-amber-500/20">
                        <Tag className="w-3 h-3" />
                        جديد
                      </span>
                    )}
                  </div>

                  {/* Product Name */}
                  <h4 className="text-base font-black leading-snug line-clamp-2 mb-3">
                    {product.name}
                  </h4>

                  {/* Category */}
                  <div className={`text-[11px] mb-3 flex items-center gap-1 ${
                    isRedDark || isDark ? 'text-slate-400' : 'text-slate-500'
                  }`}>
                    <span>التصنيف:</span>
                    <span className="font-bold text-slate-700 dark:text-slate-300">
                      {product.category || 'عام'}
                    </span>
                  </div>

                  {/* Pricing Details */}
                  <div className={`p-3 rounded-xl mb-3 space-y-1.5 ${
                    isRedDark || isDark ? 'bg-slate-950/60' : 'bg-slate-50 border border-slate-100'
                  }`}>
                    {/* Wholesale Price */}
                    <div className="flex items-center justify-between text-xs">
                      <span className={isRedDark || isDark ? 'text-slate-400' : 'text-slate-500'}>
                        سعر الجملة:
                      </span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-base font-black text-blue-600 dark:text-blue-400">
                          {wholesale.toFixed(2)}
                        </span>
                        <span className="text-[10px] text-slate-400 font-bold">ج.م</span>
                        {product.old_price_wholesale && product.old_price_wholesale !== wholesale && (
                          <span className="text-[10px] line-through text-slate-400 mr-1.5">
                            كان {product.old_price_wholesale.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Retail Price */}
                    <div className="flex items-center justify-between text-xs">
                      <span className={isRedDark || isDark ? 'text-slate-400' : 'text-slate-500'}>
                        سعر القطاعي:
                      </span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
                          {product.price.toFixed(2)}
                        </span>
                        <span className="text-[10px] text-slate-400 font-bold">ج.م</span>
                        {product.old_price && product.old_price !== product.price && (
                          <span className="text-[10px] line-through text-slate-400 mr-1.5">
                            كان {product.old_price.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Stock */}
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200/50 dark:border-slate-800/50">
                      <span className={isRedDark || isDark ? 'text-slate-400' : 'text-slate-500'}>
                        الرصيد المتاح:
                      </span>
                      <span className={`font-black ${
                        product.stock <= 5 ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'
                      }`}>
                        {product.stock} {product.unit || 'قطعة'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bottom Actions */}
                <div className="pt-2 flex items-center justify-between gap-2 border-t border-slate-200/60 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(product)}
                    className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold border transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                      isRedDark || isDark 
                        ? 'border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200' 
                        : 'border-slate-200 bg-white hover:bg-slate-100 text-slate-800 shadow-2xs'
                    }`}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>تعديل السعر</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCopyCode(product.code)}
                    className={`p-1.5 rounded-xl border text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer ${
                      isRedDark || isDark ? 'border-slate-800 bg-slate-800' : 'border-slate-200 bg-slate-50'
                    }`}
                    title="نسخ كود الصنف"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Quick Edit Price Modal */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs" dir="rtl">
          <div className={`w-full max-w-md rounded-2xl border shadow-xl p-5 transition-all ${
            isRedDark || isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-blue-500" />
                <h3 className="text-base font-black">تعديل سريع للسعر والرصيد</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="my-3 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs">
              <p className="font-bold text-blue-600 dark:text-blue-400 mb-1">
                الصنف: {editingProduct.name}
              </p>
              <p className="text-slate-600 dark:text-slate-300">
                كود الصنف: <span className="font-mono font-black">{editingProduct.code}</span> | الوحدة: {editingProduct.unit}
              </p>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold mb-1">
                  سعر الجملة الجديد (ج.م):
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={editWholesalePrice}
                  onChange={(e) => setEditWholesalePrice(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  className={`w-full py-2 px-3 rounded-xl border text-sm font-bold outline-none ${
                    isRedDark || isDark 
                      ? 'bg-slate-950 border-slate-700 text-white focus:border-blue-500' 
                      : 'bg-white border-slate-300 text-slate-900 focus:border-blue-600'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-bold mb-1">
                  سعر القطاعي الجديد (ج.م):
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={editRetailPrice}
                  onChange={(e) => setEditRetailPrice(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  className={`w-full py-2 px-3 rounded-xl border text-sm font-bold outline-none ${
                    isRedDark || isDark 
                      ? 'bg-slate-950 border-slate-700 text-white focus:border-blue-500' 
                      : 'bg-white border-slate-300 text-slate-900 focus:border-blue-600'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-bold mb-1">
                  الرصيد المتاح ({editingProduct.unit}):
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  value={editStock}
                  onChange={(e) => setEditStock(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                  className={`w-full py-2 px-3 rounded-xl border text-sm font-bold outline-none ${
                    isRedDark || isDark 
                      ? 'bg-slate-950 border-slate-700 text-white focus:border-blue-500' 
                      : 'bg-white border-slate-300 text-slate-900 focus:border-blue-600'
                  }`}
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer"
                >
                  حفظ التعديلات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

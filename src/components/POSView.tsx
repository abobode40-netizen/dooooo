import React, { useState, useMemo } from 'react';
import { 
  Search, 
  ShoppingCart, 
  Plus, 
  Minus, 
  Trash2, 
  CheckCircle2, 
  Printer, 
  X, 
  Tag, 
  User, 
  DollarSign, 
  FileText,
  Layers,
  ArrowRight,
  Receipt,
  Package
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Product, SaleItem, Sale } from '../types';

interface CartItem {
  product: Product;
  quantity: number;
  priceType: 'retail' | 'wholesale';
  customPrice?: number;
}

export const POSView: React.FC = () => {
  const { products, completeSale, showToast } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState<number>(0);
  const [paymentType, setPaymentType] = useState<'cash' | 'debt' | 'visa'>('cash');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  // Categories list
  const categories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach(p => {
      if (p.category) cats.add(p.category);
    });
    return Array.from(cats);
  }, [products]);

  // Filtered products for quick picking
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchSearch =
        !searchQuery ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.code.toLowerCase().includes(searchQuery.toLowerCase());
      const matchCat = selectedCategory === 'all' || p.category === selectedCategory;
      return matchSearch && matchCat;
    });
  }, [products, searchQuery, selectedCategory]);

  const addToCart = (product: Product, priceType: 'retail' | 'wholesale' = 'retail') => {
    setCart(prev => {
      const index = prev.findIndex(item => item.product.id === product.id && item.priceType === priceType);
      if (index >= 0) {
        const next = [...prev];
        next[index] = { ...next[index], quantity: next[index].quantity + 1 };
        return next;
      }
      return [...prev, { product, quantity: 1, priceType }];
    });
  };

  const updateQuantity = (index: number, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(index);
      return;
    }
    setCart(prev => {
      const next = [...prev];
      next[index] = { ...next[index], quantity };
      return next;
    });
  };

  const toggleItemPriceType = (index: number) => {
    setCart(prev => {
      const next = [...prev];
      const current = next[index];
      const newType = current.priceType === 'retail' ? 'wholesale' : 'retail';
      next[index] = { ...current, priceType: newType };
      return next;
    });
  };

  const removeFromCart = (index: number) => {
    setCart(prev => prev.filter((_, i) => i !== index));
  };

  const clearCart = () => {
    setCart([]);
    setDiscount(0);
    setCustomerName('');
    setCustomerPhone('');
    setNotes('');
  };

  // Calculations
  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => {
      const unitPrice =
        item.customPrice !== undefined
          ? item.customPrice
          : item.priceType === 'wholesale'
          ? item.product.price_wholesale
          : item.product.price;
      return sum + unitPrice * item.quantity;
    }, 0);
  }, [cart]);

  const finalTotal = Math.max(0, subtotal - (Number(discount) || 0));

  const handleCheckout = (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) {
      showToast('سلة المشتريات فارغة!', 'error');
      return;
    }

    if (paymentType === 'debt' && !customerName.trim()) {
      showToast('يرجى إدخال اسم العميل لتسجيل الفاتورة على حسابه الآجل', 'error');
      return;
    }

    const saleItems: SaleItem[] = cart.map((item, idx) => {
      const unitPrice =
        item.customPrice !== undefined
          ? item.customPrice
          : item.priceType === 'wholesale'
          ? item.product.price_wholesale
          : item.product.price;
      return {
        id: `sitem-${idx}`,
        sale_id: '',
        product_id: item.product.id,
        product_name: item.product.name,
        unit: item.product.unit,
        quantity: item.quantity,
        unit_price: unitPrice,
        total_price: unitPrice * item.quantity,
        price_type: item.priceType
      };
    });

    const completed = completeSale({
      total_amount: subtotal,
      discount: Number(discount) || 0,
      final_amount: finalTotal,
      payment_type: paymentType,
      customer_name: customerName.trim() || 'عميل نقدي',
      customer_phone: customerPhone.trim() || undefined,
      cashier_name: 'كاشير رئيسي',
      notes: notes.trim() || undefined,
      items: saleItems
    });

    setLastSale(completed);
    setShowReceiptModal(true);
    clearCart();
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Products Selection Grid (Left / Top on mobile) */}
      <div className="lg:col-span-7 space-y-4">
        {/* Search & Categories */}
        <div className="bg-slate-800/80 rounded-2xl p-4 border border-slate-700/60 shadow-lg space-y-3">
          <div className="relative">
            <Search className="w-5 h-5 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="pos-search-input"
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="ابحث بالاسم أو كود الصنف (مثلاً: سكر، أوكسي، 10006)..."
              className="w-full bg-slate-900/90 border border-slate-700 rounded-xl pr-11 pl-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
              >
                مسح
              </button>
            )}
          </div>

          {/* Category Filter Chips */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none text-xs">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
                selectedCategory === 'all'
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-700/60'
              }`}
            >
              الكل ({products.length})
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === cat
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-700/60'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Product Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
          {filteredProducts.map(product => {
            const inCartCount = cart
              .filter(item => item.product.id === product.id)
              .reduce((sum, item) => sum + item.quantity, 0);

            return (
              <div
                key={product.id}
                id={`pos-product-${product.code}`}
                className="group relative bg-slate-800/90 hover:bg-slate-800 border border-slate-700/60 hover:border-amber-500/50 rounded-xl p-3.5 flex flex-col justify-between transition-all duration-150 shadow-md hover:shadow-amber-500/10"
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1.5">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-amber-400 font-semibold border border-slate-700">
                      #{product.code}
                    </span>
                    <span className="text-[11px] text-slate-400 font-medium px-1.5 py-0.5 rounded bg-slate-900/50">
                      {product.unit}
                    </span>
                  </div>
                  <h3 className="text-xs font-bold text-slate-100 line-clamp-2 leading-relaxed mb-2" title={product.name}>
                    {product.name}
                  </h3>
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-700/40">
                  <div className="flex items-center justify-between text-xs">
                    <div>
                      <div className="text-[10px] text-slate-400">قطاعي</div>
                      <div className="font-bold text-emerald-400">{product.price} ج.م</div>
                    </div>
                    <div className="text-left">
                      <div className="text-[10px] text-slate-400">جملة</div>
                      <div className="font-semibold text-amber-400">{product.price_wholesale} ج.م</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => addToCart(product, 'retail')}
                      className="w-full py-1.5 px-2 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white rounded-lg text-[11px] font-bold border border-emerald-500/30 transition-all flex items-center justify-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      قطاعي
                    </button>
                    <button
                      type="button"
                      onClick={() => addToCart(product, 'wholesale')}
                      className="w-full py-1.5 px-2 bg-amber-600/20 hover:bg-amber-600 text-amber-300 hover:text-white rounded-lg text-[11px] font-bold border border-amber-500/30 transition-all flex items-center justify-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      جملة
                    </button>
                  </div>
                </div>

                {inCartCount > 0 && (
                  <div className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-amber-500 text-slate-950 text-xs font-black flex items-center justify-center shadow-lg border-2 border-slate-900 animate-pulse">
                    {inCartCount}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {filteredProducts.length === 0 && (
          <div className="bg-slate-800/50 rounded-2xl p-12 text-center border border-dashed border-slate-700">
            <Package className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 text-sm font-semibold">لم يتم العثور على أصناف مطابقة للبحث</p>
          </div>
        )}
      </div>

      {/* Cart & Checkout Panel (Right Side) */}
      <div className="lg:col-span-5 bg-slate-800/90 rounded-2xl p-5 border border-slate-700 shadow-xl space-y-4 sticky top-24">
        <div className="flex items-center justify-between pb-3 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-amber-400" />
            <h2 className="text-sm font-bold text-white">سلة الفاتورة الحالية</h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-amber-300 font-bold">
              {cart.reduce((s, i) => s + i.quantity, 0)} قطعة
            </span>
          </div>
          {cart.length > 0 && (
            <button
              onClick={clearCart}
              className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 font-semibold transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              تفريغ السلة
            </button>
          )}
        </div>

        {/* Cart Items List */}
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {cart.map((item, index) => {
            const unitPrice =
              item.customPrice !== undefined
                ? item.customPrice
                : item.priceType === 'wholesale'
                ? item.product.price_wholesale
                : item.product.price;
            const itemTotal = unitPrice * item.quantity;

            return (
              <div
                key={`${item.product.id}-${item.priceType}-${index}`}
                className="bg-slate-900/80 rounded-xl p-3 border border-slate-800 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-slate-100">{item.product.name}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-slate-400">الوحدة: {item.product.unit}</span>
                      <button
                        onClick={() => toggleItemPriceType(index)}
                        className={`text-[10px] px-2 py-0.5 rounded font-bold transition-all ${
                          item.priceType === 'wholesale'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        }`}
                      >
                        {item.priceType === 'wholesale' ? 'سعر جملة' : 'سعر قطاعي'} (تغيير)
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={() => removeFromCart(index)}
                    className="text-slate-500 hover:text-rose-400 transition-colors p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
                  <div className="flex items-center gap-2 bg-slate-800 rounded-lg p-1 border border-slate-700">
                    <button
                      onClick={() => updateQuantity(index, item.quantity - 1)}
                      className="w-6 h-6 rounded bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-white"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={e => updateQuantity(index, Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-12 text-center bg-transparent text-white font-bold text-xs focus:outline-none"
                    />
                    <button
                      onClick={() => updateQuantity(index, item.quantity + 1)}
                      className="w-6 h-6 rounded bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-white"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="text-left">
                    <div className="text-[10px] text-slate-400">
                      {item.quantity} × {unitPrice} ج.م
                    </div>
                    <div className="font-bold text-amber-400">{itemTotal.toLocaleString()} ج.م</div>
                  </div>
                </div>
              </div>
            );
          })}

          {cart.length === 0 && (
            <div className="py-12 text-center">
              <ShoppingCart className="w-10 h-10 text-slate-600 mx-auto mb-2 opacity-50" />
              <p className="text-xs text-slate-400">اختر الأصناف من القائمة للبدء بعمل الفاتورة</p>
            </div>
          )}
        </div>

        {/* Invoice Customer & Payment Options Form */}
        <form onSubmit={handleCheckout} className="space-y-3 pt-3 border-t border-slate-700">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">اسم العميل / المحل</label>
              <input
                type="text"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                placeholder="عميل نقدي / اسم العميل"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">رقم الهاتف (اختياري)</label>
              <input
                type="text"
                value={customerPhone}
                onChange={e => setCustomerPhone(e.target.value)}
                placeholder="010..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Payment Method Selector */}
          <div>
            <label className="text-[11px] font-semibold text-slate-300 block mb-1.5">طريقة الدفع</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setPaymentType('cash')}
                className={`py-2 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  paymentType === 'cash'
                    ? 'bg-emerald-500 text-slate-950 font-black shadow-md shadow-emerald-500/20'
                    : 'bg-slate-900 text-slate-400 border border-slate-700 hover:text-white'
                }`}
              >
                <DollarSign className="w-3.5 h-3.5" />
                نقدي (كاش)
              </button>
              <button
                type="button"
                onClick={() => setPaymentType('debt')}
                className={`py-2 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  paymentType === 'debt'
                    ? 'bg-rose-500 text-white font-black shadow-md shadow-rose-500/20'
                    : 'bg-slate-900 text-slate-400 border border-slate-700 hover:text-white'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                آجل (على الحساب)
              </button>
              <button
                type="button"
                onClick={() => setPaymentType('visa')}
                className={`py-2 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  paymentType === 'visa'
                    ? 'bg-sky-500 text-slate-950 font-black shadow-md shadow-sky-500/20'
                    : 'bg-slate-900 text-slate-400 border border-slate-700 hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                شبكة / فيزا
              </button>
            </div>
          </div>

          {/* Discount & Totals */}
          <div className="bg-slate-900/90 rounded-xl p-3 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span>المجموع قبل الخصم:</span>
              <span className="font-semibold">{subtotal.toLocaleString()} ج.م</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300">الخصم الإضافي:</span>
              <div className="flex items-center gap-1 w-24">
                <input
                  type="number"
                  min="0"
                  value={discount || ''}
                  onChange={e => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                  placeholder="0"
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-xs text-right text-rose-400 font-bold focus:outline-none"
                />
                <span className="text-slate-400 text-[10px]">ج.م</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-base font-black">
              <span className="text-white">الصافي للدفع:</span>
              <span className="text-amber-400">{finalTotal.toLocaleString()} ج.م</span>
            </div>
          </div>

          {/* Checkout Button */}
          <button
            type="submit"
            disabled={cart.length === 0}
            className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-black text-sm rounded-xl shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-5 h-5" />
            حفظ وطباعة الفاتورة ({finalTotal.toLocaleString()} ج.م)
          </button>
        </form>
      </div>

      {/* Receipt Modal */}
      {showReceiptModal && lastSale && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 bg-slate-800/80 border-b border-slate-700">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                <CheckCircle2 className="w-5 h-5" />
                تم إصدار الفاتورة بنجاح
              </div>
              <button
                onClick={() => setShowReceiptModal(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Printable Receipt Area */}
            <div id="printable-receipt" className="p-5 bg-white text-slate-900 text-xs font-mono space-y-3">
              <div className="text-center border-b pb-3 border-dashed border-slate-300">
                <h2 className="text-base font-black text-slate-900">سوبرماركت / مخزن المواد الغذائية</h2>
                <p className="text-[10px] text-slate-600">فاتورة مبيعات نقدية وآجل</p>
                <div className="text-[11px] font-bold mt-1">رقم الفاتورة: {lastSale.invoice_number}</div>
                <div className="text-[10px] text-slate-500">{new Date(lastSale.created_at).toLocaleString('ar-EG')}</div>
              </div>

              <div className="space-y-1 text-[11px] border-b pb-2 border-dashed border-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-600">العميل:</span>
                  <span className="font-bold">{lastSale.customer_name}</span>
                </div>
                {lastSale.customer_phone && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">الهاتف:</span>
                    <span>{lastSale.customer_phone}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-600">طريقة الدفع:</span>
                  <span className="font-bold">
                    {lastSale.payment_type === 'cash' ? 'نقدي (كاش)' : lastSale.payment_type === 'debt' ? 'آجل (حساب)' : 'فيزا'}
                  </span>
                </div>
              </div>

              {/* Items */}
              <div className="space-y-1.5 border-b pb-3 border-dashed border-slate-300">
                <div className="flex justify-between font-bold text-[10px] text-slate-500 pb-1">
                  <span>الصنف والوحدة</span>
                  <span>الكمية × السعر</span>
                  <span>الإجمالي</span>
                </div>
                {lastSale.items.map((it, idx) => (
                  <div key={idx} className="flex justify-between items-center text-[11px]">
                    <div className="w-1/2 truncate font-semibold">
                      {it.product_name} ({it.unit})
                    </div>
                    <div className="text-center text-slate-600">
                      {it.quantity} × {it.unit_price}
                    </div>
                    <div className="font-bold text-left">{it.total_price} ج.م</div>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="space-y-1 pt-1 font-bold">
                <div className="flex justify-between text-xs">
                  <span>المجموع:</span>
                  <span>{lastSale.total_amount.toLocaleString()} ج.م</span>
                </div>
                {lastSale.discount > 0 && (
                  <div className="flex justify-between text-xs text-rose-600">
                    <span>الخصم:</span>
                    <span>-{lastSale.discount.toLocaleString()} ج.م</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-black border-t pt-2 border-slate-900">
                  <span>الصافي المدفوع:</span>
                  <span>{lastSale.final_amount.toLocaleString()} ج.م</span>
                </div>
              </div>

              <div className="text-center pt-3 border-t border-dashed border-slate-300 text-[10px] text-slate-500">
                شكراً لتعاملكم معنا! نتمنى لكم يوماً سعيداً.
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-4 bg-slate-800/90 border-t border-slate-700 flex gap-3">
              <button
                onClick={handlePrintReceipt}
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                <Printer className="w-4 h-4" />
                طباعة الإيصال
              </button>
              <button
                onClick={() => setShowReceiptModal(false)}
                className="px-5 py-2.5 bg-slate-700 hover:bg-slate-600 text-white font-semibold text-xs rounded-xl transition-colors"
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

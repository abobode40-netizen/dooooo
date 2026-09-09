import React, { useState, useMemo, useRef } from 'react';
import { 
  Truck, 
  Search, 
  Plus, 
  Trash2, 
  Printer, 
  Save, 
  DollarSign, 
  Barcode, 
  CheckCircle2,
  TrendingDown,
  Layers,
  ArrowRight,
  PackagePlus,
  Building2
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Product, Purchase, PurchaseItem } from '../types';

interface PurchaseRowItem {
  product: Product;
  quantity: number;
  unit: string;
  unitCost: number;
}

export const PurchaseInvoiceView: React.FC = () => {
  const { 
    products, 
    completePurchase, 
    showToast 
  } = useApp();

  // Draft State
  const [rows, setRows] = useState<PurchaseRowItem[]>([]);
  const [orderNumber, setOrderNumber] = useState<string>(() => 'PUR-' + Math.floor(10000 + Math.random() * 90000));
  const [orderDate, setOrderDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  
  // Supplier & Payment Info
  const [supplierCode, setSupplierCode] = useState<string>('SUP-01');
  const [supplierName, setSupplierName] = useState<string>('مورد رئيسي');
  const [supplierPhone, setSupplierPhone] = useState<string>('');
  const [paymentType, setPaymentType] = useState<'cash' | 'debt' | 'visa'>('cash');
  const [discount, setDiscount] = useState<number>(0);
  const [notes, setNotes] = useState<string>('');

  // Row selection & Quick insert state
  const [activeRowIndex, setActiveRowIndex] = useState<number>(0);
  const [quickSearchQuery, setQuickSearchQuery] = useState<string>('');
  const [quickQty, setQuickQty] = useState<number>(1);
  const [quickCost, setQuickCost] = useState<number | ''>('');
  const [showProductSearchModal, setShowProductSearchModal] = useState<boolean>(false);

  // Quick input ref
  const quickInputRef = useRef<HTMLInputElement>(null);

  // Active product details
  const activeRow = rows[activeRowIndex] || rows[rows.length - 1] || null;

  // Calculations
  const totalQuantity = useMemo(() => {
    return rows.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);
  }, [rows]);

  const totalAmount = useMemo(() => {
    return rows.reduce((sum, r) => sum + (Number(r.unitCost) || 0) * (Number(r.quantity) || 0), 0);
  }, [rows]);

  const finalAmount = Math.max(0, totalAmount - (Number(discount) || 0));

  // Day Name Arabic
  const arabicDayName = useMemo(() => {
    try {
      return new Date(orderDate).toLocaleDateString('ar-EG', { weekday: 'long' });
    } catch {
      return 'اليوم';
    }
  }, [orderDate]);

  // Autocomplete products
  const filteredProducts = useMemo(() => {
    if (!quickSearchQuery.trim()) return [];
    const q = quickSearchQuery.toLowerCase().trim();
    return products.filter(p => 
      p.name.toLowerCase().includes(q) || 
      p.code.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [quickSearchQuery, products]);

  // Handle row quantity update
  const handleUpdateQty = (index: number, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveRow(index);
      return;
    }
    setRows(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], quantity: newQty };
      return updated;
    });
  };

  // Handle row cost update
  const handleUpdateCost = (index: number, newCost: number) => {
    setRows(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        unitCost: Math.max(0, newCost)
      };
      return updated;
    });
  };

  // Remove row
  const handleRemoveRow = (index: number) => {
    setRows(prev => prev.filter((_, i) => i !== index));
    if (activeRowIndex >= index && activeRowIndex > 0) {
      setActiveRowIndex(activeRowIndex - 1);
    }
  };

  // Clear / New Invoice
  const handleNewInvoice = () => {
    if (rows.length > 0 && !window.confirm('هل تريد إلغاء الفاتورة الحالية وبدء إذن توريد جديد فارغ؟')) {
      return;
    }
    setRows([]);
    setDiscount(0);
    setNotes('');
    setOrderNumber('PUR-' + Math.floor(10000 + Math.random() * 90000));
    setOrderDate(new Date().toISOString().split('T')[0]);
    setQuickSearchQuery('');
    setQuickQty(1);
    setQuickCost('');
    showToast('تم بدء إذن توريد ومشتريات جديد فارغ', 'info');
    quickInputRef.current?.focus();
  };

  // Add Product to rows
  const handleAddProduct = (product: Product, qty: number = 1, cost?: number) => {
    const defaultCost = cost !== undefined && cost > 0 
      ? cost 
      : (product.cost && product.cost > 0 ? product.cost : (product.price_wholesale * 0.88));

    setRows(prev => {
      const existingIdx = prev.findIndex(r => r.product.id === product.id);
      if (existingIdx !== -1) {
        const updated = [...prev];
        updated[existingIdx] = {
          ...updated[existingIdx],
          quantity: updated[existingIdx].quantity + qty,
          unitCost: cost && cost > 0 ? cost : updated[existingIdx].unitCost
        };
        setActiveRowIndex(existingIdx);
        return updated;
      }
      const newRow: PurchaseRowItem = {
        product,
        quantity: qty,
        unit: product.unit || 'قطعة',
        unitCost: Number(defaultCost.toFixed(2))
      };
      setActiveRowIndex(prev.length);
      return [...prev, newRow];
    });

    setQuickSearchQuery('');
    setQuickQty(1);
    setQuickCost('');
    quickInputRef.current?.focus();
  };

  // Submit Quick Insert
  const handleQuickInsertSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickSearchQuery.trim()) return;

    const q = quickSearchQuery.toLowerCase().trim();
    const match = products.find(p => p.code.toLowerCase().trim() === q || p.name.toLowerCase().trim() === q) ||
                  products.find(p => p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q));

    if (match) {
      handleAddProduct(match, Number(quickQty) || 1, Number(quickCost) || undefined);
      showToast(`تم إدراج: ${match.name} بسعر توريد ${quickCost || match.cost || 'المسجل'}`);
    } else {
      showToast(`لم يتم العثور على صنف بالرمز أو الاسم "${quickSearchQuery}"`, 'error');
    }
  };

  // Save and Complete Purchase
  const handleSavePurchase = () => {
    if (rows.length === 0) {
      showToast('الفاتورة فارغة! يرجى إدراج صنف واحد على الأقل قبل الحفظ', 'error');
      return;
    }

    const purchaseItems: PurchaseItem[] = rows.map((r, idx) => {
      return {
        id: `pitem-${idx}`,
        purchase_id: '',
        product_id: r.product.id,
        code: r.product.code,
        product_name: r.product.name,
        unit: r.unit,
        quantity: r.quantity,
        unit_cost: r.unitCost,
        total_cost: r.unitCost * r.quantity
      };
    });

    completePurchase({
      total_amount: totalAmount,
      discount: Number(discount) || 0,
      final_amount: finalAmount,
      payment_type: paymentType,
      supplier_name: supplierName.trim() || 'مورد عام',
      supplier_code: supplierCode.trim() || 'SUP-01',
      supplier_phone: supplierPhone.trim() || undefined,
      warehouse: 'المخزن الرئيسي',
      notes: notes.trim() || undefined,
      items: purchaseItems
    });

    // Reset for next purchase invoice
    setRows([]);
    setDiscount(0);
    setNotes('');
    setOrderNumber('PUR-' + Math.floor(10000 + Math.random() * 90000));
    setOrderDate(new Date().toISOString().split('T')[0]);
    quickInputRef.current?.focus();
  };

  return (
    <div className="space-y-4 font-sans text-slate-800">
      {/* Top Header Card */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate-900 flex items-center justify-center text-white shadow-sm">
            <Truck className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black text-slate-900">فاتورة مشتريات وأذن توريد مخزن</h1>
              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200 font-mono text-xs font-bold">
                {orderNumber}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              إذن توريد وإضافة بضاعة للمخزن وتحديث تكاليف الشراء بنقرة واحدة
            </p>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleNewInvoice}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
            title="إذن جديد (F2)"
          >
            <Plus className="w-4 h-4 text-blue-400" />
            إذن جديد (F2)
          </button>
          
          <button
            onClick={() => setShowProductSearchModal(true)}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
            title="بحث في الأصناف (F3)"
          >
            <Search className="w-4 h-4" />
            إدراج صنف (F3)
          </button>

          <button
            onClick={handleSavePurchase}
            disabled={rows.length === 0}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
          >
            <PackagePlus className="w-4 h-4" />
            إضافة للمخزن وحفظ
          </button>
        </div>
      </div>

      {/* Main Invoice Sheet (Identical Structure to Sales) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Invoice Metadata Header Form */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
          {/* Order Number */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">رقم أذن التوريد / الشراء</label>
            <input
              type="text"
              value={orderNumber}
              onChange={e => setOrderNumber(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono font-bold text-slate-900 focus:outline-none focus:border-blue-600"
            />
          </div>

          {/* Date & Day */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              التاريخ <span className="text-blue-600">({arabicDayName})</span>
            </label>
            <input
              type="date"
              value={orderDate}
              onChange={e => setOrderDate(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-bold text-slate-900 focus:outline-none focus:border-blue-600"
            />
          </div>

          {/* Supplier Code */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">كود المورد / الشركة</label>
            <input
              type="text"
              value={supplierCode}
              onChange={e => setSupplierCode(e.target.value)}
              placeholder="مثال: SUP-01"
              className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono font-bold text-slate-900 focus:outline-none focus:border-blue-600"
            />
          </div>

          {/* Supplier Name */}
          <div className="lg:col-span-2">
            <label className="block text-[11px] font-bold text-slate-600 mb-1">اسم المورد أو الشركة الموردة</label>
            <input
              type="text"
              value={supplierName}
              onChange={e => setSupplierName(e.target.value)}
              placeholder="اكتب اسم المورد أو الشركة..."
              className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-bold text-slate-900 focus:outline-none focus:border-blue-600"
            />
          </div>

          {/* Supplier Phone */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">رقم هاتف المورد</label>
            <input
              type="text"
              value={supplierPhone}
              onChange={e => setSupplierPhone(e.target.value)}
              placeholder="010..."
              className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900 focus:outline-none focus:border-blue-600"
            />
          </div>
        </div>

        {/* Sub-bar: Payment & Target Warehouse */}
        <div className="p-3 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Payment Type Buttons */}
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-700">طريقة السداد للمورد:</span>
            <div className="inline-flex rounded-lg border border-slate-300 p-0.5 bg-slate-100">
              <button
                type="button"
                onClick={() => setPaymentType('cash')}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                  paymentType === 'cash' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                نقدي (من الخزينة)
              </button>
              <button
                type="button"
                onClick={() => setPaymentType('debt')}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                  paymentType === 'debt' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                آجل (مستحق للمورد)
              </button>
              <button
                type="button"
                onClick={() => setPaymentType('visa')}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                  paymentType === 'visa' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                تحويل بنكي / شيك
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-700">المخزن المستلم:</span>
            <span className="bg-slate-100 px-3 py-1 rounded-md font-bold text-slate-800 border border-slate-200">
              المخزن الرئيسي (افتراضي)
            </span>
          </div>

          <div className="text-xs font-bold text-slate-700">
            <span className="text-blue-700 bg-blue-50 px-2 py-1 rounded border border-blue-200">
              الأصناف تضاف فوراً لرصيد المخزن الفعلي
            </span>
          </div>
        </div>

        {/* Quick Product Insertion Bar */}
        <div className="p-3 bg-slate-50 border-b border-slate-200">
          <form onSubmit={handleQuickInsertSubmit} className="flex flex-wrap items-center gap-2 relative">
            <div className="relative flex-1 min-w-[240px]">
              <Barcode className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={quickInputRef}
                type="text"
                value={quickSearchQuery}
                onChange={e => setQuickSearchQuery(e.target.value)}
                placeholder="أدخل كود الصنف أو الباركود أو اسم الصنف واضغط Enter..."
                className="w-full bg-white border border-slate-300 rounded-lg pr-9 pl-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-600"
              />

              {/* Autocomplete Dropdown */}
              {filteredProducts.length > 0 && (
                <div className="absolute top-full right-0 left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-30 overflow-hidden divide-y divide-slate-100">
                  {filteredProducts.map(p => (
                    <div
                      key={p.id}
                      onClick={() => handleAddProduct(p, quickQty, Number(quickCost) || undefined)}
                      className="p-2.5 hover:bg-blue-50 cursor-pointer flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                          {p.code}
                        </span>
                        <span className="font-bold text-slate-900">{p.name}</span>
                        <span className="text-slate-500">({p.unit})</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-slate-500 text-[11px]">الرصيد الحالي: {p.stock}</span>
                        <span className="font-bold text-slate-800">
                          التكلفة: {p.cost_price || (p.price_wholesale * 0.88).toFixed(1)} ج.م
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <label className="text-xs font-bold text-slate-600">الكمية:</label>
              <input
                type="number"
                min="1"
                step="1"
                value={quickQty}
                onChange={e => setQuickQty(Math.max(1, Number(e.target.value)))}
                className="w-20 bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-center text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-600"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <label className="text-xs font-bold text-slate-600">سعر الشراء:</label>
              <input
                type="number"
                min="0"
                step="0.5"
                placeholder="التكلفة"
                value={quickCost}
                onChange={e => setQuickCost(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                className="w-24 bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-center text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-600"
              />
            </div>

            <button
              type="submit"
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg flex items-center gap-1 transition-colors cursor-pointer shadow-sm"
            >
              <Plus className="w-4 h-4 text-blue-400" />
              إدراج الصنف
            </button>
          </form>
        </div>

        {/* Active Selected Product Details Ribbon */}
        {activeRow && (
          <div className="px-4 py-2 bg-slate-100 border-b border-slate-200 flex flex-wrap items-center justify-between text-xs">
            <div className="flex items-center gap-4">
              <span className="font-bold text-slate-700">
                الصنف المورد: <span className="text-blue-700">{activeRow.product.name}</span>
              </span>
              <span className="text-slate-500">
                الوحدة: <span className="font-bold text-slate-800">{activeRow.unit}</span>
              </span>
              <span className="text-slate-500">
                الرصيد قبل التوريد: <span className="font-bold text-slate-800">{activeRow.product.stock} {activeRow.unit}</span>
              </span>
              <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                الرصيد بعد التوريد: {activeRow.product.stock + activeRow.quantity} {activeRow.unit}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-slate-500 text-[11px]">
                سعر بيع الجملة: {activeRow.product.price_wholesale} ج.م | القطاعي: {activeRow.product.price} ج.م
              </span>
            </div>
          </div>
        )}

        {/* Official 7-Column Accounting Table */}
        <div className="overflow-x-auto min-h-[260px]">
          <table className="w-full text-right border-collapse text-xs">
            <thead>
              <tr className="bg-slate-800 text-white font-bold border-b border-slate-700 text-[11px]">
                <th className="py-2.5 px-3 text-center w-12">م</th>
                <th className="py-2.5 px-3 text-center w-28">كود الصنف</th>
                <th className="py-2.5 px-4">اسم الصنف والبيان</th>
                <th className="py-2.5 px-3 text-center w-24">الوحدة</th>
                <th className="py-2.5 px-3 text-center w-24">الكمية الموردة</th>
                <th className="py-2.5 px-3 text-center w-28">سعر الشراء (ج.م)</th>
                <th className="py-2.5 px-4 text-left w-32">القيمة الإجمالية</th>
                <th className="py-2.5 px-2 text-center w-12">حذف</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <div className="max-w-xs mx-auto space-y-2">
                      <Truck className="w-10 h-10 mx-auto text-slate-300" />
                      <p className="font-bold text-slate-600 text-sm">إذن التوريد فارغ حالياً</p>
                      <p className="text-xs text-slate-400">
                        أدخل كود الصنف أو ابحث بالاسم في الشريط أعلاه لإدراجه فوراً
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => {
                  const rowTotal = row.unitCost * row.quantity;
                  const isSelected = activeRowIndex === index;

                  return (
                    <tr
                      key={`${row.product.id}-${index}`}
                      onClick={() => setActiveRowIndex(index)}
                      className={`cursor-pointer transition-colors ${
                        isSelected 
                          ? 'bg-blue-50/80 font-semibold' 
                          : index % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/50 hover:bg-slate-50'
                      }`}
                    >
                      {/* م */}
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-500 text-xs">
                        {index + 1}
                      </td>

                      {/* كود الصنف */}
                      <td className="py-2.5 px-3 text-center">
                        <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono font-bold text-slate-700 text-xs">
                          {row.product.code}
                        </span>
                      </td>

                      {/* اسم الصنف */}
                      <td className="py-2.5 px-4 font-bold text-slate-900">
                        {row.product.name}
                      </td>

                      {/* الوحدة */}
                      <td className="py-2.5 px-3 text-center text-slate-600 font-medium">
                        {row.unit}
                      </td>

                      {/* الكمية */}
                      <td className="py-2 px-3 text-center" onClick={e => e.stopPropagation()}>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={row.quantity}
                          onChange={e => handleUpdateQty(index, Math.max(1, Number(e.target.value)))}
                          className="w-16 text-center bg-white border border-slate-300 rounded px-1.5 py-1 text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-600 shadow-sm"
                        />
                      </td>

                      {/* سعر الشراء */}
                      <td className="py-2 px-3 text-center" onClick={e => e.stopPropagation()}>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={row.unitCost}
                          onChange={e => handleUpdateCost(index, Math.max(0, Number(e.target.value)))}
                          className="w-20 text-center bg-white border border-slate-300 rounded px-1.5 py-1 text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-600 shadow-sm"
                        />
                      </td>

                      {/* القيمة */}
                      <td className="py-2.5 px-4 text-left font-mono font-bold text-slate-900 text-xs">
                        {rowTotal.toLocaleString()} ج.م
                      </td>

                      {/* حذف */}
                      <td className="py-2 px-2 text-center" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => handleRemoveRow(index)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                          title="حذف البند"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Invoice Summary & Bottom Action Bar */}
        <div className="p-4 bg-slate-50 border-t border-slate-200">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-center">
            {/* Notes Field */}
            <div className="lg:col-span-2">
              <label className="block text-[11px] font-bold text-slate-600 mb-1">ملاحظات التوريد والشحن</label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="رقم فاتورة المورد الورقية أو أية شروط خاصة..."
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-blue-600"
              />
            </div>

            {/* Discount */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">خصم مكتسب من المورد (ج.م)</label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  value={discount}
                  onChange={e => setDiscount(Math.max(0, Number(e.target.value)))}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>

            {/* Final Totals Card */}
            <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm space-y-1 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>إجمالي الأصناف:</span>
                <span className="font-bold text-slate-900">{rows.length} صنف ({totalQuantity} قطعة)</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>المجموع الإجمالي:</span>
                <span className="font-bold text-slate-900">{totalAmount.toLocaleString()} ج.م</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>الخصم المكتسب:</span>
                  <span className="font-bold">-{discount.toLocaleString()} ج.م</span>
                </div>
              )}
              <div className="flex justify-between text-base font-black text-slate-900 border-t border-slate-200 pt-1">
                <span>إجمالي مستحق الشراء:</span>
                <span>{finalAmount.toLocaleString()} ج.م</span>
              </div>
            </div>
          </div>

          {/* Action Buttons Bar */}
          <div className="mt-4 pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">
                عند الحفظ: سيتم زيادة كميات الأصناف الموردة في جدول المخزن وتحديث سعر التكلفة
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setRows([])}
                disabled={rows.length === 0}
                className="px-4 py-2.5 bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-700 font-bold text-xs rounded-lg transition-colors cursor-pointer border border-slate-300 disabled:opacity-40"
              >
                مسح البنود
              </button>

              <button
                onClick={handleSavePurchase}
                disabled={rows.length === 0}
                className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold text-xs rounded-lg flex items-center gap-2 transition-colors cursor-pointer shadow-sm"
              >
                <Save className="w-4 h-4 text-blue-400" />
                حفظ وإذن توريد مخزن (Enter)
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Product Search Selection Modal (F3) */}
      {showProductSearchModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 w-full max-w-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Search className="w-4 h-4 text-blue-400" />
                البحث عن صنف لإدراجه في إذن التوريد (F3)
              </h3>
              <button 
                onClick={() => setShowProductSearchModal(false)}
                className="text-slate-400 hover:text-white text-xs font-bold px-2 py-1"
              >
                إغلاق (Esc)
              </button>
            </div>

            <div className="p-4 space-y-3">
              <input
                type="text"
                value={quickSearchQuery}
                onChange={e => setQuickSearchQuery(e.target.value)}
                placeholder="اكتب اسم الصنف أو الكود..."
                autoFocus
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-600"
              />

              <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg">
                {products
                  .filter(p => !quickSearchQuery.trim() || p.name.toLowerCase().includes(quickSearchQuery.toLowerCase()) || p.code.toLowerCase().includes(quickSearchQuery.toLowerCase()))
                  .slice(0, 15)
                  .map(prod => (
                    <div
                      key={prod.id}
                      onClick={() => {
                        handleAddProduct(prod, 1);
                        setShowProductSearchModal(false);
                      }}
                      className="p-3 hover:bg-blue-50 cursor-pointer flex items-center justify-between text-xs transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          {prod.code}
                        </span>
                        <div>
                          <div className="font-bold text-slate-900">{prod.name}</div>
                          <div className="text-[11px] text-slate-500">الوحدة: {prod.unit} | الرصيد الحالي: {prod.stock}</div>
                        </div>
                      </div>
                      <div className="text-left">
                        <div className="font-bold text-slate-900">
                          التكلفة: {prod.cost || (prod.price_wholesale * 0.88).toFixed(1)} ج.م
                        </div>
                        <div className="text-[10px] text-slate-400">
                          الجملة: {prod.price_wholesale} ج.م | القطاعي: {prod.price} ج.م
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

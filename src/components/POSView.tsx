import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Receipt, 
  Search, 
  Plus, 
  Minus,
  Trash2, 
  Printer, 
  Save, 
  UserCheck, 
  DollarSign, 
  Barcode, 
  AlertCircle,
  FileSpreadsheet,
  CheckCircle2,
  TrendingUp,
  RotateCcw,
  Layers,
  ArrowRight,
  Calculator,
  Percent,
  ListOrdered,
  LayoutGrid,
  MapPin,
  Phone,
  Users,
  X,
  FileDown,
  FileText,
  Eye
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Product, Sale, SaleItem, CustomerDebt } from '../types';
import { InvoicePrintModal } from './InvoicePrintModal';
import { exportSaleInvoiceDirectPDF } from '../utils/pdfExport';
import { normalizeArabicText } from '../utils/customerImportExport';
import { matchProductSearch } from '../utils/productImportExport';
import { SalesMovementChart } from './SalesMovementChart';

// Helper to convert Eastern Arabic digits to standard numerals
const convertArabicDigits = (str: string): string => {
  if (!str) return '';
  const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  return String(str).replace(/[٠-٩]/g, d => String(arabicDigits.indexOf(d)));
};

// Smart Customer Finder Helper
const findCustomerMatch = (query: string, list: CustomerDebt[]): CustomerDebt | null => {
  if (!query || !query.trim() || !list || list.length === 0) return null;
  const rawClean = query.trim();
  const digitsClean = convertArabicDigits(rawClean).toLowerCase();
  const normalizedQuery = normalizeArabicText(rawClean);

  // 1. Exact customer code match (with digit conversion)
  let found = list.find(c => {
    if (!c.customer_code) return false;
    const cCode = convertArabicDigits(c.customer_code.trim()).toLowerCase();
    return cCode === digitsClean || c.customer_code.trim().toLowerCase() === rawClean.toLowerCase();
  });
  if (found) return found;

  // 2. Pure numeric code matching (e.g. user typed "94" and code is "CUST-094" or "94")
  const queryNums = digitsClean.replace(/\D/g, '');
  if (queryNums) {
    found = list.find(c => {
      if (!c.customer_code) return false;
      const cNums = convertArabicDigits(c.customer_code).replace(/\D/g, '');
      return cNums && Number(cNums) === Number(queryNums);
    });
    if (found) return found;
  }

  // 3. Exact normalized name match
  found = list.find(c => {
    if (!c.customer_name) return false;
    return normalizeArabicText(c.customer_name) === normalizedQuery;
  });
  if (found) return found;

  // 4. Exact phone match
  if (queryNums.length >= 4) {
    found = list.find(c => {
      const p1 = c.phone ? convertArabicDigits(c.phone).replace(/\D/g, '') : '';
      const p2 = c.phone2 ? convertArabicDigits(c.phone2).replace(/\D/g, '') : '';
      return (p1 && (p1 === queryNums || p1.endsWith(queryNums))) || 
             (p2 && (p2 === queryNums || p2.endsWith(queryNums)));
    });
    if (found) return found;
  }

  return null;
};

interface InvoiceRowItem {
  product: Product;
  quantity: number;
  unit: string;
  unitPrice: number;
  customPrice?: number;
  priceType: 'wholesale' | 'retail';
}

export const POSView: React.FC = () => {
  const { 
    products, 
    completeSale, 
    customerDebts, 
    sales,
    showToast 
  } = useApp();

  // Invoice Draft State
  const [rows, setRows] = useState<InvoiceRowItem[]>([]);
  const [orderNumber, setOrderNumber] = useState<string>(() => 'INV-' + Math.floor(10000 + Math.random() * 90000));
  const [orderDate, setOrderDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  
  // Customer & Payment Info
  const [customerCode, setCustomerCode] = useState<string>('94');
  const [customerName, setCustomerName] = useState<string>('عميل نقدي عام');
  const [customerPhone, setCustomerPhone] = useState<string>('01000000094');
  const [customerAddress, setCustomerAddress] = useState<string>('المنفذ والمخزن الرئيسي');
  const [paymentType, setPaymentType] = useState<'cash' | 'debt' | 'visa'>('cash');
  const [pricingMode, setPricingMode] = useState<'wholesale' | 'retail'>('wholesale');
  const [discount, setDiscount] = useState<number>(0);
  const [notes, setNotes] = useState<string>('');

  // Row selection & Quick insert state
  const [activeRowIndex, setActiveRowIndex] = useState<number>(0);
  const [quickSearchQuery, setQuickSearchQuery] = useState<string>('');
  const [quickQty, setQuickQty] = useState<number>(1);
  const [showProductSearchModal, setShowProductSearchModal] = useState<boolean>(false);
  const [showCustomerSelectModal, setShowCustomerSelectModal] = useState<boolean>(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState<string>('');
  const [showProfitSummary, setShowProfitSummary] = useState<boolean>(false);

  // Print modal state
  const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(false);
  const [completedSaleForPrint, setCompletedSaleForPrint] = useState<Sale | null>(null);
  const [showSalesChartModal, setShowSalesChartModal] = useState<boolean>(false);

  // Quick input ref
  const quickInputRef = useRef<HTMLInputElement>(null);

  // Customer matching
  const matchedCustomer = useMemo(() => {
    return findCustomerMatch(customerCode, customerDebts) || 
           findCustomerMatch(customerName, customerDebts) || 
           null;
  }, [customerName, customerCode, customerDebts]);

  const previousBalance = matchedCustomer ? Number(matchedCustomer.current_debt) : 0;

  // Code suggestions dropdown state
  const [showCodeDropdown, setShowCodeDropdown] = useState<boolean>(false);
  const [showNameDropdown, setShowNameDropdown] = useState<boolean>(false);

  const codeSuggestions = useMemo(() => {
    if (!customerCode.trim() || customerCode.trim() === '94') return [];
    const q = convertArabicDigits(customerCode.trim()).toLowerCase();
    const qNums = q.replace(/\D/g, '');
    return customerDebts.filter(c => {
      const cCode = convertArabicDigits(c.customer_code || '').toLowerCase();
      const cNums = cCode.replace(/\D/g, '');
      const name = normalizeArabicText(c.customer_name || '');
      return (
        cCode.includes(q) ||
        (qNums && cNums && cNums.includes(qNums)) ||
        name.includes(normalizeArabicText(q))
      );
    }).slice(0, 6);
  }, [customerCode, customerDebts]);

  const nameSuggestions = useMemo(() => {
    if (!customerName.trim() || customerName.trim() === 'عميل نقدي عام') return [];
    const norm = normalizeArabicText(customerName);
    return customerDebts.filter(c => {
      const cNameNorm = normalizeArabicText(c.customer_name || '');
      const cCode = convertArabicDigits(c.customer_code || '').toLowerCase();
      return cNameNorm.includes(norm) || cCode.includes(norm);
    }).slice(0, 6);
  }, [customerName, customerDebts]);

  // Instant Customer Code Lookup Handler (as requested: writing customer code immediately populates name, phone, address)
  const handleCustomerCodeChange = (codeVal: string) => {
    setCustomerCode(codeVal);
    setShowCodeDropdown(true);
    const clean = codeVal.trim();
    if (!clean) return;

    const found = findCustomerMatch(codeVal, customerDebts);
    if (found) {
      setCustomerName(found.customer_name);
      setCustomerPhone(found.phone || found.phone2 || '');
      setCustomerAddress(found.address || '');
    }
  };

  // Instant Customer Name Change Handler
  const handleCustomerNameChange = (nameVal: string) => {
    setCustomerName(nameVal);
    setShowNameDropdown(true);
    const clean = nameVal.trim();
    if (!clean || clean === 'عميل نقدي عام') return;

    const found = findCustomerMatch(nameVal, customerDebts);
    if (found) {
      if (found.customer_code) setCustomerCode(found.customer_code);
      if (found.phone || found.phone2) setCustomerPhone(found.phone || found.phone2 || '');
      if (found.address) setCustomerAddress(found.address || '');
    }
  };

  // Handle selecting a customer from suggestions or directory modal
  const handleSelectCustomer = (c: CustomerDebt) => {
    setCustomerCode(c.customer_code || '');
    setCustomerName(c.customer_name);
    setCustomerPhone(c.phone || c.phone2 || '');
    setCustomerAddress(c.address || '');
    setShowCustomerSelectModal(false);
    setShowCodeDropdown(false);
    setShowNameDropdown(false);
    showToast(`تم ربط بيانات العميل: ${c.customer_name}`, 'success');
  };

  // Quick reset to cash customer
  const handleResetToCashCustomer = () => {
    setCustomerCode('94');
    setCustomerName('عميل نقدي عام');
    setCustomerPhone('01000000094');
    setCustomerAddress('المنفذ والمخزن الرئيسي');
    setShowCodeDropdown(false);
    setShowNameDropdown(false);
    showToast('تم ضبط العميل الافتراضي (عميل نقدي عام)', 'info');
  };

  // Active product details
  const activeRow = rows[activeRowIndex] || rows[rows.length - 1] || null;

  // Calculations
  const totalQuantity = useMemo(() => {
    return rows.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);
  }, [rows]);

  const totalAmount = useMemo(() => {
    return rows.reduce((sum, r) => {
      const price = r.customPrice !== undefined ? r.customPrice : r.unitPrice;
      return sum + price * (Number(r.quantity) || 0);
    }, 0);
  }, [rows]);

  const finalAmount = Math.max(0, totalAmount - (Number(discount) || 0));
  const newTotalBalance = previousBalance + (paymentType === 'debt' ? finalAmount : 0);

  // Profit calculations
  const totalCost = useMemo(() => {
    return rows.reduce((sum, r) => {
      const cost = Number(r.product.cost_price || (r.product.price_wholesale * 0.88));
      return sum + cost * (Number(r.quantity) || 0);
    }, 0);
  }, [rows]);

  const totalEstimatedProfit = finalAmount - totalCost;
  const profitMargin = finalAmount > 0 ? ((totalEstimatedProfit / finalAmount) * 100).toFixed(1) : '0';

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
    return products.filter(p => matchProductSearch(p, quickSearchQuery)).slice(0, 8);
  }, [quickSearchQuery, products]);

  // Handle row quantity update
  const handleUpdateQty = (index: number, newQty: number) => {
    setRows(prev => {
      if (!prev[index]) return prev;
      const updated = [...prev];
      updated[index] = { ...updated[index], quantity: newQty };
      return updated;
    });
  };

  // Handle row price update
  const handleUpdatePrice = (index: number, newPrice: number) => {
    setRows(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        unitPrice: Math.max(0, newPrice),
        customPrice: Math.max(0, newPrice)
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
    if (rows.length > 0 && !window.confirm('هل تريد إلغاء الفاتورة الحالية وبدء فاتورة بيع جديدة فارغة؟')) {
      return;
    }
    setRows([]);
    setDiscount(0);
    setNotes('');
    setCustomerCode('94');
    setCustomerName('عميل نقدي عام');
    setCustomerPhone('01000000094');
    setCustomerAddress('المنفذ والمخزن الرئيسي');
    setOrderNumber('INV-' + Math.floor(10000 + Math.random() * 90000));
    setOrderDate(new Date().toISOString().split('T')[0]);
    setQuickSearchQuery('');
    setQuickQty(1);
    showToast('تم بدء فاتورة بيع جديدة فارغة', 'info');
    quickInputRef.current?.focus();
  };

  // Add Product to rows
  const handleAddProduct = (product: Product, qty: number = 1) => {
    const price = pricingMode === 'wholesale' ? product.price_wholesale : product.price;
    setRows(prev => {
      const existingIdx = prev.findIndex(r => r.product.id === product.id && r.priceType === pricingMode);
      if (existingIdx !== -1) {
        const updated = [...prev];
        updated[existingIdx] = {
          ...updated[existingIdx],
          quantity: updated[existingIdx].quantity + qty
        };
        setActiveRowIndex(existingIdx);
        return updated;
      }
      const newRow: InvoiceRowItem = {
        product,
        quantity: qty,
        unit: product.unit || 'قطعة',
        unitPrice: price,
        priceType: pricingMode
      };
      setActiveRowIndex(prev.length);
      return [...prev, newRow];
    });

    setQuickSearchQuery('');
    setQuickQty(1);
    quickInputRef.current?.focus();
  };

  // Submit Quick Insert
  const handleQuickInsertSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickSearchQuery.trim()) return;

    const q = quickSearchQuery.toLowerCase().trim();
    const match = products.find(p => String(p.code || '').toLowerCase().trim() === q || String(p.name || '').toLowerCase().trim() === q) ||
                  products.find(p => String(p.code || '').toLowerCase().includes(q) || String(p.name || '').toLowerCase().includes(q));

    if (match) {
      handleAddProduct(match, Number(quickQty) || 1);
      showToast(`تم إدراج: ${match.name}`);
    } else {
      showToast(`لم يتم العثور على صنف بالرمز أو الاسم "${quickSearchQuery}"`, 'error');
    }
  };

  // Create draft sale object from current form state
  const buildCurrentSaleDraft = (): Sale => {
    const saleItems: SaleItem[] = rows.map((r, idx) => {
      const unitPrice = r.customPrice !== undefined ? r.customPrice : r.unitPrice;
      return {
        id: `draft-${idx}`,
        sale_id: '',
        product_id: r.product.id,
        code: r.product.code,
        product_name: r.product.name,
        unit: r.unit,
        quantity: r.quantity,
        unit_price: unitPrice,
        total_price: unitPrice * r.quantity,
        price_type: r.priceType,
        cost: r.product.cost_price || (r.product.price_wholesale * 0.88)
      };
    });

    return {
      id: 'draft-current',
      invoice_number: orderNumber || 'INV-001',
      total_amount: totalAmount,
      discount: Number(discount) || 0,
      final_amount: finalAmount,
      payment_type: paymentType,
      customer_name: customerName.trim() || 'عميل نقدي عام',
      customer_code: customerCode.trim() || '94',
      customer_phone: customerPhone.trim() || undefined,
      customer_address: customerAddress.trim() || undefined,
      cashier_name: 'الكاشير الرئيسي',
      notes: notes.trim() || undefined,
      warehouse: 'المخزن الرئيسي',
      items: saleItems,
      created_at: new Date(orderDate).toISOString()
    };
  };

  // Preview / Print current invoice without resetting
  const handlePreviewCurrentInvoice = () => {
    if (rows.length === 0) {
      showToast('الفاتورة فارغة! يرجى إدراج صنف واحد على الأقل للمعاينة والطباعة', 'error');
      return;
    }
    const draft = buildCurrentSaleDraft();
    setCompletedSaleForPrint(draft);
    setIsPrintModalOpen(true);
  };

  // Direct PDF Export for Current Invoice
  const handleDirectExportCurrentPdf = async (size: 'a4' | 'a5') => {
    if (rows.length === 0) {
      showToast('الفاتورة فارغة! يرجى إدراج صنف واحد على الأقل لتوليد ملف PDF', 'error');
      return;
    }
    const draft = buildCurrentSaleDraft();
    try {
      showToast(`جاري توليد ملف PDF بمقاس ${size.toUpperCase()}...`);
      await exportSaleInvoiceDirectPDF(draft, {
        pageSize: size,
        previousBalance
      });
      showToast(`تم تحميل الفاتورة بنجاح كملف PDF (${size.toUpperCase()})`);
    } catch (err) {
      console.error(err);
      showToast('حدث خطأ أثناء إنشاء ملف PDF', 'error');
    }
  };

  // Save and Complete Sale
  const handleSaveInvoice = (andPrint: boolean = false) => {
    if (rows.length === 0) {
      showToast('الفاتورة فارغة! يرجى إدراج صنف واحد على الأقل قبل الحفظ', 'error');
      return;
    }

    if (paymentType === 'debt' && (!customerName.trim() || customerName === 'عميل نقدي عام')) {
      showToast('يرجى كتابة اسم العميل عند اختيار السداد الآجل (على الحساب)', 'error');
      return;
    }

    const saleItems: SaleItem[] = rows.map((r, idx) => {
      const unitPrice = r.customPrice !== undefined ? r.customPrice : r.unitPrice;
      return {
        id: `sitem-${idx}`,
        sale_id: '',
        product_id: r.product.id,
        code: r.product.code,
        product_name: r.product.name,
        unit: r.unit,
        quantity: r.quantity,
        unit_price: unitPrice,
        total_price: unitPrice * r.quantity,
        price_type: r.priceType,
        cost: r.product.cost_price || (r.product.price_wholesale * 0.88)
      };
    });

    const savedSale = completeSale({
      total_amount: totalAmount,
      discount: Number(discount) || 0,
      final_amount: finalAmount,
      payment_type: paymentType,
      customer_name: customerName.trim() || 'عميل نقدي عام',
      customer_code: customerCode.trim() || '94',
      customer_phone: customerPhone.trim() || undefined,
      customer_address: customerAddress.trim() || undefined,
      cashier_name: 'الكاشير الرئيسي',
      notes: notes.trim() || undefined,
      warehouse: 'المخزن الرئيسي',
      items: saleItems
    });

    if (andPrint) {
      setCompletedSaleForPrint(savedSale);
      setIsPrintModalOpen(true);
    }

    // Reset for next invoice
    setRows([]);
    setDiscount(0);
    setNotes('');
    setCustomerCode('94');
    setCustomerName('عميل نقدي عام');
    setCustomerPhone('01000000094');
    setCustomerAddress('المنفذ والمخزن الرئيسي');
    setOrderNumber('INV-' + Math.floor(10000 + Math.random() * 90000));
    setOrderDate(new Date().toISOString().split('T')[0]);
    quickInputRef.current?.focus();
  };

  return (
    <div className="space-y-4 font-sans text-slate-800">
      {/* Top Header Card */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm">
            <Receipt className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black text-slate-900">فاتورة مبيعات وأذن صرف مخزن</h1>
              <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-mono text-xs font-bold">
                {orderNumber}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              أذن بيع رسمي معتمد - ربط فوري مع المخزون وحسابات الديون
            </p>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleNewInvoice}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
            title="فاتورة جديدة (F2)"
          >
            <Plus className="w-4 h-4 text-emerald-400" />
            فاتورة جديدة (F2)
          </button>
          
          <button
            onClick={() => setShowProductSearchModal(true)}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
            title="بحث في الأصناف (F3)"
          >
            <Search className="w-4 h-4" />
            إدراج صنف (F3)
          </button>

          {/* Sales Movement Chart Button */}
          <button
            type="button"
            onClick={() => setShowSalesChartModal(true)}
            className="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer border border-blue-200 shadow-2xs"
            title="عرض رسم بياني لحركة المبيعات خلال الـ 7 أيام الأخيرة"
          >
            <TrendingUp className="w-4 h-4 text-blue-600" />
            <span>حركة المبيعات (7 أيام)</span>
          </button>

          {/* Quick PDF A4 / A5 Dropdown or Direct Buttons */}
          <button
            onClick={handlePreviewCurrentInvoice}
            disabled={rows.length === 0}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-300 disabled:opacity-40 shadow-xs"
            title="معاينة وطباعة الفاتورة بمقاسات A4 و A5"
          >
            <Eye className="w-4 h-4 text-blue-600" />
            <span>معاينة وطباعة (A4 / A5)</span>
          </button>

          <button
            onClick={() => handleSaveInvoice(true)}
            disabled={rows.length === 0}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
            title="حفظ الفاتورة وفتح نافذة الطباعة وتوليد PDF"
          >
            <Printer className="w-4 h-4" />
            حفظ وطباعة
          </button>
        </div>
      </div>

      {/* Main Invoice Sheet (Clean White Design) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Invoice Metadata Header Form */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
          {/* Order Number */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">رقم الفاتورة / الأذن</label>
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
              التاريخ <span className="text-blue-600 font-normal">({arabicDayName})</span>
            </label>
            <input
              type="date"
              value={orderDate}
              onChange={e => setOrderDate(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-bold text-slate-900 focus:outline-none focus:border-blue-600"
            />
          </div>

          {/* Customer Code with auto-lookup */}
          <div className="relative">
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                <span>كود العميل</span>
                {matchedCustomer ? (
                  <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                    مرتبط ✓
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400 font-normal">
                    (اكتب الكود للاستدعاء)
                  </span>
                )}
              </label>
              <div className="flex items-center gap-1.5">
                {(customerCode !== '94' || customerName !== 'عميل نقدي عام') && (
                  <button
                    type="button"
                    onClick={handleResetToCashCustomer}
                    className="text-[10px] text-slate-500 hover:text-rose-600 font-bold flex items-center gap-0.5 cursor-pointer"
                    title="الرجوع للعميل النقدي العام الافتراضي"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    نقدي (94)
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowCustomerSelectModal(true)}
                  className="text-[10px] text-blue-600 hover:text-blue-800 font-bold flex items-center gap-0.5 cursor-pointer"
                  title="تصفح دليل العملاء"
                >
                  <Users className="w-3 h-3" />
                  الدليل
                </button>
              </div>
            </div>
            <div className="relative">
              <input
                type="text"
                value={customerCode}
                onFocus={() => setShowCodeDropdown(true)}
                onChange={e => handleCustomerCodeChange(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && codeSuggestions.length > 0) {
                    e.preventDefault();
                    handleSelectCustomer(codeSuggestions[0]);
                  }
                }}
                placeholder="مثال: 94 أو 101"
                className="w-full bg-white border border-slate-300 rounded-lg pr-2.5 pl-8 py-1.5 font-mono font-bold text-blue-700 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
              />
              <button
                type="button"
                onClick={() => setShowCustomerSelectModal(true)}
                className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600 cursor-pointer p-0.5"
                title="اختيار عميل من القائمة"
              >
                <Search className="w-3.5 h-3.5" />
              </button>

              {/* Code Autocomplete Dropdown */}
              {showCodeDropdown && codeSuggestions.length > 0 && (
                <div className="absolute z-30 top-full mt-1 right-0 w-72 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden divide-y divide-slate-100 max-h-56 overflow-y-auto">
                  <div className="p-1.5 bg-slate-50 text-[10px] font-bold text-slate-500 flex items-center justify-between">
                    <span>نتائج بحث كود العميل:</span>
                    <button 
                      type="button" 
                      onClick={() => setShowCodeDropdown(false)}
                      className="text-slate-400 hover:text-slate-600 p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  {codeSuggestions.map(c => (
                    <div
                      key={c.id}
                      onClick={() => handleSelectCustomer(c)}
                      className="p-2 hover:bg-blue-50 cursor-pointer flex items-center justify-between text-xs transition-colors"
                    >
                      <div>
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <span className="font-mono text-blue-700 bg-blue-50 px-1 py-0.5 rounded text-[10px] border border-blue-200">
                            {c.customer_code || '-'}
                          </span>
                          <span>{c.customer_name}</span>
                        </div>
                        {c.address && (
                          <div className="text-[10px] text-slate-500 truncate max-w-[180px] mt-0.5">
                            📍 {c.address}
                          </div>
                        )}
                      </div>
                      {Number(c.current_debt) > 0 && (
                        <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1 py-0.5 rounded shrink-0">
                          {Number(c.current_debt).toLocaleString()} ج.م
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Customer Name */}
          <div className="lg:col-span-2 relative">
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-bold text-slate-700">اسم العميل والبيان</label>
              {previousBalance > 0 && (
                <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 animate-pulse">
                  مديونية سابقة: {previousBalance.toLocaleString()} ج.م
                </span>
              )}
            </div>
            <div className="relative">
              <input
                type="text"
                value={customerName}
                onFocus={() => setShowNameDropdown(true)}
                onChange={e => handleCustomerNameChange(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && nameSuggestions.length > 0) {
                    e.preventDefault();
                    handleSelectCustomer(nameSuggestions[0]);
                  }
                }}
                placeholder="اكتب اسم العميل أو ابحث بالكود..."
                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-bold text-slate-900 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
              />

              {/* Name Autocomplete Dropdown */}
              {showNameDropdown && nameSuggestions.length > 0 && (
                <div className="absolute z-30 top-full mt-1 right-0 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden divide-y divide-slate-100 max-h-56 overflow-y-auto">
                  <div className="p-1.5 bg-slate-50 text-[10px] font-bold text-slate-500 flex items-center justify-between">
                    <span>نتائج بحث اسم العميل:</span>
                    <button 
                      type="button" 
                      onClick={() => setShowNameDropdown(false)}
                      className="text-slate-400 hover:text-slate-600 p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  {nameSuggestions.map(c => (
                    <div
                      key={c.id}
                      onClick={() => handleSelectCustomer(c)}
                      className="p-2 hover:bg-blue-50 cursor-pointer flex items-center justify-between text-xs transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded text-[10px] border border-blue-200">
                          {c.customer_code || '-'}
                        </span>
                        <div>
                          <span className="font-bold text-slate-900">{c.customer_name}</span>
                          {c.address && (
                            <span className="text-[10px] text-slate-500 block truncate max-w-xs">
                              📍 {c.address}
                            </span>
                          )}
                        </div>
                      </div>
                      {Number(c.current_debt) > 0 && (
                        <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1 py-0.5 rounded shrink-0">
                          {Number(c.current_debt).toLocaleString()} ج.م
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Customer Phone */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">رقم هاتف العميل</label>
            <div className="relative">
              <input
                type="text"
                value={customerPhone}
                onChange={e => setCustomerPhone(e.target.value)}
                placeholder="010..."
                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono text-slate-900 focus:outline-none focus:border-blue-600"
              />
            </div>
          </div>

          {/* Customer Address (Promptly loaded when entering customer code or selected) */}
          <div className="md:col-span-3 lg:col-span-6 bg-blue-50/70 border border-blue-200/80 rounded-lg p-2.5 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex-1 min-w-[260px] flex items-center gap-2">
              <span className="text-[11px] font-bold text-blue-900 flex items-center gap-1 shrink-0">
                <MapPin className="w-3.5 h-3.5 text-blue-600" />
                عنوان العميل (يظهر على الفاتورة):
              </span>
              <input
                type="text"
                value={customerAddress}
                onChange={e => setCustomerAddress(e.target.value)}
                placeholder="عنوان العميل ليتم طباعته على الفاتورة..."
                className="flex-1 bg-white border border-blue-200 rounded-md px-2.5 py-1 text-xs text-slate-900 focus:outline-none focus:border-blue-600 shadow-sm font-semibold"
              />
            </div>

            {matchedCustomer ? (
              <div className="flex items-center gap-2 text-[11px] text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 shadow-sm">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>
                  تم الربط التلقائي: <strong>{matchedCustomer.customer_name}</strong> (كود: {matchedCustomer.customer_code || '-'})
                </span>
                {previousBalance > 0 && (
                  <span className="font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded text-[10px]">
                    رصيد آجل: {previousBalance.toLocaleString()} ج.م
                  </span>
                )}
              </div>
            ) : (
              <div className="text-[11px] text-slate-500">
                💡 بمجرد كتابة <strong>كود العميل</strong> يتم استدعاء الاسم والهاتف والعنوان تلقائياً وتثبيتها بالفاتورة.
              </div>
            )}
          </div>
        </div>

        {/* Sub-bar: Payment & Pricing options */}
        <div className="p-3 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Payment Type Buttons */}
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-700">طريقة السداد:</span>
            <div className="inline-flex rounded-lg border border-slate-300 p-0.5 bg-slate-100">
              <button
                type="button"
                onClick={() => setPaymentType('cash')}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                  paymentType === 'cash' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                نقدي (كاش)
              </button>
              <button
                type="button"
                onClick={() => setPaymentType('debt')}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                  paymentType === 'debt' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                آجل (على الحساب)
              </button>
              <button
                type="button"
                onClick={() => setPaymentType('visa')}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                  paymentType === 'visa' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                شبكة / بنكي
              </button>
            </div>
          </div>

          {/* Pricing Mode */}
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-700">نوع السعر:</span>
            <div className="inline-flex rounded-lg border border-slate-300 p-0.5 bg-slate-100">
              <button
                type="button"
                onClick={() => setPricingMode('wholesale')}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                  pricingMode === 'wholesale' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                سعر الجملة
              </button>
              <button
                type="button"
                onClick={() => setPricingMode('retail')}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                  pricingMode === 'retail' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                سعر التجزئة (القطاعي)
              </button>
            </div>
          </div>

          {/* Quick Balance / Status */}
          <div className="text-xs font-bold text-slate-700">
            {paymentType === 'debt' ? (
              <span className="text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-200">
                الحساب بعد هذه الفاتورة: {newTotalBalance.toLocaleString()} ج.م
              </span>
            ) : (
              <span className="text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-200">
                فاتورة نقدية مدفوعة بالكامل
              </span>
            )}
          </div>
        </div>

        {/* Quick Product Insertion Bar */}
        <div className="p-3 bg-blue-50/50 border-b border-slate-200">
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
                      onClick={() => handleAddProduct(p, quickQty)}
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
                        <span className="text-slate-500 text-[11px]">المخزن: {p.stock}</span>
                        <span className="font-bold text-emerald-700">
                          {pricingMode === 'wholesale' ? p.price_wholesale : p.price} ج.م
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <label className="text-xs font-bold text-slate-700">الكمية:</label>
              <div className="inline-flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setQuickQty(prev => prev + 1)}
                  className="w-8 h-8 rounded-lg bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 text-emerald-700 border border-emerald-300 flex items-center justify-center font-black transition-all active:scale-95 cursor-pointer shadow-2xs"
                  title="زيادة الكمية (+1)"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={quickQty}
                  onChange={e => setQuickQty(Math.max(1, Number(e.target.value)))}
                  className="w-14 h-8 py-1.5 text-center text-xs font-black text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-500 shadow-2xs"
                />
                <button
                  type="button"
                  onClick={() => setQuickQty(prev => Math.max(1, prev - 1))}
                  disabled={quickQty <= 1}
                  className="w-8 h-8 rounded-lg bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-700 border border-rose-300 disabled:opacity-30 disabled:hover:bg-rose-50 flex items-center justify-center font-black transition-all active:scale-95 cursor-pointer shadow-2xs"
                  title="تقليل الكمية (-1)"
                >
                  <Minus className="w-4 h-4" />
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg flex items-center gap-1 transition-colors cursor-pointer shadow-sm"
            >
              <Plus className="w-4 h-4" />
              إدراج صنف
            </button>
          </form>
        </div>

        {/* Active Selected Product Details Ribbon */}
        {activeRow && (
          <div className="px-4 py-2 bg-slate-100 border-b border-slate-200 flex flex-wrap items-center justify-between text-xs">
            <div className="flex items-center gap-4">
              <span className="font-bold text-slate-700">
                الصنف المحدد: <span className="text-blue-700">{activeRow.product.name}</span>
              </span>
              <span className="text-slate-500">
                الوحدة: <span className="font-bold text-slate-800">{activeRow.unit}</span>
              </span>
              <span className="text-slate-500">
                رصيد المخزن: <span className="font-bold text-emerald-700">{activeRow.product.stock} {activeRow.unit}</span>
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-slate-500 text-[11px]">
                سعر الشراء / التكلفة: {activeRow.product.cost_price || (activeRow.product.price_wholesale * 0.88).toFixed(1)} ج.م
              </span>
              <span className="text-slate-500 text-[11px]">
                سعر الجملة: {activeRow.product.price_wholesale} ج.م | القطاعي: {activeRow.product.price} ج.م
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
                <th className="py-2.5 px-3 text-center w-32">الكمية</th>
                <th className="py-2.5 px-3 text-center w-28">السعر (ج.م)</th>
                <th className="py-2.5 px-4 text-left w-32">القيمة الإجمالية</th>
                <th className="py-2.5 px-2 text-center w-12">حذف</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <div className="max-w-xs mx-auto space-y-2">
                      <Receipt className="w-10 h-10 mx-auto text-slate-300" />
                      <p className="font-bold text-slate-600 text-sm">الفاتورة فارغة حالياً</p>
                      <p className="text-xs text-slate-400">
                        أدخل كود الصنف أو ابحث بالاسم في الشريط أعلاه لإدراجه فوراً
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => {
                  const currentPrice = row.customPrice !== undefined ? row.customPrice : row.unitPrice;
                  const rowTotal = currentPrice * row.quantity;
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

                      {/* الكمية مع زري الزيادة والنقصان */}
                      <td className="py-2 px-2 sm:px-3 text-center" onClick={e => e.stopPropagation()}>
                        <div className="inline-flex items-center justify-center gap-1">
                          {/* زر زيادة الكمية (+) */}
                          <button
                            type="button"
                            onClick={() => handleUpdateQty(index, Number(row.quantity || 0) + 1)}
                            className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 text-emerald-700 border border-emerald-300 flex items-center justify-center font-black transition-all active:scale-95 cursor-pointer shadow-2xs"
                            title="زيادة الكمية (+1)"
                          >
                            <Plus className="w-4 h-4" />
                          </button>

                          {/* رقم الكمية */}
                          <input
                            type="number"
                            min="1"
                            step="any"
                            value={row.quantity === 0 ? '' : row.quantity}
                            onChange={e => {
                              const val = e.target.value;
                              if (val === '') {
                                handleUpdateQty(index, 0);
                              } else {
                                const parsed = parseFloat(val);
                                if (!isNaN(parsed)) {
                                  handleUpdateQty(index, parsed);
                                }
                              }
                            }}
                            onBlur={() => {
                              if (!row.quantity || row.quantity <= 0) {
                                handleUpdateQty(index, 1);
                              }
                            }}
                            className="w-14 h-7 sm:h-8 py-1 text-center text-xs font-black text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-500 shadow-2xs"
                          />

                          {/* زر إنقاص الكمية (-) */}
                          <button
                            type="button"
                            onClick={() => handleUpdateQty(index, Math.max(1, Number(row.quantity || 1) - 1))}
                            disabled={row.quantity <= 1}
                            className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-700 border border-rose-300 disabled:opacity-30 disabled:hover:bg-rose-50 flex items-center justify-center font-black transition-all active:scale-95 cursor-pointer shadow-2xs"
                            title="نقصان الكمية (-1)"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                        </div>
                      </td>

                      {/* السعر */}
                      <td className="py-2 px-3 text-center" onClick={e => e.stopPropagation()}>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={currentPrice}
                          onChange={e => handleUpdatePrice(index, Math.max(0, Number(e.target.value)))}
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
              <label className="block text-[11px] font-bold text-slate-600 mb-1">ملاحظات الفاتورة</label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="أية شروط أو ملاحظات خاصة على الفاتورة..."
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-blue-600"
              />
            </div>

            {/* Discount */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">الخصم (ج.م)</label>
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
                <div className="flex justify-between text-rose-600">
                  <span>قيمة الخصم:</span>
                  <span className="font-bold">-{discount.toLocaleString()} ج.م</span>
                </div>
              )}
              <div className="flex justify-between text-base font-black text-blue-700 border-t border-slate-200 pt-1">
                <span>الصافي النهائي:</span>
                <span>{finalAmount.toLocaleString()} ج.م</span>
              </div>
            </div>
          </div>

          {/* Action Buttons Bar */}
          <div className="mt-4 pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowProfitSummary(!showProfitSummary)}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-300"
              >
                <TrendingUp className="w-4 h-4 text-blue-600" />
                {showProfitSummary ? 'إخفاء الربحية' : 'ربحية الأصناف'}
              </button>
              
              {showProfitSummary && (
                <div className="text-xs bg-white px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 flex items-center gap-3">
                  <span>م. التكلفة: <b>{totalCost.toFixed(0)} ج.م</b></span>
                  <span>الربح التقديري: <b className="text-emerald-600">+{totalEstimatedProfit.toFixed(0)} ج.م</b></span>
                  <span>الهامش: <b className="text-blue-600">{profitMargin}%</b></span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setRows([])}
                disabled={rows.length === 0}
                className="px-3.5 py-2.5 bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-700 font-bold text-xs rounded-lg transition-colors cursor-pointer border border-slate-300 disabled:opacity-40"
              >
                مسح البنود
              </button>

              {/* PDF A4 / A5 Fast Export Buttons */}
              <div className="flex items-center rounded-lg border border-slate-300 bg-slate-100 p-0.5">
                <button
                  type="button"
                  onClick={() => handleDirectExportCurrentPdf('a4')}
                  disabled={rows.length === 0}
                  className="px-2.5 py-2 bg-white hover:bg-slate-50 disabled:opacity-40 text-slate-800 font-bold text-xs rounded-md flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                  title="تصدير وتحميل الفاتورة الحالية كملف PDF بمقاس A4"
                >
                  <FileDown className="w-3.5 h-3.5 text-blue-600" />
                  <span>PDF (A4)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDirectExportCurrentPdf('a5')}
                  disabled={rows.length === 0}
                  className="px-2.5 py-2 hover:bg-white disabled:opacity-40 text-slate-800 font-bold text-xs rounded-md flex items-center gap-1 transition-all cursor-pointer"
                  title="تصدير وتحميل الفاتورة الحالية كملف PDF بمقاس A5"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-amber-600" />
                  <span>PDF (A5)</span>
                </button>
              </div>

              {/* Print Preview without saving */}
              <button
                type="button"
                onClick={handlePreviewCurrentInvoice}
                disabled={rows.length === 0}
                className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 disabled:opacity-40 text-slate-900 font-bold text-xs rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                title="معاينة الفاتورة قبل الحفظ واختيار المقاس A4 أو A5"
              >
                <Eye className="w-4 h-4 text-blue-600" />
                <span>معاينة وطباعة (A4 / A5)</span>
              </button>

              <button
                onClick={() => handleSaveInvoice(false)}
                disabled={rows.length === 0}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs rounded-lg flex items-center gap-2 transition-colors cursor-pointer shadow-sm"
              >
                <Save className="w-4 h-4" />
                حفظ وإذن صرف (Enter)
              </button>

              <button
                onClick={() => handleSaveInvoice(true)}
                disabled={rows.length === 0}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold text-xs rounded-lg flex items-center gap-2 transition-colors cursor-pointer shadow-sm"
              >
                <Printer className="w-4 h-4 text-amber-400" />
                حفظ وطباعة الفاتورة
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
                البحث عن صنف وإدراجه في الفاتورة (F3)
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
                  .filter(p => !quickSearchQuery.trim() || String(p.name || '').toLowerCase().includes(quickSearchQuery.toLowerCase()) || String(p.code || '').toLowerCase().includes(quickSearchQuery.toLowerCase()))
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
                        <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          {prod.code}
                        </span>
                        <div>
                          <div className="font-bold text-slate-900">{prod.name}</div>
                          <div className="text-[11px] text-slate-500">الوحدة: {prod.unit} | رصيد المخزن: {prod.stock}</div>
                        </div>
                      </div>
                      <div className="text-left">
                        <div className="font-bold text-blue-700">
                          {pricingMode === 'wholesale' ? prod.price_wholesale : prod.price} ج.م
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {pricingMode === 'wholesale' ? 'سعر جملة' : 'سعر قطاعي'}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Customer Directory / Selection Modal */}
      {showCustomerSelectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl overflow-hidden border border-slate-200">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-400" />
                <h3 className="font-bold text-sm">دليل العملاء واختيار العميل للفاتورة</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCustomerSelectModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="relative">
                <input
                  type="text"
                  value={customerSearchQuery}
                  onChange={e => setCustomerSearchQuery(e.target.value)}
                  placeholder="ابحث بكود العميل، الاسم، رقم الهاتف، أو العنوان..."
                  autoFocus
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg pr-9 pl-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-600 shadow-inner"
                />
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              </div>

              <div className="text-[11px] text-slate-500 flex items-center justify-between px-1">
                <span>انقر على العميل لاستدعاء بياناته (الكود، الاسم، الهاتف، العنوان) تلقائياً:</span>
                <span className="font-bold text-slate-700">{customerDebts.length} عميل مسجل</span>
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl">
                {customerDebts
                  .filter(c => {
                    if (!customerSearchQuery.trim()) return true;
                    const q = customerSearchQuery.toLowerCase().trim();
                    return (
                      (c.customer_code && c.customer_code.toLowerCase().includes(q)) ||
                      c.customer_name.toLowerCase().includes(q) ||
                      (c.phone && c.phone.includes(q)) ||
                      (c.phone2 && c.phone2.includes(q)) ||
                      (c.address && c.address.toLowerCase().includes(q))
                    );
                  })
                  .map(c => {
                    const debt = Number(c.current_debt) || 0;
                    const isSelected = customerCode === c.customer_code || customerName === c.customer_name;
                    return (
                      <div
                        key={c.id}
                        onClick={() => handleSelectCustomer(c)}
                        className={`p-3 hover:bg-blue-50 cursor-pointer flex items-center justify-between text-xs transition-colors ${
                          isSelected ? 'bg-blue-50/80 border-r-4 border-blue-600' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-1 rounded border border-blue-200 text-xs">
                            {c.customer_code || 'بدون كود'}
                          </span>
                          <div>
                            <div className="font-bold text-slate-900 flex items-center gap-2">
                              <span>{c.customer_name}</span>
                              {isSelected && (
                                <span className="text-[10px] bg-blue-600 text-white px-1.5 py-0.2 rounded font-normal">
                                  الحالي بالفاتورة
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-3 mt-0.5">
                              {c.phone && (
                                <span className="flex items-center gap-1">
                                  <Phone className="w-3 h-3 text-slate-400" />
                                  <span className="font-mono">{c.phone}</span>
                                </span>
                              )}
                              {c.address && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="w-3 h-3 text-slate-400" />
                                  <span>{c.address}</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="text-left">
                          {debt > 0 ? (
                            <span className="inline-block font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 text-[11px]">
                              مديونية: {debt.toLocaleString()} ج.م
                            </span>
                          ) : (
                            <span className="inline-block text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[11px]">
                              خالص الحساب
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sales Movement Chart Modal */}
      {showSalesChartModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5" dir="rtl">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl p-4 sm:p-6 space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">رسم بياني لحركة المبيعات - آخر 7 أيام</h3>
                  <p className="text-xs text-slate-500">إحصائيات المبيعات، الفواتير الصادرة، وتوزيع النقد والآجل</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSalesChartModal(false)}
                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <SalesMovementChart sales={sales || []} />

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowSalesChartModal(false)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Print Modal */}
      <InvoicePrintModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        sale={completedSaleForPrint}
        previousBalance={previousBalance}
      />
    </div>
  );
};

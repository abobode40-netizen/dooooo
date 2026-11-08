import React, { useState, useRef, useMemo } from 'react';
import { 
  FileSpreadsheet, 
  Upload, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  Check, 
  Download, 
  Search, 
  TrendingUp, 
  TrendingDown, 
  PlusCircle, 
  Users, 
  Package, 
  FileDown, 
  RotateCcw,
  Layers,
  ArrowRight
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { 
  parseExcelFile, 
  autoDetectColumnMapping, 
  processImportRows, 
  downloadSampleExcelTemplate, 
  compareImportWithExisting,
  ColumnMapping, 
  ParsedImportItem, 
  ComparedImportItem 
} from '../utils/productImportExport';
import { 
  parseCustomerExcelFile, 
  autoDetectCustomerColumnMapping, 
  processCustomerImportRows, 
  compareCustomersWithExisting, 
  downloadCustomerExcelTemplate,
  CustomerColumnMapping,
  ParsedCustomerItem,
  ComparedCustomerItem
} from '../utils/customerImportExport';

interface ExcelImportViewProps {
  onNavigateTab?: (tab: string) => void;
}

export const ExcelImportView: React.FC<ExcelImportViewProps> = ({ onNavigateTab }) => {
  const { 
    products, 
    customerDebts, 
    bulkImportProducts, 
    bulkImportCustomers, 
    showToast 
  } = useApp();

  // Active sub-mode: Products import OR Customers import
  const [activeImportType, setActiveImportType] = useState<'products' | 'customers'>('products');
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileName, setFileName] = useState('');

  // -------------------------------------------------------------
  // Products Import State
  // -------------------------------------------------------------
  const [productHeaders, setProductHeaders] = useState<string[]>([]);
  const [productRawRows, setProductRawRows] = useState<Record<string, any>[]>([]);
  const [productMapping, setProductMapping] = useState<ColumnMapping>({
    codeCol: '',
    nameCol: '',
    unitCol: '',
    wholesalePriceCol: '',
    retailPriceCol: '',
    stockCol: '',
    categoryCol: ''
  });
  const [parsedProducts, setParsedProducts] = useState<ParsedImportItem[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [productFilterStatus, setProductFilterStatus] = useState<'all' | 'increase' | 'decrease' | 'new' | 'unchanged'>('all');

  const productFileInputRef = useRef<HTMLInputElement>(null);

  // Comparison against existing products based STRICTLY on code
  const productComparison = useMemo(() => {
    return compareImportWithExisting(parsedProducts, products);
  }, [parsedProducts, products]);

  const filteredComparedProducts = useMemo(() => {
    return productComparison.items.filter(item => {
      if (productFilterStatus === 'increase' && item.changeStatus !== 'increase') return false;
      if (productFilterStatus === 'decrease' && item.changeStatus !== 'decrease') return false;
      if (productFilterStatus === 'new' && item.changeStatus !== 'new') return false;
      if (productFilterStatus === 'unchanged' && item.changeStatus !== 'unchanged') return false;

      if (productSearch.trim()) {
        const q = productSearch.toLowerCase().trim();
        const mName = String(item.name || '').toLowerCase().includes(q);
        const mCode = String(item.code || '').toLowerCase().includes(q);
        if (!mName && !mCode) return false;
      }
      return true;
    });
  }, [productComparison.items, productFilterStatus, productSearch]);

  const handleProductFileUpload = async (file: File) => {
    try {
      setIsProcessing(true);
      setFileName(file.name);
      const buffer = await file.arrayBuffer();
      const { headers, rawRows } = parseExcelFile(buffer);

      if (rawRows.length === 0) {
        showToast('الملف فارغ أو لا يحتوي على صفوف بيانات صالحة', 'error');
        setIsProcessing(false);
        return;
      }

      setProductHeaders(headers);
      setProductRawRows(rawRows);

      const detected = autoDetectColumnMapping(headers, rawRows);
      setProductMapping(detected);

      const parsed = processImportRows(rawRows, detected);
      setParsedProducts(parsed);
      showToast(`تمت قراءة ${parsed.length} صنف ومطابقة الأعمدة تلقائياً`, 'success');
    } catch (err) {
      console.error(err);
      showToast('حدث خطأ أثناء قراءة ملف الإكسيل', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmProductImport = () => {
    const validItems = parsedProducts.filter(i => i.isValid && (i.name || i.code));
    if (validItems.length === 0) {
      showToast('لا توجد أصناف صالحة للاستيراد', 'error');
      return;
    }

    const payload = validItems.map(item => ({
      name: String(item.name || '').trim(),
      code: String(item.code || '').trim(),
      unit: String(item.unit || '').trim() || 'كرتونه',
      price: item.price_retail,
      price_wholesale: item.price_wholesale || item.price_retail,
      cost: 0,
      stock: item.stock || 50,
      category: item.category || 'عام',
      barcode: item.barcode || null
    }));

    // Perform code-based merge update and log price changes automatically
    bulkImportProducts(payload, 'merge');

    showToast(`تم تحديث الأسعار وإضافة الأصناف بنجاح بناء على الكود (${validItems.length} صنف)`, 'success');
    
    // Switch to Price Changes list if available
    if (onNavigateTab) {
      onNavigateTab('price_changes');
    }
  };

  // -------------------------------------------------------------
  // Customers Import State
  // -------------------------------------------------------------
  const [customerHeaders, setCustomerHeaders] = useState<string[]>([]);
  const [customerRawRows, setCustomerRawRows] = useState<Record<string, any>[]>([]);
  const [customerMapping, setCustomerMapping] = useState<CustomerColumnMapping>({
    codeCol: '',
    nameCol: '',
    phoneCol: '',
    phone2Col: '',
    addressCol: '',
    debtCol: '',
    notesCol: ''
  });
  const [parsedCustomers, setParsedCustomers] = useState<ParsedCustomerItem[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');

  const customerFileInputRef = useRef<HTMLInputElement>(null);

  const customerComparison = useMemo(() => {
    return compareCustomersWithExisting(parsedCustomers, customerDebts);
  }, [parsedCustomers, customerDebts]);

  const filteredComparedCustomers = useMemo(() => {
    return customerComparison.items.filter(item => {
      if (customerSearch.trim()) {
        const q = customerSearch.toLowerCase().trim();
        const mName = String(item.customer_name || '').toLowerCase().includes(q);
        const mCode = String(item.customer_code || '').toLowerCase().includes(q);
        const mPhone = String(item.phone || '').includes(q);
        if (!mName && !mCode && !mPhone) return false;
      }
      return true;
    });
  }, [customerComparison.items, customerSearch]);

  const handleCustomerFileUpload = async (file: File) => {
    try {
      setIsProcessing(true);
      setFileName(file.name);
      const buffer = await file.arrayBuffer();
      const { headers, rawRows } = parseCustomerExcelFile(buffer);

      if (rawRows.length === 0) {
        showToast('الملف فارغ أو لا يحتوي على صفوف بيانات صالحة', 'error');
        setIsProcessing(false);
        return;
      }

      setCustomerHeaders(headers);
      setCustomerRawRows(rawRows);

      const detected = autoDetectCustomerColumnMapping(headers);
      setCustomerMapping(detected);

      const parsed = processCustomerImportRows(rawRows, detected, customerDebts.length);
      setParsedCustomers(parsed);
      showToast(`تمت قراءة ${parsed.length} عميل ومطابقة الأعمدة بنجاح`, 'success');
    } catch (err) {
      console.error(err);
      showToast('حدث خطأ أثناء قراءة ملف عملاء الإكسيل', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmCustomerImport = () => {
    const validCustomers = parsedCustomers.filter(c => c.isValid && c.customer_name);
    if (validCustomers.length === 0) {
      showToast('لا يوجد عملاء صالحين للاستيراد', 'error');
      return;
    }

    bulkImportCustomers(validCustomers, 'merge');
    showToast(`تم تحديث واستيراد ${validCustomers.length} عميل وربط مديونياتهم بنجاح`, 'success');

    if (onNavigateTab) {
      onNavigateTab('customers');
    }
  };

  return (
    <div className="space-y-4 font-sans text-slate-800 animate-in fade-in duration-150">
      {/* Header Banner */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-600 flex items-center justify-center text-white shadow-sm">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              استرداد وتحديث البيانات من ملف الإكسيل
            </h2>
            <p className="text-xs text-slate-500">
              التحديث يتم بالكود مباشرة؛ ترصد الزيادات والنواقص والجديد آلياً وترتبط المديونيات بالعملاء
            </p>
          </div>
        </div>

        {/* Section Switcher */}
        <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200">
          <button
            type="button"
            onClick={() => setActiveImportType('products')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeImportType === 'products'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>استرداد الأصناف والأسعار (بالكود)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveImportType('customers')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeImportType === 'customers'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>استرداد العملاء والمديونيات</span>
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 1. PRODUCTS IMPORT SECTION */}
      {/* ------------------------------------------------------------- */}
      {activeImportType === 'products' && (
        <div className="space-y-4">
          {/* Upload & Actions Card */}
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span>رفع ملف إكسيل لتحديث أسعار الأصناف</span>
                  <span className="text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200">
                    المطابقة بالكود فقط
                  </span>
                </h3>
                <p className="text-xs text-slate-500">
                  إذا تطابق الكود يتم تحديث السعر والاسم فوراً ورصد الزيادة أو النقصان. وإذا كان الكود جديداً يضاف كصنف جديد دون تكرار.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={downloadSampleExcelTemplate}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer border border-slate-300"
                  title="تنزيل نموذج إكسيل جاهز يحتوي على الأعمدة الخمسة"
                >
                  <Download className="w-4 h-4 text-emerald-600" />
                  <span>تنزيل نموذج أصناف جاهز</span>
                </button>

                <input
                  type="file"
                  ref={productFileInputRef}
                  accept=".xlsx, .xls, .csv"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handleProductFileUpload(file);
                    e.target.value = '';
                  }}
                />

                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => productFileInputRef.current?.click()}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-2 cursor-pointer shadow-sm disabled:opacity-60"
                >
                  {isProcessing ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  <span>اختر ملف إكسيل للأصناف</span>
                </button>
              </div>
            </div>

            {/* When items are parsed: show analysis metrics & confirm button */}
            {parsedProducts.length > 0 && (
              <div className="pt-4 border-t border-slate-100 space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-center">
                    <span className="text-[11px] text-slate-500 block">إجمالي أصناف الملف</span>
                    <strong className="text-sm font-mono text-slate-900">{productComparison.stats.total}</strong>
                  </div>

                  <div className="bg-rose-50 border border-rose-200 rounded-lg p-2.5 text-center">
                    <span className="text-[11px] text-rose-700 font-bold flex items-center justify-center gap-1">
                      <TrendingUp className="w-3.5 h-3.5" />
                      <span>زيادة في السعر</span>
                    </span>
                    <strong className="text-sm font-mono text-rose-800">{productComparison.stats.increases}</strong>
                  </div>

                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 text-center">
                    <span className="text-[11px] text-emerald-700 font-bold flex items-center justify-center gap-1">
                      <TrendingDown className="w-3.5 h-3.5" />
                      <span>نقص في السعر</span>
                    </span>
                    <strong className="text-sm font-mono text-emerald-800">{productComparison.stats.decreases}</strong>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 text-center">
                    <span className="text-[11px] text-blue-700 font-bold flex items-center justify-center gap-1">
                      <PlusCircle className="w-3.5 h-3.5" />
                      <span>أصناف جديدة بالكود</span>
                    </span>
                    <strong className="text-sm font-mono text-blue-800">{productComparison.stats.newItems}</strong>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-center">
                    <span className="text-[11px] text-slate-500 block">أسعار ثابتة</span>
                    <strong className="text-sm font-mono text-slate-700">{productComparison.stats.unchanged}</strong>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                  <div className="text-xs text-slate-600">
                    اسم الملف المرفوع: <strong className="font-mono text-slate-800">{fileName}</strong>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setParsedProducts([]);
                        setProductRawRows([]);
                        setFileName('');
                      }}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition-colors cursor-pointer"
                    >
                      إلغاء الملف
                    </button>

                    <button
                      type="button"
                      onClick={handleConfirmProductImport}
                      className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-lg transition-colors flex items-center gap-2 cursor-pointer shadow-md"
                    >
                      <Check className="w-4 h-4 text-emerald-300" />
                      <span>اعتماد وتحديث الأسعار في قاعدة البيانات</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Table Preview of changes */}
          {parsedProducts.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setProductFilterStatus('all')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg cursor-pointer transition-colors ${
                      productFilterStatus === 'all' ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 border border-slate-200'
                    }`}
                  >
                    الكل ({productComparison.items.length})
                  </button>

                  <button
                    type="button"
                    onClick={() => setProductFilterStatus('increase')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg cursor-pointer transition-colors ${
                      productFilterStatus === 'increase' ? 'bg-rose-600 text-white' : 'bg-white text-rose-700 border border-rose-200'
                    }`}
                  >
                    الزيادات فقط ({productComparison.stats.increases})
                  </button>

                  <button
                    type="button"
                    onClick={() => setProductFilterStatus('decrease')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg cursor-pointer transition-colors ${
                      productFilterStatus === 'decrease' ? 'bg-emerald-600 text-white' : 'bg-white text-emerald-700 border border-emerald-200'
                    }`}
                  >
                    النواقص فقط ({productComparison.stats.decreases})
                  </button>

                  <button
                    type="button"
                    onClick={() => setProductFilterStatus('new')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg cursor-pointer transition-colors ${
                      productFilterStatus === 'new' ? 'bg-blue-600 text-white' : 'bg-white text-blue-700 border border-blue-200'
                    }`}
                  >
                    الجديد فقط ({productComparison.stats.newItems})
                  </button>
                </div>

                <div className="w-full sm:w-64 relative">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={productSearch}
                    onChange={e => setProductSearch(e.target.value)}
                    placeholder="ابحث في معاينة الملف..."
                    className="w-full bg-white border border-slate-300 rounded-lg pr-9 pl-3 py-1.5 text-xs"
                  />
                </div>
              </div>

              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-800 text-white sticky top-0 font-bold text-[11px]">
                    <tr>
                      <th className="py-2.5 px-3">كود الصنف</th>
                      <th className="py-2.5 px-3">اسم الصنف</th>
                      <th className="py-2.5 px-3">الوحدة</th>
                      <th className="py-2.5 px-3 text-center">حالة السعر</th>
                      <th className="py-2.5 px-3 text-left">جملة قديم</th>
                      <th className="py-2.5 px-3 text-left">جملة جديد</th>
                      <th className="py-2.5 px-3 text-left">قطاعي قديم</th>
                      <th className="py-2.5 px-3 text-left">قطاعي جديد</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredComparedProducts.slice(0, 100).map((item, idx) => (
                      <tr key={idx} className="hover:bg-blue-50/40">
                        <td className="py-2 px-3 font-mono font-bold text-slate-800">
                          #{item.code}
                        </td>
                        <td className="py-2 px-3 font-bold text-slate-900">
                          {item.name}
                        </td>
                        <td className="py-2 px-3 text-slate-600">
                          {item.unit || 'كرتونه'}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {item.changeStatus === 'increase' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-50 text-rose-700 border border-rose-200">
                              زيادة ⬆️
                            </span>
                          )}
                          {item.changeStatus === 'decrease' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                              نقصان ⬇️
                            </span>
                          )}
                          {item.changeStatus === 'new' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-200">
                              جديد 🆕
                            </span>
                          )}
                          {item.changeStatus === 'unchanged' && (
                            <span className="text-slate-400 text-[10px]">
                              ثابت
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-left font-mono text-slate-500">
                          {item.oldWholesale || '-'}
                        </td>
                        <td className="py-2 px-3 text-left font-mono font-bold text-slate-900">
                          {item.price_wholesale}
                        </td>
                        <td className="py-2 px-3 text-left font-mono text-slate-500">
                          {item.oldRetail || '-'}
                        </td>
                        <td className="py-2 px-3 text-left font-mono font-bold text-blue-700">
                          {item.price_retail}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 2. CUSTOMERS IMPORT SECTION */}
      {/* ------------------------------------------------------------- */}
      {activeImportType === 'customers' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span>رفع ملف إكسيل للعملاء والمديونيات</span>
                  <span className="text-[11px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200">
                    ربط بالمديونية وفواتير البيع
                  </span>
                </h3>
                <p className="text-xs text-slate-500">
                  يتم تحديث أرقام الهواتف، العناوين، والأرصدة الافتتاحية للمديونية، وربطها بسجل الفواتير.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={downloadCustomerExcelTemplate}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer border border-slate-300"
                >
                  <Download className="w-4 h-4 text-emerald-600" />
                  <span>تنزيل نموذج عملاء جاهز</span>
                </button>

                <input
                  type="file"
                  ref={customerFileInputRef}
                  accept=".xlsx, .xls, .csv"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handleCustomerFileUpload(file);
                    e.target.value = '';
                  }}
                />

                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => customerFileInputRef.current?.click()}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-2 cursor-pointer shadow-sm disabled:opacity-60"
                >
                  {isProcessing ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  <span>اختر ملف إكسيل للعملاء</span>
                </button>
              </div>
            </div>

            {parsedCustomers.length > 0 && (
              <div className="pt-4 border-t border-slate-100 space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-center">
                    <span className="text-[11px] text-slate-500 block">إجمالي العملاء بالملف</span>
                    <strong className="text-sm font-mono text-slate-900">{parsedCustomers.length}</strong>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 text-center">
                    <span className="text-[11px] text-blue-700 font-bold">عملاء جدد</span>
                    <strong className="text-sm font-mono text-blue-800">{customerComparison.newCount}</strong>
                  </div>

                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 text-center">
                    <span className="text-[11px] text-emerald-700 font-bold">عملاء حاليون يتم تحديثهم</span>
                    <strong className="text-sm font-mono text-emerald-800">{customerComparison.updateCount}</strong>
                  </div>

                  <div className="bg-rose-50 border border-rose-200 rounded-lg p-2.5 text-center">
                    <span className="text-[11px] text-rose-700 font-bold">إجمالي مديونيات الملف</span>
                    <strong className="text-sm font-mono text-rose-800">
                      {customerComparison.totalDebt.toLocaleString()} ج.م
                    </strong>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                  <div className="text-xs text-slate-600">
                    ملف العملاء: <strong className="font-mono text-slate-800">{fileName}</strong>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setParsedCustomers([]);
                        setCustomerRawRows([]);
                        setFileName('');
                      }}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition-colors cursor-pointer"
                    >
                      إلغاء الملف
                    </button>

                    <button
                      type="button"
                      onClick={handleConfirmCustomerImport}
                      className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-lg transition-colors flex items-center gap-2 cursor-pointer shadow-md"
                    >
                      <Check className="w-4 h-4 text-emerald-300" />
                      <span>اعتماد واستيراد العملاء والمديونيات</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Customers Preview Table */}
          {parsedCustomers.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
                <span className="text-xs font-bold text-slate-700">معاينة عملاء الملف قبل الاعتماد</span>
                <div className="w-64 relative">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={customerSearch}
                    onChange={e => setCustomerSearch(e.target.value)}
                    placeholder="ابحث بالاسم أو الهاتف..."
                    className="w-full bg-white border border-slate-300 rounded-lg pr-9 pl-3 py-1.5 text-xs"
                  />
                </div>
              </div>

              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-800 text-white sticky top-0 font-bold text-[11px]">
                    <tr>
                      <th className="py-2.5 px-3">كود العميل</th>
                      <th className="py-2.5 px-3">اسم العميل</th>
                      <th className="py-2.5 px-3">الهاتف</th>
                      <th className="py-2.5 px-3">العنوان</th>
                      <th className="py-2.5 px-3 text-left">المديونية</th>
                      <th className="py-2.5 px-3 text-center">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredComparedCustomers.map((cust, idx) => (
                      <tr key={idx} className="hover:bg-blue-50/40">
                        <td className="py-2 px-3 font-mono font-bold text-slate-700">
                          {cust.customer_code}
                        </td>
                        <td className="py-2 px-3 font-bold text-slate-900">
                          {cust.customer_name}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-600">
                          {cust.phone || '-'}
                        </td>
                        <td className="py-2 px-3 text-slate-600">
                          {cust.address || '-'}
                        </td>
                        <td className="py-2 px-3 text-left font-mono font-bold text-rose-700">
                          {cust.initialDebt ? `${cust.initialDebt.toLocaleString()} ج.م` : 'خالص'}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {cust.status === 'new' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] bg-blue-50 text-blue-700 font-bold border border-blue-200">
                              جديد
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                              تحديث
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

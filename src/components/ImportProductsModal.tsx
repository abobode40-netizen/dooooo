import React, { useState, useRef, useMemo, useEffect } from 'react';
import { 
  FileSpreadsheet, 
  FileText, 
  Download, 
  Upload, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  RefreshCw, 
  Check, 
  Layers, 
  FileUp, 
  Trash2, 
  Info,
  HelpCircle,
  Sparkles,
  Search,
  TrendingUp,
  TrendingDown,
  PlusCircle,
  MinusCircle,
  Filter,
  FileDown,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { 
  parseExcelFile, 
  autoDetectColumnMapping, 
  processImportRows, 
  parseTextOrPdfTable,
  downloadSampleExcelTemplate,
  compareImportWithExisting,
  exportPriceChangesToExcel,
  saveColumnMapping,
  getSavedColumnMapping,
  ColumnMapping, 
  ParsedImportItem,
  ComparedImportItem
} from '../utils/productImportExport';

// Setup pdfjs worker if available
import * as pdfjsLib from 'pdfjs-dist';

try {
  if (typeof window !== 'undefined' && pdfjsLib && (pdfjsLib as any).GlobalWorkerOptions) {
    (pdfjsLib as any).GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '3.11.174'}/pdf.worker.min.js`;
  }
} catch (e) {
  console.warn('PDF.js worker initialization skipped:', e);
}

interface ImportProductsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ImportSourceTab = 'excel' | 'pdf';
type PriceFilterType = 'all' | 'without_unit' | 'with_unit' | 'new_only' | 'changes_only' | 'increases_only' | 'decreases_only' | 'unchanged';

export const ImportProductsModal: React.FC<ImportProductsModalProps> = ({ isOpen, onClose }) => {
  const { products, bulkImportProducts, recordPriceChangeDay, showToast } = useApp();

  const [activeTab, setActiveTab] = useState<ImportSourceTab>('excel');
  const [priceFilter, setPriceFilter] = useState<PriceFilterType>('all');
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [fileName, setFileName] = useState<string>('');

  // Excel parsing state with saved mapping recovery
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, any>[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>(() => {
    const saved = getSavedColumnMapping();
    return {
      codeCol: saved?.codeCol || '',
      nameCol: saved?.nameCol || '',
      unitCol: saved?.unitCol || '',
      wholesalePriceCol: saved?.wholesalePriceCol || '',
      retailPriceCol: saved?.retailPriceCol || '',
      stockCol: '',
      categoryCol: ''
    };
  });

  // Parsed Items
  const [parsedItems, setParsedItems] = useState<ParsedImportItem[]>([]);
  const [previewSearch, setPreviewSearch] = useState('');
  const [pdfTextRaw, setPdfTextRaw] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfFileInputRef = useRef<HTMLInputElement>(null);

  // Check if preview items look like they have code and name swapped
  const isSuspectedSwapped = useMemo(() => {
    if (parsedItems.length === 0) return false;
    const sample = parsedItems.slice(0, 10);
    const swappedInSample = sample.filter(i => {
      const nameVal = (i.name || '').trim();
      const codeVal = (i.code || '').trim();
      return (/^\d+$/.test(nameVal) && !/^\d+$/.test(codeVal)) || (!/[\u0600-\u06FF]/.test(nameVal) && /[\u0600-\u06FF]/.test(codeVal));
    }).length;
    return swappedInSample >= Math.max(1, Math.floor(sample.length * 0.4));
  }, [parsedItems]);

  const handleSwapCodeAndName = () => {
    const newMapping = {
      ...mapping,
      codeCol: mapping.nameCol,
      nameCol: mapping.codeCol
    };
    setMapping(newMapping);
    saveColumnMapping(newMapping);
    if (rawRows.length > 0) {
      const processed = processImportRows(rawRows, newMapping);
      setParsedItems(processed);
      showToast('تم تبديل وعكس عمود الاسم وعمود الكود وتثبيت التطابق بنجاح', 'success');
    }
  };

  // Compare parsed items with current products database to calculate price increases, decreases & new items
  const comparison = useMemo(() => {
    return compareImportWithExisting(parsedItems, products);
  }, [parsedItems, products]);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Handle Excel/CSV File Upload
  const handleExcelUpload = async (file: File) => {
    try {
      setIsProcessingFile(true);
      setFileName(file.name);
      const buffer = await file.arrayBuffer();
      const { headers: extractedHeaders, rawRows: extractedRows } = parseExcelFile(buffer);

      if (extractedRows.length === 0) {
        showToast('الملف فارغ أو لا يحتوي على صفوف بيانات صالحة', 'error');
        setIsProcessingFile(false);
        return;
      }

      setHeaders(extractedHeaders);
      setRawRows(extractedRows);

      const autoMap = autoDetectColumnMapping(extractedHeaders, extractedRows);
      setMapping(autoMap);
      saveColumnMapping(autoMap);

      const processed = processImportRows(extractedRows, autoMap);
      setParsedItems(processed);
      showToast(`تمت قراءة ${processed.length} صنف بنجاح ومطابقة الأعمدة الخمسة الثابتة`, 'success');
    } catch (err) {
      console.error(err);
      showToast('حدث خطأ أثناء قراءة ملف الإكسيل، تأكد من صحة الملف', 'error');
    } finally {
      setIsProcessingFile(false);
    }
  };

  // When user modifies custom column mapping dropdowns
  const handleMappingChange = (key: keyof ColumnMapping, val: string) => {
    const newMapping = { ...mapping, [key]: val };
    setMapping(newMapping);
    saveColumnMapping(newMapping);
    if (rawRows.length > 0) {
      const processed = processImportRows(rawRows, newMapping);
      setParsedItems(processed);
    }
  };

  // Handle PDF File Upload
  const handlePdfUpload = async (file: File) => {
    try {
      setIsProcessingFile(true);
      setFileName(file.name);
      const buffer = await file.arrayBuffer();
      
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('PDF timeout')), 6000)
      );

      const loadingTask = pdfjsLib.getDocument({ data: buffer });
      const pdf = await Promise.race([loadingTask.promise, timeoutPromise]) as any;
      let fullText = '';

      const maxPages = Math.min(pdf.numPages || 1, 50);
      for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');
        fullText += pageText + '\n';
      }

      setPdfTextRaw(fullText);
      const items = parseTextOrPdfTable(fullText);
      if (items.length === 0) {
        showToast('لم يتم العثور على أسطر أصناف واضحة في ملف PDF. يمكنك نسخ النص ولصقه بالأسفل', 'info');
      } else {
        setParsedItems(items);
        showToast(`تم استخراج ${items.length} صنف من ملف PDF`, 'success');
      }
    } catch (err) {
      console.warn('PDF parse fallback:', err);
      showToast('تعذر استخراج البيانات من ملف PDF، يرجى استخدام ملف Excel أو لصق النص يدوياً', 'error');
    } finally {
      setIsProcessingFile(false);
    }
  };

  // Handle Manual Text/PDF Paste parsing
  const handleParsePastedText = (text: string) => {
    setPdfTextRaw(text);
    if (!text.trim()) {
      setParsedItems([]);
      return;
    }
    const items = parseTextOrPdfTable(text);
    setParsedItems(items);
  };

  // Remove a row from the preview table
  const handleRemoveRow = (targetItem: ComparedImportItem) => {
    setParsedItems(prev => prev.filter(i => !(
      String(i.code || '').trim() === String(targetItem.code || '').trim() &&
      String(i.name || '').trim() === String(targetItem.name || '').trim()
    )));
  };

  // Execute Final Import: Updates prices of existing products & adds new products, automatically linking to Price Changes list
  const handleConfirmImport = () => {
    const validItems = comparison.items.filter(i => i.isValid && String(i.name || '').trim());
    if (validItems.length === 0) {
      showToast('لا توجد أصناف صالحة للاستيراد', 'error');
      return;
    }

    const payload = validItems.map(item => {
      let safeName = String(item.name || '').trim();
      let safeCode = String(item.code || '').trim();

      // Guard against inverted code/name
      const nameIsDigits = /^\d+$/.test(safeName);
      const codeHasArabic = /[\u0600-\u06FF]/.test(safeCode);
      const nameHasArabic = /[\u0600-\u06FF]/.test(safeName);
      const codeIsDigits = /^\d+$/.test(safeCode);

      if ((nameIsDigits && !codeIsDigits) || (!nameHasArabic && codeHasArabic)) {
        const temp = safeName;
        safeName = safeCode;
        safeCode = temp;
      }

      return {
        name: safeName,
        code: safeCode,
        unit: String(item.unit || '').trim() || 'كرتونه',
        price: item.price_retail,
        price_wholesale: item.price_wholesale || item.price_retail,
        cost: 0,
        stock: item.stock || 50,
        category: item.category || 'عام',
        barcode: item.barcode || null
      };
    });

    // Unified Import: Updates prices of existing products & adds new items automatically
    bulkImportProducts(payload, 'merge');

    // Automatically record and link changes to Price Changes history
    const today = new Date().toISOString().split('T')[0];
    const changesToLog = comparison.items
      .filter(i => i.hasPriceChange || i.changeStatus === 'new')
      .map(i => {
        const matched = products.find(p => 
          (i.existingProductId && p.id === i.existingProductId) || 
          (i.code && p.code && String(p.code).trim().toLowerCase() === String(i.code).trim().toLowerCase())
        );
        const safeName = (i.name && String(i.name).trim() && !String(i.name).startsWith('صنف غير مسمى'))
          ? String(i.name).trim() 
          : (matched?.name || i.name || 'صنف بدون اسم');
        
        return {
          productId: i.existingProductId || matched?.id || i.code,
          productName: safeName,
          code: i.code || matched?.code || '',
          unit: i.unit || matched?.unit || 'كرتونه',
          newWholesale: i.price_wholesale,
          newRetail: i.price_retail,
          oldWholesale: i.oldWholesale,
          oldRetail: i.oldRetail,
          diffWholesale: i.diffWholesale,
          diffRetail: i.diffRetail,
          isNew: i.changeStatus === 'new'
        };
      });

    if (changesToLog.length > 0) {
      recordPriceChangeDay({
        date: today,
        title: `استيراد وتحديث أسعار: ${fileName || 'ملف خارجي'}`,
        notes: `تم تحديث أسعار ${comparison.stats.changesOnlyCount} صنف وإضافة ${comparison.stats.newItems} صنف جديد`,
        changes: changesToLog
      });
    }

    showToast(`تم تحديث أسعار ${comparison.stats.changesOnlyCount} صنف وإضافة ${comparison.stats.newItems} صنف جديد بنجاح`, 'success');
    onClose();
  };

  const validCount = comparison.items.filter(i => i.isValid).length;

  // Calculate unit distribution stats for preview buttons
  const unitStats = useMemo(() => {
    let withoutUnit = 0;
    let withUnit = 0;
    comparison.items.forEach(item => {
      const u = (item.unit || '').trim();
      if (!u || u === 'عام' || u === 'غير محدد') {
        withoutUnit++;
      } else {
        withUnit++;
      }
    });
    return { withoutUnit, withUnit };
  }, [comparison.items]);

  // Reset pagination on filter or search change
  useEffect(() => {
    setCurrentPage(1);
  }, [priceFilter, previewSearch, parsedItems]);

  // Filter preview by user selection & search
  const filteredPreview = useMemo(() => {
    return comparison.items.filter(item => {
      // Search query
      if (previewSearch.trim()) {
        const q = previewSearch.toLowerCase().trim();
        const match =
          String(item.name || '').toLowerCase().includes(q) ||
          String(item.code || '').toLowerCase().includes(q) ||
          String(item.unit || '').toLowerCase().includes(q);
        if (!match) return false;
      }

      const u = String(item.unit || '').trim();
      const isNoUnit = !u || u === 'عام' || u === 'غير محدد';

      // Filter match
      if (priceFilter === 'without_unit') return isNoUnit;
      if (priceFilter === 'with_unit') return !isNoUnit;
      if (priceFilter === 'changes_only') return item.hasPriceChange;
      if (priceFilter === 'increases_only') return item.changeStatus === 'increase';
      if (priceFilter === 'decreases_only') return item.changeStatus === 'decrease';
      if (priceFilter === 'new_only') return item.changeStatus === 'new';
      if (priceFilter === 'unchanged') return item.changeStatus === 'unchanged';

      return true;
    });
  }, [comparison.items, previewSearch, priceFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredPreview.length / pageSize));
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredPreview.slice(start, start + pageSize);
  }, [filteredPreview, currentPage, pageSize]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-6xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh] animate-in fade-in zoom-in duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 bg-slate-900 text-white border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-black shadow-sm">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                استرداد وتحديث الأصناف من ملف Excel أو PDF
              </h2>
              <p className="text-xs text-slate-300">
                قراءة مباشرة لقوائم الأسعار بالـ 5 أعمدة الرئيسية (كود الصنف، اسم الصنف، الوحدة، سعر الجملة، سعر التجزئة)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Informative Columns Pill Banner */}
        <div className="bg-blue-50 border-b border-blue-100 px-5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2 text-slate-700">
            <span className="font-bold text-blue-900 flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4 text-blue-600" />
              الأعمدة المدعومة والمطابقة تلقائياً:
            </span>
            <span className="bg-white border border-blue-200 px-2 py-0.5 rounded text-blue-800 font-bold font-mono">1. كود الصنف</span>
            <span className="bg-white border border-blue-200 px-2 py-0.5 rounded text-blue-800 font-bold">2. اسم الصنف</span>
            <span className="bg-white border border-blue-200 px-2 py-0.5 rounded text-blue-800 font-bold">3. الوحدة</span>
            <span className="bg-white border border-blue-200 px-2 py-0.5 rounded text-blue-800 font-bold">4. سعر الجملة</span>
            <span className="bg-white border border-blue-200 px-2 py-0.5 rounded text-blue-800 font-bold">5. سعر التجزئة</span>
          </div>

          <button
            onClick={downloadSampleExcelTemplate}
            className="flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-slate-100 text-blue-700 border border-blue-300 rounded-lg text-xs font-bold transition-all shadow-2xs whitespace-nowrap cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-blue-600" />
            تحميل نموذج Excel جاهز (.xlsx)
          </button>
        </div>

        {/* Source Selection Tabs */}
        <div className="flex items-center px-5 pt-3 pb-2 bg-slate-50 border-b border-slate-200 gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('excel')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'excel'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-300'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            استرداد من ملف إكسيل Excel / CSV (.xlsx, .xls, .csv)
          </button>

          <button
            onClick={() => setActiveTab('pdf')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'pdf'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-300'
            }`}
          >
            <FileText className="w-4 h-4" />
            استرداد من ملف PDF أو نسخ جدول أسعار
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1 bg-white">
          
          {/* TAB 1: EXCEL UPLOAD */}
          {activeTab === 'excel' && (
            <div className="space-y-4">
              {/* Dropzone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-blue-300 hover:border-blue-600 bg-blue-50/40 hover:bg-blue-50 rounded-2xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2.5 group shadow-2xs"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={e => {
                    if (e.target.files && e.target.files[0]) {
                      handleExcelUpload(e.target.files[0]);
                    }
                  }}
                  accept=".xlsx, .xls, .csv"
                  className="hidden"
                />

                <div className="w-12 h-12 rounded-xl bg-blue-100 border border-blue-200 flex items-center justify-center text-blue-600 group-hover:scale-105 transition-transform">
                  <FileUp className="w-6 h-6" />
                </div>

                <div>
                  <p className="text-sm font-black text-slate-900 mb-1">
                    {fileName ? `الملف المحدد: ${fileName}` : 'اضغط لاختيار ملف إكسيل الأصناف أو اسحبه وأفلته هنا'}
                  </p>
                  <p className="text-xs text-slate-500">
                    يدعم جميع ملفات الإكسيل بأي عدد من الأصناف بدون حد أقصى
                  </p>
                </div>

                {isProcessingFile && (
                  <div className="flex items-center gap-2 text-xs text-blue-700 font-bold animate-pulse mt-1">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    جاري قراءة ومعالجة صفوف الإكسيل ومقارنة الأسعار...
                  </div>
                )}
              </div>

              {/* Column Mapping Section (If Excel is loaded) */}
              {headers.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-blue-600" />
                      <h3 className="text-xs font-bold text-slate-800">
                        الأعمدة الخمسة الثابتة المعتمدة (تُحفظ تلقائياً وتظل ثابتة دائماً):
                      </h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSwapCodeAndName}
                        className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
                        title="تبديل اختيار عمود الكود وعمود الاسم إذا كانا معكوسين"
                      >
                        <RefreshCw className="w-3.5 h-3.5 text-amber-700" />
                        <span>⇄ تبديل (الاسم ⇄ الكود)</span>
                      </button>
                      <span className="text-[11px] text-slate-500 font-mono bg-white px-2 py-0.5 rounded border border-slate-200">
                        تم اكتشاف {headers.length} أعمدة
                      </span>
                    </div>
                  </div>

                  {/* Suspected Swapped Columns Banner */}
                  {isSuspectedSwapped && (
                    <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-amber-900 shadow-xs animate-in fade-in">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span className="font-bold">
                          تنبيه: يبدو أن عمود الكود يحتوي على أسماء الأصناف، وعمود الاسم يحتوي على أرقام الكود!
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleSwapCodeAndName}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs rounded-lg cursor-pointer flex items-center gap-1.5 shrink-0 shadow-xs transition-colors"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        عكس وتبديل العمودين تلقائياً الآن
                      </button>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 text-xs">
                    {/* Code */}
                    <div>
                      <label className="text-slate-700 block mb-1 font-bold">1. كود الصنف *</label>
                      <select
                        value={mapping.codeCol}
                        onChange={e => handleMappingChange('codeCol', e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900 text-xs font-bold focus:outline-none focus:border-blue-600"
                      >
                        <option value="">-- اختر العمود --</option>
                        {headers.map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>

                    {/* Name */}
                    <div>
                      <label className="text-slate-700 block mb-1 font-bold">2. اسم الصنف *</label>
                      <select
                        value={mapping.nameCol}
                        onChange={e => handleMappingChange('nameCol', e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900 text-xs font-bold focus:outline-none focus:border-blue-600"
                      >
                        <option value="">-- اختر العمود --</option>
                        {headers.map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>

                    {/* Unit */}
                    <div>
                      <label className="text-slate-700 block mb-1 font-bold">3. الوحدة *</label>
                      <select
                        value={mapping.unitCol}
                        onChange={e => handleMappingChange('unitCol', e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900 text-xs font-bold focus:outline-none focus:border-blue-600"
                      >
                        <option value="">-- اختر العمود --</option>
                        {headers.map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>

                    {/* Wholesale */}
                    <div>
                      <label className="text-slate-700 block mb-1 font-bold">4. سعر الجملة *</label>
                      <select
                        value={mapping.wholesalePriceCol}
                        onChange={e => handleMappingChange('wholesalePriceCol', e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-blue-700 font-black text-xs focus:outline-none focus:border-blue-600"
                      >
                        <option value="">-- اختر العمود --</option>
                        {headers.map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>

                    {/* Retail */}
                    <div>
                      <label className="text-slate-700 block mb-1 font-bold">5. سعر التجزئة *</label>
                      <select
                        value={mapping.retailPriceCol}
                        onChange={e => handleMappingChange('retailPriceCol', e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-emerald-700 font-black text-xs focus:outline-none focus:border-blue-600"
                      >
                        <option value="">-- اختر العمود --</option>
                        {headers.map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: PDF & COPIED TEXT UPLOAD */}
          {activeTab === 'pdf' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* PDF File picker */}
                <div
                  onClick={() => pdfFileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 hover:border-slate-800 bg-slate-50 hover:bg-slate-100 rounded-2xl p-5 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 group shadow-2xs"
                >
                  <input
                    type="file"
                    ref={pdfFileInputRef}
                    onChange={e => {
                      if (e.target.files && e.target.files[0]) {
                        handlePdfUpload(e.target.files[0]);
                      }
                    }}
                    accept=".pdf"
                    className="hidden"
                  />
                  <div className="w-10 h-10 rounded-xl bg-slate-200 border border-slate-300 flex items-center justify-center text-slate-800 group-hover:scale-105 transition-transform">
                    <FileText className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-bold text-slate-900">رفع ملف PDF رقمي</p>
                  <p className="text-[11px] text-slate-500">استخراج الجداول والنصوص تلقائياً من قوائم الأسعار والفواتير</p>
                </div>

                {/* Info Card */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-700 space-y-2">
                  <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-blue-600" />
                    المحلل الذكي للنصوص والجداول
                  </h4>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    يمكنك أيضاً نسخ الجدول مباشرةً من ملف الـ PDF أو الوورد ولصقه في المربع أدناه، وسيقوم النظام بتفكيك كل سطر تلقائياً إلى (كود، اسم، وحدة، سعر جملة، وسعر تجزئة).
                  </p>
                </div>
              </div>

              {/* Text Area for Pasted Table Lines */}
              <div>
                <label className="text-xs font-bold text-slate-800 block mb-1.5 flex items-center justify-between">
                  <span>الصق النص أو بيانات الجدول من ملف الـ PDF هنا:</span>
                  <span className="text-[11px] text-slate-500 font-normal">كل سطر يمثل صنفاً واحداً</span>
                </label>
                <textarea
                  rows={5}
                  value={pdfTextRaw}
                  onChange={e => handleParsePastedText(e.target.value)}
                  placeholder={`مثال لصق أسطر من جدول أسعار:\n20042  بن ال البيت ساده  كيلو  553  555\n30211  بسكويت لمبادا 5ج *4 علبة  كرتونه  182  185\n10129  شاي العروسة 250جم  كرتونه  580  600`}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-xs text-slate-900 font-mono placeholder-slate-400 focus:bg-white focus:outline-none focus:border-blue-600 transition-all leading-relaxed"
                />
              </div>
            </div>
          )}

          {/* PREVIEW & PRICE FLUCTUATIONS SUMMARY SECTION */}
          {parsedItems.length > 0 && (
            <div className="space-y-4 pt-3 border-t border-slate-200">
              
              {/* PRICE & UNIT STATS BAR */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                <button
                  type="button"
                  onClick={() => setPriceFilter('all')}
                  className={`p-3 rounded-xl border text-right transition-all flex flex-col justify-between cursor-pointer ${
                    priceFilter === 'all'
                      ? 'bg-blue-50 border-blue-600 shadow-xs ring-1 ring-blue-600'
                      : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center justify-between text-slate-600 text-[11px]">
                    <span className="font-bold">إجمالي الأصناف بالملف</span>
                    <Layers className="w-3.5 h-3.5 text-blue-600" />
                  </div>
                  <div className="mt-1 font-mono font-black text-lg text-slate-900">
                    {comparison.stats.total}
                  </div>
                </button>

                {/* WITHOUT UNIT */}
                <button
                  type="button"
                  onClick={() => setPriceFilter('without_unit')}
                  className={`p-3 rounded-xl border text-right transition-all flex flex-col justify-between cursor-pointer ${
                    priceFilter === 'without_unit'
                      ? 'bg-amber-50 border-amber-500 shadow-xs ring-1 ring-amber-500 text-amber-900'
                      : 'bg-amber-50/50 border-amber-200 hover:bg-amber-50 text-amber-800'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                      ليس لها وحدة
                    </span>
                  </div>
                  <div className="mt-1 font-mono font-black text-lg text-amber-900">
                    {unitStats.withoutUnit} صنف
                  </div>
                </button>

                {/* WITH UNIT */}
                <button
                  type="button"
                  onClick={() => setPriceFilter('with_unit')}
                  className={`p-3 rounded-xl border text-right transition-all flex flex-col justify-between cursor-pointer ${
                    priceFilter === 'with_unit'
                      ? 'bg-teal-50 border-teal-600 shadow-xs ring-1 ring-teal-600 text-teal-900'
                      : 'bg-teal-50/50 border-teal-200 hover:bg-teal-50 text-teal-800'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                      أصناف بوحدة
                    </span>
                  </div>
                  <div className="mt-1 font-mono font-black text-lg text-teal-900">
                    {unitStats.withUnit} صنف
                  </div>
                </button>

                {/* NEW ITEMS ONLY */}
                <button
                  type="button"
                  onClick={() => setPriceFilter('new_only')}
                  className={`p-3 rounded-xl border text-right transition-all flex flex-col justify-between cursor-pointer ${
                    priceFilter === 'new_only'
                      ? 'bg-sky-50 border-sky-500 shadow-xs ring-1 ring-sky-500 text-sky-900'
                      : 'bg-sky-50/50 border-sky-200 hover:bg-sky-50 text-sky-800'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold flex items-center gap-1">
                      <PlusCircle className="w-3.5 h-3.5 text-sky-600" />
                      أصناف جديدة تضاف 🆕
                    </span>
                  </div>
                  <div className="mt-1 font-mono font-black text-lg text-sky-900">
                    {comparison.stats.newItems} صنف
                  </div>
                </button>

                {/* INCREASES ONLY */}
                <button
                  type="button"
                  onClick={() => setPriceFilter('increases_only')}
                  className={`p-3 rounded-xl border text-right transition-all flex flex-col justify-between cursor-pointer ${
                    priceFilter === 'increases_only'
                      ? 'bg-rose-50 border-rose-500 shadow-xs ring-1 ring-rose-500 text-rose-900'
                      : 'bg-rose-50/50 border-rose-200 hover:bg-rose-50 text-rose-800'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold flex items-center gap-1">
                      <TrendingUp className="w-3.5 h-3.5 text-rose-600" />
                      أسعار زادت ⬆️
                    </span>
                  </div>
                  <div className="mt-1 font-mono font-black text-lg text-rose-900">
                    {comparison.stats.increases} صنف
                  </div>
                </button>

                {/* DECREASES ONLY */}
                <button
                  type="button"
                  onClick={() => setPriceFilter('decreases_only')}
                  className={`p-3 rounded-xl border text-right transition-all flex flex-col justify-between cursor-pointer ${
                    priceFilter === 'decreases_only'
                      ? 'bg-emerald-50 border-emerald-500 shadow-xs ring-1 ring-emerald-500 text-emerald-900'
                      : 'bg-emerald-50/50 border-emerald-200 hover:bg-emerald-50 text-emerald-800'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold flex items-center gap-1">
                      <TrendingDown className="w-3.5 h-3.5 text-emerald-600" />
                      أسعار انخفضت ⬇️
                    </span>
                  </div>
                  <div className="mt-1 font-mono font-black text-lg text-emerald-900">
                    {comparison.stats.decreases} صنف
                  </div>
                </button>
              </div>

              {/* Filter controls & Search */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-slate-600 font-bold flex items-center gap-1">
                    <Filter className="w-3.5 h-3.5 text-slate-500" />
                    عرض المعاينة:
                  </span>
                  <span className="font-bold text-slate-900 bg-white px-2.5 py-1 rounded-lg border border-slate-300">
                    {priceFilter === 'all' && `جميع الأصناف (${filteredPreview.length})`}
                    {priceFilter === 'changes_only' && `التغييرات فقط (${filteredPreview.length})`}
                    {priceFilter === 'increases_only' && `الزيادات فقط ⬆️ (${filteredPreview.length})`}
                    {priceFilter === 'decreases_only' && `النقصان فقط ⬇️ (${filteredPreview.length})`}
                    {priceFilter === 'new_only' && `الأصناف الجديدة فقط 🆕 (${filteredPreview.length})`}
                    {priceFilter === 'unchanged' && `الأسعار الثابتة (${filteredPreview.length})`}
                  </span>

                  {(comparison.stats.changesOnlyCount > 0 || comparison.stats.newItems > 0) && (
                    <button
                      type="button"
                      onClick={() => exportPriceChangesToExcel(comparison.items)}
                      className="px-3 py-1 bg-white hover:bg-slate-100 text-slate-800 rounded-lg border border-slate-300 font-bold transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                      title="تصدير جدول التغييرات والزيادات إلى ملف إكسيل منفصل"
                    >
                      <FileDown className="w-3.5 h-3.5 text-emerald-600" />
                      تصدير تقرير التغييرات Excel
                    </button>
                  )}
                </div>

                <div className="relative min-w-[220px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={previewSearch}
                    onChange={e => setPreviewSearch(e.target.value)}
                    placeholder="ابحث بالاسم أو الكود..."
                    className="w-full bg-white border border-slate-300 rounded-lg pr-9 pl-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              {/* Preview Table */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs max-h-72 overflow-y-auto">
                <table className="w-full text-right border-collapse text-xs">
                  <thead className="bg-slate-100 text-slate-700 sticky top-0 border-b border-slate-200 z-10 text-[11px] font-bold">
                    <tr>
                      <th className="py-2.5 px-3">#</th>
                      <th className="py-2.5 px-3">كود الصنف</th>
                      <th className="py-2.5 px-3">اسم الصنف</th>
                      <th className="py-2.5 px-3">الوحدة</th>
                      <th className="py-2.5 px-3">حالة السعر والتغيير</th>
                      <th className="py-2.5 px-3">سعر الجملة</th>
                      <th className="py-2.5 px-3">سعر التجزئة</th>
                      <th className="py-2.5 px-3">الرصيد</th>
                      <th className="py-2.5 px-3 text-center">حذف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800">
                    {filteredPreview.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="text-center py-8 text-slate-400 text-xs">
                          لا توجد أصناف تطابق الفلتر المحدد
                        </td>
                      </tr>
                    ) : (
                      paginatedItems.map((item, idx) => {
                        const itemIndex = (currentPage - 1) * pageSize + idx + 1;
                        return (
                          <tr
                            key={`${item.code}-${idx}`}
                            className={`hover:bg-slate-50 transition-colors ${
                              item.changeStatus === 'increase'
                                ? 'bg-rose-50/40'
                                : item.changeStatus === 'decrease'
                                ? 'bg-emerald-50/40'
                                : item.changeStatus === 'new'
                                ? 'bg-sky-50/40'
                                : ''
                            }`}
                          >
                            <td className="py-2 px-3 text-slate-400 font-mono text-[11px]">{itemIndex}</td>
                            <td className="py-2 px-3 font-mono font-bold text-blue-700">#{item.code}</td>
                            <td className="py-2 px-3 font-bold text-slate-900">
                              {item.name}
                              {!item.isValid && (
                                <span className="block text-[10px] text-rose-600 font-normal">
                                  {item.errors.join(', ')}
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3">
                              <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700 text-[11px]">
                                {item.unit}
                              </span>
                            </td>
                            
                            {/* Price Change Status Badge */}
                            <td className="py-2 px-3">
                              {item.changeStatus === 'increase' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 border border-rose-200 text-[10px] font-bold">
                                  <TrendingUp className="w-3 h-3 text-rose-600" />
                                  زيادة (+{item.diffRetail} ج.م)
                                </span>
                              )}
                              {item.changeStatus === 'decrease' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-bold">
                                  <TrendingDown className="w-3 h-3 text-emerald-600" />
                                  انخفاض ({item.diffRetail} ج.م)
                                </span>
                              )}
                              {item.changeStatus === 'new' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-100 text-sky-800 border border-sky-200 text-[10px] font-bold">
                                  <PlusCircle className="w-3 h-3 text-sky-600" />
                                  صنف جديد
                                </span>
                              )}
                              {item.changeStatus === 'unchanged' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200 text-[10px]">
                                  ثابت بدون تغيير
                                </span>
                              )}
                            </td>

                            {/* Wholesale Price */}
                            <td className="py-2 px-3 font-mono font-bold text-blue-800">
                              {item.price_wholesale} ج.م
                              {item.oldWholesale > 0 && item.oldWholesale !== item.price_wholesale && (
                                <span className="block text-[10px] text-slate-400 line-through">
                                  سابقاً: {item.oldWholesale}
                                </span>
                              )}
                            </td>

                            {/* Retail Price */}
                            <td className="py-2 px-3 font-mono font-black text-emerald-700">
                              {item.price_retail} ج.م
                              {item.oldRetail > 0 && item.oldRetail !== item.price_retail && (
                                <span className="block text-[10px] text-slate-400 line-through">
                                  سابقاً: {item.oldRetail}
                                </span>
                              )}
                            </td>

                            {/* Stock */}
                            <td className="py-2 px-3 font-mono text-slate-700">
                              {item.stock || 50}
                            </td>

                            {/* Actions */}
                            <td className="py-2 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveRow(item)}
                                className="text-slate-400 hover:text-rose-600 p-1 transition-colors cursor-pointer"
                                title="استبعاد هذا الصنف"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Bar */}
              {filteredPreview.length > pageSize && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                  <div className="text-slate-600 text-[11px] font-bold">
                    عرض {((currentPage - 1) * pageSize) + 1} إلى {Math.min(currentPage * pageSize, filteredPreview.length)} من أصل {filteredPreview.length} صنف
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1 font-bold"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                      السابق
                    </button>

                    <span className="px-3 py-1 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono font-black">
                      {currentPage} / {totalPages}
                    </span>

                    <button
                      type="button"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1 font-bold"
                    >
                      التالي
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>

                    <select
                      value={pageSize}
                      onChange={e => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-slate-700 text-xs font-bold focus:outline-none"
                    >
                      <option value={25}>25 لكل صفحة</option>
                      <option value={50}>50 لكل صفحة</option>
                      <option value={100}>100 لكل صفحة</option>
                      <option value={250}>250 لكل صفحة</option>
                      <option value={1000}>1000 لكل صفحة</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Import Policy Notice */}
              <div className="bg-emerald-50/80 border border-emerald-300 rounded-xl p-3.5 space-y-1.5">
                <div className="flex items-center gap-2 text-emerald-950 font-black text-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>طريقة الاسترداد المعتمدة: استرداد واحد موحد — تحديث أسعار الأصناف المسجلة وإضافة الأصناف الجديدة فقط</span>
                </div>
                <p className="text-[11px] text-emerald-800 leading-relaxed pr-6">
                  يقوم النظام بمطابقة الأصناف المسجلة بناءً على الأعمدة الخمسة الثابتة (كود الصنف، اسم الصنف، الوحدة، سعر الجملة، سعر التجزئة) وتحديث أسعارها فوراً، وإضافة الأصناف الجديدة تلقائياً بدون تكرار وبدون تعديل يدوي في كل مرة.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-slate-600">
            {parsedItems.length > 0 ? (
              <div className="flex items-center gap-2">
                <span>جاهز لمعالجة <strong className="text-slate-900 font-bold">{validCount}</strong> صنف</span>
                {comparison.stats.changesOnlyCount > 0 && (
                  <span className="text-blue-700 font-bold">
                    (منها {comparison.stats.changesOnlyCount} صنف بتسعير جديد)
                  </span>
                )}
                {comparison.stats.newItems > 0 && (
                  <span className="text-sky-700 font-bold">
                    (و {comparison.stats.newItems} صنف جديد يضاف)
                  </span>
                )}
              </div>
            ) : (
              <span>يرجى اختيار ملف إكسيل أو لصق نص الجدول للمعاينة</span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-lg transition-colors cursor-pointer"
            >
              إلغاء
            </button>

            <button
              type="button"
              disabled={validCount === 0}
              onClick={handleConfirmImport}
              className={`px-5 py-2.5 rounded-lg text-xs font-black flex items-center gap-2 transition-all ${
                validCount > 0
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm cursor-pointer'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-200'
              }`}
            >
              <Check className="w-4 h-4" />
              <span>اعتماد تحديث الأسعار وإضافة الأصناف الجديدة {validCount > 0 ? `(${validCount} صنف)` : ''}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

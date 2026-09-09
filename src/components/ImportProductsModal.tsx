import React, { useState, useRef, useMemo } from 'react';
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
  FileDown
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
  ColumnMapping, 
  ParsedImportItem,
  ComparedImportItem
} from '../utils/productImportExport';

// Setup pdfjs worker if available
import * as pdfjsLib from 'pdfjs-dist';

// Point worker to cdn or standard build
if (pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '3.11.174'}/pdf.worker.min.js`;
}

interface ImportProductsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ImportSourceTab = 'excel' | 'pdf' | 'text' | 'template';
type ImportMode = 'merge' | 'append' | 'replace';
type PriceFilterType = 'all' | 'changes_only' | 'increases_only' | 'decreases_only' | 'new_only' | 'unchanged';

export const ImportProductsModal: React.FC<ImportProductsModalProps> = ({ isOpen, onClose }) => {
  const { products, bulkImportProducts, recordPriceChangeDay, showToast } = useApp();

  const [activeTab, setActiveTab] = useState<ImportSourceTab>('excel');
  const [importMode, setImportMode] = useState<ImportMode>('merge');
  const [priceFilter, setPriceFilter] = useState<PriceFilterType>('all');
  const [autoLogPriceChanges, setAutoLogPriceChanges] = useState<boolean>(true);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [fileName, setFileName] = useState<string>('');

  // Excel parsing state
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, any>[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({
    codeCol: '',
    nameCol: '',
    unitCol: '',
    retailPriceCol: '',
    wholesalePriceCol: '',
    stockCol: '',
    categoryCol: ''
  });

  // Parsed Items
  const [parsedItems, setParsedItems] = useState<ParsedImportItem[]>([]);
  const [previewSearch, setPreviewSearch] = useState('');
  const [pdfTextRaw, setPdfTextRaw] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfFileInputRef = useRef<HTMLInputElement>(null);

  // Compare parsed items with current products database to calculate price increases, decreases & new items
  const comparison = useMemo(() => {
    return compareImportWithExisting(parsedItems, products);
  }, [parsedItems, products]);

  if (!isOpen) return null;

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

      const autoMap = autoDetectColumnMapping(extractedHeaders);
      setMapping(autoMap);

      const processed = processImportRows(extractedRows, autoMap);
      setParsedItems(processed);
      showToast(`تمت قراءة ${processed.length} صنف بنجاح من ملف الإكسيل`, 'success');
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
      
      const loadingTask = pdfjsLib.getDocument({ data: buffer });
      const pdf = await loadingTask.promise;
      let fullText = '';

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
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
        showToast('لم يتم العثور على جداول واضحة في ملف PDF. يمكنك نسخ ولصق النص يدوياً في خانة اللصق', 'info');
      } else {
        setParsedItems(items);
        showToast(`تم استخراج ${items.length} صنف من ملف PDF`, 'success');
      }
    } catch (err) {
      console.error(err);
      showToast('تعذر استخراج البيانات من ملف PDF تلقائياً، يرجى تجربة نسخ النص أو استخدام ملف Excel', 'error');
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
  const handleRemoveRow = (index: number) => {
    setParsedItems(prev => prev.filter((_, i) => i !== index));
  };

  // Execute Final Import
  const handleConfirmImport = () => {
    const validItems = comparison.items.filter(i => i.isValid && i.name.trim());
    if (validItems.length === 0) {
      showToast('لا توجد أصناف صالحة للاستيراد', 'error');
      return;
    }

    if (importMode === 'replace') {
      const confirmReplace = window.confirm(
        `تنبيه هـام: هل أنت متأكد من استبدال وحذف جميع الأصناف الحالية في النظام واستبدالها بـ ${validItems.length} صنف جديد؟`
      );
      if (!confirmReplace) return;
    }

    const payload = validItems.map(item => ({
      name: item.name.trim(),
      code: item.code.trim(),
      unit: item.unit.trim() || 'كرتونه',
      price: item.price_retail,
      price_wholesale: item.price_wholesale || item.price_retail,
      cost: 0,
      stock: item.stock || 50,
      category: item.category || 'عام',
      barcode: item.barcode || null
    }));

    bulkImportProducts(payload, importMode);

    // If auto-log price changes is active, record in Price Changes history
    if (autoLogPriceChanges && (comparison.stats.changesOnlyCount > 0 || comparison.stats.newItems > 0)) {
      const today = new Date().toISOString().split('T')[0];
      const changesToLog = comparison.items
        .filter(i => i.hasPriceChange || i.changeStatus === 'new')
        .map(i => ({
          productId: i.existingProductId || i.code,
          productName: i.name,
          code: i.code,
          newWholesale: i.price_wholesale,
          newRetail: i.price_retail,
          oldWholesale: i.oldWholesale,
          oldRetail: i.oldRetail,
          isNew: i.changeStatus === 'new'
        }));

      recordPriceChangeDay(today, changesToLog);
    }

    onClose();
  };

  const validCount = parsedItems.filter(i => i.isValid).length;
  const invalidCount = parsedItems.length - validCount;

  // Filter items according to search query and price changes filter
  const filteredPreview = useMemo(() => {
    return comparison.items.filter(item => {
      // Search match
      if (previewSearch) {
        const q = previewSearch.toLowerCase();
        const match =
          item.name.toLowerCase().includes(q) ||
          item.code.toLowerCase().includes(q) ||
          item.unit.toLowerCase().includes(q);
        if (!match) return false;
      }

      // Price filter match
      if (priceFilter === 'changes_only') {
        return item.hasPriceChange;
      }
      if (priceFilter === 'increases_only') {
        return item.changeStatus === 'increase';
      }
      if (priceFilter === 'decreases_only') {
        return item.changeStatus === 'decrease';
      }
      if (priceFilter === 'new_only') {
        return item.changeStatus === 'new';
      }
      if (priceFilter === 'unchanged') {
        return item.changeStatus === 'unchanged';
      }

      return true;
    });
  }, [comparison.items, previewSearch, priceFilter]);

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-6xl overflow-hidden shadow-2xl flex flex-col max-h-[94vh] animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 bg-slate-800/90 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 font-black shadow-lg">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                استرداد وتحديث الأصناف من ملف Excel / PDF (مع رصد الزيادات والنقصان)
              </h2>
              <p className="text-xs text-slate-400">
                استيراد غير محدود للأصناف، مع تحديث الأسعار، إضافة الأصناف الجديدة، وقائمة التغييرات الحصرية
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-700/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Source Tabs */}
        <div className="flex items-center justify-between px-6 pt-4 pb-2 bg-slate-900 border-b border-slate-800/80 gap-2 overflow-x-auto">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('excel')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'excel'
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              ملف إكسيل أو CSV (.xlsx, .xls, .csv)
            </button>

            <button
              onClick={() => setActiveTab('pdf')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'pdf'
                  ? 'bg-sky-600 text-white shadow-lg shadow-sky-600/20'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <FileText className="w-4 h-4" />
              ملف PDF أو نسخ نص جدول
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={downloadSampleExcelTemplate}
              className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-bold transition-all whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              تحميل نموذج إكسيل جاهز (.xlsx)
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* TAB 1: EXCEL UPLOAD */}
          {activeTab === 'excel' && (
            <div className="space-y-4">
              {/* Dropzone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-700 hover:border-amber-500 bg-slate-800/40 hover:bg-slate-800/80 rounded-2xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 group"
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

                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                  <FileUp className="w-6 h-6" />
                </div>

                <div>
                  <p className="text-sm font-bold text-white mb-1">
                    {fileName ? `الملف المحدد: ${fileName}` : 'اضغط لاختيار ملف إكسيل الأسعار أو اسحبه هنا'}
                  </p>
                  <p className="text-xs text-slate-400">
                    يدعم جميع ملفات الإكسيل بأي عدد من الأصناف (أصناف مفتوحة بدون حد أقصى)
                  </p>
                </div>

                {isProcessingFile && (
                  <div className="flex items-center gap-2 text-xs text-amber-400 animate-pulse">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    جاري قراءة ومعالجة صفوف الإكسيل ومقارنة الأسعار...
                  </div>
                )}
              </div>

              {/* Column Mapping Section (If Excel is loaded) */}
              {headers.length > 0 && (
                <div className="bg-slate-800/70 border border-slate-700/80 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-white flex items-center gap-2">
                      <Layers className="w-4 h-4 text-amber-400" />
                      تطابق أعمدة ملف الإكسيل مع النظام (تم التعرف عليها تلقائياً):
                    </h3>
                    <span className="text-[11px] text-slate-400 font-mono">
                      تم اكتشاف {headers.length} أعمدة
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                    {/* Code */}
                    <div>
                      <label className="text-slate-300 block mb-1 font-semibold">1. كود الصنف *</label>
                      <select
                        value={mapping.codeCol}
                        onChange={e => handleMappingChange('codeCol', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs font-medium focus:outline-none focus:border-amber-500"
                      >
                        <option value="">-- اختر العمود --</option>
                        {headers.map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>

                    {/* Name */}
                    <div>
                      <label className="text-slate-300 block mb-1 font-semibold">2. اسم الصنف بالكامل *</label>
                      <select
                        value={mapping.nameCol}
                        onChange={e => handleMappingChange('nameCol', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs font-medium focus:outline-none focus:border-amber-500"
                      >
                        <option value="">-- اختر العمود --</option>
                        {headers.map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>

                    {/* Unit */}
                    <div>
                      <label className="text-slate-300 block mb-1 font-semibold">3. الوحدة (كرتونه / شكاره / كيلو) *</label>
                      <select
                        value={mapping.unitCol}
                        onChange={e => handleMappingChange('unitCol', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs font-medium focus:outline-none focus:border-amber-500"
                      >
                        <option value="">-- اختر العمود --</option>
                        {headers.map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>

                    {/* Wholesale */}
                    <div>
                      <label className="text-slate-300 block mb-1 font-semibold">4. سعر الجملة (ج.م) *</label>
                      <select
                        value={mapping.wholesalePriceCol}
                        onChange={e => handleMappingChange('wholesalePriceCol', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-amber-400 font-bold text-xs focus:outline-none focus:border-amber-500"
                      >
                        <option value="">-- اختر العمود --</option>
                        {headers.map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>

                    {/* Retail */}
                    <div>
                      <label className="text-slate-300 block mb-1 font-semibold">5. سعر التجزئة / القطاعي (ج.م) *</label>
                      <select
                        value={mapping.retailPriceCol}
                        onChange={e => handleMappingChange('retailPriceCol', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-emerald-400 font-bold text-xs focus:outline-none focus:border-amber-500"
                      >
                        <option value="">-- اختر العمود --</option>
                        {headers.map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>

                    {/* Stock (Optional) */}
                    <div>
                      <label className="text-slate-300 block mb-1 font-semibold">الرصيد / المخزون (اختياري)</label>
                      <select
                        value={mapping.stockCol || ''}
                        onChange={e => handleMappingChange('stockCol', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs font-medium focus:outline-none focus:border-amber-500"
                      >
                        <option value="">(افتراضي: 50)</option>
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
                  className="border-2 border-dashed border-slate-700 hover:border-sky-500 bg-slate-800/40 hover:bg-slate-800/80 rounded-2xl p-5 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2"
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
                  <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                    <FileText className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-bold text-white">رفع ملف PDF رقمي</p>
                  <p className="text-[11px] text-slate-400">استخراج الجداول والنصوص تلقائياً من قوائم الأسعار والفواتير</p>
                </div>

                {/* Info Card */}
                <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-4 text-xs text-slate-300 space-y-2">
                  <h4 className="font-bold text-amber-400 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4" />
                    المحلل الذكي للنصوص والجداول
                  </h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    يمكنك أيضاً نسخ الجدول مباشرةً من ملف الـ PDF أو الوورد ولصقه في المربع أدناه، وسيقوم النظام بتفكيك كل سطر إلى (كود، اسم، وحدة، وسعر جملة وقطاعي) فوراً.
                  </p>
                </div>
              </div>

              {/* Text Area for Pasted Table Lines */}
              <div>
                <label className="text-xs font-bold text-slate-200 block mb-1.5 flex items-center justify-between">
                  <span>الصق النص أو بيانات الجدول من ملف الـ PDF هنا:</span>
                  <span className="text-[11px] text-slate-400 font-normal">كل سطر يمثل صنفاً</span>
                </label>
                <textarea
                  rows={6}
                  value={pdfTextRaw}
                  onChange={e => handleParsePastedText(e.target.value)}
                  placeholder={`مثال لصق أسطر من جدول أسعار:\n20042  بن ال البيت ساده  كيلو  553  555\n30211  بسكويت لمبادا 5ج *4 علبة  كرتونه  182  185\n10129  كيلو لبتون 250جم  كيلو  212  212`}
                  className="w-full bg-slate-900 border border-slate-700 rounded-2xl p-3.5 text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:border-sky-500 transition-all leading-relaxed"
                />
              </div>
            </div>
          )}

          {/* PREVIEW & PRICE FLUCTUATIONS SUMMARY SECTION */}
          {parsedItems.length > 0 && (
            <div className="space-y-4 pt-2 border-t border-slate-800">
              {/* PRICE FLUCTUATION STATS BAR */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                <button
                  onClick={() => setPriceFilter('all')}
                  className={`p-3 rounded-2xl border text-right transition-all flex flex-col justify-between ${
                    priceFilter === 'all'
                      ? 'bg-slate-800 border-amber-500 shadow-md ring-1 ring-amber-500'
                      : 'bg-slate-800/60 border-slate-700 hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between text-slate-400 text-[11px]">
                    <span>إجمالي الأصناف بالملف</span>
                    <Layers className="w-3.5 h-3.5" />
                  </div>
                  <div className="mt-1 font-mono font-bold text-lg text-white">
                    {comparison.stats.total}
                  </div>
                </button>

                {/* CHANGES ONLY FILTER - User Highlight */}
                <button
                  onClick={() => setPriceFilter('changes_only')}
                  className={`p-3 rounded-2xl border text-right transition-all flex flex-col justify-between ${
                    priceFilter === 'changes_only'
                      ? 'bg-amber-500/20 border-amber-400 shadow-md ring-2 ring-amber-400 text-amber-300'
                      : 'bg-amber-950/20 border-amber-500/40 hover:bg-amber-950/40 text-amber-400'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" />
                      التغييرات فقط (زيادة ونقصان)
                    </span>
                  </div>
                  <div className="mt-1 font-mono font-black text-lg">
                    {comparison.stats.changesOnlyCount} صنف
                  </div>
                </button>

                {/* INCREASES ONLY */}
                <button
                  onClick={() => setPriceFilter('increases_only')}
                  className={`p-3 rounded-2xl border text-right transition-all flex flex-col justify-between ${
                    priceFilter === 'increases_only'
                      ? 'bg-rose-500/20 border-rose-400 shadow-md ring-2 ring-rose-400 text-rose-300'
                      : 'bg-rose-950/20 border-rose-500/40 hover:bg-rose-950/40 text-rose-400'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold flex items-center gap-1">
                      <TrendingUp className="w-3.5 h-3.5" />
                      أسعار زادت ⬆️
                    </span>
                  </div>
                  <div className="mt-1 font-mono font-black text-lg">
                    {comparison.stats.increases} صنف
                  </div>
                </button>

                {/* DECREASES ONLY */}
                <button
                  onClick={() => setPriceFilter('decreases_only')}
                  className={`p-3 rounded-2xl border text-right transition-all flex flex-col justify-between ${
                    priceFilter === 'decreases_only'
                      ? 'bg-emerald-500/20 border-emerald-400 shadow-md ring-2 ring-emerald-400 text-emerald-300'
                      : 'bg-emerald-950/20 border-emerald-500/40 hover:bg-emerald-950/40 text-emerald-400'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold flex items-center gap-1">
                      <TrendingDown className="w-3.5 h-3.5" />
                      أسعار قلت ⬇️
                    </span>
                  </div>
                  <div className="mt-1 font-mono font-black text-lg">
                    {comparison.stats.decreases} صنف
                  </div>
                </button>

                {/* NEW ITEMS ONLY */}
                <button
                  onClick={() => setPriceFilter('new_only')}
                  className={`p-3 rounded-2xl border text-right transition-all flex flex-col justify-between ${
                    priceFilter === 'new_only'
                      ? 'bg-sky-500/20 border-sky-400 shadow-md ring-2 ring-sky-400 text-sky-300'
                      : 'bg-sky-950/20 border-sky-500/40 hover:bg-sky-950/40 text-sky-400'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold flex items-center gap-1">
                      <PlusCircle className="w-3.5 h-3.5" />
                      أصناف جديدة تضاف 🆕
                    </span>
                  </div>
                  <div className="mt-1 font-mono font-black text-lg">
                    {comparison.stats.newItems} صنف
                  </div>
                </button>
              </div>

              {/* Filter controls & Search */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-800/60 p-3.5 rounded-2xl border border-slate-700">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-slate-400 flex items-center gap-1">
                    <Filter className="w-3.5 h-3.5" />
                    عرض المعاينة:
                  </span>
                  <span className="font-bold text-white bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700">
                    {priceFilter === 'all' && `جميع الأصناف (${filteredPreview.length})`}
                    {priceFilter === 'changes_only' && `التغييرات فقط (${filteredPreview.length})`}
                    {priceFilter === 'increases_only' && `الزيادات فقط ⬆️ (${filteredPreview.length})`}
                    {priceFilter === 'decreases_only' && `النقصان فقط ⬇️ (${filteredPreview.length})`}
                    {priceFilter === 'new_only' && `الأصناف الجديدة فقط 🆕 (${filteredPreview.length})`}
                    {priceFilter === 'unchanged' && `الأسعار الثابتة (${filteredPreview.length})`}
                  </span>

                  {(comparison.stats.changesOnlyCount > 0 || comparison.stats.newItems > 0) && (
                    <button
                      onClick={() => exportPriceChangesToExcel(comparison.items)}
                      className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 hover:text-white rounded-lg border border-slate-600 font-bold transition-colors flex items-center gap-1.5"
                      title="تصدير جدول التغييرات والزيادات إلى ملف إكسيل منفصل"
                    >
                      <FileDown className="w-3.5 h-3.5 text-emerald-400" />
                      تصدير تقرير الزيادات والنقصان Excel
                    </button>
                  )}
                </div>

                <div className="relative min-w-[240px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={previewSearch}
                    onChange={e => setPreviewSearch(e.target.value)}
                    placeholder="ابحث بالاسم أو الكود..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl pr-9 pl-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Preview Table */}
              <div className="bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-inner max-h-72 overflow-y-auto">
                <table className="w-full text-right border-collapse text-xs">
                  <thead className="bg-slate-800/95 text-slate-300 sticky top-0 border-b border-slate-700 z-10 text-[11px]">
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
                  <tbody className="divide-y divide-slate-800 text-slate-200">
                    {filteredPreview.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="text-center py-8 text-slate-400 text-xs">
                          لا توجد أصناف تطابق الفلتر المحدد
                        </td>
                      </tr>
                    ) : (
                      filteredPreview.map((item, idx) => (
                        <tr
                          key={idx}
                          className={`hover:bg-slate-800/60 transition-colors ${
                            item.changeStatus === 'increase'
                              ? 'bg-rose-950/10'
                              : item.changeStatus === 'decrease'
                              ? 'bg-emerald-950/10'
                              : item.changeStatus === 'new'
                              ? 'bg-sky-950/10'
                              : ''
                          }`}
                        >
                          <td className="py-2 px-3 text-slate-500 font-mono text-[11px]">{idx + 1}</td>
                          <td className="py-2 px-3 font-mono font-bold text-amber-400">#{item.code}</td>
                          <td className="py-2 px-3 font-semibold text-white">
                            {item.name}
                            {!item.isValid && (
                              <span className="block text-[10px] text-rose-400 font-normal">
                                {item.errors.join(', ')}
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3">
                            <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[11px]">
                              {item.unit}
                            </span>
                          </td>
                          
                          {/* Price Change Status Badge */}
                          <td className="py-2 px-3">
                            {item.changeStatus === 'increase' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-bold">
                                <TrendingUp className="w-3 h-3" />
                                زيادة في السعر (+{item.diffWholesale > 0 ? item.diffWholesale : item.diffRetail} ج.م)
                              </span>
                            )}
                            {item.changeStatus === 'decrease' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                                <TrendingDown className="w-3 h-3" />
                                نقصان في السعر ({item.diffWholesale < 0 ? item.diffWholesale : item.diffRetail} ج.م)
                              </span>
                            )}
                            {item.changeStatus === 'new' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-400 border border-sky-500/30 text-[10px] font-bold">
                                <PlusCircle className="w-3 h-3" />
                                صنف جديد 🆕
                              </span>
                            )}
                            {item.changeStatus === 'unchanged' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 border border-slate-700 text-[10px]">
                                سعر ثابت ➖
                              </span>
                            )}
                          </td>

                          {/* Wholesale Price */}
                          <td className="py-2 px-3 font-mono">
                            <div className="font-bold text-amber-400">{item.price_wholesale} ج.م</div>
                            {item.oldWholesale > 0 && item.oldWholesale !== item.price_wholesale && (
                              <div className="text-[10px] text-slate-500 line-through">
                                كان: {item.oldWholesale} ج.م
                              </div>
                            )}
                          </td>

                          {/* Retail Price */}
                          <td className="py-2 px-3 font-mono">
                            <div className="font-bold text-emerald-400">{item.price_retail} ج.م</div>
                            {item.oldRetail > 0 && item.oldRetail !== item.price_retail && (
                              <div className="text-[10px] text-slate-500 line-through">
                                كان: {item.oldRetail} ج.م
                              </div>
                            )}
                          </td>

                          <td className="py-2 px-3 text-slate-300 font-mono">{item.stock ?? 50}</td>
                          <td className="py-2 px-3 text-center">
                            <button
                              onClick={() => handleRemoveRow(idx)}
                              className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                              title="حذف هذا الصنف من الاستيراد"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Import Options: Mode & Auto Price History Logging */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                {/* Import Mode Radio Selection */}
                <div className="lg:col-span-8 bg-slate-800/40 border border-slate-700/80 rounded-2xl p-4 space-y-2">
                  <label className="text-xs font-bold text-white block">طريقة معالجة وتحديث الأصناف:</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <label
                      onClick={() => setImportMode('merge')}
                      className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${
                        importMode === 'merge'
                          ? 'bg-amber-500/10 border-amber-500/60 text-amber-300'
                          : 'bg-slate-900/60 border-slate-700 text-slate-300 hover:bg-slate-900'
                      }`}
                    >
                      <input
                        type="radio"
                        name="importMode"
                        checked={importMode === 'merge'}
                        onChange={() => setImportMode('merge')}
                        className="mt-0.5 text-amber-500 focus:ring-amber-500"
                      />
                      <div>
                        <p className="text-xs font-bold">دمج وتحديث (موصى به)</p>
                        <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                          تحديث أسعار الأصناف الحالية وإضافة الأصناف الجديدة تلقائياً
                        </p>
                      </div>
                    </label>

                    <label
                      onClick={() => setImportMode('append')}
                      className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${
                        importMode === 'append'
                          ? 'bg-amber-500/10 border-amber-500/60 text-amber-300'
                          : 'bg-slate-900/60 border-slate-700 text-slate-300 hover:bg-slate-900'
                      }`}
                    >
                      <input
                        type="radio"
                        name="importMode"
                        checked={importMode === 'append'}
                        onChange={() => setImportMode('append')}
                        className="mt-0.5 text-amber-500 focus:ring-amber-500"
                      />
                      <div>
                        <p className="text-xs font-bold">إضافة كجديدة دائماً</p>
                        <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                          إضافة جميع الصفوف كأصناف جديدة دون تعديل الأصناف السابقة
                        </p>
                      </div>
                    </label>

                    <label
                      onClick={() => setImportMode('replace')}
                      className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${
                        importMode === 'replace'
                          ? 'bg-rose-500/10 border-rose-500/60 text-rose-300'
                          : 'bg-slate-900/60 border-slate-700 text-slate-300 hover:bg-slate-900'
                      }`}
                    >
                      <input
                        type="radio"
                        name="importMode"
                        checked={importMode === 'replace'}
                        onChange={() => setImportMode('replace')}
                        className="mt-0.5 text-rose-500 focus:ring-rose-500"
                      />
                      <div>
                        <p className="text-xs font-bold text-rose-400">استبدال كامل الدليل</p>
                        <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                          مسح جميع الأصناف الحالية وتعيين الأصناف المستوردة فقط
                        </p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Auto Price Log Checkbox */}
                <div className="lg:col-span-4 bg-slate-800/40 border border-slate-700/80 rounded-2xl p-4 flex flex-col justify-center gap-2">
                  <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-slate-200">
                    <input
                      type="checkbox"
                      checked={autoLogPriceChanges}
                      onChange={e => setAutoLogPriceChanges(e.target.checked)}
                      className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500 bg-slate-900 border-slate-700"
                    />
                    <span>تسجيل التغييرات تلقائياً في سجل الأسعار</span>
                  </label>
                  <p className="text-[10px] text-slate-400 leading-relaxed pr-6">
                    يقوم بحفظ تقرير بالزيادات والنقصان في قائمة تغيرات الأسعار بتاريخ اليوم للمراجعة والمقارنة لاحقاً.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-5 bg-slate-800 border-t border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="text-xs text-slate-400">
            {parsedItems.length > 0 ? (
              <div className="flex items-center gap-2">
                <span>جاهز لمعالجة <strong className="text-white">{validCount}</strong> صنف</span>
                {comparison.stats.changesOnlyCount > 0 && (
                  <span className="text-amber-400 font-bold">
                    (منها {comparison.stats.changesOnlyCount} صنف بتسعير جديد)
                  </span>
                )}
              </div>
            ) : (
              <span>يرجى اختيار ملف إكسيل أو لصق نص الجدول للمعاينة</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 bg-slate-700/60 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition-colors"
            >
              إلغاء
            </button>

            <button
              type="button"
              disabled={validCount === 0}
              onClick={handleConfirmImport}
              className={`px-6 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 transition-all ${
                validCount > 0
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20 cursor-pointer'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
              }`}
            >
              <Check className="w-4 h-4" />
              تأكيد الاستيراد والتحديث {validCount > 0 ? `(${validCount} صنف)` : ''}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

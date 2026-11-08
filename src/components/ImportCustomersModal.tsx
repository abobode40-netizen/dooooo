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
  Search,
  Users,
  UserPlus,
  Phone,
  MapPin,
  CreditCard,
  Building2,
  FileCheck
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  parseCustomerExcelFile,
  autoDetectCustomerColumnMapping,
  processCustomerImportRows,
  parsePastedCustomerTable,
  parseCustomerPdfFile,
  exportCustomersToExcel,
  downloadCustomerExcelTemplate,
  downloadCustomerCsvTemplate,
  compareCustomersWithExisting,
  CustomerColumnMapping,
  ParsedCustomerItem,
  ComparedCustomerItem
} from '../utils/customerImportExport';

interface ImportCustomersModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ImportSourceTab = 'excel' | 'paste';
type ImportMode = 'merge' | 'append' | 'replace';
type FilterType = 'all' | 'new_only' | 'update_only' | 'has_debt';

export const ImportCustomersModal: React.FC<ImportCustomersModalProps> = ({ isOpen, onClose }) => {
  const { customerDebts, bulkImportCustomers, clearAllCustomers, showToast } = useApp();

  const [activeTab, setActiveTab] = useState<ImportSourceTab>('excel');
  const [importMode, setImportMode] = useState<ImportMode>('merge');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [fileName, setFileName] = useState<string>('');
  const [pastedText, setPastedText] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // File parsing state
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, any>[]>([]);
  const [mapping, setMapping] = useState<CustomerColumnMapping>({
    codeCol: '',
    nameCol: '',
    phoneCol: '',
    phone2Col: '',
    addressCol: '',
    debtCol: '',
    notesCol: ''
  });

  const [parsedItems, setParsedItems] = useState<ParsedCustomerItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Comparison with existing customer debts
  const comparison = useMemo(() => {
    return compareCustomersWithExisting(parsedItems, customerDebts || []);
  }, [parsedItems, customerDebts]);

  // Filtered preview rows
  const filteredRows = useMemo(() => {
    return comparison.items.filter(item => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q ||
        (item.customer_name && item.customer_name.toLowerCase().includes(q)) ||
        (item.customer_code && item.customer_code.toLowerCase().includes(q)) ||
        (item.phone && item.phone.includes(q)) ||
        (item.phone2 && item.phone2.includes(q)) ||
        (item.address && item.address.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      if (filterType === 'new_only') return item.status === 'new';
      if (filterType === 'update_only') return item.status === 'update';
      if (filterType === 'has_debt') return (item.initialDebt || 0) > 0;
      return true;
    });
  }, [comparison.items, searchQuery, filterType]);

  if (!isOpen) return null;

  // Handle Excel / CSV / JSON / PDF File upload
  const handleExcelUpload = async (file: File) => {
    try {
      setIsProcessingFile(true);
      setFileName(file.name);
      const isJson = file.name.endsWith('.json');
      const isPdf = file.name.endsWith('.pdf');

      if (isJson) {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const list = Array.isArray(parsed) ? parsed : (parsed.customers || parsed.customer_debts || []);
        const normalized: ParsedCustomerItem[] = list.map((item: any, idx: number) => ({
          customer_code: String(item.customer_code || item.code || item['كود العميل'] || item['الكود'] || `CUST-${(customerDebts.length + idx + 1).toString().padStart(3, '0')}`).trim(),
          customer_name: String(item.customer_name || item.name || item['اسم العميل'] || item['الاسم'] || '').trim(),
          address: String(item.address || item['العنوان'] || item['عنوان العميل'] || '').trim(),
          phone: String(item.phone || item.phone1 || item['التليفون الاول'] || item['الهاتف'] || item['الموبايل'] || '').trim(),
          phone2: String(item.phone2 || item['التليفون الثاني'] || item['هاتف 2'] || item['موبايل 2'] || '').trim(),
          initialDebt: Number(item.initialDebt || item.current_debt || item.debt || item['الرصيد'] || item['المديونية'] || 0),
          notes: String(item.notes || item['ملاحظات'] || '').trim(),
          isValid: !!String(item.customer_name || item.name || item['اسم العميل'] || '').trim(),
          errors: []
        })).filter(c => c.customer_name);

        setParsedItems(normalized);
        showToast(`تمت قراءة ${normalized.length} عميل من ملف JSON بنجاح`, 'success');
      } else if (isPdf) {
        const buffer = await file.arrayBuffer();
        const extracted = await parseCustomerPdfFile(buffer, customerDebts.length);
        if (extracted.length === 0) {
          showToast('لم يتم العثور على بيانات عملاء واضحة في ملف PDF المحدد', 'error');
          setIsProcessingFile(false);
          return;
        }
        setParsedItems(extracted);
        showToast(`تم استخراج وقراءة ${extracted.length} عميل بنجاح من ملف PDF`, 'success');
      } else {
        const buffer = await file.arrayBuffer();
        const { headers: extractedHeaders, rawRows: extractedRows } = parseCustomerExcelFile(buffer);

        if (extractedRows.length === 0) {
          showToast('الملف فارغ أو لا يحتوي على صفوف بيانات صالحة', 'error');
          setIsProcessingFile(false);
          return;
        }

        setHeaders(extractedHeaders);
        setRawRows(extractedRows);

        const autoMap = autoDetectCustomerColumnMapping(extractedHeaders);
        setMapping(autoMap);

        const processed = processCustomerImportRows(extractedRows, autoMap, customerDebts.length);
        setParsedItems(processed);
        showToast(`تمت قراءة ${processed.length} عميل بنجاح من ملف الإكسيل`, 'success');
      }
    } catch (err) {
      console.error('Customer file parse error:', err);
      showToast('حدث خطأ أثناء قراءة ملف العملاء! يرجى التأكد من سلامة وصيغة الملف', 'error');
    } finally {
      setIsProcessingFile(false);
    }
  };

  // Re-process when column mapping changes manually
  const handleMappingChange = (key: keyof CustomerColumnMapping, value: string) => {
    const updated = { ...mapping, [key]: value };
    setMapping(updated);
    if (rawRows.length > 0) {
      const processed = processCustomerImportRows(rawRows, updated, customerDebts.length);
      setParsedItems(processed);
    }
  };

  // Handle Paste parsing
  const handleParsePasted = () => {
    if (!pastedText.trim()) {
      showToast('يرجى لصق بيانات العملاء أولاً', 'error');
      return;
    }
    try {
      const processed = parsePastedCustomerTable(pastedText, customerDebts.length);
      if (processed.length === 0) {
        showToast('لم يتم العثور على أسطر صالحة في النص الملصق', 'error');
        return;
      }
      setParsedItems(processed);
      setFileName('بيانات ملصقة مباشرة');
      showToast(`تم استخراج ${processed.length} عميل من النص الملصق بنجاح`, 'success');
    } catch (err) {
      console.error(err);
      showToast('فشل تحليل النص الملصق', 'error');
    }
  };

  // Confirm and Execute Import
  const handleConfirmImport = () => {
    const validItems = parsedItems.filter(i => i.isValid && i.customer_name.trim());
    if (validItems.length === 0) {
      showToast('لا توجد بيانات عملاء صالحة للاستيراد!', 'error');
      return;
    }

    // Filter by mode if append
    let itemsToProcess = validItems;
    if (importMode === 'append') {
      const existingNames = new Set(customerDebts.map(c => c.customer_name.trim().toLowerCase()));
      const existingCodes = new Set(customerDebts.map(c => (c.customer_code || '').trim().toLowerCase()));
      itemsToProcess = validItems.filter(
        i => !existingNames.has(i.customer_name.trim().toLowerCase()) &&
             (!i.customer_code || !existingCodes.has(i.customer_code.trim().toLowerCase()))
      );
      if (itemsToProcess.length === 0) {
        showToast('جميع العملاء في الملف مسجلون بالفعل، لم تتم إضافة أي عميل جديد في وضع الإضافة فقط', 'info');
        return;
      }
    }

    bulkImportCustomers(itemsToProcess, importMode);
    onClose();
    resetState();
  };

  // Delete a specific customer row from the import preview list
  const handleDeletePreviewRow = (customerName: string, customerCode?: string) => {
    setParsedItems(prev => prev.filter(item => {
      if (customerCode && item.customer_code && item.customer_code === customerCode) return false;
      return item.customer_name !== customerName;
    }));
    showToast(`تم حذف العميل "${customerName}" من قائمة الاستيراد`, 'info');
  };

  // Clear all items from current preview
  const handleClearAllPreview = () => {
    if (window.confirm('هل تريد بالتأكيد إفراغ كافة العملاء من المعاينة الحالية؟')) {
      setParsedItems([]);
      setFileName('');
      setPastedText('');
      showToast('تم تفريغ قائمة المعاينة بنجاح', 'info');
    }
  };

  // Clear all existing customers from the entire database
  const handleConfirmClearCustomers = () => {
    clearAllCustomers();
    setShowClearConfirm(false);
  };

  const resetState = () => {
    setParsedItems([]);
    setHeaders([]);
    setRawRows([]);
    setFileName('');
    setPastedText('');
    setSearchQuery('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4" dir="rtl">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in duration-150">
        
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black flex items-center gap-2">
                استرداد وتحديث ملف العملاء (Excel / CSV / JSON)
              </h2>
              <p className="text-xs text-slate-400">
                استيراد ذكي لبيانات العملاء، أرقام الهواتف، العناوين، وأرصدة المديونيات مع الكشف التلقائي للأعمدة
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onClose();
                resetState();
              }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1 text-xs">
          
          {/* Top Options & Source Switcher */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center bg-slate-50 p-3 rounded-xl border border-slate-200">
            {/* Tabs for Source */}
            <div className="lg:col-span-6 flex items-center gap-1.5 bg-slate-200/80 p-1 rounded-lg">
              <button
                type="button"
                onClick={() => setActiveTab('excel')}
                className={`flex-1 py-1.5 px-3 rounded-md font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === 'excel'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                ملف Excel / CSV / JSON
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('paste')}
                className={`flex-1 py-1.5 px-3 rounded-md font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === 'paste'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileText className="w-4 h-4 text-blue-600" />
                نسخ ولصق جدول مباشر
              </button>
            </div>

            {/* Import Mode Selection */}
            <div className="lg:col-span-6 flex items-center justify-between lg:justify-end gap-2 text-[11px]">
              <span className="font-bold text-slate-700">طريقة الاستيراد:</span>
              <div className="flex items-center gap-1 bg-white border border-slate-300 p-0.5 rounded-lg shadow-2xs">
                <button
                  type="button"
                  onClick={() => setImportMode('merge')}
                  className={`px-2.5 py-1 rounded font-bold cursor-pointer transition-colors ${
                    importMode === 'merge' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                  title="تحديث بيانات العملاء المسجلين وإضافة العملاء الجدد"
                >
                  دمج وتحديث
                </button>
                <button
                  type="button"
                  onClick={() => setImportMode('append')}
                  className={`px-2.5 py-1 rounded font-bold cursor-pointer transition-colors ${
                    importMode === 'append' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                  title="إضافة العملاء الجدد فقط وتخطي العملاء المسجلين مسبقاً"
                >
                  إضافة الجدد فقط
                </button>
                <button
                  type="button"
                  onClick={() => setImportMode('replace')}
                  className={`px-2.5 py-1 rounded font-bold cursor-pointer transition-colors ${
                    importMode === 'replace' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                  title="استبدال القائمة الحالية بالكامل بالملف الجديد"
                >
                  استبدال كامل
                </button>
              </div>
            </div>
          </div>

          {/* TAB 1: EXCEL / CSV / JSON UPLOAD */}
          {activeTab === 'excel' && (
            <div className="space-y-3">
              {/* Drag & Drop Area */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleExcelUpload(file);
                }}
                className={`border-2 border-dashed rounded-2xl p-5 text-center transition-all ${
                  isDragging
                    ? 'border-blue-500 bg-blue-50/80 scale-[1.005]'
                    : 'border-slate-300 bg-slate-50/60 hover:bg-slate-50 hover:border-blue-400'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,.json,.pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleExcelUpload(file);
                  }}
                  className="hidden"
                />

                <div className="max-w-md mx-auto space-y-3">
                  <div className="w-12 h-12 mx-auto rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shadow-xs">
                    <FileUp className="w-6 h-6" />
                  </div>

                  <div>
                    <h4 className="font-black text-slate-900 text-sm">
                      اسحب وأفلت ملف العملاء هنا أو اضغط للاختيار
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-1">
                      يدعم ملفات إكسل <span className="font-mono font-bold text-slate-700">.xlsx / .xls</span> أو ملفات <span className="font-mono font-bold text-slate-700">.pdf / .csv / .json</span>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Upload className="w-4 h-4" />
                      اختيار ملف (Excel / PDF / CSV)
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        exportCustomersToExcel(customerDebts);
                        showToast('تم تصدير نسخة احتياطية من سجل العملاء كملف Excel بنجاح', 'success');
                      }}
                      className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 font-bold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                      title="تصدير نسخة احتياطية فورية من بيانات العملاء الحالية إلى Excel"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                      تصدير الحالي إلى Excel
                    </button>

                    <button
                      type="button"
                      onClick={downloadCustomerExcelTemplate}
                      className="px-3 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-bold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                      title="تحميل ملف إكسل نموذجي فارغ مجهز بالأعمدة الصحيحة"
                    >
                      <Download className="w-3.5 h-3.5 text-blue-600" />
                      نموذج Excel جاهز
                    </button>

                    <button
                      type="button"
                      onClick={downloadCustomerCsvTemplate}
                      className="px-3 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-600 font-bold rounded-xl transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                      title="تحميل نموذج CSV"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-600" />
                      نموذج CSV
                    </button>
                  </div>
                </div>
              </div>

              {/* Processing Loader */}
              {isProcessingFile && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-center text-blue-800 font-bold flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                  جاري قراءة واستخراج بيانات العملاء من الملف...
                </div>
              )}
            </div>
          )}

          {/* TAB 2: PASTE TEXT / TABLE */}
          {activeTab === 'paste' && (
            <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-900 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-blue-600" />
                  الصق جدول العملاء المنسوخ من Excel أو الواتساب أو التقارير:
                </label>
                <span className="text-[11px] text-slate-500">
                  يدعم النسخ المباشر من الإكسيل (أعمدة مفصولة بـ Tab أو فاصلة)
                </span>
              </div>

              <textarea
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder={`كود العميل\tاسم العميل\tالعنوان\tالتليفون الاول\tالتليفون الثاني\tالرصيد\nCUST-001\tسوبرماركت الأمانة\tشارع الجمهورية\t01012345678\t01198765432\t1500\nCUST-002\tأحمد محمود للتجارة\tميدان المحطة\t01234567890\t\t0`}
                className="w-full h-36 p-3 bg-white border border-slate-300 rounded-xl font-mono text-xs text-slate-900 focus:outline-hidden focus:border-blue-600 transition-colors"
                dir="auto"
              />

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setPastedText('')}
                  className="text-slate-500 hover:text-rose-600 font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  مسح النص
                </button>

                <button
                  type="button"
                  onClick={handleParsePasted}
                  disabled={!pastedText.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <FileCheck className="w-4 h-4" />
                  تحليل واستخراج بيانات العملاء
                </button>
              </div>
            </div>
          )}

          {/* COLUMN MAPPING ACCORDION (If Headers Found) */}
          {headers.length > 0 && parsedItems.length > 0 && (
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div className="font-bold text-slate-900 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-blue-600" />
                  <span>مطابقة أعمدة الملف مع بيانات العميل:</span>
                </div>
                <span className="text-[11px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  تم التعرف التلقائي الذكي على الأعمدة
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-[11px]">
                {/* Name Col */}
                <div>
                  <label className="block text-slate-600 font-bold mb-1">اسم العميل *</label>
                  <select
                    value={mapping.nameCol}
                    onChange={(e) => handleMappingChange('nameCol', e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs font-bold text-slate-800"
                  >
                    <option value="">-- اختر العمود --</option>
                    {headers.map((h, i) => (
                      <option key={i} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                {/* Code Col */}
                <div>
                  <label className="block text-slate-600 font-bold mb-1">كود العميل</label>
                  <select
                    value={mapping.codeCol}
                    onChange={(e) => handleMappingChange('codeCol', e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs font-bold text-slate-800"
                  >
                    <option value="">-- تلقائي / اختياري --</option>
                    {headers.map((h, i) => (
                      <option key={i} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                {/* Phone 1 Col */}
                <div>
                  <label className="block text-slate-600 font-bold mb-1">التليفون الأول</label>
                  <select
                    value={mapping.phoneCol}
                    onChange={(e) => handleMappingChange('phoneCol', e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs font-bold text-slate-800"
                  >
                    <option value="">-- اختياري --</option>
                    {headers.map((h, i) => (
                      <option key={i} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                {/* Phone 2 Col */}
                <div>
                  <label className="block text-slate-600 font-bold mb-1">التليفون الثاني</label>
                  <select
                    value={mapping.phone2Col}
                    onChange={(e) => handleMappingChange('phone2Col', e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs font-bold text-slate-800"
                  >
                    <option value="">-- اختياري --</option>
                    {headers.map((h, i) => (
                      <option key={i} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                {/* Address Col */}
                <div>
                  <label className="block text-slate-600 font-bold mb-1">العنوان</label>
                  <select
                    value={mapping.addressCol}
                    onChange={(e) => handleMappingChange('addressCol', e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs font-bold text-slate-800"
                  >
                    <option value="">-- اختياري --</option>
                    {headers.map((h, i) => (
                      <option key={i} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                {/* Debt Col */}
                <div>
                  <label className="block text-slate-600 font-bold mb-1">الرصيد / المديونية</label>
                  <select
                    value={mapping.debtCol}
                    onChange={(e) => handleMappingChange('debtCol', e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs font-bold text-slate-800"
                  >
                    <option value="">-- اختياري --</option>
                    {headers.map((h, i) => (
                      <option key={i} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* STATS SUMMARY KPI BAR */}
          {parsedItems.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-blue-700 font-bold">إجمالي العملاء بالملف</div>
                  <div className="text-base font-black text-blue-900 mt-0.5">{parsedItems.length} عميل</div>
                </div>
                <Users className="w-5 h-5 text-blue-600" />
              </div>

              <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-emerald-700 font-bold">عملاء جدد للإضافة</div>
                  <div className="text-base font-black text-emerald-900 mt-0.5">{comparison.newCount} جديد</div>
                </div>
                <UserPlus className="w-5 h-5 text-emerald-600" />
              </div>

              <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-amber-700 font-bold">عملاء مسجلون سيتم تحديثهم</div>
                  <div className="text-base font-black text-amber-900 mt-0.5">{comparison.updateCount} مسجل</div>
                </div>
                <RefreshCw className="w-5 h-5 text-amber-600" />
              </div>

              <div className="bg-rose-50 border border-rose-200 p-3 rounded-xl flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-rose-700 font-bold">إجمالي رصيد المديونيات</div>
                  <div className="text-base font-black text-rose-900 mt-0.5">{comparison.totalDebt.toLocaleString()} ج.م</div>
                </div>
                <CreditCard className="w-5 h-5 text-rose-600" />
              </div>
            </div>
          )}

          {/* PREVIEW TABLE SECTION */}
          {parsedItems.length > 0 && (
            <div className="space-y-2 border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
              {/* Table Toolbar */}
              <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 text-xs">
                    معاينة البيانات المستخرجة من ({fileName || 'الملف'}):
                  </span>
                  <span className="bg-slate-200 text-slate-800 text-[11px] font-bold px-2 py-0.5 rounded-full">
                    {filteredRows.length} من {parsedItems.length}
                  </span>
                </div>

                {/* Filter, Clear and Search */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleClearAllPreview}
                    className="flex items-center gap-1 text-[11px] font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                    title="إفراغ كافة الصفوف من المعاينة"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>تفريغ المعاينة</span>
                  </button>

                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="بحث في المعاينة..."
                      className="pr-7 pl-2 py-1 bg-white border border-slate-300 rounded-lg text-xs w-36 sm:w-48 text-slate-900 focus:outline-hidden"
                    />
                  </div>

                  <div className="flex items-center gap-1 bg-slate-200/80 p-0.5 rounded-lg text-[11px]">
                    <button
                      type="button"
                      onClick={() => setFilterType('all')}
                      className={`px-2 py-0.5 rounded font-bold cursor-pointer transition-colors ${
                        filterType === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                      }`}
                    >
                      الكل
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterType('new_only')}
                      className={`px-2 py-0.5 rounded font-bold cursor-pointer transition-colors ${
                        filterType === 'new_only' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-600'
                      }`}
                    >
                      الجدد ({comparison.newCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterType('update_only')}
                      className={`px-2 py-0.5 rounded font-bold cursor-pointer transition-colors ${
                        filterType === 'update_only' ? 'bg-white text-amber-700 shadow-2xs' : 'text-slate-600'
                      }`}
                    >
                      المسجلون ({comparison.updateCount})
                    </button>
                  </div>
                </div>
              </div>

              {/* Table Body */}
              <div className="max-h-56 overflow-y-auto overflow-x-auto">
                <table className="w-full text-right text-[11px] border-collapse">
                  <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-2.5 w-10 text-center">م</th>
                      <th className="py-2 px-2.5 w-14 text-center">حذف</th>
                      <th className="py-2 px-2.5 w-20">الحالة</th>
                      <th className="py-2 px-2.5 w-24">كود العميل</th>
                      <th className="py-2 px-2.5">اسم العميل</th>
                      <th className="py-2 px-2.5">العنوان</th>
                      <th className="py-2 px-2.5">التليفون 1</th>
                      <th className="py-2 px-2.5">التليفون 2</th>
                      <th className="py-2 px-2.5 text-left">الرصيد / المديونية</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRows.slice(0, 100).map((row, idx) => (
                      <tr key={idx} className="hover:bg-blue-50/40 transition-colors">
                        <td className="py-1.5 px-2.5 text-center text-slate-400 font-mono">{idx + 1}</td>
                        <td className="py-1.5 px-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleDeletePreviewRow(row.customer_name, row.customer_code)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                            title={`حذف العميل "${row.customer_name}" من المعاينة`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                        <td className="py-1.5 px-2.5">
                          {row.status === 'new' ? (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                              جديد
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold">
                              تحديث
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 px-2.5 font-mono font-bold text-slate-700">
                          {row.customer_code || '-'}
                        </td>
                        <td className="py-1.5 px-2.5 font-bold text-slate-900">
                          {row.customer_name}
                          {row.notes && <span className="text-[10px] text-slate-400 mr-1.5 font-normal">({row.notes})</span>}
                        </td>
                        <td className="py-1.5 px-2.5 text-slate-600 truncate max-w-xs">{row.address || '-'}</td>
                        <td className="py-1.5 px-2.5 font-mono text-slate-700 dir-ltr text-right">{row.phone || '-'}</td>
                        <td className="py-1.5 px-2.5 font-mono text-slate-700 dir-ltr text-right">{row.phone2 || '-'}</td>
                        <td className="py-1.5 px-2.5 font-mono text-left font-bold text-slate-900">
                          {row.initialDebt > 0 ? (
                            <span className="text-rose-600">{row.initialDebt.toLocaleString()} ج.م</span>
                          ) : (
                            <span className="text-slate-400">0</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filteredRows.length > 100 && (
                <div className="p-2 bg-slate-50 text-center text-[11px] text-slate-500 border-t border-slate-200">
                  يتم عرض أول 100 عميل فقط في المعاينة لتسريع العرض، وسيتم استيراد كافة الـ {parsedItems.length} عميل بالكامل.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-100 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-600">
            <Info className="w-4 h-4 text-blue-600 shrink-0" />
            <span>
              {importMode === 'merge' && 'وضع الدمج: سيتم إضافة العملاء الجدد وتحديث أرقام هواتف وعناوين العملاء المسجلين (دون تكرار الاسم).'}
              {importMode === 'append' && 'وضع الإضافة فقط: سيتم إضافة العملاء الجدد فقط ولن يتم المساس بالعملاء المسجلين.'}
              {importMode === 'replace' && 'وضع الاستبدال: سيتم استبدال كامل قائمة العملاء الحالية ببيانات هذا الملف.'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                resetState();
              }}
              className="px-4 py-2 bg-white hover:bg-slate-200 border border-slate-300 text-slate-700 font-bold rounded-xl transition-colors cursor-pointer"
            >
              إلغاء
            </button>

            <button
              type="button"
              disabled={parsedItems.length === 0}
              onClick={handleConfirmImport}
              className="px-6 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white font-black rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
            >
              <Check className="w-4 h-4 text-emerald-400" />
              <span>بدء استرداد وحفظ العملاء ({parsedItems.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Clear All Customers Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-60 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white rounded-2xl border border-rose-200 shadow-2xl max-w-md w-full p-5 space-y-4 text-slate-900 animate-in zoom-in-95">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-base font-black text-rose-900">تأكيد مسح وتصفير كافة سجلات العملاء</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                هل أنت متأكد من رغبتك في حذف وتصفير جميع بيانات العملاء وحساباتهم الحالية؟ لن يؤثر هذا على المبيعات السابقة وسيتم الاحتفاظ بالحساب النقدي العام.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
              >
                تراجع
              </button>
              <button
                type="button"
                onClick={handleConfirmClearCustomers}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black rounded-xl cursor-pointer shadow-md"
              >
                تأكيد مسح كافة العملاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

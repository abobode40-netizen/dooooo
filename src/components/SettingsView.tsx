import React, { useState, useRef } from 'react';
import { 
  Building2, 
  Store, 
  Printer, 
  Database, 
  Cloud, 
  Sliders, 
  Receipt, 
  Save, 
  RotateCcw,
  FileSpreadsheet,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  FileUp,
  FileDown,
  HelpCircle,
  TrendingUp,
  TrendingDown,
  Tag,
  Boxes,
  ShieldAlert,
  Sun,
  Moon,
  Wifi,
  WifiOff,
  Palette,
  Users,
  Package,
  History,
  FileText,
  Layers,
  ArrowUpDown,
  RefreshCw,
  Search,
  Trash2
} from 'lucide-react';
import { BackupView } from './BackupView';
import { ImportProductsModal } from './ImportProductsModal';
import { ImportCustomersModal } from './ImportCustomersModal';
import { StartupOnlineModal } from './StartupOnlineModal';
import { useApp } from '../context/AppContext';
import { 
  downloadSampleExcelTemplate, 
  exportProductsToExcel, 
  exportPriceChangesToExcel,
  parseExcelFile,
  processImportRows,
  autoDetectColumnMapping,
  compareImportWithExisting,
  parsePdfBufferToItems,
  deduplicateImportRows,
  findMatchingProduct,
  ParsedImportItem
} from '../utils/productImportExport';
import { 
  downloadCustomerExcelTemplate, 
  exportCustomersToExcel 
} from '../utils/customerImportExport';
import {
  exportProductsListPDF,
  exportPriceChangesListPDF,
  exportCustomersListPDF
} from '../utils/pdfExport';

export interface StoreSettings {
  storeName: string;
  activityDesc: string;
  phone: string;
  address: string;
  commercialReg: string;
  taxNumber: string;
  invoiceFooterNote: string;
  defaultCashierName: string;
  defaultPaymentType: 'cash' | 'debt' | 'visa';
  autoPrintAfterSale: boolean;
  enablePriceHistoryLogging: boolean;
  // Traits and Limits
  minStockAlertLimit: number;
  maxCustomerDebtLimit: number;
  productCategories: string;
  productUnits: string;
}

const DEFAULT_SETTINGS: StoreSettings = {
  storeName: 'أولاد طه للجملة والمواد الغذائية',
  activityDesc: 'بيع وتوزيع المواد الغذائية والمنظفات ومستلزمات السوبرماركت بالجملة والقطاعي',
  phone: '01012345678 - 01198765432',
  address: 'شارع الجمهورية الرئيسي - المخزن والفرع المركزي',
  commercialReg: '89412',
  taxNumber: '432-110-985',
  invoiceFooterNote: 'البضاعة المباعة لا ترد ولا تستبدل بعد 14 يوماً من تاريخ الفاتورة. شكراً لتعاملكم معنا.',
  defaultCashierName: 'الكاشير الرئيسي',
  defaultPaymentType: 'cash',
  autoPrintAfterSale: true,
  enablePriceHistoryLogging: true,
  minStockAlertLimit: 5,
  maxCustomerDebtLimit: 15000,
  productCategories: 'زيوت وسمن, معلبات وصلصة, أرز ومكرونة, بقوليات, ألبان وجبن, مساحيق ومنظفات, مشروبات وشاي, حلويات وبسكويت',
  productUnits: 'قطعة, كرتونة, باكت, كيلو, كيس, دستة, شيكارة, لتر'
};

const SETTINGS_STORAGE_KEY = 'store_app_settings_v1';

interface SettingsViewProps {
  onNavigateTab?: (tab: string) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onNavigateTab }) => {
  const { 
    showToast, 
    products, 
    customerDebts,
    priceChangeItems,
    priceChangeDays,
    theme, 
    setTheme, 
    storeName, 
    setStoreName, 
    isOnline,
    showStartupAlert,
    setShowStartupAlert,
    fixSwappedProductsCodeAndName,
    clearAllProducts,
    clearAllCustomers,
    clearProductPriceFlags,
    bulkImportProducts,
    recordPriceChangeDay
  } = useApp();
  
  const [activeSubTab, setActiveSubTab] = useState<'themes' | 'products_io' | 'backup' | 'customers_io' | 'general' | 'invoice'>('themes');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isCustomerImportModalOpen, setIsCustomerImportModalOpen] = useState(false);
  const [isPreviewOnlineModalOpen, setIsPreviewOnlineModalOpen] = useState(false);
  const [isClearProductsModalOpen, setIsClearProductsModalOpen] = useState(false);
  const [confirmClearChecked, setConfirmClearChecked] = useState(false);

  // Direct 5-column fixed import states
  const productFileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessingDirectImport, setIsProcessingDirectImport] = useState(false);
  const [isDraggingProductFile, setIsDraggingProductFile] = useState(false);
  const [directImportStats, setDirectImportStats] = useState<{
    fileName: string;
    total: number;
    updated: number;
    added: number;
    unchanged: number;
    duplicatesMerged?: number;
    timestamp: string;
  } | null>(null);

  // Process Direct Fixed Import (Excel / CSV / PDF):
  // Strictly extracts: (الكود، اسم الصنف، الوحدة، سعر الجملة، سعر التجزئة)
  // Automatically updates existing products' prices and adds new products only
  const processDirectFixedImport = async (file: File) => {
    setIsProcessingDirectImport(true);
    try {
      const buffer = await file.arrayBuffer();
      const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
      let rawValidItems: ParsedImportItem[] = [];

      if (isPdf) {
        rawValidItems = await parsePdfBufferToItems(buffer);
      } else {
        const { headers, rawRows } = parseExcelFile(buffer);
        if (!rawRows || rawRows.length === 0) {
          showToast('الملف فارغ أو لا يحتوي على صفوف صالحة للاستيراد', 'error');
          setIsProcessingDirectImport(false);
          return;
        }
        const mapping = autoDetectColumnMapping(headers);
        const parsedItems = processImportRows(rawRows, mapping);
        rawValidItems = parsedItems.filter(i => i.isValid && String(i.name || '').trim());
      }

      if (rawValidItems.length === 0) {
        showToast('لم يتم العثور على أي صنف صالح يحمل اسماً واضحاً في الملف المرفوع', 'error');
        setIsProcessingDirectImport(false);
        return;
      }

      // Deduplicate rows within file and compare strictly with existing products
      const comparison = compareImportWithExisting(rawValidItems, products);

      // Build payload with clean 5 attributes
      const payload = comparison.items.map(item => {
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

      // Merge import: updates prices of existing products and adds new products only
      bulkImportProducts(payload, 'merge');

      // Automatically register and log price differences in history
      const today = new Date().toISOString().split('T')[0];
      const changesToLog = comparison.items
        .filter(i => i.hasPriceChange || i.changeStatus === 'new')
        .map(i => {
          const matched = findMatchingProduct(i, products);
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
          title: `استيراد: ${file.name}`,
          notes: `تحديث أسعار ${comparison.stats.changesOnlyCount} صنف وإضافة ${comparison.stats.newItems} صنف جديد من استيراد ${isPdf ? 'PDF' : 'Excel'}`,
          changes: changesToLog
        });
      }

      setDirectImportStats({
        fileName: file.name,
        total: comparison.stats.total,
        updated: comparison.stats.changesOnlyCount,
        added: comparison.stats.newItems,
        unchanged: comparison.stats.unchanged,
        duplicatesMerged: comparison.stats.duplicatesMerged,
        timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
      });

      showToast(
        `تم استيراد ${file.name} بنجاح: تحديث أسعار ${comparison.stats.changesOnlyCount} صنف، إضافة ${comparison.stats.newItems} صنف جديد${comparison.stats.duplicatesMerged > 0 ? `، ودمج ${comparison.stats.duplicatesMerged} تكرار` : ''}`,
        'success'
      );
    } catch (err) {
      console.error(err);
      showToast('حدث خطأ أثناء قراءة ملف الاستيراد', 'error');
    } finally {
      setIsProcessingDirectImport(false);
    }
  };

  const handleProductFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processDirectFixedImport(file);
    }
    if (e.target) e.target.value = '';
  };

  // Inverted products check
  const invertedProductsCount = products.filter(p => {
    const nameVal = String(p.name || '').trim();
    const codeVal = String(p.code || '').trim();
    const nameIsDigits = /^\d+$/.test(nameVal);
    const codeIsDigits = /^\d+$/.test(codeVal);
    const nameHasArabic = /[\u0600-\u06FF]/.test(nameVal);
    const codeHasArabic = /[\u0600-\u06FF]/.test(codeVal);
    const nameIsCodePattern = /^(p|prd|itm|code|c)[-_]?\d+/i.test(nameVal);

    return (nameIsDigits && !codeIsDigits) || (!nameHasArabic && codeHasArabic) || (nameIsCodePattern && codeHasArabic) || (codeVal.length > nameVal.length && codeVal.includes(' ') && !nameVal.includes(' ') && !codeIsDigits);
  }).length;

  // Export Loading States
  const [isExportingProductPdf, setIsExportingProductPdf] = useState(false);
  const [isExportingPriceChangesPdf, setIsExportingPriceChangesPdf] = useState(false);
  const [isExportingCustomerPdf, setIsExportingCustomerPdf] = useState(false);

  const [settings, setSettings] = useState<StoreSettings>(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved), storeName: storeName || DEFAULT_SETTINGS.storeName };
    } catch (e) {
      console.error(e);
    }
    return { ...DEFAULT_SETTINGS, storeName: storeName || DEFAULT_SETTINGS.storeName };
  });

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
      if (settings.storeName) {
        setStoreName(settings.storeName);
      }
      showToast('تم حفظ كافة الإعدادات والسمات والحدود بنجاح', 'success');
    } catch (e) {
      showToast('فشل حفظ الإعدادات', 'error');
    }
  };

  const handleResetDefaults = () => {
    if (window.confirm('هل تريد استعادة الإعدادات الافتراضية للنظام؟')) {
      setSettings(DEFAULT_SETTINGS);
      setStoreName(DEFAULT_SETTINGS.storeName);
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(DEFAULT_SETTINGS));
      showToast('تمت استعادة الإعدادات الافتراضية', 'info');
    }
  };

  // Product PDF Export Handler
  const handleExportProductPdf = async () => {
    if (products.length === 0) {
      showToast('لا توجد أصناف لتصديرها', 'warning');
      return;
    }
    setIsExportingProductPdf(true);
    try {
      await exportProductsListPDF(products);
      showToast('تم تصدير كشف الأصناف والمخزون PDF بنجاح', 'success');
    } catch (err) {
      console.error(err);
      showToast('حدث خطأ أثناء تصدير كشف الأصناف PDF', 'error');
    } finally {
      setIsExportingProductPdf(false);
    }
  };

  // Price Changes PDF Export Handler
  const handleExportPriceChangesPdf = async () => {
    if (priceChangeItems.length === 0) {
      showToast('لا توجد سجلات فروق أسعار لتصديرها', 'warning');
      return;
    }
    setIsExportingPriceChangesPdf(true);
    try {
      await exportPriceChangesListPDF(priceChangeItems);
      showToast('تم تصدير تقرير فروق الأسعار والزيادة والنقصان PDF بنجاح', 'success');
    } catch (err) {
      console.error(err);
      showToast('حدث خطأ أثناء تصدير تقرير فروق الأسعار PDF', 'error');
    } finally {
      setIsExportingPriceChangesPdf(false);
    }
  };

  // Customer PDF Export Handler
  const handleExportCustomerPdf = async () => {
    if (customerDebts.length === 0) {
      showToast('لا توجد بيانات عملاء لتصديرها', 'warning');
      return;
    }
    setIsExportingCustomerPdf(true);
    try {
      await exportCustomersListPDF(customerDebts);
      showToast('تم تصدير كشف ودليل العملاء والمديونيات PDF بنجاح', 'success');
    } catch (err) {
      console.error(err);
      showToast('حدث خطأ أثناء تصدير كشف العملاء PDF', 'error');
    } finally {
      setIsExportingCustomerPdf(false);
    }
  };

  return (
    <div className="space-y-5 font-sans animate-in fade-in duration-150">
      {/* Top Header Card */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-600 flex items-center justify-center text-white shadow-sm">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              لوحة الإعدادات والمزامنة والاسترداد والتصدير
            </h2>
            <p className="text-xs text-slate-500">
              استرداد وتصدير الأصناف والعملاء والأسعار، سمات المظهر، بيانات المؤسسة، والنسخ السحابي
            </p>
          </div>
        </div>

        {/* Sub-tab navigation buttons */}
        <div className="flex flex-wrap bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
          <button
            onClick={() => setActiveSubTab('themes')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
              activeSubTab === 'themes'
                ? 'bg-red-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Palette className="w-4 h-4" />
            الثيمات والمظهر
          </button>

          <button
            onClick={() => setActiveSubTab('products_io')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
              activeSubTab === 'products_io'
                ? 'bg-red-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Package className="w-4 h-4" />
            استرداد الأصناف (Excel)
          </button>

          <button
            onClick={() => setActiveSubTab('backup')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
              activeSubTab === 'backup'
                ? 'bg-red-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Cloud className="w-4 h-4" />
            نسخة احتياطية (للأصناف والبرنامج كامل)
          </button>

          <button
            onClick={() => setActiveSubTab('customers_io')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
              activeSubTab === 'customers_io'
                ? 'bg-red-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Users className="w-4 h-4" />
            استرداد العملاء
          </button>

          <button
            onClick={() => setActiveSubTab('general')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
              activeSubTab === 'general'
                ? 'bg-red-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Building2 className="w-4 h-4" />
            بيانات الشركة والحدود
          </button>

          <button
            onClick={() => setActiveSubTab('invoice')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
              activeSubTab === 'invoice'
                ? 'bg-red-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Receipt className="w-4 h-4" />
            الفواتير والطباعة
          </button>
        </div>
      </div>

      {/* Quick Navigation to other features */}
      {onNavigateTab && (
        <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-bold text-slate-700 dark:text-slate-300">الانتقال السريع إلى الشاشات:</span>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => onNavigateTab('products')}
              className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 font-bold text-slate-800 dark:text-slate-200 cursor-pointer"
            >
              📦 الأصناف
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('search')}
              className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 font-bold text-slate-800 dark:text-slate-200 cursor-pointer"
            >
              🔍 البحث
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('price_changes')}
              className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 font-bold text-blue-700 dark:text-blue-400 cursor-pointer"
            >
              📈 الزيادات والنواقص
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('customers')}
              className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 font-bold text-slate-800 dark:text-slate-200 cursor-pointer"
            >
              👥 العملاء
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('debts')}
              className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 font-bold text-purple-700 dark:text-purple-400 cursor-pointer"
            >
              💳 مديونيات العملاء
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('sales')}
              className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 font-bold text-emerald-700 dark:text-emerald-400 cursor-pointer"
            >
              🧾 فواتير البيع
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('import')}
              className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 font-bold text-slate-800 dark:text-slate-200 cursor-pointer"
            >
              📊 استرداد الإكسيل
            </button>
          </div>
        </div>
      )}

      {/* TAB 0: THEMES & ONLINE ADVISORY */}
      {activeSubTab === 'themes' && (
        <div className="space-y-4">
          {/* Theme Selector Section */}
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Palette className="w-5 h-5 text-red-600" />
                <h3 className="text-sm font-black text-slate-900">سمات المظهر (ليل ونهار وسمة أولاد طه)</h3>
              </div>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
                السمة الحالية: {theme === 'light' ? 'النهاري' : theme === 'dark' ? 'الليلي' : 'أولاد طه (أحمر وداكن)'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Option 1: Light Theme */}
              <div 
                onClick={() => setTheme('light')}
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  theme === 'light' 
                    ? 'border-blue-600 bg-blue-50/50 shadow-md ring-2 ring-blue-500/20' 
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-600">
                      <Sun className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-black text-slate-900 text-sm">الوضع النهاري (فاتح)</h4>
                      <p className="text-[11px] text-slate-500">مريح للعمل المكتبي في ضوء النهار</p>
                    </div>
                  </div>
                  {theme === 'light' && (
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs">✓</span>
                  )}
                </div>
                <div className="p-3 bg-slate-100 rounded-lg border border-slate-200 space-y-1.5 text-xs">
                  <div className="h-4 bg-white rounded-sm w-3/4 border border-slate-200"></div>
                  <div className="h-4 bg-blue-600 rounded-sm w-1/2 text-white text-[9px] px-1 font-bold flex items-center">أزرار زرقاء</div>
                </div>
              </div>

              {/* Option 2: Dark Theme */}
              <div 
                onClick={() => setTheme('dark')}
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  theme === 'dark' 
                    ? 'border-blue-500 bg-slate-900 text-white shadow-md ring-2 ring-blue-500/20' 
                    : 'border-slate-200 hover:border-slate-300 bg-slate-900 text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-blue-400">
                      <Moon className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-black text-white text-sm">الوضع الليلي (داكن)</h4>
                      <p className="text-[11px] text-slate-400">مريح للعينين في الإضاءة الخافتة</p>
                    </div>
                  </div>
                  {theme === 'dark' && (
                    <span className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs">✓</span>
                  )}
                </div>
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-1.5 text-xs">
                  <div className="h-4 bg-slate-800 rounded-sm w-3/4"></div>
                  <div className="h-4 bg-red-600 rounded-sm w-1/2 text-white text-[9px] px-1 font-bold flex items-center">أزرار داكنة</div>
                </div>
              </div>

              {/* Option 3: Red & Dark (Taha Theme matching photo) */}
              <div 
                onClick={() => setTheme('red_dark')}
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  theme === 'red_dark' 
                    ? 'border-red-600 bg-slate-900 text-white shadow-md ring-2 ring-red-500/20' 
                    : 'border-slate-200 hover:border-slate-300 bg-slate-900 text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center text-white font-black">
                      ط
                    </div>
                    <div>
                      <h4 className="font-black text-white text-sm">سمة أولاد طه (أحمر وداكن)</h4>
                      <p className="text-[11px] text-slate-400">مطابقة لشكل القوائم والصورة المطلوبة</p>
                    </div>
                  </div>
                  {theme === 'red_dark' && (
                    <span className="w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center text-xs">✓</span>
                  )}
                </div>
                <div className="p-3 bg-[#12151d] rounded-lg border border-red-900/40 space-y-1.5 text-xs">
                  <div className="h-4 bg-gradient-to-r from-red-600 to-rose-600 rounded-sm w-full text-white text-[9px] px-1 font-bold flex items-center">شريط علوي أحمر</div>
                  <div className="h-4 bg-slate-800 rounded-sm w-2/3"></div>
                </div>
              </div>
            </div>
          </div>

          {/* Online Connection & Price Updating Alert Section */}
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Wifi className="w-5 h-5 text-emerald-600" />
                <h3 className="text-sm font-black text-slate-900">
                  تنبيه اتصال الإنترنت لتحديث الأسعار عند فتح التطبيق
                </h3>
              </div>
              <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                isOnline ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}>
                {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
                <span>{isOnline ? 'الشبكة متصلة حالياً' : 'غير متصل بالشبكة'}</span>
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="font-bold text-slate-900 text-sm mb-1">
                  إظهار رسالة التنبيه الإرشادية عند بداية تشغيل التطبيق
                </div>
                <p className="text-xs text-slate-500 max-w-xl leading-relaxed">
                  توضح الرسالة للمستخدمين أن التطبيق بحاجة للاتصال بالإنترنت لمزامنة قوائم الأسعار الجديدة واستيراد التغيرات وتحديث المخازن، مع استمرار إمكانية البيع دون إنترنت.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsPreviewOnlineModalOpen(true)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 shadow-xs cursor-pointer"
                >
                  معاينة وتجربة الرسالة الآن
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const nextVal = !showStartupAlert;
                    setShowStartupAlert(nextVal);
                    if (nextVal) {
                      localStorage.removeItem('store_hide_online_startup_modal');
                      showToast('سيتم إظهار رسالة تنبيه الاتصال عند بدء التشغيل', 'success');
                    } else {
                      localStorage.setItem('store_hide_online_startup_modal', 'true');
                      showToast('تم كتم إظهار الرسالة التلقائية عند بدء التشغيل', 'info');
                    }
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-black transition-colors cursor-pointer ${
                    showStartupAlert 
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs' 
                      : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                  }`}
                >
                  {showStartupAlert ? 'مفعلة عند الفتح' : 'معطلة'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Online Modal Preview */}
      {isPreviewOnlineModalOpen && (
        <StartupOnlineModal 
          isOpen={isPreviewOnlineModalOpen} 
          onClose={() => setIsPreviewOnlineModalOpen(false)} 
        />
      )}

      {/* TAB 1: GENERAL & TRAITS & LIMITS */}
      {activeSubTab === 'general' && (
        <form onSubmit={handleSaveSettings} className="space-y-4">
          {/* Company Details */}
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
              <Building2 className="w-4 h-4 text-blue-600" />
              <span>بيانات المؤسسة والشركة الرئيسية</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
              <div className="lg:col-span-2">
                <label className="font-bold text-slate-700 block mb-1">
                  اسم الشركة أو المؤسسة (يظهر في ترويسة جميع الفواتير) *
                </label>
                <input
                  type="text"
                  required
                  value={settings.storeName}
                  onChange={e => setSettings({ ...settings, storeName: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-bold focus:bg-white focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  أرقام الهواتف والتواصل
                </label>
                <input
                  type="text"
                  value={settings.phone}
                  onChange={e => setSettings({ ...settings, phone: e.target.value })}
                  placeholder="010... - 011..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none font-mono"
                />
              </div>

              <div className="lg:col-span-2">
                <label className="font-bold text-slate-700 block mb-1">
                  نشاط المؤسسة والبيان التجاري
                </label>
                <input
                  type="text"
                  value={settings.activityDesc}
                  onChange={e => setSettings({ ...settings, activityDesc: e.target.value })}
                  placeholder="مثال: تجارة المواد الغذائية بالجملة والتجزئة"
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  العنوان والموقع
                </label>
                <input
                  type="text"
                  value={settings.address}
                  onChange={e => setSettings({ ...settings, address: e.target.value })}
                  placeholder="المدينة، الشارع الرئيسي"
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  رقم السجل التجاري (س.ت)
                </label>
                <input
                  type="text"
                  value={settings.commercialReg}
                  onChange={e => setSettings({ ...settings, commercialReg: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  رقم البطاقة الضريبية (ب.ض)
                </label>
                <input
                  type="text"
                  value={settings.taxNumber}
                  onChange={e => setSettings({ ...settings, taxNumber: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none font-mono"
                />
              </div>
            </div>
          </div>

          {/* Limits and Traits */}
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
              <Boxes className="w-4 h-4 text-blue-600" />
              <span>السمات والحدود الرقابية (حدود المخزون والمديونية)</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                <label className="font-bold text-slate-800 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-amber-600" />
                  حد الطلب الأدنى الافتراضي للأصناف (تنبيه النواقص)
                </label>
                <p className="text-[11px] text-slate-500 mb-2">
                  الصنف الذي يقل رصيده عن هذا الرقم يُدرج تلقائياً في قائمة النواقص
                </p>
                <input
                  type="number"
                  min="0"
                  value={settings.minStockAlertLimit}
                  onChange={e => setSettings({ ...settings, minStockAlertLimit: Number(e.target.value) })}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 font-bold text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                <label className="font-bold text-slate-800 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-rose-600" />
                  الحد الأقصى الافتراضي لمديونية العميل (ج.م)
                </label>
                <p className="text-[11px] text-slate-500 mb-2">
                  سقف المديونية الآجلة لتنبيه الكاشير قبل البيع على الحساب
                </p>
                <input
                  type="number"
                  min="0"
                  step="500"
                  value={settings.maxCustomerDebtLimit}
                  onChange={e => setSettings({ ...settings, maxCustomerDebtLimit: Number(e.target.value) })}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 font-bold text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2 space-y-1">
                <label className="font-bold text-slate-700 block">
                  سمات وتصنيفات المنتجات (مفصولة بفاصلة)
                </label>
                <input
                  type="text"
                  value={settings.productCategories}
                  onChange={e => setSettings({ ...settings, productCategories: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none text-xs"
                />
              </div>

              <div className="sm:col-span-2 space-y-1">
                <label className="font-bold text-slate-700 block">
                  سمات وحدات القياس المعتمدة (مفصولة بفاصلة)
                </label>
                <input
                  type="text"
                  value={settings.productUnits}
                  onChange={e => setSettings({ ...settings, productUnits: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none text-xs"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                onClick={handleResetDefaults}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                استعادة الإعدادات الافتراضية
              </button>

              <button
                type="submit"
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-sm transition-colors cursor-pointer"
              >
                <Save className="w-4 h-4" />
                حفظ بيانات الشركة والسمات
              </button>
            </div>
          </div>
        </form>
      )}

      {/* TAB 1: PRODUCTS IMPORT & EXPORT (قائمة الأصناف والمخزون مستقلة تماماً) */}
      {activeSubTab === 'products_io' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* Top Products KPI Banner */}
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-600 flex items-center justify-center text-white shadow-xs">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    مركز استيراد وتصدير قائمة الأصناف والمخزون
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    إدارة مستقلة ومخصصة بالكامل لبيانات الأصناف، الأكواد، الأسعار الحالية، والأرصدة المخزنية
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setIsImportModalOpen(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors cursor-pointer"
                  title="استرداد ملف الأصناف (Excel أو PDF) لتحديث الأسعار وإضافة الأصناف الجديدة"
                >
                  <FileUp className="w-4 h-4 text-white" />
                  استرداد ملف وتحديث الأسعار
                </button>

                <button
                  onClick={() => {
                    setConfirmClearChecked(false);
                    setIsClearProductsModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-lg border border-rose-300 transition-colors cursor-pointer shadow-2xs"
                  title="مسح وتفريغ قائمة الأصناف بالكامل للبدء باستيراد نظيف دون تراكم أصناف سابقة"
                >
                  <Trash2 className="w-4 h-4 text-rose-600" />
                  <span>مسح كل الأصناف</span>
                  <span className="bg-rose-200/80 text-rose-900 px-1.5 py-0.5 text-[10px] rounded-full font-mono font-bold leading-none">
                    {products.length}
                  </span>
                </button>

                <button
                  onClick={downloadSampleExcelTemplate}
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-lg border border-slate-300 transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4 text-emerald-600" />
                  تحميل نموذج Excel فارغ
                </button>
              </div>
            </div>

            {/* Quick Metrics Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-3.5 bg-emerald-50/70 border border-emerald-200/80 rounded-xl">
                <span className="text-[11px] font-bold text-emerald-800 block">إجمالي الأصناف المسجلة</span>
                <span className="text-xl font-black text-emerald-950 font-mono mt-1 block">
                  {products.length} صنف
                </span>
              </div>

              <div className="p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-xl">
                <span className="text-[11px] font-bold text-blue-800 block">إجمالي رصيد المخزون</span>
                <span className="text-xl font-black text-blue-950 font-mono mt-1 block">
                  {products.reduce((acc, p) => acc + (Number(p.stock) || 0), 0).toLocaleString()} قطعة
                </span>
              </div>

              <div className="p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-xl">
                <span className="text-[11px] font-bold text-amber-800 block">قيمة المخزون (سعر الجملة)</span>
                <span className="text-xl font-black text-amber-950 font-mono mt-1 block">
                  {Math.round(products.reduce((acc, p) => acc + ((Number(p.price_wholesale) || Number(p.price) || 0) * (Number(p.stock) || 0)), 0)).toLocaleString()} ج.م
                </span>
              </div>

              <div className="p-3.5 bg-purple-50/70 border border-purple-200/80 rounded-xl">
                <span className="text-[11px] font-bold text-purple-800 block">عدد الأقسام والتصنيفات</span>
                <span className="text-xl font-black text-purple-950 font-mono mt-1 block">
                  {Array.from(new Set(products.map(p => p.category).filter(Boolean))).length || 1} قسم
                </span>
              </div>
            </div>
          </div>

          {/* Grid of Product Actions: Import & Export Operations */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Card A: الاستيراد الثابت المعتمد للأصناف والأسعار (5 أعمدة فقط) */}
            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                {/* Header */}
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
                  <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                      <span>الاستيراد الثابت للأصناف والأسعار (Excel / CSV)</span>
                      <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                        5 أعمدة فقط
                      </span>
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      استيراد ثابت مقتصر فقط على: الكود، اسم الصنف، الوحدة، سعر الجملة، وسعر التجزئة
                    </p>
                  </div>
                </div>

                {/* The 5 Fixed Columns Bar */}
                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                    <span className="flex items-center gap-1 text-slate-900">
                      <Layers className="w-3.5 h-3.5 text-emerald-600" />
                      الأعمدة الخمسة الثابتة المطلوبة في الملف:
                    </span>
                    <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-mono">
                      ترتيب تلقائي ومطابقة ذكية
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-center">
                    <div className="p-1.5 bg-white rounded-lg border border-slate-200 text-[11px] font-bold text-slate-800 shadow-2xs">
                      1. كود الصنف
                    </div>
                    <div className="p-1.5 bg-white rounded-lg border border-slate-200 text-[11px] font-bold text-slate-800 shadow-2xs">
                      2. اسم الصنف
                    </div>
                    <div className="p-1.5 bg-white rounded-lg border border-slate-200 text-[11px] font-bold text-slate-800 shadow-2xs">
                      3. الوحدة
                    </div>
                    <div className="p-1.5 bg-blue-50/80 rounded-lg border border-blue-200 text-[11px] font-black text-blue-900 shadow-2xs">
                      4. سعر الجملة
                    </div>
                    <div className="p-1.5 bg-emerald-50/80 rounded-lg border border-emerald-200 text-[11px] font-black text-emerald-900 shadow-2xs">
                      5. سعر التجزئة
                    </div>
                  </div>
                </div>

                {/* The Two-Rule Direct Explanation */}
                <div className="p-3 bg-emerald-50/40 rounded-xl border border-emerald-200/60 text-xs space-y-2 text-slate-700">
                  <div className="font-bold text-slate-900 flex items-center gap-1.5 text-emerald-800">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    منطق الاستيراد والمعالجة التلقائية المعتمدة:
                  </div>
                  <ul className="list-disc list-inside space-y-1 pr-1 text-[11px] leading-relaxed">
                    <li>
                      <strong>تحديث تلقائي للأصناف الموجودة:</strong> بمجرد مطابقة الكود أو الاسم، يتم تحديث سعر الجملة وسعر القطاعي فوراً، وتسجيل أي زيادة أو نقصان تلقائياً في سجل الأسعار.
                    </li>
                    <li>
                      <strong>إضافة الأصناف الجديدة فقط:</strong> يتم إدراج أي صنف جديد غير متواجد مسبقاً تلقائياً في قاعدة الأصناف دون تكرار أو مساس بالأصناف السابقة.
                    </li>
                  </ul>
                </div>

                {/* Direct Drag-and-Drop / File Upload Zone */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDraggingProductFile(true);
                  }}
                  onDragLeave={() => setIsDraggingProductFile(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDraggingProductFile(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) processDirectFixedImport(file);
                  }}
                  className={`p-4 rounded-xl border-2 border-dashed transition-all text-center flex flex-col items-center justify-center gap-2 ${
                    isDraggingProductFile
                      ? 'border-emerald-500 bg-emerald-50 shadow-inner ring-2 ring-emerald-400/20'
                      : 'border-slate-200 hover:border-emerald-400 bg-slate-50/60 hover:bg-emerald-50/20'
                  }`}
                >
                  <input
                    type="file"
                    ref={productFileInputRef}
                    accept=".xlsx, .xls, .csv, .pdf"
                    onChange={handleProductFileInputChange}
                    className="hidden"
                  />

                  {isProcessingDirectImport ? (
                    <div className="py-2 flex items-center gap-2 text-emerald-700 font-bold text-xs animate-pulse">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>جارٍ قراءة الملف وتحديث أسعار الأصناف وإضافة الأصناف الجديدة...</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-center gap-2 text-slate-700">
                        <Upload className="w-5 h-5 text-emerald-600" />
                        <span className="text-xs font-bold text-slate-800">
                          اسحب وأفلت ملف Excel أو PDF هنا أو اضغط للاستيراد المباشر
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400">
                        يدعم ملفات (.xlsx, .xls, .csv, .pdf) — يحدّث أسعار الأصناف الحالية ويضيف الأصناف الجديدة فقط
                      </p>
                      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => productFileInputRef.current?.click()}
                          className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-lg shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                        >
                          <FileUp className="w-3.5 h-3.5" />
                          <span>اختيار ملف Excel / PDF</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsImportModalOpen(true)}
                          className="px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-lg border border-slate-300 transition-colors cursor-pointer flex items-center gap-1.5"
                        >
                          <span>معاينة وتدقيق متقدم</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Direct Import Stats Banner (if user recently imported) */}
                {directImportStats && (
                  <div className="p-3 bg-white rounded-xl border-2 border-emerald-300 shadow-xs space-y-2 animate-in fade-in">
                    <div className="flex items-center justify-between text-xs font-bold text-emerald-950 border-b border-emerald-100 pb-1.5">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        نتائج آخر استيراد مباشر ({directImportStats.fileName}):
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {directImportStats.timestamp}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                      <div className="p-2 bg-emerald-50 rounded-lg border border-emerald-200">
                        <span className="text-[10px] font-bold text-emerald-800 block">تم تحديث أسعارها</span>
                        <span className="text-base font-black text-emerald-900 font-mono">{directImportStats.updated}</span>
                      </div>
                      <div className="p-2 bg-blue-50 rounded-lg border border-blue-200">
                        <span className="text-[10px] font-bold text-blue-800 block">أصناف جديدة أضيفت</span>
                        <span className="text-base font-black text-blue-900 font-mono">{directImportStats.added}</span>
                      </div>
                      <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                        <span className="text-[10px] font-bold text-slate-700 block">بدون تغيير في السعر</span>
                        <span className="text-base font-black text-slate-800 font-mono">{directImportStats.unchanged}</span>
                      </div>
                      <div className="p-2 bg-purple-50 rounded-lg border border-purple-200">
                        <span className="text-[10px] font-bold text-purple-800 block">إجمالي في الملف</span>
                        <span className="text-base font-black text-purple-900 font-mono">{directImportStats.total}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons Row */}
              <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
                <button
                  type="button"
                  onClick={downloadSampleExcelTemplate}
                  className="flex-1 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl border border-slate-300 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  title="تحميل نموذج إكسيل فارغ يحتوي فقط على الأعمدة الخمسة المعتمدة"
                >
                  <Download className="w-4 h-4 text-emerald-600" />
                  تحميل النموذج الثابت (5 أعمدة)
                </button>

                <button
                  type="button"
                  onClick={() => clearProductPriceFlags()}
                  className="px-3.5 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold text-xs rounded-xl border border-amber-300 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  title="تصفير علامات الأسعار المتغيرة والأصناف الجديدة"
                >
                  <RotateCcw className="w-4 h-4 text-amber-600" />
                  <span>تصفير علامات الأسعار</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setConfirmClearChecked(false);
                    setIsClearProductsModalOpen(true);
                  }}
                  className="px-3.5 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl border border-rose-300 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  title="مسح كافة الأصناف لتصفير القائمة والبدء باسترداد نظيف"
                >
                  <Trash2 className="w-4 h-4 text-rose-600" />
                  <span>مسح كل الأصناف ({products.length})</span>
                </button>
              </div>
            </div>

            {/* Card B: تصدير دليل الأصناف والمخزون كـ Excel و PDF */}
            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
                  <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                  <div>
                    <h4 className="text-sm font-black text-slate-900">
                      تصدير كشوف ودليل الأصناف والمخزون (Export)
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      تصدير فوري لكامل بيانات الأصناف، الأسعار، الأرصدة والباركود كـ Excel أو PDF
                    </p>
                  </div>
                </div>

                <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-200 text-xs space-y-1.5 text-slate-700">
                  <div className="font-bold text-blue-900 flex items-center gap-1.5">
                    <Boxes className="w-4 h-4 text-blue-600" />
                    محتويات كشف الأصناف المصدر:
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    يتضمن الملف المصدر: م، كود الصنف، اسم الصنف، الوحدة، القسم، سعر الجملة، سعر القطاعي، الرصيد المخزني الحالي، والباركود، مع مجاميع كمية وتقييم مالي كامل.
                  </p>
                </div>
              </div>

              <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  onClick={() => {
                    if (products.length === 0) {
                      showToast('لا توجد أصناف لتصديرها', 'warning');
                      return;
                    }
                    exportProductsToExcel(products);
                    showToast(`تم تصدير ${products.length} صنف كملف Excel بنجاح`, 'success');
                  }}
                  disabled={products.length === 0}
                  className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-200" />
                  تصدير الأصناف (Excel)
                </button>

                <button
                  onClick={handleExportProductPdf}
                  disabled={isExportingProductPdf || products.length === 0}
                  className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
                >
                  {isExportingProductPdf ? (
                    <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
                  ) : (
                    <FileDown className="w-4 h-4 text-rose-400" />
                  )}
                  تصدير كشف الأصناف (PDF)
                </button>
              </div>
            </div>

            {/* CARD C: FIX SWAPPED CODE & NAME AFTER RESTORE (إصلاح الجميع) */}
            <div className="md:col-span-2 bg-white rounded-2xl p-5 border-2 border-amber-200 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-amber-100 pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs">
                    <RotateCcw className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                      معالجة ظهور الكود مكان اسم الصنف بعد الاسترداد (إصلاح الجميع)
                      {invertedProductsCount > 0 && (
                        <span className="bg-amber-100 text-amber-800 text-xs px-2.5 py-0.5 rounded-full font-bold">
                          تم رصد {invertedProductsCount} صنف معكوس
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      إذا قمت باستيراد أو استرداد أصناف وظهر في جدول الأصناف أو شاشة البيع كود الصنف بدلاً من اسمه، تتيح لك هذه الأداة عكس وتصحيح حقول (الاسم ⇄ الكود) بنقرة واحدة.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => fixSwappedProductsCodeAndName('auto')}
                  className="p-3.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-xl flex items-start gap-3 transition-colors cursor-pointer text-right"
                >
                  <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-black text-xs text-emerald-950">
                      إصلاح ذكي وتلقائي للأصناف المعكوسة
                    </div>
                    <p className="text-[11px] text-emerald-700 mt-0.5 leading-relaxed">
                      يفحص النظام قاعدة البيانات ويعكس الكود والاسم فقط للأصناف التي تحتوي على أرقام في الاسم ونصوص في الكود.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('هل أنت متأكد من عكس وتبديل عمود الاسم وعمود الكود لجميع أصناف قاعدة البيانات بالكامل؟')) {
                      fixSwappedProductsCodeAndName('force_all');
                    }
                  }}
                  className="p-3.5 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-xl flex items-start gap-3 transition-colors cursor-pointer text-right"
                >
                  <div className="w-8 h-8 rounded-lg bg-amber-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                    <ArrowUpDown className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-black text-xs text-amber-950">
                      تبديل (الاسم ⇄ الكود) لجميع الأصناف بلا استثناء (إصلاح الجميع)
                    </div>
                    <p className="text-[11px] text-amber-700 mt-0.5 leading-relaxed">
                      يعكس حقل الاسم وحقل الكود لجميع أصناف الدليل المسجلة لديك فوراً.
                    </p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CUSTOMERS IMPORT & EXPORT (العملاء لوحدها) */}
      {activeSubTab === 'customers_io' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* Top Customers KPI Banner */}
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-xs">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    مركز استيراد وتصدير دليل وسجلات العملاء والمديونيات
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    إدارة مستقلة ومخصصة بالكامل لبيانات العملاء، أرقام الهواتف، العناوين، وكشوف المديونية السابقة
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={downloadCustomerExcelTemplate}
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-lg border border-slate-300 transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4 text-blue-600" />
                  تحميل نموذج العملاء (Excel)
                </button>

                <button
                  onClick={() => setIsCustomerImportModalOpen(true)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-lg shadow-sm transition-colors cursor-pointer"
                >
                  <FileUp className="w-4 h-4 text-white" />
                  بدء استرداد العملاء
                </button>
              </div>
            </div>

            {/* Quick Metrics Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-xl">
                <span className="text-[11px] font-bold text-blue-800 block">إجمالي العملاء المسجلين</span>
                <span className="text-xl font-black text-blue-950 font-mono mt-1 block">
                  {customerDebts.length} عميل
                </span>
              </div>

              <div className="p-3.5 bg-rose-50/70 border border-rose-200/80 rounded-xl">
                <span className="text-[11px] font-bold text-rose-800 block">إجمالي المديونيات المستحقة</span>
                <span className="text-xl font-black text-rose-950 font-mono mt-1 block">
                  {customerDebts.reduce((sum, c) => sum + (Number(c.current_debt) || 0), 0).toLocaleString()} ج.م
                </span>
              </div>

              <div className="p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-xl">
                <span className="text-[11px] font-bold text-amber-800 block">عملاء عليهم مبالغ آجلة</span>
                <span className="text-xl font-black text-amber-950 font-mono mt-1 block">
                  {customerDebts.filter(c => (Number(c.current_debt) || 0) > 0).length} عميل
                </span>
              </div>

              <div className="p-3.5 bg-emerald-50/70 border border-emerald-200/80 rounded-xl">
                <span className="text-[11px] font-bold text-emerald-800 block">عملاء خالص الحساب (صفر)</span>
                <span className="text-xl font-black text-emerald-950 font-mono mt-1 block">
                  {customerDebts.filter(c => (Number(c.current_debt) || 0) <= 0).length} عميل
                </span>
              </div>
            </div>
          </div>

          {/* Grid of Customer Actions: Import & Export Operations */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Card A: استرداد دليل وسجل العملاء */}
            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
                  <FileUp className="w-5 h-5 text-blue-600" />
                  <div>
                    <h4 className="text-sm font-black text-slate-900">
                      استرداد دليل العملاء والمديونيات (Import)
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      استيراد مباشر لبيانات العملاء من ملفات Excel و PDF و CSV و JSON
                    </p>
                  </div>
                </div>

                <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-200 text-xs space-y-2 text-slate-700">
                  <div className="font-bold text-blue-900 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-blue-600" />
                    مميزات ونظام استرداد العملاء:
                  </div>
                  <ul className="list-disc list-inside space-y-1 pr-1 text-[11px] leading-relaxed">
                    <li>
                      <strong>التعرف الذكي على الأعمدة:</strong> يتعرف على كود العميل، الاسم، العنوان، الهواتف، ورصيد الدين.
                    </li>
                    <li>
                      <strong>دعم ملفات متعددة:</strong> يدعم XLSX, XLS, CSV, JSON واستخراج الجداول من PDF.
                    </li>
                    <li>
                      <strong>أنماط الدمج والتحديث:</strong> دمج وتحديث حسابات العملاء، أو إضافة عملاء جدد فقط، أو استبدال كامل.
                    </li>
                    <li>
                      <strong>معاينة تفاعلية حية:</strong> مراجعة كل عميل قبل الحفظ مع كشف وتصحيح التكرارات تلقائياً.
                    </li>
                  </ul>
                </div>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
                <button
                  onClick={() => setIsCustomerImportModalOpen(true)}
                  className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
                >
                  <FileUp className="w-4 h-4" />
                  بدء استرداد ملف العملاء الآن
                </button>

                <button
                  onClick={downloadCustomerExcelTemplate}
                  className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl border border-slate-300 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4 text-blue-600" />
                  تحميل النموذج
                </button>
              </div>
            </div>

            {/* Card B: تصدير سجل ودليل العملاء كـ Excel و PDF */}
            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                  <div>
                    <h4 className="text-sm font-black text-slate-900">
                      تصدير كشوف وسجلات العملاء (Export)
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      تصدير شامل لكافة بيانات العملاء والمديونيات وأرقام الهواتف كملف Excel أو PDF معتمد
                    </p>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1.5 text-slate-700">
                  <div className="font-bold text-slate-900 flex items-center gap-1.5 text-emerald-700">
                    <Users className="w-4 h-4 text-emerald-600" />
                    محتويات كشف ودليل العملاء المصدر:
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    يتضمن الملف: كود العميل، اسم العميل والمنشأة، العنوان بالتفصيل، رقم التليفون الأول، رقم التليفون الثاني، ملاحظات الحساب، ورصيد المديونية المستحق مع خانات اعتماد الإدارة والحسابات.
                  </p>
                </div>
              </div>

              <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  onClick={() => {
                    if (customerDebts.length === 0) {
                      showToast('لا توجد بيانات عملاء لتصديرها', 'warning');
                      return;
                    }
                    exportCustomersToExcel(customerDebts);
                    showToast(`تم تصدير ${customerDebts.length} عميل كملف Excel بنجاح`, 'success');
                  }}
                  disabled={customerDebts.length === 0}
                  className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-200" />
                  تصدير العملاء (Excel)
                </button>

                <button
                  onClick={handleExportCustomerPdf}
                  disabled={isExportingCustomerPdf || customerDebts.length === 0}
                  className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
                >
                  {isExportingCustomerPdf ? (
                    <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
                  ) : (
                    <FileDown className="w-4 h-4 text-rose-400" />
                  )}
                  تصدير كشف العملاء (PDF)
                </button>
              </div>
            </div>
          </div>

          {/* Card C: مسح وتصفير سجل العملاء بالكامل */}
          <div className="bg-rose-50/60 rounded-xl p-5 border border-rose-200 shadow-sm space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-rose-600 flex items-center justify-center text-white shrink-0">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-rose-950">إدارة وحذف سجل العملاء بالكامل</h4>
                  <p className="text-[11px] text-rose-700">
                    يمكنك تصفير قاعدة بيانات العملاء للبدء من جديد أو استيراد ملف عملاء جديد ونظيف دون تكرارات.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (window.confirm('هل أنت متأكد من مسح وتصفير كافة بيانات وسجلات العملاء الحالية؟ سيتم الاحتفاظ فقط بحساب العميل النقدي العام.')) {
                    clearAllCustomers();
                  }
                }}
                disabled={customerDebts.length === 0}
                className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white font-black text-xs rounded-xl flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer shrink-0"
              >
                <Trash2 className="w-4 h-4" />
                <span>مسح وتصفير كافة العملاء ({customerDebts.length})</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: INVOICE & PRINT SETTINGS */}
      {activeSubTab === 'invoice' && (
        <form onSubmit={handleSaveSettings} className="space-y-4">
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
              <Receipt className="w-4 h-4 text-blue-600" />
              <span>إعدادات الفاتورة والطباعة التلقائية</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  اسم الكاشير الافتراضي
                </label>
                <input
                  type="text"
                  value={settings.defaultCashierName}
                  onChange={e => setSettings({ ...settings, defaultCashierName: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  طريقة الدفع الافتراضية
                </label>
                <select
                  value={settings.defaultPaymentType}
                  onChange={e => setSettings({ ...settings, defaultPaymentType: e.target.value as any })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none font-bold"
                >
                  <option value="cash">نقدي (كاش)</option>
                  <option value="debt">آجل (على الحساب)</option>
                  <option value="visa">فيزا / شبكة</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="font-bold text-slate-700 block mb-1">
                  ملاحظة تذييل الفاتورة (شروط الاسترجاع والشكر المطبوعة بالأسفل)
                </label>
                <textarea
                  rows={2}
                  value={settings.invoiceFooterNote}
                  onChange={e => setSettings({ ...settings, invoiceFooterNote: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none leading-relaxed text-xs"
                />
              </div>
            </div>

            {/* Checkboxes */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.autoPrintAfterSale}
                  onChange={e => setSettings({ ...settings, autoPrintAfterSale: e.target.checked })}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 bg-white border-slate-300"
                />
                <div>
                  <span className="text-xs font-bold text-slate-900 block">فتح نافذة المعاينة والطباعة تلقائياً بعد حفظ الفاتورة</span>
                  <span className="text-[11px] text-slate-500">إظهار الفاتورة فور اكتمال البيع لطباعتها بضغطة زر واحدة</span>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.enablePriceHistoryLogging}
                  onChange={e => setSettings({ ...settings, enablePriceHistoryLogging: e.target.checked })}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 bg-white border-slate-300"
                />
                <div>
                  <span className="text-xs font-bold text-slate-900 block">تسجيل تغيرات الأسعار تلقائياً عند استيراد ملفات الإكسيل</span>
                  <span className="text-[11px] text-slate-500">حفظ الزيادات والنقصان في قائمة تغيرات الأسعار لمقارنتها لاحقاً</span>
                </div>
              </label>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end">
              <button
                type="submit"
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-sm transition-colors cursor-pointer"
              >
                <Save className="w-4 h-4" />
                حفظ إعدادات الفاتورة
              </button>
            </div>
          </div>
        </form>
      )}

      {/* TAB 4: BACKUP & GOOGLE DRIVE */}
      {activeSubTab === 'backup' && (
        <div>
          <BackupView />
        </div>
      )}

      {/* Import Modals */}
      <ImportProductsModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
      />

      <ImportCustomersModal
        isOpen={isCustomerImportModalOpen}
        onClose={() => setIsCustomerImportModalOpen(false)}
      />

      {/* Clear All Products Confirmation Modal */}
      {isClearProductsModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
            {/* Modal Header */}
            <div className="p-4 bg-rose-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-white/20 rounded-xl">
                  <Trash2 className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-black">مسح وتفريغ قائمة الأصناف والمخزون</h3>
                  <p className="text-[11px] text-rose-100 mt-0.5">
                    إجراء تمهيدي لتصفير القائمة والبدء باسترداد ملف أصناف نظيف
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsClearProductsModalOpen(false)}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 text-slate-700 text-xs">
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl space-y-2">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-rose-950 text-xs">لماذا هذا الإجراء مهم؟</h4>
                    <p className="text-[11px] text-rose-800 leading-relaxed mt-1">
                      عند استيراد ملفات سابقة، قد تتراكم الأصناف ويصبح عددها كبيراً جداً مع أصناف مكررة أو قديمة. يتيح لك هذا الزر مسح جميع الأصناف المسجلة حالياً بالكامل (عدد <strong>{products.length} صنف</strong>) لتبدأ استيراد ملفك النظيف من نقطة الصفر بكل سلاسة.
                    </p>
                  </div>
                </div>
              </div>

              {/* Data impact summary */}
              <div className="grid grid-cols-3 gap-2.5 text-center">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-[10px] font-bold text-slate-500 block">الأصناف للمسح</span>
                  <span className="text-base font-black text-rose-600 font-mono mt-1 block">
                    {products.length} صنف
                  </span>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-[10px] font-bold text-slate-500 block">رصيد المخزن</span>
                  <span className="text-base font-black text-slate-900 font-mono mt-1 block">
                    {products.reduce((acc, p) => acc + (Number(p.stock) || 0), 0).toLocaleString()}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-[10px] font-bold text-slate-500 block">قيمة المخزون</span>
                  <span className="text-base font-black text-slate-900 font-mono mt-1 block">
                    {Math.round(products.reduce((acc, p) => acc + ((Number(p.price_wholesale) || Number(p.price) || 0) * (Number(p.stock) || 0)), 0)).toLocaleString()} ج.م
                  </span>
                </div>
              </div>

              {/* Safety notice */}
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-[11px] text-blue-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                <span>
                  <strong>أمان تام:</strong> فواتير المبيعات السابقة، المشتريات، وحسابات ديون العملاء محفوظة ولن تتأثر.
                </span>
              </div>

              {products.length > 0 ? (
                <label className="flex items-start gap-2.5 p-3.5 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={confirmClearChecked}
                    onChange={e => setConfirmClearChecked(e.target.checked)}
                    className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 border-slate-300 mt-0.5 cursor-pointer"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-slate-900 block">
                      أوافق وأؤكد مسح كافة الأصناف الحالية ({products.length} صنف)
                    </span>
                    <span className="text-[11px] text-slate-500 block mt-0.5">
                      أريد تصفير القائمة الحالية لبدء استرداد ملف أصناف نظيف تماماً
                    </span>
                  </div>
                </label>
              ) : (
                <div className="p-4 text-center text-slate-500 bg-slate-50 rounded-xl border border-slate-200 font-bold">
                  قائمة الأصناف فارغة بالفعل (0 صنف)، يمكنك الضغط مباشرة على زر "استرداد ملف" لرفع ملفك!
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <button
                type="button"
                onClick={() => setIsClearProductsModalOpen(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                إلغاء وتراجع
              </button>

              <button
                type="button"
                disabled={products.length === 0 || !confirmClearChecked}
                onClick={() => {
                  clearAllProducts();
                  setIsClearProductsModalOpen(false);
                  setTimeout(() => {
                    setIsImportModalOpen(true);
                  }, 300);
                }}
                className={`px-5 py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all ${
                  products.length > 0 && confirmClearChecked
                    ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-sm cursor-pointer'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-200'
                }`}
              >
                <Trash2 className="w-4 h-4" />
                <span>تأكيد مسح كافة الأصناف والبدء بالاستيراد النظيف</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

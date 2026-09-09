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
  FileUp,
  HelpCircle,
  TrendingUp,
  Tag,
  Boxes,
  ShieldAlert
} from 'lucide-react';
import { BackupView } from './BackupView';
import { ImportProductsModal } from './ImportProductsModal';
import { useApp } from '../context/AppContext';
import { downloadSampleExcelTemplate } from '../utils/productImportExport';

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
  storeName: 'مؤسسة البركة لتجارة المواد الغذائية والجملة',
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

export const SettingsView: React.FC = () => {
  const { showToast, products } = useApp();
  const [activeSubTab, setActiveSubTab] = useState<'general' | 'import' | 'invoice' | 'backup'>('general');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const [settings, setSettings] = useState<StoreSettings>(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    } catch (e) {
      console.error(e);
    }
    return DEFAULT_SETTINGS;
  });

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
      showToast('تم حفظ كافة الإعدادات والسمات والحدود بنجاح', 'success');
    } catch (e) {
      showToast('فشل حفظ الإعدادات', 'error');
    }
  };

  const handleResetDefaults = () => {
    if (window.confirm('هل تريد استعادة الإعدادات الافتراضية للنظام؟')) {
      setSettings(DEFAULT_SETTINGS);
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(DEFAULT_SETTINGS));
      showToast('تمت استعادة الإعدادات الافتراضية', 'info');
    }
  };

  return (
    <div className="space-y-5 font-sans text-slate-800 animate-in fade-in duration-150">
      {/* Top Header Card */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              لوحة الإعدادات واسترداد الأصناف
            </h2>
            <p className="text-xs text-slate-500">
              بيانات الشركة والمؤسسة، السمات، حدود الطلب، استرداد وتحديث الأصناف والأسعار (Excel)
            </p>
          </div>
        </div>

        {/* Sub-tab navigation buttons (Clean White & Blue theme) */}
        <div className="flex flex-wrap bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
          <button
            onClick={() => setActiveSubTab('general')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
              activeSubTab === 'general'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Building2 className="w-4 h-4" />
            بيانات الشركة والسمات والحدود
          </button>

          <button
            onClick={() => setActiveSubTab('import')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
              activeSubTab === 'import'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            استرداد الأصناف والأسعار (Excel)
          </button>

          <button
            onClick={() => setActiveSubTab('invoice')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
              activeSubTab === 'invoice'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Receipt className="w-4 h-4" />
            إعدادات الفاتورة والطباعة
          </button>

          <button
            onClick={() => setActiveSubTab('backup')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
              activeSubTab === 'backup'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Cloud className="w-4 h-4" />
            النسخ والربط السحابي
          </button>
        </div>
      </div>

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

      {/* TAB 2: IMPORT PRODUCTS & PRICES (Excel/CSV) */}
      {activeSubTab === 'import' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    استرداد وتحديث الأصناف وقوائم الأسعار (Excel / CSV)
                  </h3>
                  <p className="text-xs text-slate-500">
                    تحديث ذكي ومحكم للأسعار مع توثيق كافة الزيادات والنقصان تلقائياً
                  </p>
                </div>
              </div>

              <button
                onClick={downloadSampleExcelTemplate}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-lg border border-slate-300 transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4 text-emerald-600" />
                تحميل نموذج إكسيل فارغ
              </button>
            </div>

            {/* Smart Import Rules Summary Box */}
            <div className="p-4 bg-blue-50/60 rounded-xl border border-blue-200 space-y-2 text-xs">
              <div className="font-bold text-blue-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-blue-600" />
                قواعد وشروط عملية الاسترداد المعتمدة:
              </div>
              <ul className="list-disc list-inside space-y-1.5 text-slate-700 pr-2 leading-relaxed">
                <li>
                  <b className="text-slate-900">تحديث الأصناف المطابقة:</b> يتم التعرف على الأصناف الموجودة عبر الكود أو الاسم وتحديث أسعارها الجديدة فوراً، <span className="text-blue-700 font-bold">دون تكرار الصنف أو إضافة صنف على صنف</span>.
                </li>
                <li>
                  <b className="text-slate-900">الحفاظ على الأصناف غير المتغيرة:</b> أي صنف قديم لم يطرأ تغيير على سعره في الملف يظل كما هو دون مساس.
                </li>
                <li>
                  <b className="text-slate-900">إضافة الأصناف الجديدة:</b> الأصناف المسجلة في ملف الإكسيل التي لم تكن موجودة من قبل تضاف تلقائياً للأصناف.
                </li>
                <li>
                  <b className="text-slate-900">التوثيق في قائمة الزيادة والنقصان:</b> تسجل جميع الفروق بين الأسعار القديمة والجديدة مباشرة في <span className="text-emerald-700 font-bold">"قائمة الزيادة والنقصان"</span> موضحة الزيادات (🔺) والتخفيضات (🔻).
                </li>
              </ul>
            </div>

            {/* Quick Status */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-slate-500 block">إجمالي الأصناف المسجلة حالياً:</span>
                <span className="text-base font-black text-slate-900">{products.length} صنف</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-slate-500 block">صيغ الملفات المقبولة:</span>
                <span className="text-xs font-bold text-slate-900">XLSX, XLS, CSV</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-slate-500 block">الوجهة التلقائية للفروق:</span>
                <span className="text-xs font-bold text-emerald-700">قائمة الزيادة والنقصان</span>
              </div>
            </div>

            {/* Big Launch Import Button */}
            <div className="pt-2 flex items-center justify-center">
              <button
                onClick={() => setIsImportModalOpen(true)}
                className="w-full sm:w-auto px-8 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-xl flex items-center justify-center gap-3 transition-colors cursor-pointer shadow-sm"
              >
                <FileUp className="w-5 h-5 text-white" />
                بدء استرداد وتحديث ملف الأصناف والأسعار الآن
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

      {/* Import Modal */}
      <ImportProductsModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
      />
    </div>
  );
};

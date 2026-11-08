import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase, type Product, type Customer } from './lib/supabase';
import { parseExcelFile, exportExcel, exportPDF, downloadTemplate, downloadCustomerTemplate, exportCustomersExcel, parseCustomerExcel, normalizeAr, type ImportPreview } from './lib/files';
import AccountingAssistant from './components/AccountingAssistant';
import {
  Plus, Search, FileText, Settings, Mic, Pencil, Trash2, X, Upload, Download,
  FileSpreadsheet, FileDown, RefreshCw, AlertCircle, CheckCircle2, Package, Palette,
  ShoppingCart, ArrowRight, ArrowLeft, Loader2, ClipboardList, MinusCircle,
  Check, History, CopyPlus, ChevronDown, ChevronUp, TrendingUp, TrendingDown, ArrowUp, ArrowDown,
  Sparkles, Menu, Wallet, Calculator, Coins, Save, Eye, EyeOff, Printer,
  Users, Phone, MessageCircle, PlusCircle, DollarSign, Wifi, WifiOff,
  DatabaseBackup, RotateCcw, UserPlus, Contact, Link, Sun, Moon,
} from 'lucide-react';

// ─── Helpers ─────────────────────────────────────────────
function getErrMsg(err: unknown): string {
  if (!err) return 'خطأ غير معروف';
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

// YYYY-MM-DD بتوقيت الجهاز المحلي (وليس UTC) — حتى لا يتأخر "اليوم" بعد منتصف الليل
function localDateStr(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// تهريب النصوص قبل وضعها داخل HTML الفاتورة المطبوعة (منع كسر الصفحة / حقن HTML)
function escapeHtml(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}

// رقم واتساب بصيغة دولية للأرقام المصرية: 01001234567 → 201001234567
function waPhone(raw: string | null | undefined): string {
  let d = (raw || '').replace(/[^0-9]/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = '20' + d.slice(1);
  return d;
}

// بحث موحّد في الأصناف: يتجاهل التشكيل والهمزات والتاء المربوطة والأرقام الهندية، ويطابق كل كلمة على حدة
type SearchEntry = { p: Product; s: string };
function buildSearchIndex(products: Product[]): SearchEntry[] {
  return products.map(p => ({ p, s: normalizeAr([p.name, p.code, p.barcode].filter(Boolean).join(' ')) }));
}
function searchIndex(index: SearchEntry[], q: string, limit = Infinity): Product[] {
  const tokens = normalizeAr(q).split(' ').filter(Boolean);
  if (tokens.length === 0) return [];
  const out: Product[] = [];
  for (const e of index) {
    if (tokens.every(t => e.s.includes(t))) {
      out.push(e.p);
      if (out.length >= limit) break;
    }
  }
  return out;
}

// جلب (أو إنشاء) سجل اليوم بدون الوقوع في سباق التكرار (unique violation)
async function getOrCreateByDate(
  table: 'shortage_lists' | 'price_change_days', col: 'list_date' | 'day_date', date: string,
): Promise<string | null> {
  const sel = await supabase.from(table).select('id').eq(col, date).maybeSingle();
  if (sel.data) return (sel.data as { id: string }).id;
  const ins = await supabase.from(table).insert({ [col]: date } as any).select('id').single();
  if (ins.data) return (ins.data as { id: string }).id;
  const again = await supabase.from(table).select('id').eq(col, date).maybeSingle();
  return (again.data as { id: string } | null)?.id ?? null;
}

type ExistingMaps = { byCode: Map<string, Product>; byName: Map<string, Product> };
async function fetchAllExistingProducts(): Promise<ExistingMaps> {
  const byCode = new Map<string, Product>();
  const byName = new Map<string, Product>();
  const pageSize = 1000;
  let page = 0;
  while (true) {
    // الترتيب ضروري مع range() وإلا قد تتكرر/تُفقد صفوف بين الصفحات
    const { data, error } = await supabase
      .from('products').select('*').order('id')
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    (data as Product[]).forEach(p => {
      byName.set(normalizeAr(p.name), p);
      if (p.code && p.code.trim()) byCode.set(normalizeAr(p.code), p);
    });
    if (data.length < pageSize) break;
    page++;
  }
  return { byCode, byName };
}

const backupTables = [
  'products', 'sales', 'sale_items',
  'shortage_lists', 'shortage_items',
  'price_snapshots', 'price_change_days', 'price_change_items',
  'cash_counter_sessions', 'cash_counter_denominations',
  'customer_debts', 'customers',
] as const;
type BackupTable = typeof backupTables[number];
type BackupPayload = { version: 1; created_at: string; tables: Partial<Record<BackupTable, unknown[]>> };

async function fetchAllTableRows(table: BackupTable): Promise<unknown[]> {
  const rows: unknown[] = [];
  const orderCol = table === 'price_snapshots' ? 'product_id' : 'id';
  let page = 0;
  while (true) {
    const { data, error } = await supabase.from(table).select('*').order(orderCol).range(page * 1000, (page + 1) * 1000 - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < 1000) break;
    page++;
  }
  return rows;
}

async function collectBackup(): Promise<BackupPayload> {
  const entries = await Promise.all(backupTables.map(async table => [table, await fetchAllTableRows(table)] as const));
  return { version: 1, created_at: new Date().toISOString(), tables: Object.fromEntries(entries) };
}

function downloadJson(payload: unknown, prefix: string): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${prefix}-${localDateStr()}.json`;
  document.body.appendChild(link); // Firefox يحتاج العنصر داخل الصفحة
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function backupAllData(): Promise<void> {
  downloadJson(await collectBackup(), 'sales-inventory-backup');
}

async function backupProductsOnly(): Promise<void> {
  const products = await fetchAllTableRows('products');
  const payload = {
    version: 1,
    type: 'products_only' as const,
    created_at: new Date().toISOString(),
    count: products.length,
    products,
  };
  downloadJson(payload, 'products-backup');
}

async function restoreProductsOnly(file: File): Promise<number> {
  let parsed: any;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('ملف النسخة الاحتياطية غير صالح (ليس ملف JSON سليم)');
  }
  let list: any[] = [];
  if (Array.isArray(parsed)) list = parsed;
  else if (parsed && Array.isArray(parsed.products)) list = parsed.products;
  else if (parsed && parsed.tables && Array.isArray(parsed.tables.products)) list = parsed.tables.products;
  else throw new Error('الملف لا يحتوي على قائمة أصناف صالحة');

  if (list.length === 0) throw new Error('ملف الأصناف فارغ');

  const BATCH = 500;
  for (let i = 0; i < list.length; i += BATCH) {
    const chunk = list.slice(i, i + BATCH);
    const { error } = await supabase.from('products').upsert(chunk, { onConflict: 'id' });
    if (error) throw new Error(`خطأ أثناء استعادة الأصناف: ${getErrMsg(error)}`);
  }
  return list.length;
}

function isBackupPayload(value: unknown): value is BackupPayload {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<BackupPayload>;
  return candidate.version === 1 && !!candidate.tables && typeof candidate.tables === 'object';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dynamicFrom = (table: string) => (supabase.from as unknown as (name: string) => any)(table);

async function replaceAllTables(payload: BackupPayload): Promise<void> {
  const deleteOrder: BackupTable[] = [
    'sale_items', 'shortage_items', 'price_change_items', 'cash_counter_denominations',
    'sales', 'shortage_lists', 'price_change_days', 'cash_counter_sessions',
    'customer_debts', 'customers', 'price_snapshots', 'products',
  ];
  for (const table of deleteOrder) {
    const query = table === 'price_snapshots'
      ? dynamicFrom(table).delete().not('product_id', 'is', null)
      : dynamicFrom(table).delete().not('id', 'is', null);
    const { error } = await query;
    if (error) throw error;
  }
  const insertOrder: BackupTable[] = [
    'products', 'customers', 'sales', 'shortage_lists', 'price_change_days', 'cash_counter_sessions',
    'customer_debts', 'price_snapshots', 'sale_items', 'shortage_items',
    'price_change_items', 'cash_counter_denominations',
  ];
  for (const table of insertOrder) {
    const sourceRows = payload.tables[table];
    if (!Array.isArray(sourceRows) || sourceRows.length === 0) continue;
    const rows = sourceRows.map(row => {
      const copy = { ...(row as Record<string, unknown>) };
      delete copy.remaining; // عمود محسوب (generated) في customer_debts
      return copy;
    });
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await dynamicFrom(table).insert(rows.slice(i, i + 500));
      if (error) throw new Error(`${table}: ${getErrMsg(error)}`);
    }
  }
}

async function restoreAllData(file: File): Promise<void> {
  let parsed: unknown;
  try { parsed = JSON.parse(await file.text()); } catch { throw new Error('ملف النسخة الاحتياطية غير صالح'); }
  if (!isBackupPayload(parsed)) throw new Error('ملف النسخة الاحتياطية غير صالح');
  // تحقق كامل من الصفوف قبل حذف أي شيء
  for (const table of backupTables) {
    const rows = parsed.tables[table];
    if (rows === undefined) continue;
    if (!Array.isArray(rows) || rows.some(r => !r || typeof r !== 'object' || Array.isArray(r))) {
      throw new Error(`ملف النسخة الاحتياطية يحتوي على بيانات غير صالحة في الجدول ${table}`);
    }
  }
  // نسخة أمان من البيانات الحالية: تُنزَّل كملف وتُستخدم للتراجع التلقائي إذا فشلت الاستعادة
  const snapshot = await collectBackup();
  downloadJson(snapshot, 'sales-inventory-before-restore');
  try {
    await replaceAllTables(parsed);
  } catch (e) {
    try {
      await replaceAllTables(snapshot);
    } catch {
      throw new Error(`فشلت الاستعادة (${getErrMsg(e)}) وتعذّر التراجع التلقائي — استخدم ملف before-restore الذي تم تنزيله`);
    }
    throw new Error(`فشلت الاستعادة (${getErrMsg(e)}) — تمت إعادة البيانات السابقة كما كانت`);
  }
}

// ─── Speech Recognition hook ──────────────────────────────
interface SRResultAlt { transcript: string; confidence: number; }
interface SRResult { length: number; isFinal: boolean; [i: number]: SRResultAlt; }
interface SREvent { results: { length: number; [i: number]: SRResult }; resultIndex: number; }
type SR = {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  start(): void; stop(): void; abort(): void;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
};
function getSRConstructor(): (new () => SR) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SR;
    webkitSpeechRecognition?: new () => SR;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}
function useVoiceSearch(onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [err, setErr] = useState('');
  const recRef = useRef<SR | null>(null);
  const finalRef = useRef('');
  const cbRef = useRef(onFinal);
  cbRef.current = onFinal;

  const start = useCallback(() => {
    const SRCtor = getSRConstructor();
    if (!SRCtor) { setErr('المتصفح لا يدعم التعرف على الصوت — استخدم Chrome'); return; }
    setErr(''); setInterim(''); finalRef.current = '';
    const rec = new SRCtor();
    rec.lang = 'ar-EG';
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (e: SREvent) => {
      let interimText = '';
      let finalText = finalRef.current;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interimText += r[0].transcript;
      }
      finalRef.current = finalText;
      setInterim(interimText);
    };
    rec.onerror = (e: { error?: string }) => {
      setErr(e.error === 'not-allowed' ? 'تم رفض الوصول للميكروفون' : (e.error || 'خطأ في الصوت'));
      setListening(false);
    };
    rec.onend = () => {
      setListening(false);
      setInterim('');
      const text = finalRef.current.trim();
      if (text) cbRef.current(text);
    };
    rec.onstart = () => setListening(true);
    try { rec.start(); recRef.current = rec; }
    catch { setErr('تعذر تشغيل الميكروفون'); setListening(false); }
  }, []);

  const stop = useCallback(() => { recRef.current?.stop(); setListening(false); }, []);
  // إيقاف الميكروفون عند مغادرة الشاشة
  useEffect(() => () => {
    const r = recRef.current;
    if (r) { r.onresult = null; r.onend = null; r.onerror = null; try { r.abort(); } catch { /* ignore */ } }
  }, []);
  return { listening, interim, err, start, stop };
}

// ─── Confirm Modal ────────────────────────────────────────
function ConfirmModal({ title, message, onConfirm, onCancel }: {
  title: string; message: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-slate-800 rounded-2xl shadow-2xl border border-slate-700 max-w-sm w-full p-6">
        <div className="flex items-center gap-3 mb-3">
          <AlertCircle className="w-6 h-6 text-amber-400" />
          <h3 className="text-lg font-bold text-white">{title}</h3>
        </div>
        <p className="text-slate-300 mb-5">{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2.5 rounded-xl font-medium transition">إلغاء</button>
          <button onClick={onConfirm} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-xl font-medium transition">تأكيد</button>
        </div>
      </div>
    </div>
  );
}

// ─── Product Form Modal (Add + Edit) ──────────────────────
function ProductFormModal({ initial, onSave, onClose }: {
  initial: Product | null;
  onSave: (p: Omit<Product, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    code: initial?.code || '', name: initial?.name || '', unit: initial?.unit || '',
    barcode: initial?.barcode || '', price: String(initial?.price ?? ''),
    price_wholesale: String(initial?.price_wholesale ?? ''), cost: String(initial?.cost ?? ''),
    stock: String(initial?.stock ?? ''), category: initial?.category || '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const submit = async () => {
    if (!form.name.trim()) { setErr('الاسم مطلوب'); return; }
    setSaving(true); setErr('');
    try {
      await onSave({
        code: form.code.trim() || null, name: form.name.trim(), unit: form.unit.trim() || null,
        barcode: form.barcode.trim() || null, price: parseFloat(form.price) || 0,
        price_wholesale: parseFloat(form.price_wholesale) || 0, cost: parseFloat(form.cost) || 0,
        stock: parseInt(form.stock) || 0, category: form.category.trim() || null,
      });
      onClose();
    } catch (e) { setErr(getErrMsg(e)); }
    finally { setSaving(false); }
  };
  const fld = 'bg-slate-900 text-white rounded-lg border border-slate-600 focus:border-blue-500 outline-none px-3 py-2 w-full';
  const lbl = 'block text-slate-300 text-sm mb-1';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-slate-800 rounded-2xl shadow-2xl border border-slate-700 max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">{initial ? 'تعديل صنف' : 'إضافة صنف'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={lbl}>اسم الصنف *</label>
            <input className={fld} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus />
          </div>
          <div><label className={lbl}>الكود</label><input className={fld} value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} /></div>
          <div><label className={lbl}>الوحدة</label><input className={fld} value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} /></div>
          <div><label className={lbl}>الباركود</label><input className={fld} value={form.barcode} onChange={e => setForm({ ...form, barcode: e.target.value })} /></div>
          <div><label className={lbl}>التصنيف</label><input className={fld} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} /></div>
          <div><label className={lbl}>سعر التجزئة</label><input type="number" step="0.01" className={fld} value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} /></div>
          <div><label className={lbl}>سعر الجملة</label><input type="number" step="0.01" className={fld} value={form.price_wholesale} onChange={e => setForm({ ...form, price_wholesale: e.target.value })} /></div>
          <div><label className={lbl}>التكلفة</label><input type="number" step="0.01" className={fld} value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} /></div>
          <div><label className={lbl}>المخزون</label><input type="number" className={fld} value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} /></div>
        </div>
        {err && <p className="text-red-400 text-sm mt-3">{err}</p>}
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2.5 rounded-xl font-medium transition">إلغاء</button>
          <button onClick={submit} disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded-xl font-medium transition flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {initial ? 'حفظ التعديل' : 'إضافة'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Product Table (with Pagination & Column Sorting) ─────
function ProductTable({ products, onEdit, onDelete, onAdd, changeStatusMap }: {
  products: Product[];
  onEdit: (p: Product) => void;
  onDelete: (p: Product) => void;
  onAdd: () => void;
  changeStatusMap?: Map<string, { type: 'increased' | 'decreased' | 'new'; item: PriceChangeItem }>;
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<'name' | 'code' | 'price' | 'price_wholesale' | 'stock'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const pageSize = 50;

  // Reset to page 1 if list length changes
  useEffect(() => {
    setCurrentPage(1);
  }, [products.length]);

  const handleSort = (field: 'name' | 'code' | 'price' | 'price_wholesale' | 'stock') => {
    if (sortField === field) {
      setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const sorted = useMemo(() => {
    return [...products].sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();
      if (valA === valB) return 0;
      if (valA == null) return 1;
      if (valB == null) return -1;
      const res = valA < valB ? -1 : 1;
      return sortOrder === 'asc' ? res : -res;
    });
  }, [products, sortField, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, currentPage, pageSize]);

  if (products.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400 bg-slate-900/40 rounded-xl border border-slate-700/60 p-8">
        <Package className="w-12 h-12 mx-auto mb-3 opacity-50 text-blue-400" />
        <p className="text-base font-semibold mb-3">لا توجد أصناف مطابقة</p>
        <button
          onClick={onAdd}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-xs inline-flex items-center gap-1.5 transition"
        >
          <Plus className="w-4 h-4" />
          إضافة صنف جديد
        </button>
      </div>
    );
  }

  const SortHeader = ({ field, label }: { field: 'name' | 'code' | 'price' | 'price_wholesale' | 'stock'; label: string }) => (
    <th
      onClick={() => handleSort(field)}
      className="px-3 py-2.5 text-right font-semibold cursor-pointer hover:bg-slate-700/40 transition select-none"
    >
      <div className="flex items-center gap-1">
        <span>{label}</span>
        {sortField === field && (
          <span className="text-blue-400 text-xs">
            {sortOrder === 'asc' ? '▲' : '▼'}
          </span>
        )}
      </div>
    </th>
  );

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-slate-700/80 shadow-md">
        <table className="w-full text-sm">
          <thead className="bg-slate-800 text-slate-200 border-b border-slate-700">
            <tr>
              <SortHeader field="code" label="الكود" />
              <SortHeader field="name" label="اسم الصنف" />
              <th className="px-3 py-2.5 text-right font-semibold">الوحدة</th>
              <SortHeader field="price_wholesale" label="سعر الجملة" />
              <SortHeader field="price" label="سعر التجزئة" />
              <SortHeader field="stock" label="المخزون" />
              <th className="px-3 py-2.5 text-center font-semibold">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {pageItems.map((p) => {
              const isLowStock = (p.stock ?? 0) <= 5;
              const status = changeStatusMap?.get(p.id) || (p.code ? changeStatusMap?.get(`code:${normalizeAr(p.code)}`) : undefined);
              return (
                <tr key={p.id} className="hover:bg-slate-800/60 transition-colors">
                  <td className="px-3 py-2.5 text-slate-300 font-mono text-xs">{p.code || '-'}</td>
                  <td className="px-3 py-2.5 text-white font-medium">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span>{p.name}</span>
                      {status?.type === 'increased' && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-emerald-950/90 text-emerald-300 border border-emerald-700/80 font-bold shrink-0 shadow-2xs" title="صنف زاد سعره اليوم">
                          <TrendingUp className="w-3 h-3 text-emerald-400" />
                          <span>زيادة</span>
                        </span>
                      )}
                      {status?.type === 'decreased' && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-amber-950/90 text-amber-300 border border-amber-700/80 font-bold shrink-0 shadow-2xs" title="صنف نقص سعره اليوم">
                          <TrendingDown className="w-3 h-3 text-amber-400" />
                          <span>نقص</span>
                        </span>
                      )}
                      {status?.type === 'new' && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-cyan-950/90 text-cyan-300 border border-cyan-700/80 font-bold shrink-0 shadow-2xs" title="صنف جديد">
                          <Sparkles className="w-3 h-3 text-cyan-400" />
                          <span>جديد</span>
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-slate-300">{p.unit || '-'}</td>
                  <td className="px-3 py-2.5 text-slate-200 font-mono tabular-nums">
                    {Number(p.price_wholesale || 0).toFixed(2)} ج.م
                  </td>
                  <td className="px-3 py-2.5 text-slate-200 font-mono tabular-nums font-bold">
                    {Number(p.price || 0).toFixed(2)} ج.م
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-bold ${
                      isLowStock ? 'bg-red-950/80 text-red-300 border border-red-800' : 'text-slate-200'
                    }`}>
                      {p.stock ?? 0}
                      {isLowStock && <span className="mr-1 text-[10px] text-red-400 font-sans">(ناقص)</span>}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => onEdit(p)}
                        title="تعديل الصنف"
                        className="p-1.5 rounded-lg text-blue-400 hover:bg-blue-600/20 hover:text-blue-300 transition"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onDelete(p)}
                        title="حذف الصنف"
                        className="p-1.5 rounded-lg text-red-400 hover:bg-red-600/20 hover:text-red-300 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-2 py-2 text-xs text-slate-400 bg-slate-800/40 rounded-lg border border-slate-700/60">
          <div>
            عرض من <strong className="text-white font-mono">{((currentPage - 1) * pageSize) + 1}</strong> إلى{' '}
            <strong className="text-white font-mono">{Math.min(currentPage * pageSize, sorted.length)}</strong> من أصل{' '}
            <strong className="text-white font-mono">{sorted.length.toLocaleString('ar-EG')}</strong> صنف
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="px-2.5 py-1 rounded border border-slate-700 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              الأول
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-2.5 py-1 rounded border border-slate-700 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              السابق
            </button>
            <span className="px-3 py-1 font-mono text-white">
              صفحة {currentPage} من {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-2.5 py-1 rounded border border-slate-700 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              التالي
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="px-2.5 py-1 rounded border border-slate-700 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              الأخير
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Items View ───────────────────────────────────────────
// ─── Items View ───────────────────────────────────────────
function ItemsView({ products, loading, onRefresh, onEdit, onDelete, onAdd, todayChanges }: {
  products: Product[];
  loading: boolean;
  onRefresh: () => void;
  onEdit: (p: Product) => void;
  onDelete: (p: Product) => void;
  onAdd: () => void;
  todayChanges?: PriceChangeItem[];
}) {
  const [q, setQ] = useState('');
  type FilterType = 'all' | 'increased' | 'decreased' | 'newItems' | 'lowStock';
  const [filterType, setFilterType] = useState<FilterType>('all');
  const index = useMemo(() => buildSearchIndex(products), [products]);

  const { increasedMap, decreasedMap, newMap, changeStatusMap } = useMemo(() => {
    const inc = new Map<string, PriceChangeItem>();
    const dec = new Map<string, PriceChangeItem>();
    const nw = new Map<string, PriceChangeItem>();
    const status = new Map<string, { type: 'increased' | 'decreased' | 'new'; item: PriceChangeItem }>();

    for (const item of (todayChanges || [])) {
      const pId = item.product_id;
      const code = item.code ? normalizeAr(item.code) : '';
      const isNew = !!item.is_new;
      const curPw = Number(item.price_wholesale || 0);
      const curPr = Number(item.price_retail || 0);
      const oldPw = Number(item.old_price_wholesale || 0);
      const oldPr = Number(item.old_price_retail || 0);

      if (isNew) {
        if (pId) { nw.set(pId, item); status.set(pId, { type: 'new', item }); }
        if (code) nw.set(`code:${code}`, item);
      } else if (curPr > oldPr || curPw > oldPw) {
        if (pId) { inc.set(pId, item); status.set(pId, { type: 'increased', item }); }
        if (code) inc.set(`code:${code}`, item);
      } else if (curPr < oldPr || curPw < oldPw) {
        if (pId) { dec.set(pId, item); status.set(pId, { type: 'decreased', item }); }
        if (code) dec.set(`code:${code}`, item);
      }
    }
    return { increasedMap: inc, decreasedMap: dec, newMap: nw, changeStatusMap: status };
  }, [todayChanges]);

  const isMatchFilter = useCallback((p: Product, type: FilterType) => {
    if (type === 'all') return true;
    if (type === 'lowStock') return (p.stock ?? 0) <= 5;
    const pCode = p.code ? normalizeAr(p.code) : '';
    if (type === 'increased') {
      return increasedMap.has(p.id) || (!!pCode && increasedMap.has(`code:${pCode}`));
    }
    if (type === 'decreased') {
      return decreasedMap.has(p.id) || (!!pCode && decreasedMap.has(`code:${pCode}`));
    }
    if (type === 'newItems') {
      return newMap.has(p.id) || (!!pCode && newMap.has(`code:${pCode}`));
    }
    return true;
  }, [increasedMap, decreasedMap, newMap]);

  const increasedCount = useMemo(() => products.filter(p => isMatchFilter(p, 'increased')).length, [products, isMatchFilter]);
  const decreasedCount = useMemo(() => products.filter(p => isMatchFilter(p, 'decreased')).length, [products, isMatchFilter]);
  const newItemsCount = useMemo(() => products.filter(p => isMatchFilter(p, 'newItems')).length, [products, isMatchFilter]);
  const lowStockCount = useMemo(() => products.filter(p => (p.stock ?? 0) <= 5).length, [products]);

  const filtered = useMemo(() => {
    let list = q.trim() ? searchIndex(index, q) : products;
    if (filterType !== 'all') {
      list = list.filter(p => isMatchFilter(p, filterType));
    }
    return list;
  }, [products, q, index, filterType, isMatchFilter]);

  return (
    <div className="space-y-4">
      {/* Top Action Bar */}
      <div className="flex flex-wrap gap-2.5 items-center justify-between">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="بحث سريع باسم الصنف أو الكود أو الباركود..."
            className="w-full bg-slate-800 text-white rounded-xl border border-slate-700/80 focus:border-blue-500 outline-none pr-10 pl-4 py-2.5 text-sm shadow-xs transition"
          />
          {q && (
            <button
              onClick={() => setQ('')}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => exportExcel(products)}
            title="تصدير قائمة الأصناف إكسيل"
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-xl border border-slate-700 flex items-center gap-1.5 text-xs font-medium transition cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span className="hidden sm:inline">إكسيل</span>
          </button>

          <button
            onClick={() => exportPDF(products)}
            title="تصدير أو طباعة قائمة الأصناف PDF"
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-xl border border-slate-700 flex items-center gap-1.5 text-xs font-medium transition cursor-pointer"
          >
            <FileText className="w-4 h-4 text-rose-400" />
            <span className="hidden sm:inline">PDF</span>
          </button>

          <button
            onClick={onRefresh}
            title="تحديث قائمة الأصناف"
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 p-2.5 rounded-xl border border-slate-700 transition cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={onAdd}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة صنف</span>
          </button>
        </div>
      </div>

      {/* Filter Segmented Control with Live Counters */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/60 pb-3">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-lg transition font-medium cursor-pointer ${
              filterType === 'all' ? 'bg-blue-600 text-white font-bold shadow-xs' : 'text-slate-300 hover:text-white bg-slate-800/80 border border-slate-700/60'
            }`}
          >
            كل الأصناف ({products.length.toLocaleString('ar-EG')})
          </button>

          <button
            onClick={() => setFilterType('increased')}
            className={`px-3 py-1.5 rounded-lg transition font-medium flex items-center gap-1.5 cursor-pointer ${
              filterType === 'increased' ? 'bg-emerald-600 text-white font-bold shadow-xs' : 'text-slate-300 hover:text-emerald-400 bg-slate-800/80 border border-slate-700/60'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            <span>📈 زادت أسعارها</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
              filterType === 'increased' ? 'bg-emerald-950 text-emerald-200' : 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
            }`}>
              {increasedCount.toLocaleString('ar-EG')}
            </span>
          </button>

          <button
            onClick={() => setFilterType('decreased')}
            className={`px-3 py-1.5 rounded-lg transition font-medium flex items-center gap-1.5 cursor-pointer ${
              filterType === 'decreased' ? 'bg-amber-600 text-white font-bold shadow-xs' : 'text-slate-300 hover:text-amber-400 bg-slate-800/80 border border-slate-700/60'
            }`}
          >
            <TrendingDown className="w-3.5 h-3.5 text-amber-400" />
            <span>📉 نقصت أسعارها</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
              filterType === 'decreased' ? 'bg-amber-950 text-amber-200' : 'bg-amber-950/80 text-amber-300 border border-amber-800'
            }`}>
              {decreasedCount.toLocaleString('ar-EG')}
            </span>
          </button>

          <button
            onClick={() => setFilterType('newItems')}
            className={`px-3 py-1.5 rounded-lg transition font-medium flex items-center gap-1.5 cursor-pointer ${
              filterType === 'newItems' ? 'bg-cyan-600 text-white font-bold shadow-xs' : 'text-slate-300 hover:text-cyan-400 bg-slate-800/80 border border-slate-700/60'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>🆕 أصناف جديدة</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
              filterType === 'newItems' ? 'bg-cyan-950 text-cyan-200' : 'bg-cyan-950/80 text-cyan-300 border border-cyan-800'
            }`}>
              {newItemsCount.toLocaleString('ar-EG')}
            </span>
          </button>

          <button
            onClick={() => setFilterType('lowStock')}
            className={`px-3 py-1.5 rounded-lg transition font-medium flex items-center gap-1 cursor-pointer ${
              filterType === 'lowStock' ? 'bg-red-600 text-white font-bold shadow-xs' : 'text-slate-300 hover:text-red-400 bg-slate-800/80 border border-slate-700/60'
            }`}
          >
            <span>⚠️ نواقص المخزون</span>
            {lowStockCount > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                filterType === 'lowStock' ? 'bg-red-950 text-red-200' : 'bg-red-950 text-red-300'
              }`}>
                {lowStockCount.toLocaleString('ar-EG')}
              </span>
            )}
          </button>
        </div>

        <div className="text-xs text-slate-400 font-mono">
          النتائج: <strong className="text-white">{filtered.length.toLocaleString('ar-EG')}</strong>
        </div>
      </div>

      {loading && products.length === 0 ? (
        <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-400" /></div>
      ) : (
        <ProductTable products={filtered} onEdit={onEdit} onDelete={onDelete} onAdd={onAdd} changeStatusMap={changeStatusMap} />
      )}
    </div>
  );
}

// ─── Search View (with voice search button) ───────────────
function SearchView({ products }: { products: Product[] }) {
  const [q, setQ] = useState('');
  const index = useMemo(() => buildSearchIndex(products), [products]);
  const results = q.trim() ? searchIndex(index, q, 50) : [];
  const { listening, interim, err, start, stop } = useVoiceSearch((text) => setQ(text));
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="ابحث عن صنف..."
            className="w-full bg-slate-800 text-white text-lg rounded-xl border border-slate-700 focus:border-blue-500 outline-none pr-12 pl-14 py-3"
            autoFocus
          />
        </div>
        <button
          onClick={listening ? stop : start}
          title="بحث بالصوت"
          className={`shrink-0 w-12 flex items-center justify-center rounded-xl border transition ${listening ? 'bg-red-600 border-red-500 animate-pulse' : 'bg-slate-800 border-slate-700 hover:border-blue-600'}`}
        >
          <Mic className={`w-5 h-5 ${listening ? 'text-white' : 'text-blue-400'}`} />
        </button>
      </div>
      {err && <p className="text-red-400 text-sm">{err}</p>}
      {interim && <p className="text-slate-400 text-sm italic">{interim}...</p>}
      {q.trim() && (
        <div className="text-slate-400 text-xs font-mono">نتائج البحث: <strong className="text-white">{results.length}</strong> صنف</div>
      )}
      {results.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {results.map(p => {
            const isLow = (p.stock ?? 0) <= 5;
            return (
              <div key={p.id} className="bg-slate-800 rounded-xl border border-slate-700/80 p-4 hover:border-blue-500 shadow-sm transition space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-white font-bold text-sm leading-snug">{p.name}</h3>
                  {p.code && (
                    <span className="text-[11px] font-mono text-slate-300 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-700 shrink-0">
                      #{p.code}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 bg-slate-900/60 rounded-lg p-2.5 border border-slate-700/50 text-xs">
                  <div>
                    <div className="text-slate-400 text-[10px]">سعر الجملة</div>
                    <div className="font-mono tabular-nums text-slate-200 font-semibold text-sm">
                      {Number(p.price_wholesale || 0).toFixed(2)} <span className="text-[10px]">ج.م</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400 text-[10px]">سعر التجزئة</div>
                    <div className="font-mono tabular-nums text-white font-bold text-sm">
                      {Number(p.price || 0).toFixed(2)} <span className="text-[10px]">ج.م</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-700/40">
                  <div>
                    الوحدة: <strong className="text-slate-200">{p.unit || '-'}</strong>
                  </div>
                  <div>
                    المخزون:{' '}
                    <span className={`font-mono font-bold ${isLow ? 'text-red-400 bg-red-950/60 px-1.5 py-0.5 rounded border border-red-900' : 'text-slate-200'}`}>
                      {p.stock ?? 0}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : q.trim() ? (
        <div className="text-center py-16 text-slate-400 bg-slate-900/30 rounded-xl border border-slate-800">
          <Search className="w-8 h-8 mx-auto mb-2 opacity-40 text-blue-400" />
          <p className="text-sm">لا توجد أصناف مطابقة لكلمة "{q}"</p>
        </div>
      ) : (
        <div className="text-center py-12 text-slate-400 bg-slate-900/30 rounded-xl border border-slate-800 space-y-2">
          <Sparkles className="w-8 h-8 mx-auto text-blue-400 opacity-60" />
          <p className="text-sm font-medium text-slate-300">اكتب اسم الصنف أو كوده في خانة البحث أعلاه</p>
          <p className="text-xs text-slate-500">أو اضغط على زر الميكروفون للتحدث الصوتي المباشر</p>
        </div>
      )}
    </div>
  );
}

// ─── Invoice printing (shared) ────────────────────────────
type PrintableInvoice = {
  customer_name: string | null; customer_phone: string | null; customer_address: string | null;
  customer_code?: string | null; total: number; created_at: string;
  lines: { name: string; unit: string | null; quantity: number; price: number; subtotal: number }[];
};
type PrintMode = 'a4' | 'a5' | 'thermal';

function buildInvoiceHtml(inv: PrintableInvoice, mode: PrintMode): string {
  const e = escapeHtml;
  const dateStr = e(new Date(inv.created_at).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }));
  const codeStr = inv.customer_code ? `<div class="info"><span class="lbl">كود العميل:</span> ${e(inv.customer_code)}</div>` : '';
  const phoneStr = inv.customer_phone ? `<div class="info"><span class="lbl">هاتف:</span> ${e(inv.customer_phone)}</div>` : '';
  const addrStr = inv.customer_address ? `<div class="info"><span class="lbl">العنوان:</span> ${e(inv.customer_address)}</div>` : '';
  const total = Number(inv.total).toFixed(2);
  const head = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>فاتورة</title>`;
  if (mode === 'thermal') {
    const rows = inv.lines.map(l => `<tr><td>${e(l.name)}</td><td>${e(l.unit || '-')}</td><td>${e(l.quantity)}</td><td>${l.price.toFixed(2)}</td><td>${l.subtotal.toFixed(2)}</td></tr>`).join('');
    return `${head}<style>body{font-family:monospace;font-size:11px;width:280px;margin:0 auto;padding:8px}h2{text-align:center;margin:4px 0}.info{margin:2px 0}table{width:100%;border-collapse:collapse;margin-top:6px}th,td{padding:2px 4px;text-align:right}th{border-bottom:1px dashed #000}.tot{border-top:1px dashed #000;padding-top:4px;margin-top:4px;font-weight:bold;font-size:14px;text-align:left}</style></head><body><h2>فاتورة بيع</h2><div class="info">العميل: ${e(inv.customer_name || '-')}</div>${codeStr}${phoneStr}${addrStr}<div class="info">التاريخ: ${dateStr}</div><table><thead><tr><th>الصنف</th><th>وحدة</th><th>كمية</th><th>سعر</th><th>إجمالي</th></tr></thead><tbody>${rows}</tbody></table><div class="tot">الإجمالي: ${total} جنيه</div></body></html>`;
  }
  const itemsRows = inv.lines.map((l, i) => `<tr><td style="text-align:center">${i + 1}</td><td>${e(l.name)}</td><td style="text-align:center">${e(l.unit || '-')}</td><td style="text-align:center">${e(l.quantity)}</td><td style="text-align:center">${l.price.toFixed(2)}</td><td style="text-align:center">${l.subtotal.toFixed(2)}</td></tr>`).join('');
  if (mode === 'a5') {
    return `${head}<style>@page{size:A5;margin:10mm}body{font-family:'Segoe UI',Tahoma,sans-serif;font-size:11px;padding:12px;max-width:148mm;margin:0 auto}.hdr{text-align:center;border-bottom:2px solid #d4af37;padding-bottom:8px;margin-bottom:10px}.hdr h1{margin:0;font-size:18px;color:#333}.hdr p{margin:2px 0;color:#666;font-size:10px}.cust{background:#f8f5e8;border:1px solid #d4af37;border-radius:6px;padding:8px;margin-bottom:10px}.cust div{margin:2px 0}.lbl{color:#666;font-weight:bold;margin-left:4px}table{width:100%;border-collapse:collapse}th,td{padding:4px 5px;text-align:right;border-bottom:1px solid #ddd}th{background:#3d3a1f;color:#d4af37;font-size:10px;-webkit-print-color-adjust:exact;print-color-adjust:exact}.tot{margin-top:10px;text-align:left}.tot span{font-size:16px;font-weight:bold;color:#333}</style></head><body><div class="hdr"><h1>فاتورة بيع</h1><p>التاريخ: ${dateStr}</p></div><div class="cust"><div><span class="lbl">اسم العميل:</span> ${e(inv.customer_name || '-')}</div>${codeStr}${phoneStr}${addrStr}</div><table><thead><tr><th>م</th><th>الصنف</th><th>الوحدة</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>${itemsRows}</tbody></table><div class="tot"><span>الإجمالي: ${total} جنيه</span></div></body></html>`;
  }
  return `${head}<style>@page{size:A4;margin:15mm}body{font-family:'Segoe UI',Tahoma,sans-serif;padding:30px;max-width:210mm;margin:0 auto}.hdr{text-align:center;border-bottom:3px solid #d4af37;padding-bottom:12px;margin-bottom:16px}.hdr h1{margin:0;color:#333}.hdr p{margin:4px 0;color:#666;font-size:13px}.cust{background:#f8f5e8;border:1px solid #d4af37;border-radius:8px;padding:12px;margin-bottom:16px}.cust div{margin:3px 0}table{width:100%;border-collapse:collapse}th,td{padding:8px 10px;text-align:right;border-bottom:1px solid #ddd}th{background:#3d3a1f;color:#d4af37;-webkit-print-color-adjust:exact;print-color-adjust:exact}.tot{margin-top:16px;text-align:left}.tot span{font-size:22px;font-weight:bold;color:#333}.lbl{color:#666;font-weight:bold;margin-left:6px}</style></head><body><div class="hdr"><h1>فاتورة بيع</h1><p>التاريخ: ${dateStr}</p></div><div class="cust"><div><span class="lbl">اسم العميل:</span> ${e(inv.customer_name || '-')}</div>${codeStr}${phoneStr}${addrStr}</div><table><thead><tr><th>م</th><th>اسم الصنف</th><th>الوحدة</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>${itemsRows}</tbody></table><div class="tot"><span>الإجمالي: ${total} جنيه</span></div></body></html>`;
}

// يفتح نافذة الطباعة بطريقة آمنة عبر iframe خفي لمنع الحظر
function printInvoiceHtml(inv: PrintableInvoice, mode: PrintMode): void {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = 'none';
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) return;
  doc.open();
  doc.write(buildInvoiceHtml(inv, mode));
  doc.close();
  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (e) {
      console.warn('Print error:', e);
    }
    setTimeout(() => {
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
    }, 1500);
  }, 350);
}

// ─── New Invoice View (with voice search button) ──────────
type InvoiceLine = { product: Product; qty: number; price: number };
type FullInvoice = {
  id: string; customer_name: string | null; customer_phone: string | null;
  customer_address: string | null; customer_code: string | null; total: number; created_at: string;
  lines: { product_id: string; name: string; unit: string | null; quantity: number; price: number; subtotal: number }[];
};

function NewInvoiceView({ products, customers, onSave, onBack }: {
  products: Product[];
  customers: Customer[];
  onSave: (lines: InvoiceLine[], customerName: string, customerPhone: string, customerAddress: string, customerId: string | null, invoiceDate: string) => Promise<void>;
  onBack: () => void;
}) {
  const [q, setQ] = useState('');
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [customer, setCustomer] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerCode, setCustomerCode] = useState('');
  const [customerSuggestions, setCustomerSuggestions] = useState<Customer[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [invoiceDate, setInvoiceDate] = useState(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  });
  const [saving, setSaving] = useState(false);
  const [savedInvoice, setSavedInvoice] = useState<FullInvoice | null>(null);
  const [priceMode, setPriceMode] = useState<'retail' | 'wholesale'>('retail');
  const { listening, interim, err, start, stop } = useVoiceSearch((text) => setQ(text));
  const index = useMemo(() => buildSearchIndex(products), [products]);
  const results = q.trim() ? searchIndex(index, q, 10) : [];
  const addProduct = (p: Product) => {
    const price = priceMode === 'wholesale' ? Number(p.price_wholesale) : Number(p.price);
    setLines(prev => prev.some(l => l.product.id === p.id)
      ? prev.map(l => l.product.id === p.id ? { ...l, qty: l.qty + 1 } : l)
      : [...prev, { product: p, qty: 1, price }]);
    setQ('');
  };
  // الكمية قد تكون 0 مؤقتاً أثناء الكتابة (لا يُحذف الصنف) — الحذف بزر ✕ فقط، وتُصحَّح إلى 1 عند الخروج من الحقل
  const updateQty = (id: string, qty: number) => {
    setLines(prev => prev.map(l => l.product.id === id ? { ...l, qty: Math.max(0, qty) } : l));
  };
  const removeLine = (id: string) => setLines(prev => prev.filter(l => l.product.id !== id));
  const updatePrice = (id: string, price: number) => {
    setLines(prev => prev.map(l => l.product.id === id ? { ...l, price: Math.max(0, price) } : l));
  };

  const onCustomerCodeChange = (val: string) => {
    setCustomerCode(val);
    setSelectedCustomerId(null);
    if (val.trim().length >= 1) {
      const matches = customers.filter(c =>
        (c.code || '').toLowerCase().includes(val.toLowerCase()) ||
        c.name.toLowerCase().includes(val.toLowerCase())
      ).slice(0, 8);
      setCustomerSuggestions(matches);
      setShowSuggestions(true);
    } else {
      setCustomerSuggestions([]);
      setShowSuggestions(false);
    }
  };
  const pickCustomer = (c: Customer) => {
    setSelectedCustomerId(c.id);
    setCustomerCode(c.code || '');
    setCustomer(c.name);
    setPhone(c.phone1 || '');
    setAddress(c.address || '');
    setShowSuggestions(false);
  };

  const total = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const submit = async () => {
    const validLines = lines.filter(l => l.qty > 0);
    if (validLines.length === 0 || saving) return;
    if (!invoiceDate || isNaN(new Date(invoiceDate).getTime())) { alert('تاريخ الفاتورة غير صالح'); return; }
    setSaving(true);
    try {
      await onSave(validLines, customer.trim(), phone.trim(), address.trim(), selectedCustomerId, invoiceDate);
      const inv: FullInvoice = {
        id: 'preview', customer_name: customer.trim() || null,
        customer_phone: phone.trim() || null, customer_address: address.trim() || null,
        customer_code: customerCode.trim() || null,
        total: validLines.reduce((s, l) => s + l.qty * l.price, 0), created_at: new Date(invoiceDate).toISOString(),
        lines: validLines.map(l => ({ product_id: l.product.id, name: l.product.name, unit: l.product.unit, quantity: l.qty, price: l.price, subtotal: l.qty * l.price })),
      };
      setSavedInvoice(inv);
      setLines([]); setCustomer(''); setPhone(''); setAddress(''); setSelectedCustomerId(null); setCustomerCode('');
    } catch (e) { alert(getErrMsg(e)); }
    finally { setSaving(false); }
  };

  const printInvoice = printInvoiceHtml;
  const saveInvoicePDF = (inv: FullInvoice, mode: 'a4' | 'a5') => printInvoiceHtml(inv, mode); // اختر "حفظ كـ PDF" من نافذة الطباعة

  if (savedInvoice) {
    return (
      <div className="space-y-4">
        <div className="text-center py-6" style={{ color: 'var(--success-light)' }}>
          <CheckCircle2 className="w-12 h-12 mx-auto mb-2" />
          <p className="text-lg font-bold">تم حفظ الفاتورة بنجاح!</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <button onClick={() => printInvoice(savedInvoice, 'a4')} className="p-4 rounded-xl font-semibold transition flex flex-col items-center gap-2" style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)', color: 'var(--accent)' }}>
            <FileText className="w-6 h-6" /> طباعة A4
          </button>
          <button onClick={() => printInvoice(savedInvoice, 'a5')} className="p-4 rounded-xl font-semibold transition flex flex-col items-center gap-2" style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)', color: 'var(--accent)' }}>
            <FileText className="w-6 h-6" /> طباعة A5
          </button>
          <button onClick={() => printInvoice(savedInvoice, 'thermal')} className="p-4 rounded-xl font-semibold transition flex flex-col items-center gap-2" style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)', color: 'var(--accent)' }}>
            <FileText className="w-6 h-6" /> طباعة حرارية
          </button>
          <button onClick={() => saveInvoicePDF(savedInvoice, 'a4')} className="p-4 rounded-xl font-semibold transition flex flex-col items-center gap-2" style={{ background: 'color-mix(in srgb, var(--success) 15%, transparent)', border: '1px solid color-mix(in srgb, var(--success) 40%, transparent)', color: 'var(--success)' }}>
            <Download className="w-6 h-6" /> PDF (A4)
          </button>
          <button onClick={() => saveInvoicePDF(savedInvoice, 'a5')} className="p-4 rounded-xl font-semibold transition flex flex-col items-center gap-2" style={{ background: 'color-mix(in srgb, var(--success) 15%, transparent)', border: '1px solid color-mix(in srgb, var(--success) 40%, transparent)', color: 'var(--success)' }}>
            <Download className="w-6 h-6" /> PDF (A5)
          </button>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setSavedInvoice(null)} className="flex-1 py-3 rounded-xl font-semibold transition" style={{ background: 'color-mix(in srgb, var(--accent) 20%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 50%, transparent)', color: 'var(--accent)' }}>
            فاتورة جديدة
          </button>
          <button onClick={onBack} className="flex-1 py-3 rounded-xl font-semibold transition" style={{ background: 'color-mix(in srgb, var(--accent) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)', color: 'var(--accent-light)' }}>
            العودة للقائمة
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} style={{ color: 'var(--accent-light)' }} className="flex items-center gap-1 text-sm">
          <ArrowRight className="w-4 h-4" /> رجوع
        </button>
        <h2 className="text-lg font-bold" style={{ color: 'var(--accent)' }}>فاتورة جديدة</h2>
      </div>

      {/* Customer info */}
      <div className="rounded-2xl p-4 space-y-3" style={{ background: 'color-mix(in srgb, var(--bg-light) 50%, transparent)', border: '1px solid var(--border)' }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Customer code autocomplete */}
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--accent-muted)' }} />
            <input
              value={customerCode}
              onChange={(e) => onCustomerCodeChange(e.target.value)}
              onFocus={() => { if (customerSuggestions.length > 0) setShowSuggestions(true); }}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              placeholder="كود العميل أو الاسم"
              className="w-full rounded-xl px-4 py-2.5 pr-10 outline-none"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--accent)' }}
            />
            {showSuggestions && customerSuggestions.length > 0 && (
              <div className="absolute z-20 top-full right-0 left-0 mt-1 rounded-xl shadow-xl max-h-56 overflow-y-auto" style={{ background: 'var(--bg-light)', border: '1px solid var(--accent)' }}>
                {customerSuggestions.map(c => (
                  <button key={c.id} onMouseDown={(e) => { e.preventDefault(); pickCustomer(c); }} className="w-full text-right px-4 py-2.5 border-b last:border-0" style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}>
                    <span className="font-medium">{c.name}</span>
                    {c.code && <span className="text-xs mr-2" style={{ color: 'var(--accent-muted)' }}>({c.code})</span>}
                    {c.phone1 && <span className="text-xs block" style={{ color: 'var(--accent-muted)' }}>{c.phone1}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Date & time */}
          <input
            type="datetime-local"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
            className="rounded-xl px-4 py-2.5 outline-none"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--accent)' }}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="اسم العميل"
            className="rounded-xl px-4 py-2.5 outline-none" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--accent)' }} />
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="رقم الهاتف" type="tel"
            className="rounded-xl px-4 py-2.5 outline-none" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--accent)' }} />
        </div>
        <input value={address} onChange={e => setAddress(e.target.value)} placeholder="العنوان"
          className="w-full rounded-xl px-4 py-2.5 outline-none" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--accent)' }} />
        <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          <button onClick={() => setPriceMode('retail')} className="flex-1 px-4 py-2.5 text-sm font-medium transition" style={priceMode === 'retail' ? { background: 'var(--accent)', color: 'var(--bg)' } : { background: 'var(--bg)', color: 'var(--accent-light)' }}>تجزئة</button>
          <button onClick={() => setPriceMode('wholesale')} className="flex-1 px-4 py-2.5 text-sm font-medium transition" style={priceMode === 'wholesale' ? { background: 'var(--accent)', color: 'var(--bg)' } : { background: 'var(--bg)', color: 'var(--accent-light)' }}>جملة</button>
        </div>
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: 'var(--accent-muted)' }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="ابحث وأضف أصناف للفاتورة..."
            className="w-full text-lg rounded-xl outline-none pr-12 pl-14 py-3" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--accent)' }} />
        </div>
        <button onClick={listening ? stop : start} title="بحث بالصوت"
          className="shrink-0 w-12 flex items-center justify-center rounded-xl border transition" style={listening ? { background: 'var(--danger-dark)', border: '1px solid var(--danger-muted)', color: '#fff' } : { background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--accent)' }}>
          <Mic className="w-5 h-5" />
        </button>
      </div>
      {err && <p className="text-sm" style={{ color: 'var(--danger-muted)' }}>{err}</p>}
      {interim && <p className="text-sm italic" style={{ color: 'var(--accent-muted)' }}>{interim}...</p>}
      {results.length > 0 && (
        <div className="relative">
          <div className="absolute z-10 top-0 w-full rounded-xl shadow-xl max-h-64 overflow-y-auto" style={{ background: 'var(--bg-light)', border: '1px solid var(--border)' }}>
            {results.map(p => (
              <button key={p.id} onClick={() => addProduct(p)} className="w-full text-right px-4 py-2.5 border-b last:border-0 flex justify-between items-center" style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}>
                <span>{p.name}</span>
                <span className="text-sm" style={{ color: 'var(--accent-muted)' }}>{Number(priceMode === 'wholesale' ? p.price_wholesale : p.price).toFixed(2)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {lines.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ background: 'color-mix(in srgb, var(--bg-light) 50%, transparent)', border: '1px solid var(--border)' }}>
          <table className="w-full text-sm">
            <thead style={{ background: 'color-mix(in srgb, var(--bg) 80%, transparent)' }}>
              <tr style={{ color: 'var(--accent)' }}>
                <th className="px-3 py-2 text-right">الصنف</th>
                <th className="px-3 py-2 text-right">الوحدة</th>
                <th className="px-3 py-2 text-right">السعر</th>
                <th className="px-3 py-2 text-right">الكمية</th>
                <th className="px-3 py-2 text-right">الإجمالي</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map(l => (
                <tr key={l.product.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                  <td className="px-3 py-2" style={{ color: 'var(--accent)' }}>{l.product.name}</td>
                  <td className="px-3 py-2" style={{ color: 'var(--accent-light)' }}>{l.product.unit || '-'}</td>
                  <td className="px-3 py-2"><input type="number" step="0.01" value={l.price} onChange={e => updatePrice(l.product.id, parseFloat(e.target.value) || 0)} className="w-20 rounded px-2 py-1" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--accent)' }} /></td>
                  <td className="px-3 py-2"><input type="number" min={1} value={l.qty || ''} onChange={e => updateQty(l.product.id, parseInt(e.target.value) || 0)} onBlur={() => { if (l.qty <= 0) updateQty(l.product.id, 1); }} className="w-16 rounded px-2 py-1" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--accent)' }} /></td>
                  <td className="px-3 py-2 font-medium" style={{ color: 'var(--accent)' }}>{(l.qty * l.price).toFixed(2)}</td>
                  <td className="px-3 py-2"><button onClick={() => removeLine(l.product.id)} className="p-1 rounded" style={{ color: 'var(--danger-muted)' }}><X className="w-4 h-4" /></button></td>
                </tr>
              ))}
            </tbody>
            <tfoot style={{ background: 'color-mix(in srgb, var(--bg) 80%, transparent)' }}>
              <tr>
                <td colSpan={4} className="px-3 py-3 text-right font-bold" style={{ color: 'var(--accent)' }}>الإجمالي</td>
                <td className="px-3 py-3 font-bold text-lg" style={{ color: 'var(--accent-light)' }}>{total.toFixed(2)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {lines.length > 0 && (
        <button onClick={submit} disabled={saving} className="w-full font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition disabled:opacity-50" style={{ background: 'var(--accent)', color: 'var(--bg)' }}>
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          حفظ الفاتورة
        </button>
      )}
    </div>
  );
}

// ─── Invoices View ────────────────────────────────────────
type Invoice = { id: string; customer_id: string | null; customer_name: string | null; customer_phone: string | null; customer_address: string | null; total: number; created_at: string; lines: FullInvoice['lines'] };
function InvoicesView({ onAddNew, customers }: { onAddNew: () => void; customers: Customer[] }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [debts, setDebts] = useState<CustomerDebt[]>([]);
  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('sales').select('id, customer_id, customer_name, customer_phone, customer_address, total, created_at').order('created_at', { ascending: false }).limit(100);
    if (error) { alert(getErrMsg(error)); setLoading(false); return; }
    const invs: Invoice[] = (data || []).map((i: unknown) => {
      const inv = i as { id: string; customer_id: string | null; customer_name: string | null; customer_phone: string | null; customer_address: string | null; total: number; created_at: string };
      return { id: inv.id, customer_id: inv.customer_id, customer_name: inv.customer_name, customer_phone: inv.customer_phone, customer_address: inv.customer_address, total: Number(inv.total), created_at: inv.created_at, lines: [] };
    });
    setInvoices(invs);
    setLoading(false);
  }, []);
  const loadDebts = useCallback(async () => {
    const { data } = await supabase.from('customer_debts').select('*');
    if (data) setDebts((data as CustomerDebt[]) || []);
  }, []);
  useEffect(() => { load(); loadDebts(); }, [load, loadDebts]);
  const toggle = async (id: string) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    const inv = invoices.find(i => i.id === id);
    if (inv && inv.lines.length === 0) {
      const { data } = await supabase.from('sale_items').select('product_id, name, unit, quantity, price, subtotal').eq('sale_id', id);
      if (data) {
        const lines = (data as { product_id: string; name: string; unit: string | null; quantity: number; price: number; subtotal: number }[]).map(l => ({
          product_id: l.product_id, name: l.name, unit: l.unit, quantity: l.quantity, price: Number(l.price), subtotal: Number(l.subtotal),
        }));
        setInvoices(prev => prev.map(i => i.id === id ? { ...i, lines } : i));
      }
    }
  };
  const deleteInvoice = async (id: string) => {
    if (!confirm('هل تريد حذف هذه الفاتورة نهائياً؟')) return;
    const { error: e1 } = await supabase.from('sale_items').delete().eq('sale_id', id);
    if (e1) { alert(getErrMsg(e1)); return; }
    const { error: e2 } = await supabase.from('sales').delete().eq('id', id);
    if (e2) { alert(getErrMsg(e2)); return; }
    setInvoices(prev => prev.filter(i => i.id !== id));
    setExpanded(null);
  };
  const printInvoice = (inv: Invoice, mode: PrintMode) => printInvoiceHtml(inv, mode);
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold" style={{ color: 'var(--accent)' }}>الفواتير</h2>
        <button onClick={onAddNew} className="px-4 py-2 rounded-xl font-semibold flex items-center gap-2 transition" style={{ background: 'var(--accent)', color: 'var(--bg)' }}>
          <Plus className="w-4 h-4" /> فاتورة جديدة
        </button>
      </div>
      {loading ? (
        <div className="text-center py-12"><Loader2 className="w-8 h-8 animate-spin mx-auto" style={{ color: 'var(--accent)' }} /></div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-12" style={{ color: 'var(--accent-muted)' }}>
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>لا توجد فواتير بعد</p>
        </div>
      ) : (
        <div className="space-y-2">
          {invoices.map(inv => (
            <div key={inv.id} className="rounded-xl overflow-hidden" style={{ background: 'color-mix(in srgb, var(--bg-light) 50%, transparent)', border: '1px solid var(--border)' }}>
              <button onClick={() => toggle(inv.id)} className="w-full flex items-center justify-between px-4 py-3 transition" style={{ color: 'var(--accent)' }}>
                <div className="flex items-center gap-3 text-right">
                  <span className="text-sm" style={{ color: 'var(--accent-muted)' }}>{new Date(inv.created_at).toLocaleDateString('ar-EG')}</span>
                  <div>
                    <div className="font-medium">{inv.customer_name || 'عميل غير محدد'}</div>
                    {inv.customer_phone && <div className="text-xs" style={{ color: 'var(--accent-muted)' }}>{inv.customer_phone}</div>}
                    {inv.customer_id && (() => {
                      const debt = debts.find(d => d.customer_id === inv.customer_id);
                      if (!debt) return null;
                      const remaining = Number(debt.remaining);
                      if (remaining <= 0) return null;
                      return (
                        <div className="text-xs font-semibold mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded" style={{ background: 'color-mix(in srgb, var(--danger) 15%, transparent)', color: 'var(--danger)', border: '1px solid color-mix(in srgb, var(--danger) 30%, transparent)' }}>
                          <Wallet className="w-3 h-3" /> مديونية: {remaining.toLocaleString('ar-EG')} ج.م
                        </div>
                      );
                    })()}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold" style={{ color: 'var(--accent-light)' }}>{Number(inv.total).toFixed(2)}</span>
                  <button onClick={(e) => { e.stopPropagation(); deleteInvoice(inv.id); }} className="p-1.5 rounded-lg transition" style={{ color: 'var(--danger-muted)', background: 'color-mix(in srgb, var(--danger) 10%, transparent)' }} title="حذف الفاتورة">
                    <Trash2 className="w-4 h-4" />
                  </button>
                  {expanded === inv.id ? <ArrowLeft className="w-4 h-4" style={{ color: 'var(--accent-muted)' }} /> : <ArrowRight className="w-4 h-4" style={{ color: 'var(--accent-muted)' }} />}
                </div>
              </button>
              {expanded === inv.id && inv.lines.length > 0 && (
                <div className="border-t p-3 space-y-2" style={{ borderColor: 'var(--border)', background: 'color-mix(in srgb, var(--bg) 30%, transparent)' }}>
                  {inv.customer_address && (
                    <div className="text-sm" style={{ color: 'var(--accent-light)' }}>العنوان: {inv.customer_address}</div>
                  )}
                  <table className="w-full text-sm">
                    <thead style={{ color: 'var(--accent-muted)' }}>
                      <tr><th className="text-right py-1">الصنف</th><th className="text-right py-1">الوحدة</th><th className="text-right py-1">السعر</th><th className="text-right py-1">الكمية</th><th className="text-right py-1">الإجمالي</th></tr>
                    </thead>
                    <tbody>
                      {inv.lines.map((l, i) => (
                        <tr key={i} style={{ color: 'var(--accent)' }}>
                          <td className="py-1">{l.name}</td>
                          <td className="py-1">{l.unit || '-'}</td>
                          <td className="py-1">{l.price.toFixed(2)}</td>
                          <td className="py-1">{l.quantity}</td>
                          <td className="py-1">{l.subtotal.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="flex gap-2 pt-2">
                    <button onClick={() => printInvoice(inv, 'a4')} className="flex-1 py-2 rounded-lg text-sm font-medium transition flex items-center justify-center gap-1" style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)', color: 'var(--accent)' }}>
                      <Printer className="w-4 h-4" /> A4
                    </button>
                    <button onClick={() => printInvoice(inv, 'a5')} className="flex-1 py-2 rounded-lg text-sm font-medium transition flex items-center justify-center gap-1" style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)', color: 'var(--accent)' }}>
                      <Printer className="w-4 h-4" /> A5
                    </button>
                    <button onClick={() => printInvoice(inv, 'thermal')} className="flex-1 py-2 rounded-lg text-sm font-medium transition flex items-center justify-center gap-1" style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)', color: 'var(--accent)' }}>
                      <Printer className="w-4 h-4" /> حرارية
                    </button>
                    <button onClick={() => deleteInvoice(inv.id)} className="flex-1 py-2 rounded-lg text-sm font-medium transition flex items-center justify-center gap-1" style={{ background: 'color-mix(in srgb, var(--danger) 15%, transparent)', border: '1px solid color-mix(in srgb, var(--danger) 40%, transparent)', color: 'var(--danger-muted)' }}>
                      <Trash2 className="w-4 h-4" /> حذف
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Import Modal ─────────────────────────────────────────
function ColumnPreviewModal({ preview, mode, onConfirm, onCancel }: {
  preview: ImportPreview;
  mode: 'add' | 'upsert';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const fieldLabels: Record<string, string> = {
    name: 'الاسم', code: 'الكود', barcode: 'الباركود', price: 'سعر التجزئة',
    price_wholesale: 'سعر الجملة', cost: 'التكلفة', stock: 'الكمية', unit: 'الوحدة', category: 'التصنيف',
  };
  const hasCode = Object.values(preview.foundColumns).includes('code') ||
    preview.allColumns.some(c => c.field === 'code');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-slate-800 rounded-2xl shadow-2xl border border-slate-700 max-w-2xl w-full p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">مراجعة الأعمدة المُكتشفة</h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="text-slate-400 text-sm mb-4">
          عدد الأصناف: {preview.rows.length.toLocaleString('ar-EG')} — وضع الاستيراد: {mode === 'upsert' ? 'تحديث وإضافة' : 'إضافة فقط'}
        </div>
        {!hasCode && (
          <div className="bg-red-600/15 border border-red-600/40 rounded-xl p-3 mb-4 flex items-start gap-2 text-sm text-red-300">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>لم يتم التعرف على عمود الكود! الأكواد لن تُستورد. راجع عنوان عمود الكود في ملف Excel — استخدم "الكود" أو "رقم الصنف" أو "كود".</span>
          </div>
        )}
        <div className="space-y-1.5 mb-5">
          {preview.allColumns.map((c, i) => (
            <div key={i} className={`flex items-center gap-3 p-2.5 rounded-lg ${c.field ? 'bg-emerald-600/10 border border-emerald-600/30' : 'bg-slate-700/30 border border-slate-700'}`}>
              <span className={`text-xs font-mono px-2 py-0.5 rounded ${c.field ? 'bg-emerald-600/20 text-emerald-300' : 'bg-slate-600 text-slate-400'}`}>
                {c.field ? fieldLabels[c.field] || c.field : 'غير مُتعرّف'}
              </span>
              <span className="text-white text-sm font-medium">"{c.header}"</span>
              <span className="text-slate-500 text-xs mr-auto truncate">
                {c.samples.map(s => `"${s}"`).join('  ')}
              </span>
            </div>
          ))}
        </div>
        {preview.warnings.length > 0 && (
          <div className="bg-amber-600/10 border border-amber-600/30 rounded-xl p-3 mb-4 space-y-1">
            {preview.warnings.map((w, i) => (
              <div key={i} className="text-amber-300 text-sm flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-3">
          <button onClick={onConfirm} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition">
            تأكيد الاستيراد
          </button>
          <button onClick={onCancel} className="px-6 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-3 rounded-xl transition">
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}

function ImportModal({ onConfirm, onClose }: {
  onConfirm: (mode: 'add' | 'upsert') => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'add' | 'upsert'>('upsert');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-slate-800 rounded-2xl shadow-2xl border border-slate-700 max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">استيراد الأصناف</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-2 mb-5">
          <button onClick={() => setMode('upsert')} className={`w-full text-right p-3 rounded-xl border-2 transition ${mode === 'upsert' ? 'border-blue-500 bg-blue-600/10' : 'border-slate-600 hover:border-slate-500'}`}>
            <div className="text-white font-semibold mb-1">تحديث وإضافة (upsert)</div>
            <div className="text-slate-400 text-sm">يحدّث الأصناف الموجودة ويضيف الجديدة فقط</div>
          </button>
          <button onClick={() => setMode('add')} className={`w-full text-right p-3 rounded-xl border-2 transition ${mode === 'add' ? 'border-blue-500 bg-blue-600/10' : 'border-slate-600 hover:border-slate-500'}`}>
            <div className="text-white font-semibold mb-1">إضافة فقط</div>
            <div className="text-slate-400 text-sm">يضيف كل الأصناف بدون تحديث</div>
          </button>
        </div>
        <button onClick={() => onConfirm(mode)} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition">
          متابعة واختيار الملف
        </button>
      </div>
    </div>
  );
}

// ─── Cash Counter View (عداد النقدية) ─────────────────────
const DENOMINATIONS = [200, 100, 50, 20, 10, 5];
type CashSession = {
  id: string;
  customer_name: string | null;
  total_amount: number;
  session_date: string;
  created_at: string;
  denominations: { denomination_value: number; count: number; subtotal: number }[];
};

function CashCounterView({ onMsg }: { onMsg: (m: string) => void }) {
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [customerName, setCustomerName] = useState('');
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<CashSession[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);

  const setCount = (denom: number, val: string) => {
    const n = Math.max(0, parseInt(val) || 0);
    setCounts(prev => ({ ...prev, [denom]: n }));
  };

  const subtotal = (denom: number) => (counts[denom] || 0) * denom;
  const grandTotal = DENOMINATIONS.reduce((sum, d) => sum + subtotal(d), 0);
  const totalNotes = DENOMINATIONS.reduce((sum, d) => sum + (counts[d] || 0), 0);

  const reset = () => {
    setCounts({});
    setCustomerName('');
  };

  const saveSession = async () => {
    if (grandTotal === 0) { onMsg('لا يوجد مبلغ للعدّ'); return; }
    setSaving(true);
    try {
      const { data: session, error: se } = await supabase
        .from('cash_counter_sessions')
        .insert({ customer_name: customerName.trim() || null, total_amount: grandTotal })
        .select('id, customer_name, total_amount, session_date, created_at')
        .single();
      if (se) throw se;
      const sessionId = (session as { id: string }).id;
      const denomRows = DENOMINATIONS
        .filter(d => (counts[d] || 0) > 0)
        .map(d => ({ session_id: sessionId, denomination_value: d, count: counts[d], subtotal: subtotal(d) }));
      if (denomRows.length > 0) {
        const { error: de } = await supabase.from('cash_counter_denominations').insert(denomRows);
        if (de) {
          await supabase.from('cash_counter_sessions').delete().eq('id', sessionId); // لا نترك جلسة بدون تفاصيل
          throw de;
        }
      }
      onMsg(`تم حفظ العدّة بمبلغ ${grandTotal.toLocaleString('ar-EG')} جنيه ✓`);
      reset();
      if (historyOpen) loadHistory();
    } catch (e) {
      onMsg(getErrMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    const { data: sessions } = await supabase
      .from('cash_counter_sessions')
      .select('id, customer_name, total_amount, session_date, created_at')
      .order('created_at', { ascending: false }).limit(50);
    const sessionsArr = (sessions as Omit<CashSession, 'denominations'>[] | null) ?? [];
    // استعلام واحد لكل التفاصيل بدل استعلام لكل جلسة
    const ids = sessionsArr.map(x => x.id);
    const byId = new Map<string, CashSession['denominations']>();
    if (ids.length > 0) {
      const { data: denoms } = await supabase
        .from('cash_counter_denominations')
        .select('session_id, denomination_value, count, subtotal')
        .in('session_id', ids).order('denomination_value', { ascending: false });
      for (const d of (denoms ?? []) as Array<CashSession['denominations'][number] & { session_id: string }>) {
        const arr = byId.get(d.session_id) ?? [];
        arr.push({ denomination_value: d.denomination_value, count: d.count, subtotal: d.subtotal });
        byId.set(d.session_id, arr);
      }
    }
    const result: CashSession[] = sessionsArr.map(x => ({ ...x, total_amount: Number(x.total_amount), denominations: byId.get(x.id) ?? [] }));
    setHistory(result);
    setHistoryLoading(false);
  }, []);

  useEffect(() => {
    if (historyOpen && history.length === 0) loadHistory();
  }, [historyOpen, history.length, loadHistory]);

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calculator className="w-6 h-6 text-amber-400" />
          <h2 className="text-lg font-bold text-white">عداد النقدية</h2>
        </div>
        <button
          onClick={() => setHistoryOpen(o => !o)}
          className="flex items-center gap-1.5 text-sm text-amber-400 hover:text-amber-300 transition"
        >
          <History className="w-4 h-4" /> السجل
        </button>
      </div>

      {/* Denomination grid */}
      <div className="bg-slate-800/50 rounded-2xl border border-amber-600/20 p-4 space-y-3">
        {DENOMINATIONS.map(d => (
          <div key={d} className="flex items-center gap-3">
            <div className="flex items-center gap-2 w-28 shrink-0">
              <Coins className="w-5 h-5 text-amber-400" />
              <span className="text-white font-bold text-lg">{d.toLocaleString('ar-EG')}</span>
              <span className="text-slate-400 text-xs">جنيه</span>
            </div>
            <div className="flex-1 flex items-center gap-2">
              <input
                type="number"
                min={0}
                value={counts[d] || ''}
                onChange={e => setCount(d, e.target.value)}
                placeholder="0"
                className="w-24 bg-slate-900 text-white text-center text-lg font-bold rounded-lg border border-slate-700 focus:border-amber-500 outline-none px-3 py-2"
              />
              <span className="text-slate-400 text-sm">ورقة</span>
              <div className="flex-1 text-left">
                <span className="text-amber-400 font-semibold">
                  {subtotal(d).toLocaleString('ar-EG')}
                </span>
                <span className="text-slate-500 text-sm"> جنيه</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Total */}
      <div className="bg-gradient-to-l from-amber-600/20 to-amber-600/5 rounded-2xl border border-amber-600/40 p-4 flex items-center justify-between">
        <div>
          <div className="text-amber-400 text-sm">الإجمالي ({totalNotes.toLocaleString('ar-EG')} ورقة)</div>
          <div className="text-white text-3xl font-bold">{grandTotal.toLocaleString('ar-EG')}</div>
        </div>
        <div className="text-amber-400 text-sm">جنيه مصري</div>
      </div>

      {/* Customer name + save */}
      <div className="flex gap-2">
        <input
          value={customerName}
          onChange={e => setCustomerName(e.target.value)}
          placeholder="اسم العميل (اختياري)..."
          className="flex-1 bg-slate-800 text-white rounded-xl border border-slate-700 focus:border-amber-500 outline-none px-4 py-3"
        />
        <button
          onClick={saveSession}
          disabled={saving || grandTotal === 0}
          className="shrink-0 bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white px-5 rounded-xl font-semibold flex items-center gap-2 transition"
        >
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          حفظ
        </button>
      </div>
      <button
        onClick={reset}
        className="text-slate-400 hover:text-slate-300 text-sm transition"
      >
        تصفير العدّة
      </button>

      {/* History */}
      {historyOpen && (
        <div className="space-y-2 pt-2">
          <h3 className="text-white font-semibold flex items-center gap-2">
            <History className="w-5 h-5 text-amber-400" /> سجل العدّات السابقة
          </h3>
          {historyLoading ? (
            <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-amber-400" /></div>
          ) : history.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-4">لا يوجد سجل بعد</p>
          ) : (
            <div className="space-y-2">
              {history.map(s => (
                <div key={s.id} className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
                  <button
                    onClick={() => setExpandedSession(expandedSession === s.id ? null : s.id)}
                    className="w-full flex items-center justify-between p-3 hover:bg-slate-800 transition"
                  >
                    <div className="flex items-center gap-3">
                      {expandedSession === s.id
                        ? <ChevronUp className="w-4 h-4 text-slate-400" />
                        : <ChevronDown className="w-4 h-4 text-slate-400" />}
                      <div className="text-right">
                        <div className="text-white font-semibold">
                          {s.customer_name || 'بدون اسم'}
                        </div>
                        <div className="text-slate-400 text-xs">
                          {new Date(s.created_at).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
                        </div>
                      </div>
                    </div>
                    <div className="text-amber-400 font-bold text-lg">
                      {Number(s.total_amount).toLocaleString('ar-EG')} ج
                    </div>
                  </button>
                  {expandedSession === s.id && s.denominations.length > 0 && (
                    <div className="px-4 pb-3 space-y-1 border-t border-slate-700 pt-2">
                      {s.denominations.map((d, i) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span className="text-slate-300">
                            {Number(d.denomination_value).toLocaleString('ar-EG')} ج × {d.count}
                          </span>
                          <span className="text-amber-400">{Number(d.subtotal).toLocaleString('ar-EG')} ج</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Settings View ────────────────────────────────────────
function SettingsView({ products, customers, onRefresh, onImport, onCustomerImport, onClearAll, onClearAllCustomers, onMergeDuplicates, theme, onThemeChange, onMsg }: {
  products: Product[];
  customers: Customer[];
  onRefresh: () => void | Promise<void>;
  onImport: (mode: 'add' | 'upsert') => void;
  onCustomerImport: (file: File) => void;
  onClearAll: () => void;
  onClearAllCustomers: () => void;
  onMergeDuplicates: () => void;
  theme: 'olive' | 'ocean' | 'forest' | 'sunset' | 'midnight' | 'rose' | 'day' | 'night';
  onThemeChange: (t: 'olive' | 'ocean' | 'forest' | 'sunset' | 'midnight' | 'rose' | 'day' | 'night') => void;
  onMsg: (m: string) => void;
}) {
  const [merging, setMerging] = useState(false);
  const [backingUpAll, setBackingUpAll] = useState(false);
  const [restoringAll, setRestoringAll] = useState(false);
  const [confirmRestoreAll, setConfirmRestoreAll] = useState<File | null>(null);
  const restoreAllRef = useRef<HTMLInputElement>(null);

  const [backingUpProducts, setBackingUpProducts] = useState(false);
  const [restoringProducts, setRestoringProducts] = useState(false);
  const [confirmRestoreProducts, setConfirmRestoreProducts] = useState<File | null>(null);
  const restoreProductsRef = useRef<HTMLInputElement>(null);

  const customerImportRef = useRef<HTMLInputElement>(null);
  const btn = 'flex items-center gap-3 p-3.5 rounded-xl bg-slate-800 border border-slate-700/80 hover:border-blue-500 hover:bg-slate-800/90 transition text-right w-full cursor-pointer';
  const ic = 'w-10 h-10 rounded-lg flex items-center justify-center shrink-0';

  const dupCount = (() => {
    const seen = new Set<string>();
    let dups = 0;
    for (const p of products) {
      const k = normalizeAr(p.name);
      if (seen.has(k)) dups++; else seen.add(k);
    }
    return dups;
  })();

  const themes: Array<{ id: 'olive' | 'ocean' | 'forest' | 'sunset' | 'midnight' | 'rose' | 'day' | 'night'; label: string; colors: string[] }> = [
    { id: 'day', label: 'النهاري', colors: ['#f1f5f9', '#0f766e', '#16a34a'] },
    { id: 'night', label: 'الليلي', colors: ['#0a0a0a', '#fafafa', '#22c55e'] },
    { id: 'olive', label: 'الذهبي', colors: ['#3d3a1f', '#d4af37', '#7ab050'] },
    { id: 'ocean', label: 'الأزرق', colors: ['#0f1929', '#38bdf8', '#4ade80'] },
    { id: 'forest', label: 'الأخضر', colors: ['#1a2e1a', '#4ade80', '#84cc16'] },
    { id: 'sunset', label: 'البرتقالي', colors: ['#2a1f1a', '#fb923c', '#84cc16'] },
    { id: 'midnight', label: 'الرمادي', colors: ['#1e293b', '#94a3b8', '#4ade80'] },
    { id: 'rose', label: 'الأحمر', colors: ['#2a1a1f', '#f43f5e', '#84cc16'] },
  ];

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <div className="flex items-center justify-between pb-2 border-b border-slate-700/60">
        <div>
          <h2 className="text-xl font-bold text-white">الإعدادات</h2>
          <p className="text-slate-400 text-xs mt-0.5">تخصيص المظهر، استيراد وتحديث الأصناف، والنسخ الاحتياطي</p>
        </div>
      </div>

      {/* 1. Theme picker */}
      <div className="rounded-2xl bg-slate-800/90 border border-slate-700 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Palette className="w-5 h-5 text-blue-400" />
          <h3 className="text-white font-bold text-base">الثيمات والمظهر</h3>
        </div>
        <p className="text-slate-400 text-xs mb-3.5">اختر المظهر المريح لعينيك — ألوان واضحة عالية التباين لبيئات العمل المختلفة:</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {themes.map(t => (
            <button
              key={t.id}
              onClick={() => onThemeChange(t.id)}
              className={`rounded-xl p-3 border-2 transition text-center cursor-pointer ${theme === t.id ? 'border-blue-500 bg-blue-600/10' : 'border-slate-700 hover:border-slate-600 bg-slate-900/40'}`}
            >
              <div className="flex justify-center gap-1.5 mb-2">
                {t.colors.map((c, i) => (
                  <div key={i} className="w-5 h-5 rounded-full border border-black/20" style={{ background: c }} />
                ))}
              </div>
              <div className="text-xs font-semibold text-white">{t.label}</div>
              {theme === t.id ? (
                <div className="text-[10px] text-blue-400 font-bold mt-1">مفعّل ✓</div>
              ) : (
                <div className="text-[10px] text-slate-500 mt-1">تبديل</div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Products Import & Recovery */}
      <div className="rounded-2xl bg-slate-800/90 border border-slate-700 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center shrink-0">
              <Upload className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-white font-bold text-base">استرداد وتحديث الأصناف (Excel / CSV)</h3>
              <p className="text-slate-400 text-xs mt-0.5">
                تحديث الأسعار وإضافة الأصناف الجديدة بناءً على كود الصنف حصراً مع الحفاظ على المخزون القائم
              </p>
            </div>
          </div>
        </div>

        <div className="bg-blue-950/40 border border-blue-800/60 rounded-xl p-3.5 text-xs text-blue-200 leading-relaxed">
          <div className="font-bold flex items-center gap-1.5 mb-1 text-blue-300">
            <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" />
            آلية الاسترداد المعتمدة بناءً على كود الصنف:
          </div>
          <ul className="list-disc list-inside space-y-1 text-slate-300 mr-1">
            <li>يتم فحص كل صنف داخل الملف ومطابقته بالكود مع الأصناف الموجودة بقاعدة البيانات.</li>
            <li>عند تطابق الكود: يتم تحديث الأسعار (الجملة والتجزئة) والتكلفة فقط مع <strong>الحفاظ الكامل على المخزون والأرصدة القائمة</strong> دون تصفيرها.</li>
            <li>الأصناف التي لا يوجد كودها في النظام: تُضاف كأصناف جديدة، وتتفعّل بها أزرار الزيادة والنقص والأصناف الجديدة في شاشة الأصناف تلقائياً.</li>
          </ul>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <button
            onClick={() => onImport('upsert')}
            className="flex items-center gap-3 p-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition text-right font-bold shadow-md cursor-pointer sm:col-span-2"
          >
            <span className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
              <Upload className="w-5 h-5 text-white" />
            </span>
            <div>
              <div className="text-base text-white">استيراد وتحديث الأصناف من ملف (Excel / CSV)</div>
              <div className="text-blue-100 text-xs font-normal">اختيار ملف إكسيل للمطابقة بالكود وتحديث الأسعار والأصناف الجديدة</div>
            </div>
          </button>

          <button onClick={downloadTemplate} className={btn}>
            <span className={`${ic} bg-amber-600/20`}><FileText className="w-5 h-5 text-amber-400" /></span>
            <div>
              <div className="text-white font-semibold text-sm">تحميل قالب Excel للأصناف</div>
              <div className="text-slate-400 text-xs">قالب جاهز يحتوي على أعمدة (الكود، اسم الصنف، الوحدة، سعر الجملة، سعر التجزئة)</div>
            </div>
          </button>

          <button onClick={() => exportExcel(products)} className={btn}>
            <span className={`${ic} bg-emerald-600/20`}><FileSpreadsheet className="w-5 h-5 text-emerald-400" /></span>
            <div>
              <div className="text-white font-semibold text-sm">تصدير الأصناف الحالية (Excel)</div>
              <div className="text-slate-400 text-xs">حفظ وتصدير كافة الأصناف المسجلة ({products.length.toLocaleString('ar-EG')} صنف) في ملف Excel</div>
            </div>
          </button>

          <button onClick={() => exportPDF(products)} className={btn}>
            <span className={`${ic} bg-rose-600/20`}><FileDown className="w-5 h-5 text-rose-400" /></span>
            <div>
              <div className="text-white font-semibold text-sm">تصدير أو طباعة قائمة الأصناف (PDF)</div>
              <div className="text-slate-400 text-xs">عرض قائمة الأصناف للطباعة أو الحفظ بتنسيق PDF يدعم العربية</div>
            </div>
          </button>

          <button onClick={onRefresh} className={btn}>
            <span className={`${ic} bg-cyan-600/20`}><RefreshCw className="w-5 h-5 text-cyan-400" /></span>
            <div>
              <div className="text-white font-semibold text-sm">تحديث قائمة الأصناف من السيرفر</div>
              <div className="text-slate-400 text-xs">إعادة تحميل كافة الأصناف والأسعار الحالية من قاعدة البيانات</div>
            </div>
          </button>

          {dupCount > 0 && (
            <button
              onClick={async () => { setMerging(true); await onMergeDuplicates(); setMerging(false); }}
              disabled={merging}
              className={`${btn} sm:col-span-2 hover:border-amber-500`}
            >
              <span className={`${ic} bg-amber-600/20`}>
                {merging ? <Loader2 className="w-5 h-5 text-amber-400 animate-spin" /> : <CopyPlus className="w-5 h-5 text-amber-400" />}
              </span>
              <div>
                <div className="text-white font-semibold text-sm">دمج الأصناف المكرّرة ({dupCount.toLocaleString('ar-EG')} صنف مكرر)</div>
                <div className="text-slate-400 text-xs">توحيد الأصناف ذات الأسماء المتطابقة مع الاحتفاظ بالكود والأسعار الأحدث وربط الحركات</div>
              </div>
            </button>
          )}
        </div>
      </div>

      {/* 3. Backup & Restore (Products Only + Full Program) */}
      <div className="rounded-2xl bg-slate-800/90 border border-slate-700 p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center shrink-0">
            <DatabaseBackup className="w-5 h-5" />
          </span>
          <div>
            <h3 className="text-white font-bold text-base">النسخ الاحتياطي والاستعادة</h3>
            <p className="text-slate-400 text-xs mt-0.5">حفظ واسترجاع بيانات الأصناف بشكل مستقل أو النسخة الشاملة للبرنامج كاملاً</p>
          </div>
        </div>

        {/* Section A: Products only */}
        <div className="rounded-xl bg-slate-900/60 border border-slate-700/80 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-emerald-400" />
              <h4 className="text-white font-bold text-sm">أولاً: نسخة احتياطية للأصناف فقط</h4>
            </div>
            <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800">
              {products.length.toLocaleString('ar-EG')} صنف
            </span>
          </div>
          <p className="text-slate-400 text-xs">
            حفظ واستعادة بيانات جدول الأصناف (الاسم، الكود، الباركود، الأسعار، المخزون، الوحدات) في ملف JSON منفصل.
          </p>
          <div className="flex flex-wrap gap-2.5 pt-1">
            <button
              onClick={async () => {
                setBackingUpProducts(true);
                try {
                  await backupProductsOnly();
                  onMsg('تم إنشاء وتحميل نسخة الأصناف الاحتياطية بنجاح ✓');
                } catch (e) {
                  onMsg(getErrMsg(e));
                } finally {
                  setBackingUpProducts(false);
                }
              }}
              disabled={backingUpProducts}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold px-4 py-2.5 rounded-lg transition cursor-pointer shadow-xs"
            >
              {backingUpProducts ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              تنزيل نسخة الأصناف فقط (JSON)
            </button>

            <button
              onClick={() => restoreProductsRef.current?.click()}
              disabled={restoringProducts}
              className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-xs font-bold px-4 py-2.5 rounded-lg transition cursor-pointer border border-slate-600"
            >
              {restoringProducts ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5 text-amber-400" />}
              استعادة الأصناف من ملف (JSON)
            </button>
          </div>
          <input
            ref={restoreProductsRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) setConfirmRestoreProducts(f);
              if (restoreProductsRef.current) restoreProductsRef.current.value = '';
            }}
          />
        </div>

        {/* Section B: Complete Program Backup */}
        <div className="rounded-xl bg-slate-900/60 border border-slate-700/80 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DatabaseBackup className="w-4 h-4 text-blue-400" />
              <h4 className="text-white font-bold text-sm">ثانياً: نسخة احتياطية للبرنامج كامل</h4>
            </div>
            <span className="text-[11px] font-mono text-blue-400 bg-blue-950/80 px-2 py-0.5 rounded border border-blue-800">
              قاعدة البيانات الشاملة
            </span>
          </div>
          <p className="text-slate-400 text-xs">
            حفظ نسخة كاملة من جميع جداول البرنامج (الأصناف، الفواتير وبنودها، النواقص، سجل الأسعار، النقدية، العملاء، والمديونيات) مع ميزة التراجع التلقائي عند أي خطأ.
          </p>
          <div className="flex flex-wrap gap-2.5 pt-1">
            <button
              onClick={async () => {
                setBackingUpAll(true);
                try {
                  await backupAllData();
                  onMsg('تم إنشاء وتحميل النسخة الاحتياطية الشاملة للبرنامج كامل بنجاح ✓');
                } catch (e) {
                  onMsg(getErrMsg(e));
                } finally {
                  setBackingUpAll(false);
                }
              }}
              disabled={backingUpAll}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold px-4 py-2.5 rounded-lg transition cursor-pointer shadow-xs"
            >
              {backingUpAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              تنزيل نسخة شاملة للبرنامج كامل (JSON)
            </button>

            <button
              onClick={() => restoreAllRef.current?.click()}
              disabled={restoringAll}
              className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold px-4 py-2.5 rounded-lg transition cursor-pointer shadow-xs"
            >
              {restoringAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
              استعادة البرنامج كامل من ملف (JSON)
            </button>
          </div>
          <input
            ref={restoreAllRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) setConfirmRestoreAll(f);
              if (restoreAllRef.current) restoreAllRef.current.value = '';
            }}
          />
        </div>

        {/* Clear products */}
        <div className="pt-1">
          <button onClick={onClearAll} className={`${btn} hover:border-red-600/80 hover:bg-red-950/20`}>
            <span className={`${ic} bg-red-600/20`}><Trash2 className="w-5 h-5 text-red-400" /></span>
            <div>
              <div className="text-red-400 font-semibold text-sm">حذف كل الأصناف نهائياً</div>
              <div className="text-slate-400 text-xs">تفريغ قائمة الأصناف بالكامل بعد التأكيد (تحذير: لا يمكن التراجع إلا من نسخة احتياطية)</div>
            </div>
          </button>
        </div>
      </div>

      {/* Confirmation Modals for Restores */}
      {confirmRestoreProducts && (
        <ConfirmModal
          title="استعادة نسخة الأصناف الاحتياطية"
          message="سيتم تحديث واستعادة بيانات الأصناف وأسعارها من ملف النسخة الاحتياطية. هل أنت متأكد من المتابعة؟"
          onConfirm={async () => {
            const f = confirmRestoreProducts;
            setConfirmRestoreProducts(null);
            setRestoringProducts(true);
            try {
              const count = await restoreProductsOnly(f);
              onMsg(`تمت استعادة وتحديث ${count.toLocaleString('ar-EG')} صنف بنجاح ✓`);
              await onRefresh();
            } catch (e) {
              onMsg(getErrMsg(e));
            } finally {
              setRestoringProducts(false);
            }
          }}
          onCancel={() => setConfirmRestoreProducts(null)}
        />
      )}

      {confirmRestoreAll && (
        <ConfirmModal
          title="استعادة النسخة الاحتياطية الشاملة"
          message="سيتم استبدال جميع البيانات الحالية لكامل البرنامج بالبيانات الموجودة في ملف النسخة الاحتياطية. هل أنت متأكد من المتابعة؟"
          onConfirm={async () => {
            const f = confirmRestoreAll;
            setConfirmRestoreAll(null);
            setRestoringAll(true);
            try {
              await restoreAllData(f);
              onMsg('تمت استعادة النسخة الاحتياطية الشاملة للبرنامج كامل بنجاح ✓');
              await onRefresh();
            } catch (e) {
              onMsg(getErrMsg(e));
            } finally {
              setRestoringAll(false);
            }
          }}
          onCancel={() => setConfirmRestoreAll(null)}
        />
      )}

      {/* 4. Customer management */}
      <div className="rounded-2xl bg-slate-800/90 border border-slate-700 p-5 shadow-sm space-y-3">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center shrink-0">
            <Contact className="w-5 h-5" />
          </span>
          <div>
            <h3 className="text-white font-bold text-base">إدارة العملاء</h3>
            <p className="text-slate-400 text-xs mt-0.5">
              استيراد وتصدير قاعدة بيانات العملاء وربطها بالفواتير والمديونيات
            </p>
          </div>
        </div>

        <div className="space-y-2.5 pt-1">
          <button onClick={() => customerImportRef.current?.click()} className={btn}>
            <span className={`${ic} bg-emerald-600/20`}><Upload className="w-5 h-5 text-emerald-400" /></span>
            <div>
              <div className="text-white font-semibold text-sm">استيراد عملاء (Excel / CSV)</div>
              <div className="text-slate-400 text-xs">تحديث وإضافة العملاء من ملف Excel بناءً على كود العميل</div>
            </div>
          </button>
          <button onClick={() => exportCustomersExcel(customers)} className={btn}>
            <span className={`${ic} bg-green-600/20`}><FileSpreadsheet className="w-5 h-5 text-green-400" /></span>
            <div>
              <div className="text-white font-semibold text-sm">تصدير العملاء (Excel)</div>
              <div className="text-slate-400 text-xs">حفظ قائمة العملاء ({customers.length.toLocaleString('ar-EG')} عميل) في ملف Excel</div>
            </div>
          </button>
          <button onClick={downloadCustomerTemplate} className={btn}>
            <span className={`${ic} bg-amber-600/20`}><FileText className="w-5 h-5 text-amber-400" /></span>
            <div>
              <div className="text-white font-semibold text-sm">تحميل قالب العملاء</div>
              <div className="text-slate-400 text-xs">قالب Excel جاهز لإدخال بيانات العملاء (الكود، الاسم، العنوان، الهاتف 1 و 2)</div>
            </div>
          </button>
          <button onClick={onClearAllCustomers} className={`${btn} hover:border-red-600/80 hover:bg-red-950/20`}>
            <span className={`${ic} bg-red-600/20`}><Trash2 className="w-5 h-5 text-red-400" /></span>
            <div>
              <div className="text-white font-semibold text-sm">حذف كل العملاء</div>
              <div className="text-slate-400 text-xs">حذف جميع العملاء نهائياً ({customers.length.toLocaleString('ar-EG')} عميل)</div>
            </div>
          </button>
        </div>
        <input
          ref={customerImportRef}
          type="file"
          accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) onCustomerImport(f);
            if (customerImportRef.current) customerImportRef.current.value = '';
          }}
        />
      </div>
    </div>
  );
}

// ─── Network Status Indicator ─────────────────────────────
function NetworkIndicator({ online }: { online: boolean }) {
  return (
    <div
      title={online ? 'متصل بالإنترنت' : 'غير متصل بالإنترنت'}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition ${
        online ? 'bg-green-600/20 text-green-400 border border-green-600/40' : 'bg-red-600/20 text-red-400 border border-red-600/40'
      }`}
    >
      <span className={`relative flex w-2.5 h-2.5`}>
        {online && <span className="absolute inline-flex w-full h-full rounded-full bg-green-400 opacity-60 animate-ping" />}
        <span className={`relative inline-flex rounded-full w-2.5 h-2.5 ${online ? 'bg-green-400' : 'bg-red-400'}`} />
      </span>
      <span className="hidden sm:inline">{online ? 'متصل' : 'غير متصل'}</span>
    </div>
  );
}

// ─── Shortages View (نواقص اليوم + سجل الأيام السابقة) ──
type ShortageItem = {
  id: string;
  product_id: string | null;
  product_name: string;
  notes: string;
  arrived: boolean;
  created_at: string;
};
type ShortageList = {
  id: string;
  list_date: string;
  items: ShortageItem[];
};

function ShortagesView({ products, onMsg }: { products: Product[]; onMsg: (m: string) => void }) {
  const [items, setItems] = useState<ShortageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [listId, setListId] = useState<string | null>(null);
  const [history, setHistory] = useState<ShortageList[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedList, setExpandedList] = useState<string | null>(null);
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const todayStr = localDateStr();

  const loadList = useCallback(async () => {
    setLoading(true);
    const lId = await getOrCreateByDate('shortage_lists', 'list_date', todayStr);
    setListId(lId);
    if (lId) {
      const { data: itemsData } = await supabase
        .from('shortage_items').select('id, product_id, product_name, notes, arrived, created_at')
        .eq('list_id', lId).order('created_at', { ascending: true });
      setItems((itemsData as ShortageItem[] | null) ?? []);
    }
    setLoading(false);
  }, [todayStr]);

  useEffect(() => { loadList(); }, [loadList]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    const { data: lists } = await supabase
      .from('shortage_lists').select('id, list_date')
      .lt('list_date', todayStr).order('list_date', { ascending: false }).limit(30);
    const listsArr = (lists as { id: string; list_date: string }[] | null) ?? [];
    const byList = new Map<string, ShortageItem[]>();
    if (listsArr.length > 0) {
      const { data: all } = await supabase
        .from('shortage_items').select('id, list_id, product_id, product_name, notes, arrived, created_at')
        .in('list_id', listsArr.map(l => l.id)).order('created_at', { ascending: true });
      for (const it of (all ?? []) as Array<ShortageItem & { list_id: string }>) {
        const arr = byList.get(it.list_id) ?? [];
        arr.push(it);
        byList.set(it.list_id, arr);
      }
    }
    const result: ShortageList[] = listsArr.map(l => ({ id: l.id, list_date: l.list_date, items: byList.get(l.id) ?? [] }));
    setHistory(result);
    setHistoryLoading(false);
  }, [todayStr]);

  useEffect(() => {
    if (historyOpen && history.length === 0) loadHistory();
  }, [historyOpen, history.length, loadHistory]);

  const searchIdx = useMemo(() => buildSearchIndex(products), [products]);
  const results = q.trim() ? searchIndex(searchIdx, q, 8) : [];

  const addItem = async (p: Product) => {
    if (!listId) return;
    setQ(''); setShowResults(false);
    const { data, error } = await supabase
      .from('shortage_items').insert({ list_id: listId, product_id: p.id, product_name: p.name, notes: '', arrived: false })
      .select('id, product_id, product_name, notes, arrived, created_at').single();
    if (error) { onMsg(getErrMsg(error)); return; }
    if (data) setItems(prev => [...prev, data as ShortageItem]);
  };

  const addCustomItem = async () => {
    const name = q.trim();
    if (!name || !listId) return;
    setQ(''); setShowResults(false);
    const { data, error } = await supabase
      .from('shortage_items').insert({ list_id: listId, product_id: null, product_name: name, notes: '', arrived: false })
      .select('id, product_id, product_name, notes, arrived, created_at').single();
    if (error) { onMsg(getErrMsg(error)); return; }
    if (data) setItems(prev => [...prev, data as ShortageItem]);
  };

  const removeItem = async (id: string) => {
    const { error } = await supabase.from('shortage_items').delete().eq('id', id);
    if (error) { onMsg(getErrMsg(error)); return; }
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const toggleArrived = async (id: string) => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    const newVal = !item.arrived;
    setItems(prev => prev.map(i => i.id === id ? { ...i, arrived: newVal } : i));
    const { error } = await supabase.from('shortage_items').update({ arrived: newVal }).eq('id', id);
    if (error) {
      setItems(prev => prev.map(i => i.id === id ? { ...i, arrived: !newVal } : i)); // تراجع
      onMsg(getErrMsg(error));
    }
  };

  const updateNotes = (id: string, notes: string) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, notes } : i));
    if (debounceRef.current[id]) clearTimeout(debounceRef.current[id]);
    debounceRef.current[id] = setTimeout(async () => {
      setSavingId(id);
      await supabase.from('shortage_items').update({ notes }).eq('id', id);
      setSavingId(null);
    }, 600);
  };

  const importNotArrived = async (srcList: ShortageList) => {
    if (!listId) return;
    const notArrived = srcList.items.filter(i => !i.arrived);
    if (notArrived.length === 0) { onMsg('لا توجد نواقص لم تأتِ في هذا اليوم'); return; }
    const existingNames = new Set(items.map(i => i.product_name.trim()));
    const toAdd = notArrived.filter(i => !existingNames.has(i.product_name.trim()));
    if (toAdd.length === 0) { onMsg('جميع النواقص التي لم تأتِ موجودة بالفعل في قائمة اليوم'); return; }
    const rows = toAdd.map(i => ({
      list_id: listId, product_id: i.product_id, product_name: i.product_name,
      notes: i.notes || '', arrived: false,
    }));
    const { data, error } = await supabase
      .from('shortage_items').insert(rows)
      .select('id, product_id, product_name, notes, arrived, created_at');
    if (!error && data) {
      setItems(prev => [...prev, ...(data as ShortageItem[])]);
      onMsg(`تم إضافة ${toAdd.length} صنف من نواقص ${srcList.list_date} ✓`);
    } else if (error) {
      onMsg(getErrMsg(error));
    }
  };

  useEffect(() => {
    return () => { Object.values(debounceRef.current).forEach(clearTimeout); };
  }, []);

  const arrivedCount = items.filter(i => i.arrived).length;
  const notArrivedCount = items.length - arrivedCount;

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-amber-400" />
          <h2 className="text-lg font-bold text-white">نواقص اليوم</h2>
        </div>
        <span className="text-slate-400 text-sm">
          {new Date().toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' })}
        </span>
      </div>

      {/* Search + add */}
      <div className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              value={q}
              onChange={e => { setQ(e.target.value); setShowResults(true); }}
              onFocus={() => setShowResults(true)}
              onKeyDown={e => { if (e.key === 'Enter' && results.length === 0 && q.trim()) addCustomItem(); }}
              placeholder="ابحث عن صنف أو اكتب اسم صنف جديد..."
              className="w-full bg-slate-800 text-white text-lg rounded-xl border border-slate-700 focus:border-amber-500 outline-none pr-12 pl-4 py-3"
            />
          </div>
          <button
            onClick={addCustomItem}
            disabled={!q.trim()}
            className="shrink-0 bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white px-4 rounded-xl font-semibold flex items-center gap-2 transition"
          >
            <Plus className="w-5 h-5" /> إضافة
          </button>
        </div>
        {showResults && results.length > 0 && (
          <div className="absolute z-10 top-full mt-1 w-[calc(100%-3.5rem)] bg-slate-800 rounded-xl border border-slate-700 shadow-xl max-h-64 overflow-y-auto">
            {results.map(p => (
              <button
                key={p.id}
                onClick={() => addItem(p)}
                className="w-full text-right px-4 py-2.5 hover:bg-slate-700 border-b border-slate-700 last:border-0 flex justify-between items-center"
              >
                <span className="text-white">{p.name}</span>
                {p.code && <span className="text-slate-400 text-sm">{p.code}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Notebook-style list */}
      {loading ? (
        <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin mx-auto text-amber-400" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>لا توجد نواقص اليوم — ابحث وأضف الأصناف الناقصة</p>
        </div>
      ) : (
        <div className="bg-amber-50 rounded-2xl shadow-xl border border-amber-200 overflow-hidden">
          <div className="relative">
            <div className="absolute right-12 top-0 bottom-0 w-0.5 bg-red-300" />
            <div className="divide-y divide-amber-200">
              {items.map((item) => (
                <div key={item.id} className={`flex items-start gap-3 px-4 py-3 transition group ${item.arrived ? 'bg-green-50/60' : 'hover:bg-amber-100/50'}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className={`font-semibold text-base ${item.arrived ? 'text-green-700 line-through' : 'text-slate-800'}`}>{item.product_name}</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => toggleArrived(item.id)}
                          title={item.arrived ? 'لم يصل' : 'وصل'}
                          className={`rounded-lg p-1 transition ${item.arrived ? 'text-green-600 hover:bg-green-100' : 'text-slate-400 hover:bg-amber-100 hover:text-green-600'}`}
                        >
                          <Check className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => removeItem(item.id)}
                          title="إزالة"
                          className="text-red-500 hover:text-red-700 hover:bg-red-100 rounded-lg p-1 transition opacity-60 group-hover:opacity-100"
                        >
                          <MinusCircle className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                    <input
                      value={item.notes}
                      onChange={e => updateNotes(item.id, e.target.value)}
                      placeholder="ملاحظات..."
                      className="w-full bg-transparent text-slate-600 text-sm border-b border-dashed border-amber-300 focus:border-amber-500 outline-none py-1 placeholder:text-amber-400/60"
                    />
                    {savingId === item.id && (
                      <span className="text-amber-500 text-xs flex items-center gap-1 mt-0.5">
                        <Loader2 className="w-3 h-3 animate-spin" /> جارٍ الحفظ...
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-amber-100/60 px-4 py-2 border-t border-amber-200 flex items-center justify-between text-sm text-amber-700">
            <span>الإجمالي: {items.length} — وصل: {arrivedCount} — لم يصل: {notArrivedCount}</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> حفظ تلقائي</span>
          </div>
        </div>
      )}

      {/* History section */}
      <div className="border border-slate-700 rounded-2xl overflow-hidden bg-slate-800/50">
        <button
          onClick={() => setHistoryOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800 transition"
        >
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-blue-400" />
            <span className="text-white font-semibold">سجل الأيام السابقة</span>
          </div>
          {historyOpen ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
        </button>
        {historyOpen && (
          <div className="border-t border-slate-700">
            {historyLoading ? (
              <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-400" /></div>
            ) : history.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">لا يوجد سجل للأيام السابقة</div>
            ) : (
              <div className="divide-y divide-slate-700">
                {history.map(hl => {
                  const hNotArrived = hl.items.filter(i => !i.arrived).length;
                  const hArrived = hl.items.filter(i => i.arrived).length;
                  const isOpen = expandedList === hl.id;
                  return (
                    <div key={hl.id}>
                      <button
                        onClick={() => setExpandedList(isOpen ? null : hl.id)}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800/70 transition"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-slate-300 text-sm">
                            {new Date(hl.list_date + 'T00:00:00').toLocaleDateString('ar-EG', { weekday: 'short', day: 'numeric', month: 'short' })}
                          </span>
                          <span className="text-slate-400 text-xs">{hl.items.length} صنف</span>
                          {hNotArrived > 0 && (
                            <span className="text-red-400 text-xs bg-red-600/10 px-2 py-0.5 rounded-full">{hNotArrived} لم تأتِ</span>
                          )}
                          {hArrived > 0 && (
                            <span className="text-green-400 text-xs bg-green-600/10 px-2 py-0.5 rounded-full">{hArrived} وصل</span>
                          )}
                        </div>
                        {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                      </button>
                      {isOpen && (
                        <div className="px-4 pb-3 bg-slate-900/40">
                          {hNotArrived > 0 && (
                            <button
                              onClick={() => importNotArrived(hl)}
                              className="w-full mb-2 mt-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2 rounded-lg flex items-center justify-center gap-2 transition"
                            >
                              <CopyPlus className="w-4 h-4" />
                              إضافة النواقص التي لم تأتِ ({hNotArrived}) إلى قائمة اليوم
                            </button>
                          )}
                          <div className="space-y-1">
                            {hl.items.map((it) => (
                              <div key={it.id} className="flex items-center gap-2 text-sm py-1">
                                <span className={it.arrived ? 'text-green-400 line-through' : 'text-slate-200'}>{it.product_name}</span>
                                {it.arrived ? (
                                  <span className="text-green-400 text-xs">✓ وصل</span>
                                ) : (
                                  <span className="text-red-400 text-xs">✗ لم يصل</span>
                                )}
                                {it.notes && <span className="text-slate-500 text-xs truncate">— {it.notes}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Price Changes View (زيادات الأسعار اليومية) ──────
type PriceChangeItem = {
  id: string;
  product_id: string | null;
  product_name: string;
  code: string | null;
  price_wholesale: number;
  price_retail: number;
  old_price_wholesale: number;
  old_price_retail: number;
  is_new: boolean;
  created_at: string;
};
type PriceChangeDay = {
  id: string;
  day_date: string;
  items: PriceChangeItem[];
};

// Capture current prices from DB as "before" snapshot — returns Map<productId, {pw, pr}>
// يرمي خطأ عند الفشل: لقطة ناقصة كانت تجعل كل الأصناف تظهر "جديد" بالخطأ.
async function capturePriceSnapshot(): Promise<Map<string, { pw: number; pr: number }>> {
  const map = new Map<string, { pw: number; pr: number }>();
  let page = 0;
  while (true) {
    const { data, error } = await supabase
      .from('products').select('id, price_wholesale, price').order('id')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const p of data as { id: string; price_wholesale: number; price: number }[]) {
      map.set(p.id, { pw: Number(p.price_wholesale), pr: Number(p.price) });
    }
    if (data.length < 1000) break;
    page++;
  }
  return map;
}

type TodayPriceRow = {
  id: string; product_id: string | null; price_wholesale: number; price_retail: number;
  old_price_wholesale: number; old_price_retail: number; is_new: boolean;
};

// Compare fresh products to "before" snapshot, upsert changed items, remove reverted ones.
// - يحتفظ بالسعر القديم الأصلي لليوم عند تعديل نفس الصنف أكثر من مرة (10→12 ثم 12→15 تظهر 10→15)
// - لا يحذف الأصناف "الجديدة" ولا المضافة يدوياً أثناء التنظيف
async function detectAndRecordPriceChanges(
  products: Product[],
  beforeMap: Map<string, { pw: number; pr: number }>
): Promise<{ changed: number; newCount: number; dayId: string | null }> {
  if (products.length === 0) return { changed: 0, newCount: 0, dayId: null }; // حماية: قائمة فارغة = فشل تحميل
  const dId = await getOrCreateByDate('price_change_days', 'day_date', localDateStr());
  if (!dId) return { changed: 0, newCount: 0, dayId: null };

  const { data: existingData, error: exErr } = await supabase
    .from('price_change_items')
    .select('id, product_id, price_wholesale, price_retail, old_price_wholesale, old_price_retail, is_new')
    .eq('day_id', dId);
  if (exErr) throw exErr;
  const existing = (existingData as TodayPriceRow[] | null) ?? [];
  const existingByProduct = new Map<string, TodayPriceRow>();
  for (const ex of existing) if (ex.product_id) existingByProduct.set(ex.product_id, ex);
  const productById = new Map(products.map(p => [p.id, p]));

  const mkRow = (p: Product, oldPw: number, oldPr: number, isNew: boolean) => ({
    day_id: dId, product_id: p.id, product_name: p.name, code: p.code || '',
    price_wholesale: Number(p.price_wholesale), price_retail: Number(p.price),
    old_price_wholesale: oldPw, old_price_retail: oldPr, is_new: isNew,
  });

  const rows: ReturnType<typeof mkRow>[] = [];
  const toDelete: string[] = [];
  const touched = new Set<string>();
  let changedCount = 0;
  let newCount = 0;

  for (const p of products) {
    const before = beforeMap.get(p.id);
    if (!before) {
      rows.push(mkRow(p, Number(p.price_wholesale), Number(p.price), true));
      touched.add(p.id); newCount++;
      continue;
    }
    const curPw = Number(p.price_wholesale);
    const curPr = Number(p.price);
    if (curPw === before.pw && curPr === before.pr) continue;
    touched.add(p.id);
    const ex = existingByProduct.get(p.id);
    const oldPw = ex ? Number(ex.old_price_wholesale) : before.pw;
    const oldPr = ex ? Number(ex.old_price_retail) : before.pr;
    const isNew = ex?.is_new ?? false;
    if (!isNew && curPw === oldPw && curPr === oldPr) { // رجع لسعره الأصلي في اليوم
      if (ex) toDelete.push(ex.id);
      continue;
    }
    rows.push(mkRow(p, oldPw, oldPr, isNew));
    changedCount++;
  }

  // أصناف سُجّل لها تغيّر فعلي ثم رجع سعرها لقيمته القديمة → تُحذف من قائمة اليوم
  for (const ex of existing) {
    if (!ex.product_id || touched.has(ex.product_id) || ex.is_new) continue;
    const hadRealChange = Number(ex.price_wholesale) !== Number(ex.old_price_wholesale) || Number(ex.price_retail) !== Number(ex.old_price_retail);
    if (!hadRealChange) continue; // صنف مضاف يدوياً
    const cur = productById.get(ex.product_id);
    if (cur && Number(cur.price_wholesale) === Number(ex.old_price_wholesale) && Number(cur.price) === Number(ex.old_price_retail)) {
      toDelete.push(ex.id);
    }
  }

  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase
      .from('price_change_items')
      .upsert(rows.slice(i, i + BATCH), { onConflict: 'day_id,product_id' });
    if (error) throw error;
  }
  for (let i = 0; i < toDelete.length; i += BATCH) {
    const { error } = await supabase.from('price_change_items').delete().in('id', toDelete.slice(i, i + BATCH));
    if (error) throw error;
  }

  return { changed: changedCount, newCount, dayId: dId };
}

function PriceChangesView({ products, onMsg }: { products: Product[]; onMsg: (m: string) => void }) {
  const [todayItems, setTodayItems] = useState<PriceChangeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dayId, setDayId] = useState<string | null>(null);
  const [history, setHistory] = useState<PriceChangeDay[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [manualSearch, setManualSearch] = useState('');
  const [detecting, setDetecting] = useState(false);
  const [detectResult, setDetectResult] = useState<string | null>(null);
  const autoDetectedRef = useRef(false);

  const todayStr = localDateStr();

  const loadToday = useCallback(async () => {
    setLoading(true);
    const dId = await getOrCreateByDate('price_change_days', 'day_date', todayStr);
    setDayId(dId);
    if (dId) {
      const { data: items } = await supabase
        .from('price_change_items').select('id, product_id, product_name, code, price_wholesale, price_retail, old_price_wholesale, old_price_retail, is_new, created_at')
        .eq('day_id', dId).order('created_at', { ascending: true });
      setTodayItems((items as PriceChangeItem[] | null) ?? []);
    }
    setLoading(false);
  }, [todayStr]);

  useEffect(() => { loadToday(); }, [loadToday]);

  // On first open: clean up stale items whose prices reverted to old values
  useEffect(() => {
    if (autoDetectedRef.current || products.length === 0) return;
    autoDetectedRef.current = true;
    (async () => {
      setDetecting(true);
      try {
        // before == الأسعار الحالية في الذاكرة → لا تغييرات جديدة، فقط تنظيف الأصناف التي رجع سعرها
        const beforeMap = new Map(products.map(p => [p.id, { pw: Number(p.price_wholesale), pr: Number(p.price) }]));
        await detectAndRecordPriceChanges(products, beforeMap);
        await loadToday();
        setDetectResult('تم تحديث القائمة — رصد تلقائي بعد كل تغيّر في الأسعار');
      } catch (e) {
        setDetectResult(getErrMsg(e));
      } finally {
        setDetecting(false);
      }
    })();
  }, [products, loadToday]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    const { data: days } = await supabase
      .from('price_change_days').select('id, day_date')
      .lt('day_date', todayStr).order('day_date', { ascending: false }).limit(30);
    const daysArr = (days as { id: string; day_date: string }[] | null) ?? [];
    const byDay = new Map<string, PriceChangeItem[]>();
    if (daysArr.length > 0) {
      const { data: all } = await supabase
        .from('price_change_items').select('id, day_id, product_id, product_name, code, price_wholesale, price_retail, old_price_wholesale, old_price_retail, is_new, created_at')
        .in('day_id', daysArr.map(d => d.id)).order('created_at', { ascending: true });
      for (const it of (all ?? []) as Array<PriceChangeItem & { day_id: string }>) {
        const arr = byDay.get(it.day_id) ?? [];
        arr.push(it);
        byDay.set(it.day_id, arr);
      }
    }
    const result: PriceChangeDay[] = daysArr.map(d => ({ id: d.id, day_date: d.day_date, items: byDay.get(d.id) ?? [] }));
    setHistory(result);
    setHistoryLoading(false);
  }, [todayStr]);

  useEffect(() => {
    if (historyOpen && history.length === 0) loadHistory();
  }, [historyOpen, history.length, loadHistory]);

  // Auto-cleanup: delete days older than 15 days and stale items with no price difference
  useEffect(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 15);
    const cutoffStr = localDateStr(cutoff);
    supabase.from('price_change_days').delete().lt('day_date', cutoffStr).then(() => {});
  }, []);

  const removeItem = async (id: string) => {
    const { error } = await supabase.from('price_change_items').delete().eq('id', id);
    if (error) { onMsg(getErrMsg(error)); return; }
    setTodayItems(prev => prev.filter(i => i.id !== id));
  };

  const addManualItem = async (product: Product) => {
    if (!dayId) return;
    const existing = todayItems.find(i => i.product_id === product.id);
    if (existing) { onMsg('هذا الصنف موجود بالفعل في القائمة'); return; }
    const row = {
      day_id: dayId,
      product_id: product.id,
      product_name: product.name,
      code: product.code || '',
      price_wholesale: Number(product.price_wholesale),
      price_retail: Number(product.price),
      old_price_wholesale: Number(product.price_wholesale),
      old_price_retail: Number(product.price),
      is_new: false,
    };
    const { data: inserted, error } = await supabase
      .from('price_change_items').upsert(row, { onConflict: 'day_id,product_id' })
      .select('id, product_id, product_name, code, price_wholesale, price_retail, old_price_wholesale, old_price_retail, is_new, created_at')
      .single();
    if (error) { onMsg(getErrMsg(error)); return; }
    if (inserted) {
      setTodayItems(prev => [...prev, inserted as PriceChangeItem]);
      onMsg('تم إضافة الصنف ✓');
      setManualSearch('');
    }
  };

  const manualIdx = useMemo(() => buildSearchIndex(products), [products]);
  const filteredManualProducts = manualSearch.trim() ? searchIndex(manualIdx, manualSearch, 50) : products.slice(0, 20);

  const fmtPrice = (n: number) => Number(n).toFixed(2);
  const pctChange = (oldV: number, newV: number) => {
    if (oldV <= 0) return newV > 0 ? 100 : 0;
    return Math.round(((newV - oldV) / oldV) * 100);
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-emerald-400" />
          <h2 className="text-lg font-bold text-white">زيادة ونقص الأسعار اليوم</h2>

        </div>
        <span className="text-slate-400 text-sm">
          {new Date().toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' })}
        </span>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setShowManualAdd(o => !o)}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-3 py-2.5 rounded-lg transition"
        >
          <CopyPlus className="w-4 h-4" />
          إضافة صنف يدوياً
        </button>
      </div>
      {detecting && (
        <div className="bg-blue-600/15 border border-blue-600/30 rounded-xl p-3 flex items-center gap-2 text-sm text-blue-300">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          <span>جارٍ رصد التغيّرات...</span>
        </div>
      )}
      {detectResult && !detecting && (
        <div className="bg-blue-600/15 border border-blue-600/30 rounded-xl p-3 flex items-start gap-2 text-sm text-blue-300">
          <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{detectResult}</span>
        </div>
      )}

      {/* Manual add panel */}
      {showManualAdd && (
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-3 space-y-2">
          <input
            type="text"
            value={manualSearch}
            onChange={e => setManualSearch(e.target.value)}
            placeholder="ابحث بالاسم أو الكود..."
            autoFocus
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
          <div className="max-h-64 overflow-y-auto space-y-1">
            {filteredManualProducts.length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-4">لا توجد نتائج</p>
            ) : filteredManualProducts.map(p => (
              <button
                key={p.id}
                onClick={() => addManualItem(p)}
                className="w-full flex items-center justify-between bg-slate-900/50 hover:bg-slate-700/50 rounded-lg px-3 py-2 text-sm transition"
              >
                <div className="flex items-center gap-2">
                  <span className="text-white">{p.name}</span>
                  {p.code && <span className="text-slate-400 text-xs">{p.code}</span>}
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span>جملة: {Number(p.price_wholesale).toFixed(2)}</span>
                  <span>تجزئة: {Number(p.price).toFixed(2)}</span>
                  <CopyPlus className="w-4 h-4 text-emerald-400" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Info banner */}
      <div className="bg-emerald-600/10 border border-emerald-600/30 rounded-xl p-3 flex items-start gap-2 text-sm text-emerald-300">
        <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
        <span>يتم رصد تغيّرات الأسعار تلقائياً بعد كل استيراد أو تعديل لصنف. الأصناف التي زاد أو نقص سعرها تُضاف لقائمة اليوم، والأصناف الجديدة تُعلَّم بـ«جديد». في نهاية اليوم تُحفظ في سجل يومي ويبدأ اليوم التالي بقائمة جديدة.</span>
      </div>

      {/* Today's list */}
      {loading ? (
        <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin mx-auto text-emerald-400" /></div>
      ) : todayItems.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>لا توجد تغيّرات في الأسعار اليوم</p>
          <p className="text-sm mt-1">عند رصد تغيّر في سعر (زيادة أو نقصان) أو إضافة صنف جديد سيُضاف تلقائياً</p>
        </div>
      ) : (
        <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900/50 text-slate-300">
                <tr>
                  <th className="px-3 py-2.5 text-right">الكود</th>
                  <th className="px-3 py-2.5 text-right">الصنف</th>
                  <th className="px-3 py-2.5 text-right">سعر الجملة</th>
                  <th className="px-3 py-2.5 text-right">سعر التجزئة</th>
                  <th className="px-3 py-2.5 text-center">إزالة</th>
                </tr>
              </thead>
              <tbody>
                {todayItems.map((item) => (
                  <tr key={item.id} className={`border-t border-slate-700 hover:bg-slate-700/30 transition group ${item.is_new ? 'bg-sky-600/5' : ''}`}>
                    <td className="px-3 py-2.5 text-slate-300">{item.code || '-'}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium">{item.product_name}</span>
                        {item.is_new && (
                          <span className="text-sky-400 text-xs bg-sky-600/15 border border-sky-600/30 px-1.5 py-0.5 rounded-full whitespace-nowrap">جديد</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-white font-semibold">{fmtPrice(item.price_wholesale)}</span>
                        {!item.is_new && item.price_wholesale !== item.old_price_wholesale && (
                          <span className={`flex items-center gap-0.5 text-xs ${item.price_wholesale > item.old_price_wholesale ? 'text-emerald-400' : 'text-red-400'}`}>
                            {item.price_wholesale > item.old_price_wholesale ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                            {pctChange(item.old_price_wholesale, item.price_wholesale)}%
                          </span>
                        )}
                        {item.is_new && <span className="text-sky-400 text-xs">سعر جديد</span>}
                      </div>
                      {!item.is_new && item.price_wholesale !== item.old_price_wholesale && (
                        <div className="text-slate-500 text-xs">من {fmtPrice(item.old_price_wholesale)}</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-white font-semibold">{fmtPrice(item.price_retail)}</span>
                        {!item.is_new && item.price_retail !== item.old_price_retail && (
                          <span className={`flex items-center gap-0.5 text-xs ${item.price_retail > item.old_price_retail ? 'text-emerald-400' : 'text-red-400'}`}>
                            {item.price_retail > item.old_price_retail ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                            {pctChange(item.old_price_retail, item.price_retail)}%
                          </span>
                        )}
                        {item.is_new && <span className="text-sky-400 text-xs">سعر جديد</span>}
                      </div>
                      {!item.is_new && item.price_retail !== item.old_price_retail && (
                        <div className="text-slate-500 text-xs">من {fmtPrice(item.old_price_retail)}</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <button
                        onClick={() => removeItem(item.id)}
                        title="إزالة"
                        className="text-red-400 hover:text-red-300 hover:bg-red-600/20 rounded-lg p-1.5 transition opacity-60 group-hover:opacity-100"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="bg-slate-900/50 px-4 py-2.5 border-t border-slate-700 flex items-center justify-between text-sm text-slate-400">
            <span>عدد الأصناف اليوم: {todayItems.length} ({todayItems.filter(i => i.is_new).length} جديد، {todayItems.filter(i => !i.is_new).length} تغيّر سعره)</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> إضافة يدوية</span>
          </div>
        </div>
      )}

      {/* History section */}
      <div className="border border-slate-700 rounded-2xl overflow-hidden bg-slate-800/50">
        <button
          onClick={() => setHistoryOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800 transition"
        >
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-emerald-400" />
            <span className="text-white font-semibold">سجل زيادات الأيام السابقة</span>
          </div>
          {historyOpen ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
        </button>
        {historyOpen && (
          <div className="border-t border-slate-700">
            {historyLoading ? (
              <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-emerald-400" /></div>
            ) : history.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">لا يوجد سجل للأيام السابقة</div>
            ) : (
              <div className="divide-y divide-slate-700">
                {history.map(hd => {
                  const isOpen = expandedDay === hd.id;
                  return (
                    <div key={hd.id}>
                      <button
                        onClick={() => setExpandedDay(isOpen ? null : hd.id)}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800/70 transition"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-slate-300 text-sm">
                            {new Date(hd.day_date + 'T00:00:00').toLocaleDateString('ar-EG', { weekday: 'short', day: 'numeric', month: 'short' })}
                          </span>
                          <span className="text-emerald-400 text-xs bg-emerald-600/10 px-2 py-0.5 rounded-full">{hd.items.length} صنف</span>
                        </div>
                        {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                      </button>
                      {isOpen && (
                        <div className="px-4 pb-3 bg-slate-900/40">
                          <table className="w-full text-sm">
                            <thead className="text-slate-400">
                              <tr>
                                <th className="text-right py-1">الكود</th>
                                <th className="text-right py-1">الصنف</th>
                                <th className="text-right py-1">الجملة</th>
                                <th className="text-right py-1">التجزئة</th>
                              </tr>
                            </thead>
                            <tbody>
                              {hd.items.map((it) => (
                                <tr key={it.id} className="text-slate-200">
                                  <td className="py-1 text-slate-400">{it.code || '-'}</td>
                                  <td className="py-1">
                                    <div className="flex items-center gap-2">
                                      <span>{it.product_name}</span>
                                      {it.is_new && (
                                        <span className="text-sky-400 text-xs bg-sky-600/15 border border-sky-600/30 px-1.5 py-0.5 rounded-full whitespace-nowrap">جديد</span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-1">{fmtPrice(it.price_wholesale)}</td>
                                  <td className="py-1">{fmtPrice(it.price_retail)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Customer Debts (مديونية العملاء) ─────────────────────
type CustomerDebt = {
  id: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  customer_address: string | null;
  account_total: number;
  paid_amount: number;
  remaining: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

// ─── Customers View (قائمة العملاء) ──────────────────────
function CustomersView({ onMsg, customers, onCustomerChange }: {
  onMsg: (m: string) => void;
  customers: Customer[];
  onCustomerChange: () => void;
}) {
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editC, setEditC] = useState<Customer | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Customer | null>(null);
  const [form, setForm] = useState({ code: '', name: '', phone1: '', phone2: '', address: '', notes: '' });
  const [saving, setSaving] = useState(false);
  // قائمة العملاء تأتي من المكوّن الأب (customers) — لا حاجة لجلبها مرة ثانية هنا

  const resetForm = () => { setForm({ code: '', name: '', phone1: '', phone2: '', address: '', notes: '' }); setEditC(null); };
  const openAdd = () => { resetForm(); setShowForm(true); };
  const openEdit = (c: Customer) => {
    setForm({ code: c.code || '', name: c.name, phone1: c.phone1 || '', phone2: c.phone2 || '', address: c.address || '', notes: c.notes || '' });
    setEditC(c); setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { onMsg('الرجاء إدخال اسم العميل'); return; }
    const payload = {
      code: form.code.trim() || null,
      name: form.name.trim(),
      phone1: form.phone1.trim() || null,
      phone2: form.phone2.trim() || null,
      address: form.address.trim() || null,
      notes: form.notes.trim() || null,
    };
    if (saving) return;
    setSaving(true);
    try {
      if (editC) {
        const { error } = await supabase.from('customers').update(payload).eq('id', editC.id);
        if (error) { onMsg(getErrMsg(error)); return; }
        onMsg('تم تعديل العميل ✓');
      } else {
        const { error } = await supabase.from('customers').insert(payload);
        if (error) { onMsg(getErrMsg(error)); return; }
        onMsg('تم إضافة العميل ✓');
      }
    } finally { setSaving(false); }
    setShowForm(false); resetForm(); onCustomerChange();
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const { error } = await supabase.from('customers').delete().eq('id', confirmDelete.id);
    if (error) onMsg(getErrMsg(error));
    else { onMsg('تم حذف العميل ✓'); onCustomerChange(); }
    setConfirmDelete(null);
  };

  const shareWhatsApp = (c: Customer) => {
    const text = encodeURIComponent(`مرحبا ${c.name}`);
    const phone = waPhone(c.phone1);
    const url = phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
    window.open(url, '_blank');
  };

  const sq = normalizeAr(search);
  const filtered = !sq ? customers : customers.filter(c =>
    normalizeAr(c.name).includes(sq) ||
    normalizeAr(c.code || '').includes(sq) ||
    normalizeAr(c.phone1 || '').includes(sq) || normalizeAr(c.phone2 || '').includes(sq)
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--accent-muted)' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو الكود أو الهاتف..."
            className="w-full rounded-xl py-2.5 pr-10 pl-3 text-sm outline-none transition"
            style={{ background: 'color-mix(in srgb, var(--bg) 60%, transparent)', border: '1px solid var(--border)', color: 'var(--accent)' }}
          />
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition hover:brightness-110" style={{ background: 'var(--accent)', color: 'var(--bg)' }}>
          <UserPlus className="w-4 h-4" />
          إضافة عميل
        </button>
      </div>

      <div className="text-sm" style={{ color: 'var(--accent-muted)' }}>عدد العملاء: {filtered.length.toLocaleString('ar-EG')}</div>

      {filtered.length === 0 ? (
        <div className="text-center py-12" style={{ color: 'var(--accent-muted)' }}>
          <Contact className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-sm">لا يوجد عملاء{search ? ' مطابقين للبحث' : ''}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: 'var(--border)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'color-mix(in srgb, var(--accent) 10%, transparent)' }}>
                <th className="text-right px-3 py-3 font-bold" style={{ color: 'var(--accent)' }}>الكود</th>
                <th className="text-right px-3 py-3 font-bold" style={{ color: 'var(--accent)' }}>الاسم</th>
                <th className="text-right px-3 py-3 font-bold" style={{ color: 'var(--accent)' }}>هاتف 1</th>
                <th className="text-right px-3 py-3 font-bold" style={{ color: 'var(--accent)' }}>هاتف 2</th>
                <th className="text-right px-3 py-3 font-bold" style={{ color: 'var(--accent)' }}>العنوان</th>
                <th className="text-center px-3 py-3 font-bold" style={{ color: 'var(--accent)' }}>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => (
                <tr key={c.id} style={{ background: i % 2 === 0 ? 'color-mix(in srgb, var(--bg) 40%, transparent)' : 'transparent', borderBottom: '1px solid color-mix(in srgb, var(--border) 30%, transparent)' }}>
                  <td className="px-3 py-3" style={{ color: 'var(--accent-muted)' }}>{c.code || '-'}</td>
                  <td className="px-3 py-3">
                    <div className="font-semibold" style={{ color: 'var(--accent)' }}>{c.name}</div>
                    {c.notes && <div className="text-xs mt-0.5" style={{ color: 'var(--accent-muted)' }}>{c.notes}</div>}
                  </td>
                  <td className="px-3 py-3" style={{ color: 'var(--accent-light)' }}>{c.phone1 || '-'}</td>
                  <td className="px-3 py-3" style={{ color: 'var(--accent-light)' }}>{c.phone2 || '-'}</td>
                  <td className="px-3 py-3" style={{ color: 'var(--accent-light)' }}>{c.address || '-'}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-center gap-1.5">
                      <button onClick={() => shareWhatsApp(c)} title="مشاركة عبر واتساب" className="p-2 rounded-lg transition hover:brightness-110" style={{ background: 'rgba(37, 211, 102, 0.15)', border: '1px solid rgba(37, 211, 102, 0.3)', color: '#25d366' }}>
                        <MessageCircle className="w-4 h-4" />
                      </button>
                      <button onClick={() => openEdit(c)} title="تعديل" className="p-2 rounded-lg transition" style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)', color: 'var(--accent)' }}>
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => setConfirmDelete(c)} title="حذف" className="p-2 rounded-lg transition" style={{ background: 'color-mix(in srgb, var(--danger) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--danger) 25%, transparent)', color: 'var(--danger)' }}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60" onClick={() => { setShowForm(false); resetForm(); }} />
          <div className="relative w-full max-w-md rounded-2xl p-6 shadow-2xl" style={{ background: 'var(--bg-light)', border: '1px solid var(--accent)' }}>
            <h3 className="text-lg font-bold mb-4" style={{ color: 'var(--accent)' }}>{editC ? 'تعديل عميل' : 'إضافة عميل'}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs block mb-1" style={{ color: 'var(--accent-muted)' }}>كود العميل</label>
                <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ background: 'color-mix(in srgb, var(--bg) 60%, transparent)', border: '1px solid var(--border)', color: 'var(--accent)' }} />
              </div>
              <div>
                <label className="text-xs block mb-1" style={{ color: 'var(--accent-muted)' }}>اسم العميل *</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ background: 'color-mix(in srgb, var(--bg) 60%, transparent)', border: '1px solid var(--border)', color: 'var(--accent)' }} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs block mb-1" style={{ color: 'var(--accent-muted)' }}>رقم الهاتف الأول</label>
                  <input value={form.phone1} onChange={(e) => setForm({ ...form, phone1: e.target.value })} placeholder="01xxxxxxxxx" className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ background: 'color-mix(in srgb, var(--bg) 60%, transparent)', border: '1px solid var(--border)', color: 'var(--accent)' }} />
                </div>
                <div>
                  <label className="text-xs block mb-1" style={{ color: 'var(--accent-muted)' }}>رقم الهاتف الثاني</label>
                  <input value={form.phone2} onChange={(e) => setForm({ ...form, phone2: e.target.value })} placeholder="01xxxxxxxxx" className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ background: 'color-mix(in srgb, var(--bg) 60%, transparent)', border: '1px solid var(--border)', color: 'var(--accent)' }} />
                </div>
              </div>
              <div>
                <label className="text-xs block mb-1" style={{ color: 'var(--accent-muted)' }}>العنوان</label>
                <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ background: 'color-mix(in srgb, var(--bg) 60%, transparent)', border: '1px solid var(--border)', color: 'var(--accent)' }} />
              </div>
              <div>
                <label className="text-xs block mb-1" style={{ color: 'var(--accent-muted)' }}>ملاحظات</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none" style={{ background: 'color-mix(in srgb, var(--bg) 60%, transparent)', border: '1px solid var(--border)', color: 'var(--accent)' }} />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => { setShowForm(false); resetForm(); }} className="flex-1 py-2.5 rounded-xl font-medium transition" style={{ background: 'color-mix(in srgb, var(--accent) 10%, transparent)', border: '1px solid var(--border)', color: 'var(--accent)' }}>إلغاء</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 rounded-xl font-bold transition hover:brightness-110 disabled:opacity-50" style={{ background: 'var(--accent)', color: 'var(--bg)' }}>حفظ</button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <ConfirmModal title="حذف العميل" message={`هل تريد حذف "${confirmDelete.name}"؟`} onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)} />
      )}
    </div>
  );
}

function DebtsView({ onMsg, customers }: { onMsg: (m: string) => void; customers: Customer[] }) {
  const [debts, setDebts] = useState<CustomerDebt[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editDebt, setEditDebt] = useState<CustomerDebt | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CustomerDebt | null>(null);
  const [custSearch, setCustSearch] = useState('');
  const [showCustSuggestions, setShowCustSuggestions] = useState(false);
  const [form, setForm] = useState({
    customer_id: '' as string | null,
    customer_name: '',
    customer_phone: '',
    customer_address: '',
    account_total: '',
    paid_amount: '',
    notes: '',
  });
  const cq = normalizeAr(custSearch);
  const custSuggestions = customers.filter(c =>
    normalizeAr(c.code || '').includes(cq) ||
    normalizeAr(c.name).includes(cq) ||
    (c.phone1 || '').includes(custSearch.trim())
  ).slice(0, 8);
  const pickCustomer = (c: Customer) => {
    setForm({ ...form, customer_id: c.id, customer_name: c.name, customer_phone: c.phone1 || '', customer_address: c.address || '' });
    setCustSearch(c.code || c.name);
    setShowCustSuggestions(false);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('customer_debts')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      onMsg(getErrMsg(error));
      setLoading(false);
      return;
    }
    setDebts((data || []) as CustomerDebt[]);
    setLoading(false);
  }, [onMsg]);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setForm({ customer_id: null, customer_name: '', customer_phone: '', customer_address: '', account_total: '', paid_amount: '', notes: '' });
    setEditDebt(null);
    setCustSearch('');
    setShowCustSuggestions(false);
  };

  const openAdd = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (d: CustomerDebt) => {
    setForm({
      customer_id: d.customer_id || null,
      customer_name: d.customer_name,
      customer_phone: d.customer_phone || '',
      customer_address: d.customer_address || '',
      account_total: String(d.account_total),
      paid_amount: String(d.paid_amount),
      notes: d.notes || '',
    });
    setCustSearch(d.customer_name);
    setEditDebt(d);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.customer_name.trim()) {
      onMsg('الرجاء إدخال اسم العميل');
      return;
    }
    const payload = {
      customer_id: form.customer_id || null,
      customer_name: form.customer_name.trim(),
      customer_phone: form.customer_phone.trim() || null,
      customer_address: form.customer_address.trim() || null,
      account_total: Math.max(0, Number(form.account_total) || 0),
      paid_amount: Math.max(0, Number(form.paid_amount) || 0),
      notes: form.notes.trim() || null,
    };
    if (editDebt) {
      const { error } = await supabase.from('customer_debts').update(payload).eq('id', editDebt.id);
      if (error) { onMsg(getErrMsg(error)); return; }
      onMsg('تم تعديل حساب العميل ✓');
    } else {
      const { error } = await supabase.from('customer_debts').insert(payload);
      if (error) { onMsg(getErrMsg(error)); return; }
      onMsg('تم إضافة حساب العميل ✓');
    }
    setShowForm(false);
    resetForm();
    await load();
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const { error } = await supabase.from('customer_debts').delete().eq('id', confirmDelete.id);
    if (error) onMsg(getErrMsg(error));
    else { onMsg('تم حذف حساب العميل ✓'); await load(); }
    setConfirmDelete(null);
  };

  const shareWhatsApp = (d: CustomerDebt) => {
    const lines: string[] = [];
    lines.push(`*حساب العميل*`);
    lines.push(`الاسم: ${d.customer_name}`);
    lines.push(`الحساب الإجمالي: ${Number(d.account_total).toLocaleString('ar-EG')} ج.م`);
    lines.push(`المدفوع: ${Number(d.paid_amount).toLocaleString('ar-EG')} ج.م`);
    lines.push(`الباقي: ${Number(d.remaining).toLocaleString('ar-EG')} ج.م`);
    if (d.notes) lines.push(`ملاحظات: ${d.notes}`);
    lines.push(`التاريخ: ${new Date(d.created_at).toLocaleDateString('ar-EG')}`);
    const text = encodeURIComponent(lines.join('\n'));
    const phone = waPhone(d.customer_phone);
    const url = phone
      ? `https://wa.me/${phone}?text=${text}`
      : `https://wa.me/?text=${text}`;
    window.open(url, '_blank');
  };

  const dq = normalizeAr(search);
  const filtered = !dq ? debts : debts.filter(d =>
    normalizeAr(d.customer_name).includes(dq) ||
    (d.customer_phone || '').includes(search.trim())
  );

  const totalAccount = debts.reduce((s, d) => s + Number(d.account_total), 0);
  const totalPaid = debts.reduce((s, d) => s + Number(d.paid_amount), 0);
  const totalRemaining = debts.reduce((s, d) => s + Number(d.remaining), 0);

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl p-4 border" style={{ background: 'color-mix(in srgb, var(--accent) 8%, transparent)', borderColor: 'color-mix(in srgb, var(--accent) 25%, transparent)' }}>
          <div className="text-xs mb-1" style={{ color: 'var(--accent-muted)' }}>إجمالي الحسابات</div>
          <div className="text-xl font-bold" style={{ color: 'var(--accent)' }}>{totalAccount.toLocaleString('ar-EG')} ج.م</div>
        </div>
        <div className="rounded-2xl p-4 border" style={{ background: 'color-mix(in srgb, var(--success) 8%, transparent)', borderColor: 'color-mix(in srgb, var(--success) 25%, transparent)' }}>
          <div className="text-xs mb-1" style={{ color: 'var(--success)' }}>إجمالي المدفوع</div>
          <div className="text-xl font-bold" style={{ color: 'var(--success)' }}>{totalPaid.toLocaleString('ar-EG')} ج.م</div>
        </div>
        <div className="rounded-2xl p-4 border" style={{ background: 'color-mix(in srgb, var(--danger) 8%, transparent)', borderColor: 'color-mix(in srgb, var(--danger) 25%, transparent)' }}>
          <div className="text-xs mb-1" style={{ color: 'var(--danger)' }}>إجمالي المتبقي</div>
          <div className="text-xl font-bold" style={{ color: 'var(--danger)' }}>{totalRemaining.toLocaleString('ar-EG')} ج.م</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--accent-muted)' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو رقم الهاتف..."
            className="w-full rounded-xl py-2.5 pr-10 pl-3 text-sm outline-none transition"
            style={{ background: 'color-mix(in srgb, var(--bg) 60%, transparent)', border: '1px solid var(--border)', color: 'var(--accent)' }}
          />
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition hover:brightness-110"
          style={{ background: 'var(--accent)', color: 'var(--bg)' }}
        >
          <PlusCircle className="w-4 h-4" />
          إضافة عميل
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12">
          <Loader2 className="w-6 h-6 animate-spin mx-auto" style={{ color: 'var(--accent)' }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12" style={{ color: 'var(--accent-muted)' }}>
          <Users className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-sm">لا توجد حسابات عملاء{search ? ' مطابقة للبحث' : ''}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: 'var(--border)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'color-mix(in srgb, var(--accent) 10%, transparent)' }}>
                <th className="text-right px-3 py-3 font-bold" style={{ color: 'var(--accent)' }}>اسم العميل</th>
                <th className="text-right px-3 py-3 font-bold" style={{ color: 'var(--accent)' }}>كود العميل</th>
                <th className="text-right px-3 py-3 font-bold" style={{ color: 'var(--accent)' }}>حساب العميل</th>
                <th className="text-right px-3 py-3 font-bold" style={{ color: 'var(--accent)' }}>المدفوع</th>
                <th className="text-right px-3 py-3 font-bold" style={{ color: 'var(--accent)' }}>الباقي</th>
                <th className="text-right px-3 py-3 font-bold" style={{ color: 'var(--accent)' }}>التاريخ</th>
                <th className="text-center px-3 py-3 font-bold" style={{ color: 'var(--accent)' }}>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d, i) => (
                <tr
                  key={d.id}
                  className="transition hover:bg-opacity-50"
                  style={{ background: i % 2 === 0 ? 'color-mix(in srgb, var(--bg) 40%, transparent)' : 'transparent', borderBottom: '1px solid color-mix(in srgb, var(--border) 30%, transparent)' }}
                >
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5">
                      <div className="font-semibold" style={{ color: 'var(--accent)' }}>{d.customer_name}</div>
                      {d.customer_id && <Link className="w-3 h-3" style={{ color: 'var(--success)' }} />}
                    </div>
                    {d.customer_phone && (
                      <div className="text-xs flex items-center gap-1 mt-0.5" style={{ color: 'var(--accent-muted)' }}>
                        <Phone className="w-3 h-3" />
                        {d.customer_phone}
                      </div>
                    )}
                    {d.customer_address && (
                      <div className="text-xs mt-0.5" style={{ color: 'var(--accent-muted)' }}>{d.customer_address}</div>
                    )}
                  </td>
                  <td className="px-3 py-3" style={{ color: 'var(--accent-muted)' }}>
                    {(() => { const c = customers.find(c => c.id === d.customer_id); return c?.code || '-'; })()}
                  </td>
                  <td className="px-3 py-3" style={{ color: 'var(--accent-light)' }}>{Number(d.account_total).toLocaleString('ar-EG')} ج.م</td>
                  <td className="px-3 py-3" style={{ color: 'var(--success)' }}>{Number(d.paid_amount).toLocaleString('ar-EG')} ج.م</td>
                  <td className="px-3 py-3">
                    <span className="font-bold" style={{ color: Number(d.remaining) > 0 ? 'var(--danger)' : 'var(--success)' }}>
                      {Number(d.remaining).toLocaleString('ar-EG')} ج.م
                    </span>
                  </td>
                  <td className="px-3 py-3 text-xs" style={{ color: 'var(--accent-muted)' }}>
                    {new Date(d.created_at).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => shareWhatsApp(d)}
                        title="مشاركة عبر واتساب"
                        className="p-2 rounded-lg transition hover:brightness-110"
                        style={{ background: 'rgba(37, 211, 102, 0.15)', border: '1px solid rgba(37, 211, 102, 0.3)', color: '#25d366' }}
                      >
                        <MessageCircle className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openEdit(d)}
                        title="تعديل"
                        className="p-2 rounded-lg transition"
                        style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)', color: 'var(--accent)' }}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(d)}
                        title="حذف"
                        className="p-2 rounded-lg transition"
                        style={{ background: 'color-mix(in srgb, var(--danger) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--danger) 25%, transparent)', color: 'var(--danger)' }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60" onClick={() => { setShowForm(false); resetForm(); }} />
          <div className="relative w-full max-w-md rounded-2xl p-6 shadow-2xl" style={{ background: 'var(--bg-light)', border: '1px solid var(--accent)' }}>
            <h3 className="text-lg font-bold mb-4" style={{ color: 'var(--accent)' }}>
              {editDebt ? 'تعديل حساب العميل' : 'إضافة حساب عميل'}
            </h3>
            <div className="space-y-3">
              {customers.length > 0 && (
                <div className="relative">
                  <label className="text-xs block mb-1" style={{ color: 'var(--accent-muted)' }}>بحث عن عميل بالكود أو الاسم</label>
                  <div className="relative">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--accent-muted)' }} />
                    <input
                      value={custSearch}
                      onChange={(e) => {
                        setCustSearch(e.target.value);
                        setForm({ ...form, customer_id: null, customer_name: e.target.value });
                        if (e.target.value.trim().length >= 1) setShowCustSuggestions(true);
                        else setShowCustSuggestions(false);
                      }}
                      onFocus={() => { if (custSuggestions.length > 0) setShowCustSuggestions(true); }}
                      onBlur={() => setTimeout(() => setShowCustSuggestions(false), 200)}
                      placeholder="اكتب كود العميل أو اسمه..."
                      className="w-full rounded-lg px-3 py-2 pr-10 text-sm outline-none"
                      style={{ background: 'color-mix(in srgb, var(--bg) 60%, transparent)', border: '1px solid var(--border)', color: 'var(--accent)' }}
                    />
                  </div>
                  {showCustSuggestions && custSuggestions.length > 0 && (
                    <div className="absolute z-50 top-full right-0 left-0 mt-1 rounded-lg shadow-2xl max-h-56 overflow-y-auto" style={{ background: 'var(--bg-light)', border: '2px solid var(--accent)' }}>
                      {custSuggestions.map(c => (
                        <button key={c.id} type="button" onMouseDown={(e) => { e.preventDefault(); pickCustomer(c); }} className="w-full text-right px-3 py-2.5 border-b last:border-0 transition hover:brightness-95" style={{ borderColor: 'var(--border)', color: 'var(--accent)', background: 'var(--bg-light)' }}>
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{c.name}</span>
                            {c.code && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)' }}>{c.code}</span>}
                          </div>
                          {c.phone1 && <span className="text-xs block mt-0.5" style={{ color: 'var(--accent-muted)' }}>{c.phone1}</span>}
                          {c.address && <span className="text-xs block" style={{ color: 'var(--accent-muted)' }}>{c.address}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  {form.customer_id && (
                    <div className="mt-1.5 flex items-center gap-1.5 text-xs" style={{ color: 'var(--success)' }}>
                      <Link className="w-3 h-3" />
                      <span>مرتبط بعميل من القائمة</span>
                      <button type="button" onClick={() => { setForm({ ...form, customer_id: null }); }} className="underline" style={{ color: 'var(--danger)' }}>إلغاء الربط</button>
                    </div>
                  )}
                </div>
              )}
              <div>
                <label className="text-xs block mb-1" style={{ color: 'var(--accent-muted)' }}>اسم العميل *</label>
                <input
                  value={form.customer_name}
                  onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ background: 'color-mix(in srgb, var(--bg) 60%, transparent)', border: '1px solid var(--border)', color: 'var(--accent)' }}
                />
              </div>
              <div>
                <label className="text-xs block mb-1" style={{ color: 'var(--accent-muted)' }}>رقم الهاتف (واتساب)</label>
                <input
                  value={form.customer_phone}
                  onChange={(e) => setForm({ ...form, customer_phone: e.target.value })}
                  placeholder="01xxxxxxxxx"
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ background: 'color-mix(in srgb, var(--bg) 60%, transparent)', border: '1px solid var(--border)', color: 'var(--accent)' }}
                />
              </div>
              <div>
                <label className="text-xs block mb-1" style={{ color: 'var(--accent-muted)' }}>العنوان</label>
                <input
                  value={form.customer_address}
                  onChange={(e) => setForm({ ...form, customer_address: e.target.value })}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ background: 'color-mix(in srgb, var(--bg) 60%, transparent)', border: '1px solid var(--border)', color: 'var(--accent)' }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs block mb-1" style={{ color: 'var(--accent-muted)' }}>حساب العميل (ج.م)</label>
                  <input
                    type="number"
                    value={form.account_total}
                    onChange={(e) => setForm({ ...form, account_total: e.target.value })}
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                    style={{ background: 'color-mix(in srgb, var(--bg) 60%, transparent)', border: '1px solid var(--border)', color: 'var(--accent)' }}
                  />
                </div>
                <div>
                  <label className="text-xs block mb-1" style={{ color: 'var(--accent-muted)' }}>المدفوع (ج.م)</label>
                  <input
                    type="number"
                    value={form.paid_amount}
                    onChange={(e) => setForm({ ...form, paid_amount: e.target.value })}
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                    style={{ background: 'color-mix(in srgb, var(--bg) 60%, transparent)', border: '1px solid var(--border)', color: 'var(--accent)' }}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs block mb-1" style={{ color: 'var(--accent-muted)' }}>ملاحظات</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
                  style={{ background: 'color-mix(in srgb, var(--bg) 60%, transparent)', border: '1px solid var(--border)', color: 'var(--accent)' }}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={handleSave}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm transition hover:brightness-110"
                style={{ background: 'var(--accent)', color: 'var(--bg)' }}
              >
                {editDebt ? 'حفظ التعديل' : 'إضافة'}
              </button>
              <button
                onClick={() => { setShowForm(false); resetForm(); }}
                className="px-4 py-2.5 rounded-xl text-sm transition"
                style={{ background: 'color-mix(in srgb, var(--bg) 60%, transparent)', border: '1px solid var(--border)', color: 'var(--accent)' }}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60" onClick={() => setConfirmDelete(null)} />
          <div className="relative w-full max-w-sm rounded-2xl p-6 shadow-2xl" style={{ background: 'var(--bg-light)', border: '1px solid var(--accent)' }}>
            <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--accent)' }}>حذف حساب العميل</h3>
            <p className="text-sm mb-5" style={{ color: 'var(--accent-light)' }}>هل تريد حذف حساب "{confirmDelete.customer_name}"؟</p>
            <div className="flex gap-2">
              <button
                onClick={handleDelete}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm transition"
                style={{ background: 'var(--danger)', color: '#fff' }}
              >
                حذف
              </button>
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2.5 rounded-xl text-sm transition"
                style={{ background: 'color-mix(in srgb, var(--bg) 60%, transparent)', border: '1px solid var(--border)', color: 'var(--accent)' }}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────
type Tab = 'items' | 'search' | 'invoices' | 'shortages' | 'pricechanges' | 'cashcounter' | 'customers' | 'debts' | 'assistant' | 'settings' | 'newinvoice';
export default function App() {
  const [tab, setTab] = useState<Tab>('items');
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importMode, setImportMode] = useState<'add' | 'upsert'>('upsert');
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Product | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmClearCustomers, setConfirmClearCustomers] = useState(false);
  const [msg, setMsg] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [entered, setEntered] = useState(true);
  const [theme, setTheme] = useState<'olive' | 'ocean' | 'forest' | 'sunset' | 'midnight' | 'rose' | 'day' | 'night'>(() => {
    return (localStorage.getItem('app_theme') as any) || 'ocean';
  });
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('theme-ocean', 'theme-forest', 'theme-sunset', 'theme-midnight', 'theme-rose', 'theme-day', 'theme-night');
    if (theme !== 'olive') root.classList.add(`theme-${theme}`);
    localStorage.setItem('app_theme', theme);
  }, [theme]);

  const msgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showMsg = useCallback((m: string) => {
    setMsg(m);
    if (msgTimer.current) clearTimeout(msgTimer.current); // لا يمسح مؤقتٌ قديم رسالةً أحدث
    msgTimer.current = setTimeout(() => setMsg(''), 5000);
  }, []);
  useEffect(() => () => { if (msgTimer.current) clearTimeout(msgTimer.current); }, []);

  // يرجع null عند الفشل (وليس [] حتى لا تُعامل كقائمة أصناف فارغة)
  const loadProducts = useCallback(async (opts?: { silent?: boolean }): Promise<Product[] | null> => {
    const silent = opts?.silent === true;
    if (!silent) setLoading(true);
    const all: Product[] = [];
    const pageSize = 1000;
    let page = 0;
    while (true) {
      const { data, error } = await supabase.from('products').select('*')
        .order('name').range(page * pageSize, (page + 1) * pageSize - 1);
      if (error) {
        if (!silent) showMsg(getErrMsg(error));
        setLoading(false);
        return null;
      }
      if (!data || data.length === 0) break;
      all.push(...(data as Product[]));
      if (data.length < pageSize) break;
      page++;
    }
    setProducts(all);
    setLoading(false);
    return all;
  }, [showMsg]);

  const loadCustomers = useCallback(async (): Promise<Customer[]> => {
    const { data, error } = await supabase.from('customers').select('*').order('created_at', { ascending: false });
    if (error) { showMsg(getErrMsg(error)); return []; }
    const list = (data || []) as Customer[];
    setCustomers(list);
    return list;
  }, [showMsg]);

  const [todayChanges, setTodayChanges] = useState<PriceChangeItem[]>([]);

  const loadTodayChanges = useCallback(async (): Promise<PriceChangeItem[]> => {
    try {
      const todayStr = localDateStr();
      const dId = await getOrCreateByDate('price_change_days', 'day_date', todayStr);
      if (!dId) return [];
      const { data, error } = await supabase
        .from('price_change_items')
        .select('id, day_id, product_id, product_name, code, price_wholesale, price_retail, old_price_wholesale, old_price_retail, is_new, created_at')
        .eq('day_id', dId)
        .order('created_at', { ascending: true });
      if (error) {
        console.warn('loadTodayChanges error', error);
        return [];
      }
      const list = (data || []) as PriceChangeItem[];
      setTodayChanges(list);
      return list;
    } catch (e) {
      console.warn('loadTodayChanges catch', e);
      return [];
    }
  }, []);

  // Online/offline detection
  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      showMsg('عاد الاتصال بالإنترنت — جارٍ تحديث البيانات...');
      loadProducts();
      loadCustomers();
      loadTodayChanges();
    };
    const onOffline = () => {
      setOnline(false);
      showMsg('تم فقد الاتصال بالإنترنت — ستعود المزامنة تلقائياً عند عودة الاتصال');
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [loadProducts, loadCustomers, loadTodayChanges, showMsg]);

  useEffect(() => {
    loadProducts();
    loadCustomers();
    loadTodayChanges();
  }, [loadProducts, loadCustomers, loadTodayChanges]);

  // Auto-refresh every 90s when online
  useEffect(() => {
    const id = setInterval(() => { if (navigator.onLine && !document.hidden) loadProducts({ silent: true }); }, 90000);
    return () => clearInterval(id);
  }, [loadProducts]);

  const handleSaveProduct = async (p: Omit<Product, 'id' | 'created_at' | 'updated_at'>) => {
    // Capture old prices BEFORE the edit (فشل اللقطة لا يمنع الحفظ، فقط يتخطى رصد التغيّر)
    let beforeMap: Map<string, { pw: number; pr: number }> | null = null;
    try { beforeMap = await capturePriceSnapshot(); } catch { beforeMap = null; }
    if (editProduct) {
      const { error } = await supabase.from('products').update(p).eq('id', editProduct.id);
      if (error) throw error;
      showMsg('تم تعديل الصنف ✓');
    } else {
      const { error } = await supabase.from('products').insert(p);
      if (error) throw error;
      showMsg('تم إضافة الصنف ✓');
    }
    const fresh = await loadProducts();
    // Auto-detect price changes after edit/add
    if (fresh && beforeMap) detectAndRecordPriceChanges(fresh, beforeMap).catch(e => showMsg('تعذّر تسجيل تغيّر السعر: ' + getErrMsg(e)));
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const { error } = await supabase.from('products').delete().eq('id', confirmDelete.id);
    if (error) showMsg(getErrMsg(error));
    else { showMsg('تم حذف الصنف ✓'); await loadProducts(); }
    setConfirmDelete(null);
  };

  const handleClearAll = async () => {
    setConfirmClear(false);
    try {
      const { error } = await supabase.from('products').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) showMsg(getErrMsg(error));
      else { showMsg('تم حذف جميع الأصناف ✓'); await loadProducts(); }
    } finally {}
  };

  const handleClearAllCustomers = async () => {
    setConfirmClearCustomers(false);
    try {
      const { error } = await supabase.from('customers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) showMsg(getErrMsg(error));
      else { showMsg('تم حذف جميع العملاء ✓'); await loadCustomers(); }
    } finally {}
  };

  const handleMergeDuplicates = async () => {
    try {
      // Group products by normalized code (priority) or name; keep the one with a code (or newest) as canonical
      const groups = new Map<string, Product[]>();
      for (const p of products) {
        const k = (p.code && p.code.trim()) ? normalizeAr(p.code.trim()) : normalizeAr(p.name);
        const arr = groups.get(k) ?? [];
        arr.push(p);
        groups.set(k, arr);
      }
      let mergedCount = 0;
      for (const [, arr] of groups) {
        if (arr.length < 2) continue;
        // Pick canonical: prefer one with code, then most recently created (last in array)
        const canonical = [...arr].sort((a, b) => {
          if (!!a.code !== !!b.code) return a.code ? -1 : 1;
          return (b.created_at || '').localeCompare(a.created_at || '');
        })[0];
        const dupes = arr.filter(p => p.id !== canonical.id);
        // Update canonical with code/price from the newest duplicate if canonical lacks them
        const newest = dupes.reduce((n, p) => (p.created_at || '') > (n.created_at || '') ? p : n, dupes[0]);
        const patch: Record<string, unknown> = {};
        if (!canonical.code && newest?.code) patch.code = newest.code;
        if (!canonical.price_wholesale && newest?.price_wholesale) patch.price_wholesale = newest.price_wholesale;
        if (!canonical.price && newest?.price) patch.price = newest.price;
        if (Object.keys(patch).length) {
          await supabase.from('products').update(patch).eq('id', canonical.id);
        }
        // Re-point sale_items, shortage_items, price_change_items, price_snapshots to canonical
        const dupIds = dupes.map(d => d.id);
        for (const table of ['sale_items', 'shortage_items', 'price_change_items', 'price_snapshots']) {
          for (const did of dupIds) {
            await supabase.from(table).update({ product_id: canonical.id }).eq('product_id', did);
          }
        }
        // Delete the duplicate products
        const { error } = await supabase.from('products').delete().in('id', dupIds);
        if (error) { showMsg(getErrMsg(error)); return; }
        mergedCount += dupes.length;
      }
      await loadProducts();
      showMsg(mergedCount > 0 ? `تم دمج ${mergedCount.toLocaleString('ar-EG')} صنف مكرّر ✓` : 'لا توجد أصناف مكرّرة');
    } catch (e) {
      showMsg(getErrMsg(e));
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const preview: ImportPreview = await parseExcelFile(file);
      if (preview.rows.length === 0) {
        showMsg(preview.warnings.join(' — ') || 'لم يتم العثور على أصناف في الملف');
        setLoading(false);
        return;
      }
      // Show preview modal so user can verify detected columns before importing
      setImportPreview(preview);
      setLoading(false);
    } catch (e) {
      showMsg(getErrMsg(e));
      setLoading(false);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const executeImport = async () => {
    if (!importPreview) return;
    const preview = importPreview;
    setImportPreview(null);
    setLoading(true);
    try {
      // Capture old prices BEFORE the import (فشل اللقطة لا يمنع الاستيراد)
      let beforeMap: Map<string, { pw: number; pr: number }> | null = null;
      try { beforeMap = await capturePriceSnapshot(); } catch { beforeMap = null; }
      const importWarnings = preview.warnings.length > 0 ? preview.warnings.join(' — ') : '';
      const BATCH = 500;
      if (importMode === 'upsert') {
        const { byCode } = await fetchAllExistingProducts();
        const toUpdate: Array<Record<string, unknown>> = [];
        const toInsert: Array<Record<string, unknown>> = [];
        const insertedIds: string[] = [];
        const seenCodes = new Set<string>();
        const usedIds = new Set<string>();
        let skippedRows = 0;
        // الأعمدة الموجودة فعلاً في الملف: غير الموجودة لا تُصفَّر في الأصناف القائمة
        const has = (f: string) => f in preview.foundColumns;
        for (const r of preview.rows) {
          const codeKey = r.code && r.code.trim() ? normalizeAr(r.code.trim()) : '';

          // صف مكرر داخل الملف بالكود → يُتجاوز
          if (codeKey && seenCodes.has(codeKey)) { skippedRows++; continue; }
          if (codeKey) seenCodes.add(codeKey);

          // المطابقة بناءً على كود الصنف حصراً
          const ex = codeKey ? byCode.get(codeKey) : undefined;
          if (ex) {
            if (usedIds.has(ex.id)) { skippedRows++; continue; } // نفس الصنف القائم لا يُحدَّث مرتين في نفس الدفعة
            usedIds.add(ex.id);
            toUpdate.push({
              id: ex.id,
              code: ex.code || r.code,
              name: r.name || ex.name,
              unit: ex.unit || r.unit, // الحفاظ على الوحدة القائمة
              barcode: ex.barcode || r.barcode,
              // تحديث الأسعار فقط
              price: has('price') ? r.price : ex.price,
              price_wholesale: has('price_wholesale') ? r.price_wholesale : ex.price_wholesale,
              cost: has('cost') ? r.cost : ex.cost,
              // الحفاظ التام على رصيد المخزون القائم
              stock: ex.stock,
              category: r.category ?? ex.category,
            });
          } else {
            // صنف جديد يُضاف للنظام
            toInsert.push({
              code: r.code || null,
              name: r.name,
              unit: r.unit || 'قطعة',
              barcode: r.barcode || null,
              price: r.price || 0,
              price_wholesale: r.price_wholesale || 0,
              cost: r.cost || 0,
              stock: r.stock || 0,
              category: r.category || null,
            });
          }
        }
        const isUniqueViolation = (error: unknown): boolean => {
          if (!error || typeof error !== 'object') return false;
          const candidate = error as { code?: string; message?: string; details?: string };
          const text = `${candidate.code ?? ''} ${candidate.message ?? ''} ${candidate.details ?? ''}`.toLowerCase();
          return candidate.code === '23505' || text.includes('unique') || text.includes('duplicate');
        };
        let handledDuplicates = 0;
        for (let i = 0; i < toUpdate.length; i += BATCH) {
          const batch = toUpdate.slice(i, i + BATCH);
          const { error } = await supabase.from('products').upsert(batch, { onConflict: 'id' });
          if (!error) continue;
          if (!isUniqueViolation(error)) throw error;
          for (const row of batch) {
            const { error: rowError } = await supabase.from('products').upsert(row, { onConflict: 'id' });
            if (rowError && !isUniqueViolation(rowError)) throw rowError;
            if (rowError) handledDuplicates++;
          }
        }
        for (let i = 0; i < toInsert.length; i += BATCH) {
          const batch = toInsert.slice(i, i + BATCH);
          const { data: insertedData, error } = await supabase.from('products').insert(batch).select('id');
          if (!error) {
            if (insertedData) insertedIds.push(...(insertedData as { id: string }[]).map(d => d.id));
            continue;
          }
          if (!isUniqueViolation(error)) throw error;
          for (const row of batch) {
            const { data: ins, error: rowError } = await supabase.from('products').insert(row).select('id');
            if (ins) insertedIds.push(...(ins as { id: string }[]).map(d => d.id));
            if (!rowError) continue;
            if (!isUniqueViolation(rowError)) throw rowError;
            handledDuplicates++;
          }
        }
        const dupTotal = handledDuplicates + skippedRows;
        const duplicateMsg = dupTotal > 0 ? ` (تم تجاوز/معالجة ${dupTotal.toLocaleString('ar-EG')} صف مكرر)` : '';
        const summaryMsg = `تم استرداد الأصناف بناءً على الكود بنجاح ✓ تم تحديث أسعار ${toUpdate.length.toLocaleString('ar-EG')} صنف، وإضافة ${insertedIds.length.toLocaleString('ar-EG')} صنف جديد${duplicateMsg}${importWarnings ? ' — ' + importWarnings : ''}`;
        showMsg(summaryMsg);
      } else {
        const addInsertedIds: string[] = [];
        let skippedDuplicates = 0;
        const seenNames = new Set<string>();
        const rowsToAdd: Array<Record<string, unknown>> = [];
        for (const r of preview.rows) {
          const nameKey = normalizeAr(r.name);
          if (seenNames.has(nameKey)) { skippedDuplicates++; continue; }
          seenNames.add(nameKey);
          rowsToAdd.push({
            code: r.code, name: r.name, unit: r.unit, barcode: r.barcode,
            price: r.price, price_wholesale: r.price_wholesale, cost: r.cost,
            stock: r.stock, category: r.category,
          });
        }
        const isDup = (error: unknown) => {
          const m = getErrMsg(error).toLowerCase();
          return m.includes('unique') || m.includes('duplicate') || m.includes('23505');
        };
        // إدراج دفعات (500) بدل صف واحد لكل طلب؛ وعند تعارض الدفعة نرجع للإدراج صفاً صفاً
        for (let i = 0; i < rowsToAdd.length; i += BATCH) {
          const batch = rowsToAdd.slice(i, i + BATCH);
          const { data: ins, error } = await supabase.from('products').insert(batch).select('id');
          if (!error) { if (ins) addInsertedIds.push(...(ins as { id: string }[]).map(d => d.id)); continue; }
          if (!isDup(error)) throw error;
          for (const row of batch) {
            const { data: one, error: rowErr } = await supabase.from('products').insert(row).select('id');
            if (!rowErr) { if (one) addInsertedIds.push(...(one as { id: string }[]).map(d => d.id)); continue; }
            if (isDup(rowErr)) { skippedDuplicates++; continue; }
            throw rowErr;
          }
        }
        const duplicateMsg = skippedDuplicates > 0 ? ` — تم تجاوز ${skippedDuplicates.toLocaleString('ar-EG')} صف مكرر` : '';
        showMsg(`تم إضافة ${addInsertedIds.length.toLocaleString('ar-EG')} صنف ✓${duplicateMsg}${importWarnings ? ' — ' + importWarnings : ''}`);
      }
      const fresh = await loadProducts();
      // Auto-detect price changes after import and update today's counters
      if (fresh && beforeMap) {
        try {
          await detectAndRecordPriceChanges(fresh, beforeMap);
        } catch (e) {
          console.warn('detect price changes error:', e);
        }
      }
      await loadTodayChanges();
      setTab('items'); // الانتقال لشاشة الأصناف لتفعيل أزرار الزيادة والنقص والأصناف الجديدة فوراً
    } catch (e) {
      showMsg(getErrMsg(e));
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleCustomerImport = async (file: File) => {
    setLoading(true);
    try {
      const preview = await parseCustomerExcel(file);
      if (preview.rows.length === 0) {
        showMsg(preview.warnings.join(' — ') || 'لم يتم العثور على عملاء في الملف');
        setLoading(false);
        return;
      }
      // Fetch existing customers by code for upsert matching
      type ExistingCustomer = { id: string; name: string; code: string | null; phone1: string | null; phone2: string | null; address: string | null };
      const existingByCode = new Map<string, ExistingCustomer>();
      const existingByName = new Map<string, ExistingCustomer>();
      const pageSize = 1000;
      let page = 0;
      while (true) {
        const { data, error: fe } = await supabase.from('customers').select('id, name, code, phone1, phone2, address').order('id').range(page * pageSize, (page + 1) * pageSize - 1);
        if (fe) throw fe;
        if (!data || data.length === 0) break;
        (data as ExistingCustomer[]).forEach(c => {
          existingByName.set(normalizeAr(c.name), c);
          if (c.code && c.code.trim()) existingByCode.set(normalizeAr(c.code.trim()), c);
        });
        if (data.length < pageSize) break;
        page++;
      }
      const toUpdate: Array<Record<string, unknown>> = [];
      const toInsert: Array<Record<string, unknown>> = [];
      const seenKeys = new Set<string>();
      const usedIds = new Set<string>();
      for (const r of preview.rows) {
        const codeKey = r.code && r.code.trim() ? normalizeAr(r.code.trim()) : '';
        const nameKey = normalizeAr(r.name);
        const dedupKey = codeKey || nameKey;
        if (seenKeys.has(dedupKey)) continue;
        seenKeys.add(dedupKey);
        const payload = { code: r.code, name: r.name, phone1: r.phone1, phone2: r.phone2, address: r.address };
        const ex = (codeKey ? existingByCode.get(codeKey) : undefined) ?? existingByName.get(nameKey);
        if (ex) {
          if (usedIds.has(ex.id)) continue;
          usedIds.add(ex.id);
          // القيم الفارغة في الملف لا تمسح بيانات العميل الموجودة
          toUpdate.push({ id: ex.id, code: payload.code ?? ex.code, name: payload.name, phone1: payload.phone1 ?? ex.phone1, phone2: payload.phone2 ?? ex.phone2, address: payload.address ?? ex.address });
        } else {
          toInsert.push(payload);
        }
      }
      const BATCH = 500;
      for (let i = 0; i < toUpdate.length; i += BATCH) {
        const { error } = await supabase.from('customers').upsert(toUpdate.slice(i, i + BATCH), { onConflict: 'id' });
        if (error) throw error;
      }
      // Insert one by one if batch fails (unique constraint on code may reject some)
      let insertedCount = 0;
      let insertErrors = 0;
      for (let i = 0; i < toInsert.length; i += BATCH) {
        const batch = toInsert.slice(i, i + BATCH);
        const { error } = await supabase.from('customers').insert(batch);
        if (error) {
          const msg = getErrMsg(error);
          if (msg.includes('unique') || msg.includes('duplicate') || msg.includes('23505')) {
            // Fall back to row-by-row to skip rows that violate the code unique constraint
            for (const row of batch) {
              const { error: e2 } = await supabase.from('customers').insert(row);
              if (e2) {
                const m2 = getErrMsg(e2);
                if (m2.includes('unique') || m2.includes('duplicate') || m2.includes('23505')) {
                  insertErrors++;
                } else {
                  throw e2;
                }
              } else {
                insertedCount++;
              }
            }
          } else {
            throw error;
          }
        } else {
          insertedCount += batch.length;
        }
      }
      const skippedMsg = insertErrors > 0 ? ` — تم تجاوز ${insertErrors.toLocaleString('ar-EG')} عميل بكود مكرر` : '';
      showMsg(`تم تحديث ${toUpdate.length.toLocaleString('ar-EG')} عميل وإضافة ${insertedCount.toLocaleString('ar-EG')} عميل جديد ✓${skippedMsg}${preview.warnings.length ? ' — ' + preview.warnings.join(' — ') : ''}`);
      await loadCustomers();
    } catch (e) {
      showMsg(getErrMsg(e));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveInvoice = async (lines: InvoiceLine[], customerName: string, customerPhone: string, customerAddress: string, customerId: string | null, invoiceDate: string) => {
    const total = lines.reduce((s, l) => s + l.qty * l.price, 0);
    const { data, error } = await supabase.from('sales').insert({
      customer_id: customerId || null, customer_name: customerName || null, customer_phone: customerPhone || null, customer_address: customerAddress || null,
      total: Math.round(total * 100) / 100, items_count: lines.length, created_at: new Date(invoiceDate).toISOString(),
    }).select('id').single();
    if (error) throw error;
    const invId = (data as { id: string }).id;
    const invLines = lines.map(l => ({
      sale_id: invId, product_id: l.product.id, name: l.product.name,
      code: l.product.code, unit: l.product.unit, price: l.price,
      quantity: l.qty, subtotal: Math.round(l.qty * l.price * 100) / 100,
    }));
    const { error: le } = await supabase.from('sale_items').insert(invLines);
    if (le) {
      await supabase.from('sales').delete().eq('id', invId); // لا نترك فاتورة بدون أصناف
      throw le;
    }
    showMsg('تم حفظ الفاتورة ✓');
  };

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'items', label: 'الأصناف', icon: <Package className="w-5 h-5" /> },
    { id: 'search', label: 'بحث', icon: <Search className="w-5 h-5" /> },
    { id: 'shortages', label: 'النواقص', icon: <ClipboardList className="w-5 h-5" /> },
    { id: 'pricechanges', label: 'زيادة ونقص', icon: <TrendingUp className="w-5 h-5" /> },
    { id: 'cashcounter', label: 'عداد النقدية', icon: <Calculator className="w-5 h-5" /> },
    { id: 'invoices', label: 'الفواتير', icon: <FileText className="w-5 h-5" /> },
    { id: 'customers', label: 'العملاء', icon: <Contact className="w-5 h-5" /> },
    { id: 'debts', label: 'مديونية العملاء', icon: <Users className="w-5 h-5" /> },
    { id: 'assistant', label: 'المساعد الذكي', icon: <Sparkles className="w-5 h-5" /> },
    { id: 'settings', label: 'الإعدادات', icon: <Settings className="w-5 h-5" /> },
  ];

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)', color: 'var(--accent)' }}>
      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur shadow-sm" style={{ background: 'color-mix(in srgb, var(--bg) 95%, transparent)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(o => !o)}
              className="p-2 rounded-lg transition hover:bg-slate-800 lg:hidden cursor-pointer"
              style={{ color: 'var(--accent)' }}
              title="القوائم"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-blue-600 text-white shadow-xs">
                <Package className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-base font-bold leading-tight flex items-center gap-2" style={{ color: 'var(--accent)' }}>
                  إدارة المبيعات والمخزون
                </h1>
                <div className="text-[11px] hidden sm:block opacity-75 font-mono">
                  {products.length.toLocaleString('ar-EG')} صنف مسجل
                </div>
              </div>
            </div>
          </div>

          {/* Header Controls: Quick Theme Toggle & Network Status */}
          <div className="flex items-center gap-2">
            {/* Quick Theme Switch */}
            <div className="flex items-center p-0.5 rounded-lg border text-xs" style={{ borderColor: 'var(--border)', background: 'var(--bg-light)' }}>
              <button
                type="button"
                onClick={() => setTheme('day')}
                className={`px-2 py-1 rounded-md transition flex items-center gap-1 cursor-pointer ${
                  theme === 'day' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'opacity-70 hover:opacity-100'
                }`}
                title="الوضع النهاري"
              >
                <Sun className="w-3.5 h-3.5 text-amber-500" />
                <span className="hidden md:inline">نهاري</span>
              </button>
              <button
                type="button"
                onClick={() => setTheme('ocean')}
                className={`px-2 py-1 rounded-md transition flex items-center gap-1 cursor-pointer ${
                  theme === 'ocean' ? 'bg-blue-600 text-white shadow-xs font-bold' : 'opacity-70 hover:opacity-100'
                }`}
                title="الوضع الأزرق الداكن"
              >
                <Moon className="w-3.5 h-3.5" />
                <span className="hidden md:inline">أزرق</span>
              </button>
              <button
                type="button"
                onClick={() => setTheme('midnight')}
                className={`px-2 py-1 rounded-md transition flex items-center gap-1 cursor-pointer ${
                  theme === 'midnight' ? 'bg-slate-800 text-white shadow-xs font-bold' : 'opacity-70 hover:opacity-100'
                }`}
                title="الوضع الليلي"
              >
                <span className="text-[11px]">ليلي</span>
              </button>
            </div>

            <NetworkIndicator online={online} />
          </div>
        </div>

        {/* Desktop Quick Tabs Bar (1-click direct navigation) */}
        <div className="hidden lg:block border-t" style={{ borderColor: 'var(--border)', background: 'color-mix(in srgb, var(--bg-light) 75%, var(--bg))' }}>
          <div className="max-w-7xl mx-auto px-4 flex items-center gap-1.5 overflow-x-auto py-1.5 scrollbar-thin">
            {tabs.map(t => {
              const isActive = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    isActive ? 'shadow-xs font-bold ring-1' : 'opacity-75 hover:opacity-100 hover:bg-slate-800/40'
                  }`}
                  style={
                    isActive
                      ? { background: 'var(--primary, #2563eb)', color: '#ffffff', borderColor: 'var(--primary, #2563eb)' }
                      : { color: 'var(--accent-light)' }
                  }
                >
                  {t.icon}
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
          <aside className="relative w-72 max-w-[80vw] overflow-y-auto py-4 px-3 shadow-2xl" style={{ background: 'var(--bg-light)', borderLeft: '1px solid var(--accent)' }}>
            <div className="flex items-center justify-between mb-4 px-2">
              <span className="font-bold text-lg" style={{ color: 'var(--accent)' }}>القوائم</span>
              <button onClick={() => setSidebarOpen(false)} className="p-1.5 rounded-lg" style={{ color: 'var(--accent)' }}>
                <ChevronUp className="w-5 h-5 rotate-90" />
              </button>
            </div>
            <nav className="space-y-1">
              {tabs.map(t => (
                <button
                  key={t.id}
                  onClick={() => { setTab(t.id); setSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition ${tab === t.id ? 'font-bold' : ''}`}
                  style={
                    tab === t.id
                      ? { background: 'color-mix(in srgb, var(--accent) 20%, transparent)', color: 'var(--accent)', border: '1px solid color-mix(in srgb, var(--accent) 50%, transparent)' }
                      : { color: 'var(--accent-light)' }
                  }
                >
                  {t.icon}
                  {t.label}
                </button>
              ))}
            </nav>
          </aside>
        </div>
      )}

      {/* Message banner */}
      {msg && (
        <div className="sticky top-[95px] z-30 max-w-7xl mx-auto px-4 mt-3">
          <div className="rounded-xl p-3 flex items-center gap-2 text-sm shadow-md" style={{ background: 'color-mix(in srgb, var(--success) 15%, transparent)', border: '1px solid color-mix(in srgb, var(--success) 40%, transparent)', color: 'var(--success)' }}>
            <CheckCircle2 className="w-4 h-4 shrink-0" /> {msg}
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 py-5">
        {tab === 'items' && (
          <ItemsView
            products={products}
            loading={loading}
            onRefresh={() => { void loadProducts(); void loadTodayChanges(); }}
            onEdit={(p) => { setEditProduct(p); setFormOpen(true); }}
            onDelete={(p) => setConfirmDelete(p)}
            onAdd={() => { setEditProduct(null); setFormOpen(true); }}
            todayChanges={todayChanges}
          />
        )}
        {tab === 'search' && <SearchView products={products} />}
        {tab === 'invoices' && (
          <InvoicesView onAddNew={() => setTab('newinvoice')} customers={customers} />
        )}
        {tab === 'newinvoice' && (
          <NewInvoiceView products={products} customers={customers} onSave={handleSaveInvoice} onBack={() => setTab('invoices')} />
        )}
        {tab === 'shortages' && <ShortagesView products={products} onMsg={showMsg} />}
        {tab === 'pricechanges' && <PriceChangesView products={products} onMsg={showMsg} />}
        {tab === 'cashcounter' && <CashCounterView onMsg={showMsg} />}
        {tab === 'customers' && (
          <CustomersView onMsg={showMsg} customers={customers} onCustomerChange={() => loadCustomers()} />
        )}
        {tab === 'debts' && <DebtsView onMsg={showMsg} customers={customers} />}
        {tab === 'assistant' && <AccountingAssistant />}
        {tab === 'settings' && (
          <SettingsView
            products={products}
            customers={customers}
            onRefresh={async () => { await Promise.all([loadProducts(), loadCustomers(), loadTodayChanges()]); }}
            onImport={(m) => { setImportMode(m); if (fileRef.current) fileRef.current.click(); }}
            onCustomerImport={handleCustomerImport}
            onClearAll={() => setConfirmClear(true)}
            onClearAllCustomers={() => setConfirmClearCustomers(true)}
            onMergeDuplicates={handleMergeDuplicates}
            theme={theme}
            onThemeChange={setTheme}
            onMsg={showMsg}
          />
        )}
      </main>

      {/* Modals */}
      {formOpen && (
        <ProductFormModal
          initial={editProduct}
          onSave={handleSaveProduct}
          onClose={() => { setFormOpen(false); setEditProduct(null); }}
        />
      )}
      {importOpen && (
        <ImportModal
          onConfirm={(m) => { setImportMode(m); setImportOpen(false); if (fileRef.current) fileRef.current.click(); }}
          onClose={() => setImportOpen(false)}
        />
      )}
      {confirmDelete && (
        <ConfirmModal
          title="حذف الصنف"
          message={`هل تريد حذف "${confirmDelete.name}"؟`}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
      {confirmClear && (
        <ConfirmModal
          title="حذف كل الأصناف"
          message="سيتم حذف جميع الأصناف نهائياً. هل أنت متأكد؟"
          onConfirm={handleClearAll}
          onCancel={() => setConfirmClear(false)}
        />
      )}
      {confirmClearCustomers && (
        <ConfirmModal
          title="حذف كل العملاء"
          message="سيتم حذف جميع العملاء نهائياً. هل أنت متأكد؟"
          onConfirm={handleClearAllCustomers}
          onCancel={() => setConfirmClearCustomers(false)}
        />
      )}
      {importPreview && (
        <ColumnPreviewModal
          preview={importPreview}
          mode={importMode}
          onConfirm={() => executeImport()}
          onCancel={() => setImportPreview(null)}
        />
      )}
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
}

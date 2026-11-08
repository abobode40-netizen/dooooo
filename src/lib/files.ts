import * as XLSX from 'xlsx';
import type { Product, Customer } from './supabase';

export type ColumnInfo = { header: string; colIndex: number; field: string | null; samples: string[]; };
export type ImportPreview = { rows: ImportRow[]; foundColumns: Record<string, string>; warnings: string[]; allColumns: ColumnInfo[]; };
export type ImportRow = { code: string | null; name: string; unit: string | null; barcode: string | null; price: number; price_wholesale: number; cost: number; stock: number; category: string | null; };

export function normalizeAr(s: string): string {
  return s
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF\u00A0\u061C]/g, '')
    .trim()
    // Arabic-Indic digits → Western digits
    .replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660))
    // Extended Arabic-Indic (Farsi/Urdu) → Western digits
    .replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x06F0))
    // Arabic decimal separator ٫ → '.', Arabic thousands separator ٬ → ''
    .replace(/\u066B/g, '.')
    .replace(/\u066C/g, '')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '') // التشكيل + التطويل
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}
const IGNORE_HEADERS = new Set(['م','ت','#','no','num','seq','row','n','i']);
const COLUMN_PATTERNS: Array<{ patterns: string[]; field: string }> = [
  { field: 'code', patterns: ['الكود','كود','الرمز','رمز','رقم الصنف','رقم الكود','رقم المنتج','رقم المادة','رقم الماده','رقم','كود الصنف','كود المنتج','كود الماده','كود المادة','sku','item code','code','item no','item number'] },
  { field: 'name', patterns: ['اسم الصنف','اسم صنف','اسم المنتج','اسم المادة','اسم الماده','اسم البضاعة','اسم البضاعه','اسم السلعة','اسم السلعه','الاسم','اسم','الصنف','صنف','المنتج','منتج','البضاعه','البضاعة','المادة','الماده','السلعة','السلعه','البند','البيان','وصف الصنف','وصف المنتج','وصف','التسمية','التسميه','المسمى','المسمي','name','product','item','description'] },
  { field: 'unit', patterns: ['الوحده','الوحدة','وحده','وحدة','وحدة القياس','وحده القياس','وحدة البيع','وحده البيع','unit','uom'] },
  { field: 'barcode', patterns: ['الباركود','باركود','بار كود','barcode','bar code'] },
  { field: 'price_wholesale', patterns: ['سعر الجمله','سعر الجملة','سعر جمله','سعر جملة','جمله','جملة','الجمله','الجملة','سعر بيع جمله','سعر البيع جمله','سعر بيع جملة','سعر البيع جملة','ثمن الجمله','ثمن الجملة','ثمن جمله','ثمن جملة','قيمة الجملة','قيمة الجمله','قيمه الجملة','قيمه الجمله','سعر الكرتون','سعر الكرتونة','wholesale','wholesale price','جملي','سعر ج','س ج'] },
  { field: 'price', patterns: ['سعر التجزيه','سعر التجزئة','سعر التجزئه','تجزيه','تجزئه','تجزئة','التجزيه','التجزئه','التجزئة','سعر البيع','سعر بيع','السعر','سعر','ثمن التجزيه','ثمن التجزئة','ثمن','ثمن البيع','قيمة التجزئة','قيمة التجزئه','قيمه التجزئة','سعر المفرد','مفرد','المفرد','retail','retail price','price','سعر ت','س ت'] },
  { field: 'cost', patterns: ['التكلفه','التكلفة','تكلفه','تكلفة','سعر الشراء','سعر شراء','ثمن الشراء','ثمن شراء','cost','purchase price'] },
  { field: 'stock', patterns: ['الكميه','الكمية','كميه','كمية','المخزون','مخزون','الرصيد','رصيد','العدد','عدد','stock','quantity','qty','balance'] },
  { field: 'category', patterns: ['التصنيف','تصنيف','الفئه','الفئة','فئه','فئة','المجموعه','المجموعة','مجموعه','مجموعة','category','group','النوع','نوع'] },
];
function matchField(h: string): string | null {
  const n = normalizeAr(h);
  if (!n || IGNORE_HEADERS.has(n) || /^\d+$/.test(n)) return null;
  for (const { patterns, field } of COLUMN_PATTERNS) for (const p of patterns) if (normalizeAr(p) === n) return field;
  if (n.length >= 3) for (const { patterns, field } of COLUMN_PATTERNS) for (const p of patterns) { const np = normalizeAr(p); if (np.length >= 3 && (n.includes(np) || np.includes(n))) return field; }
  return null;
}
function samplesLookLikeName(s: string[]): boolean {
  if (!s.length) return false;
  return s.filter(v => /[\u0600-\u06FF]/.test(v) || /[a-zA-Z]{2,}/.test(v)).length >= Math.ceil(s.length / 2);
}
function getSamples(ws: XLSX.WorkSheet, col: number, startRow: number, endRow: number, max = 4): string[] {
  const out: string[] = [];
  for (let r = startRow; r <= endRow && out.length < max; r++) { const cell = ws[XLSX.utils.encode_cell({ r, c: col })]; if (!cell) continue; const v = String(cell.v ?? '').trim(); if (v) out.push(v); }
  return out;
}
function detectHeaderRow(ws: XLSX.WorkSheet): { rowIndex: number; colMap: Record<number, string>; allColumns: ColumnInfo[] } | null {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
  for (let r = range.s.r; r <= Math.min(range.s.r + 15, range.e.r); r++) {
    const candidates: { col: number; header: string; field: string | null; samples: string[] }[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) { const cell = ws[XLSX.utils.encode_cell({ r, c })]; if (!cell) continue; const header = String(cell.v ?? '').trim(); if (!header) continue; candidates.push({ col: c, header, field: matchField(header), samples: getSamples(ws, c, r + 1, range.e.r) }); }
    const colMap: Record<number, string> = {}; const used = new Set<string>();
    for (const cand of candidates) if (cand.field && cand.field !== 'name' && !used.has(cand.field)) { colMap[cand.col] = cand.field; used.add(cand.field); }
    for (const cand of candidates) if (cand.field === 'name' && !used.has('name') && samplesLookLikeName(cand.samples)) { colMap[cand.col] = 'name'; used.add('name'); }
    if (!used.has('name')) continue;
    // Fallback: if no code column detected, try the first unrecognized column
    // whose samples look like codes (short, non-Arabic, alphanumeric)
    if (!used.has('code')) {
      for (const cand of candidates) {
        if (cand.field !== null || colMap[cand.col]) continue;
        const looksLikeCode = cand.samples.length > 0 && cand.samples.every(s =>
          s.length <= 20 && !/[\u0600-\u06FF]{3,}/.test(s) && /[a-zA-Z0-9]/.test(s)
        );
        if (looksLikeCode) { colMap[cand.col] = 'code'; used.add('code'); break; }
      }
    }
    return { rowIndex: r, colMap, allColumns: candidates.map(c => ({ header: c.header, colIndex: c.col, field: colMap[c.col] ?? null, samples: c.samples.slice(0, 3) })) };
  }
  return null;
}
function toNum(v: unknown): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  const n = parseFloat(
    String(v)
      .replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660))   // أرقام هندية → غربية
      .replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x06F0))
      .replace(/\u066B/g, '.').replace(/\u066C/g, '')
      .replace(/[^\d.\-]/g, '')
  );
  return isNaN(n) ? 0 : n;
}
function toStr(v: unknown): string | null { if (v == null) return null; const s = String(v).trim(); return s === '' ? null : s; }
function toPhone(v: unknown): string | null {
  if (v == null) return null;
  let s: string;
  if (typeof v === 'number') {
    s = String(Math.round(v));
  } else {
    s = String(v).trim();
  }
  if (s === '') return null;
  // Strip spaces, dashes, parentheses, Arabic-Indic digits
  s = s.replace(/[\s\-()\u200B-\u200F\u202A-\u202E\uFEFF]/g, '');
  s = s.replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660));
  s = s.replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x06F0));
  if (s === '') return null;
  // +20 prefix → 0 prefix
  if (s.startsWith('+20')) return '0' + s.slice(3);
  // 0020 prefix → 0 prefix
  if (s.startsWith('0020')) return '0' + s.slice(4);
  // 20 prefix (12 digits total = 0 + 10 digits) → 0 prefix
  if (s.startsWith('20') && s.length === 12) return '0' + s.slice(2);
  // All digits without leading 0 → add leading 0
  if (/^\d+$/.test(s) && !s.startsWith('0')) return '0' + s;
  return s;
}
function toCode(v: unknown): string | null {
  if (v == null) return null;
  let s: string;
  if (typeof v === 'number') {
    s = String(v); // لا نقرّب الأكواد العشرية (10.5 يجب ألا تصبح 11)
  } else {
    s = String(v).trim();
  }
  if (s === '') return null;
  // Convert Arabic-Indic and Extended Arabic-Indic numerals to Western
  s = s
    .replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x06F0))
    .replace(/\u066B/g, '.')   // Arabic decimal separator
    .replace(/\u066C/g, '');    // Arabic thousands separator
  return s.trim() === '' ? null : s;
}

export async function parseExcelFile(file: File): Promise<ImportPreview> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: false, raw: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { rows: [], foundColumns: {}, warnings: ['الملف فارغ'], allColumns: [] };
  const detected = detectHeaderRow(sheet);
  if (!detected) {
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');
    const debugCols: ColumnInfo[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) { const cell = sheet[XLSX.utils.encode_cell({ r: range.s.r, c })]; debugCols.push({ header: String(cell?.v ?? '').trim(), colIndex: c, field: null, samples: getSamples(sheet, c, range.s.r + 1, range.e.r).slice(0,3) }); }
    return { rows: [], foundColumns: {}, warnings: ['لم يتم التعرف على عمود الاسم', `الأعمدة: ${debugCols.map(c => `"${c.header}"(${c.samples[0]??'فارغ'})`).join(' | ')}`], allColumns: debugCols };
  }
  const { rowIndex, colMap, allColumns } = detected;
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');
  const foundColumns: Record<string, string> = {};
  Object.entries(colMap).forEach(([c, field]) => { const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: Number(c) })]; if (cell) foundColumns[field] = String(cell.v ?? '').trim(); });
  const warnings: string[] = [];
  if (!Object.values(colMap).includes('code')) {
    const codeHeaders = allColumns.filter(c => c.field === null).map(c => `"${c.header}"`).join('، ');
    warnings.push(`تحذير: لم يتم التعرف على عمود الكود — عناوين الأعمدة غير المُتعرّف عليها: ${codeHeaders || 'لا يوجد'}. استخدم "الكود" أو "رقم الصنف" أو "كود" كعنوان للعمود`);
  }
  if (!Object.values(colMap).includes('price_wholesale') && !Object.values(colMap).includes('price')) warnings.push('تحذير: لم يتم التعرف على أعمدة الأسعار');
  const rows: ImportRow[] = [];
  for (let r = rowIndex + 1; r <= range.e.r; r++) {
    const data: Record<string, unknown> = {};
    Object.entries(colMap).forEach(([c, field]) => { const cell = sheet[XLSX.utils.encode_cell({ r, c: Number(c) })]; data[field] = cell ? cell.v : null; });
    const name = toStr(data['name']); if (!name) continue;
    rows.push({ code: toCode(data['code']), name, unit: toStr(data['unit']), barcode: toStr(data['barcode']), price: toNum(data['price']), price_wholesale: toNum(data['price_wholesale']), cost: toNum(data['cost']), stock: Math.round(toNum(data['stock'])), category: toStr(data['category']) });
  }
  return { rows, foundColumns, warnings, allColumns };
}

export function exportExcel(products: Product[], filename = 'products.xlsx') {
  const ws = XLSX.utils.json_to_sheet(products.map(p => ({ 'الكود': p.code||'', 'اسم الصنف': p.name, 'الوحدة': p.unit||'', 'سعر الجملة': Number(p.price_wholesale), 'سعر التجزئة': Number(p.price), 'المخزون': p.stock })));
  ws['!cols'] = [{ wch: 14 }, { wch: 40 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }];
  const wb = XLSX.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] }; XLSX.utils.book_append_sheet(wb, ws, 'الأصناف'); XLSX.writeFile(wb, filename);
}

// ملاحظة: jsPDF لا يحتوي على خط عربي افتراضي فكان النص العربي يظهر مشوّهاً/فارغاً في PDF.
// لذلك نستخدم نافذة طباعة المتصفح (تدعم العربية و RTL) ومنها يمكن اختيار "حفظ كـ PDF".
// استخدام iframe للطباعة لمنع حظر النوافذ المنبثقة داخل المتصفحات
function printHtmlContent(html: string): void {
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
  doc.write(html);
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
  }, 400);
}

export function exportPDF(products: Product[], filename = 'products.pdf') {
  const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
  const rows = products.map((p, i) => `<tr><td style="text-align:center">${i + 1}</td><td>${esc(p.code || '-')}</td><td style="font-weight:bold">${esc(p.name)}</td><td style="text-align:center">${esc(p.unit || '-')}</td><td style="text-align:center;font-family:monospace">${Number(p.price_wholesale).toFixed(2)}</td><td style="text-align:center;font-family:monospace">${Number(p.price).toFixed(2)}</td><td style="text-align:center">${esc(p.stock)}</td></tr>`).join('');
  const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${esc(filename.replace(/\.pdf$/i, ''))}</title><style>@page{size:A4 landscape;margin:12mm}body{font-family:'Cairo','Segoe UI',Tahoma,sans-serif;font-size:11px;color:#1e293b;padding:10px}h1{font-size:18px;margin:0 0 4px;color:#0f172a}p{margin:0 0 10px;color:#64748b}table{width:100%;border-collapse:collapse}th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:right}th{background:#0f172a;color:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}tr:nth-child(even) td{background:#f8fafc;-webkit-print-color-adjust:exact;print-color-adjust:exact}thead{display:table-header-group}tr{page-break-inside:avoid}</style></head><body><h1>قائمة أصناف المخزن والمبيعات</h1><p>إجمالي الأصناف: ${products.length} — التاريخ: ${new Date().toLocaleDateString('ar-EG')}</p><table><thead><tr><th>#</th><th>الكود</th><th>اسم الصنف</th><th>الوحدة</th><th>سعر الجملة</th><th>سعر التجزئة</th><th>المخزون</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
  printHtmlContent(html);
}

export function downloadTemplate() {
  const ws = XLSX.utils.json_to_sheet([{ 'الكود': '1001', 'اسم الصنف': 'أرز بسمتي 5ك', 'الوحدة': 'شكارة', 'سعر الجملة': 360, 'سعر التجزئة': 400, 'المخزون': 100 }]);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'قالب_الاستيراد'); XLSX.writeFile(wb, 'products-template.xlsx');
}

// ─── Customer import helpers ─────────────────────────────
const CUSTOMER_COL_PATTERNS: Array<{ patterns: string[]; field: string }> = [
  { field: 'code', patterns: ['كود العميل','الكود','كود','رمز العميل','الرمز','رقم العميل','رقم','customer code','code','id','customer id'] },
  { field: 'name', patterns: ['اسم العميل','الاسم','اسم','العميل','عميل','customer name','name','customer'] },
  { field: 'phone1', patterns: ['رقم الهاتف الاول','الهاتف الاول','رقم التليفون الاول','التليفون الاول','الهاتف 1','تليفون 1','هاتف 1','رقم 1','phone1','phone 1','mobile1','mobile 1','tel1','tel 1','رقم الهاتف','الهاتف','رقم التليفون','التليفون','phone','mobile','tel'] },
  { field: 'phone2', patterns: ['رقم الهاتف الثاني','الهاتف الثاني','رقم التليفون الثاني','التليفون الثاني','الهاتف 2','تليفون 2','هاتف 2','رقم 2','phone2','phone 2','mobile2','mobile 2','tel2','tel 2'] },
  { field: 'address', patterns: ['عنوان العميل','العنوان','عنوان','السكن','سكن','address','addr','location'] },
];
function matchCustomerField(h: string): string | null {
  const n = normalizeAr(h);
  if (!n || IGNORE_HEADERS.has(n) || /^\d+$/.test(n)) return null;
  for (const { patterns, field } of CUSTOMER_COL_PATTERNS) for (const p of patterns) if (normalizeAr(p) === n) return field;
  if (n.length >= 3) for (const { patterns, field } of CUSTOMER_COL_PATTERNS) for (const p of patterns) { const np = normalizeAr(p); if (np.length >= 3 && (n.includes(np) || np.includes(n))) return field; }
  return null;
}
function detectCustomerHeaderRow(ws: XLSX.WorkSheet): { rowIndex: number; colMap: Record<number, string> } | null {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
  for (let r = range.s.r; r <= Math.min(range.s.r + 15, range.e.r); r++) {
    const candidates: { col: number; header: string; field: string | null; samples: string[] }[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) { const cell = ws[XLSX.utils.encode_cell({ r, c })]; if (!cell) continue; const header = String(cell.v ?? '').trim(); if (!header) continue; candidates.push({ col: c, header, field: matchCustomerField(header), samples: getSamples(ws, c, r + 1, range.e.r) }); }
    const colMap: Record<number, string> = {}; const used = new Set<string>();
    for (const cand of candidates) if (cand.field && !used.has(cand.field)) { colMap[cand.col] = cand.field; used.add(cand.field); }
    if (!used.has('name')) continue;
    // Fallback: if no code column detected, try the first unrecognized column
    // whose samples look like codes (short, non-Arabic, alphanumeric)
    if (!used.has('code')) {
      for (const cand of candidates) {
        if (cand.field !== null || colMap[cand.col]) continue;
        const looksLikeCode = cand.samples.length > 0 && cand.samples.every(s =>
          s.length <= 20 && !/[\u0600-\u06FF]{3,}/.test(s) && /[a-zA-Z0-9]/.test(s)
        );
        if (looksLikeCode) { colMap[cand.col] = 'code'; used.add('code'); break; }
      }
    }
    // Fallback: if no phone1 detected but phone2 was (or neither), try unrecognized columns with numeric samples
    if (!used.has('phone1')) {
      for (const cand of candidates) {
        if (cand.field !== null || colMap[cand.col]) continue;
        const looksLikePhone = cand.samples.length > 0 && cand.samples.every(s =>
          /^[\d\s\-+()]+$/.test(s) && s.replace(/\D/g, '').length >= 8
        );
        if (looksLikePhone) { colMap[cand.col] = 'phone1'; used.add('phone1'); break; }
      }
    }
    return { rowIndex: r, colMap };
  }
  return null;
}
export type CustomerImportRow = { code: string | null; name: string; phone1: string | null; phone2: string | null; address: string | null };
export type CustomerImportPreview = { rows: CustomerImportRow[]; warnings: string[] };
export async function parseCustomerExcel(file: File): Promise<CustomerImportPreview> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: false, raw: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { rows: [], warnings: ['الملف فارغ'] };
  const detected = detectCustomerHeaderRow(sheet);
  if (!detected) return { rows: [], warnings: ['لم يتم التعرف على عمود اسم العميل'] };
  const { rowIndex, colMap } = detected;
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');
  const warnings: string[] = [];
  if (!Object.values(colMap).includes('code')) warnings.push('تحذير: لم يتم التعرف على عمود كود العميل');
  if (!Object.values(colMap).includes('address')) warnings.push('تحذير: لم يتم التعرف على عمود العنوان');
  const rows: CustomerImportRow[] = [];
  for (let r = rowIndex + 1; r <= range.e.r; r++) {
    const data: Record<string, unknown> = {};
    Object.entries(colMap).forEach(([c, field]) => {
      const cell = sheet[XLSX.utils.encode_cell({ r, c: Number(c) })];
      if (!cell) { data[field] = null; return; }
      // For phone fields, prefer formatted text (cell.w) which preserves leading zeros
      // If cell.w is missing (e.g. numbers stored as numbers), use cell.v
      if (field === 'phone1' || field === 'phone2') {
        const raw = cell.w ?? cell.v;
        // If the formatted text looks like scientific notation (1.01E+10), fall back to raw number
        if (typeof raw === 'string' && /[Ee][+\-]\d/.test(raw) && typeof cell.v === 'number') {
          data[field] = String(Math.round(cell.v));
        } else {
          data[field] = raw;
        }
      } else if (field === 'code') {
        // For code: if it's a number, keep it as integer string; otherwise use formatted text
        if (typeof cell.v === 'number') {
          data[field] = String(cell.v);
        } else {
          data[field] = cell.w ?? cell.v;
        }
      } else {
        data[field] = cell.v;
      }
    });
    const name = toStr(data['name']); if (!name) continue;
    rows.push({ code: toCode(data['code']), name, phone1: toPhone(data['phone1']), phone2: toPhone(data['phone2']), address: toStr(data['address']) });
  }
  if (rows.length === 0) warnings.push('لم يتم العثور على صفوف بيانات');
  return { rows, warnings };
}
export function downloadCustomerTemplate() {
  const ws = XLSX.utils.json_to_sheet([{ 'كود العميل': 'C001', 'اسم العميل': 'محمد أحمد', 'عنوان العميل': 'القاهرة - مدينة نصر', 'رقم الهاتف الأول': '01001234567', 'رقم الهاتف الثاني': '01112345678' }], { cellDates: false });
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let r = range.s.r; r <= range.e.r; r++) { for (let c = range.s.c; c <= range.e.c; c++) { const addr = XLSX.utils.encode_cell({ r, c }); if (ws[addr]) ws[addr].z = '@'; } }
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'قالب_العملاء'); XLSX.writeFile(wb, 'customers-template.xlsx');
}
export function exportCustomersExcel(customers: Customer[], filename = 'customers.xlsx') {
  const ws = XLSX.utils.json_to_sheet(customers.map(c => ({ 'كود العميل': c.code || '', 'اسم العميل': c.name, 'عنوان العميل': c.address || '', 'رقم الهاتف الأول': c.phone1 || '', 'رقم الهاتف الثاني': c.phone2 || '' })));
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let r = range.s.r; r <= range.e.r; r++) { for (let c = range.s.c; c <= range.e.c; c++) { const addr = XLSX.utils.encode_cell({ r, c }); if (ws[addr]) ws[addr].z = '@'; } }
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'العملاء'); XLSX.writeFile(wb, filename);
}

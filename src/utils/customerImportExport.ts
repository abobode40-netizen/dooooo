import * as XLSX from 'xlsx';
import { CustomerDebt } from '../types';

export interface ParsedCustomerItem {
  customer_code: string;
  customer_name: string;
  phone: string;
  phone2: string;
  address: string;
  initialDebt: number;
  notes: string;
  isValid: boolean;
  errors: string[];
}

export interface ComparedCustomerItem extends ParsedCustomerItem {
  status: 'new' | 'update';
  existingCustomer?: CustomerDebt;
  debtDiff: number;
}

export interface CustomerColumnMapping {
  codeCol: string;
  nameCol: string;
  phoneCol: string;
  phone2Col: string;
  addressCol: string;
  debtCol: string;
  notesCol: string;
}

const KNOWN_CODE_HEADERS = [
  'كود العميل', 'كود', 'الكود', 'كود_العميل', 'رقم العميل', 'الرمز', 'رقم الحساب',
  'code', 'customer_code', 'cust_code', 'id', 'cust_id', 'client_code', 'account_no'
];

const KNOWN_NAME_HEADERS = [
  'اسم العميل', 'الاسم', 'اسم_العميل', 'اسم التاجر', 'العميل', 'المحل', 'اسم المحل', 'الجهة', 'بيان العميل',
  'name', 'customer_name', 'customer', 'client', 'client_name', 'full_name'
];

const KNOWN_PHONE1_HEADERS = [
  'التليفون الاول', 'التليفون 1', 'تليفون 1', 'هاتف 1', 'موبايل 1', 'رقم الهاتف', 'التليفون', 'الهاتف', 'الموبايل', 'الجوال', 'تليفون', 'موبايل', 'هاتف',
  'phone', 'phone1', 'mobile', 'mobile1', 'tel', 'cell', 'phone_number', 'contact'
];

const KNOWN_PHONE2_HEADERS = [
  'التليفون الثاني', 'التليفون 2', 'تليفون 2', 'هاتف 2', 'موبايل 2', 'رقم اضافي', 'هاتف اخر', 'موبايل اخر', 'تليفون اخر',
  'phone2', 'mobile2', 'tel2', 'secondary_phone', 'other_phone', 'alt_phone'
];

const KNOWN_ADDRESS_HEADERS = [
  'العنوان', 'عنوان العميل', 'عنوان', 'المكان', 'المنطقة', 'البلد', 'المدينة', 'الفرع', 'الموقع',
  'address', 'location', 'area', 'city', 'street'
];

const KNOWN_DEBT_HEADERS = [
  'الرصيد', 'رصيد', 'المديونية', 'مديونية', 'رصيد اول المدة', 'الرصيد الافتتاحي', 'الآجل', 'المستحق', 'المبلغ المستحق', 'حساب آجل',
  'debt', 'balance', 'current_debt', 'initial_debt', 'opening_balance', 'due_amount'
];

const KNOWN_NOTES_HEADERS = [
  'ملاحظات', 'ملاحظة', 'البيان', 'ملاحظات العميل', 'تفاصيل', 'نوع العميل',
  'notes', 'remarks', 'comment', 'description'
];

export function normalizeArabicText(str: string): string {
  if (!str) return '';
  return str
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F]/g, '') // remove tashkeel
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[_\-\.]+/g, ' ')
    .replace(/\s+/g, ' ');
}

export const normalizeString = normalizeArabicText;

/**
 * Deduplicates parsed customer items by normalized customer name, merging details
 */
export function deduplicateCustomerItems(items: ParsedCustomerItem[]): ParsedCustomerItem[] {
  const map = new Map<string, ParsedCustomerItem>();

  for (const item of items) {
    if (!item.customer_name?.trim()) continue;
    const key = normalizeArabicText(item.customer_name);

    if (!map.has(key)) {
      map.set(key, { ...item });
    } else {
      const existing = map.get(key)!;
      map.set(key, {
        ...existing,
        customer_code: existing.customer_code || item.customer_code,
        phone: existing.phone || item.phone,
        phone2: existing.phone2 || item.phone2 || (item.phone && item.phone !== existing.phone ? item.phone : ''),
        address: existing.address || item.address,
        notes: existing.notes ? (item.notes && !existing.notes.includes(item.notes) ? `${existing.notes} | ${item.notes}` : existing.notes) : (item.notes || ''),
        initialDebt: Math.max(existing.initialDebt || 0, item.initialDebt || 0),
        isValid: existing.isValid || item.isValid
      });
    }
  }

  return Array.from(map.values());
}

function matchHeader(headers: string[], candidates: string[]): string {
  const normCandidates = candidates.map(c => normalizeString(c));

  // 1. Exact match after normalization
  for (const h of headers) {
    const normH = normalizeString(h);
    if (!normH) continue;
    for (let i = 0; i < normCandidates.length; i++) {
      if (normH === normCandidates[i]) {
        return h;
      }
    }
  }

  // 2. Substring match
  for (const h of headers) {
    const normH = normalizeString(h);
    if (!normH) continue;
    for (let i = 0; i < normCandidates.length; i++) {
      if (normH.includes(normCandidates[i]) || normCandidates[i].includes(normH)) {
        return h;
      }
    }
  }

  return '';
}

/**
 * Auto detects column mapping for customers
 */
export function autoDetectCustomerColumnMapping(headers: string[]): CustomerColumnMapping {
  return {
    codeCol: matchHeader(headers, KNOWN_CODE_HEADERS),
    nameCol: matchHeader(headers, KNOWN_NAME_HEADERS) || headers[0] || '',
    phoneCol: matchHeader(headers, KNOWN_PHONE1_HEADERS),
    phone2Col: matchHeader(headers, KNOWN_PHONE2_HEADERS),
    addressCol: matchHeader(headers, KNOWN_ADDRESS_HEADERS),
    debtCol: matchHeader(headers, KNOWN_DEBT_HEADERS),
    notesCol: matchHeader(headers, KNOWN_NOTES_HEADERS)
  };
}

/**
 * Parses an Excel or CSV file buffer and returns raw rows and headers
 */
export function parseCustomerExcelFile(buffer: ArrayBuffer): {
  headers: string[];
  rawRows: Record<string, any>[];
  sheetNames: string[];
} {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetNames = workbook.SheetNames;
  if (sheetNames.length === 0) {
    return { headers: [], rawRows: [], sheetNames: [] };
  }

  const sheet = workbook.Sheets[sheetNames[0]];
  
  // Convert sheet to json with raw headers
  // Also try to detect the real header row if first row was a banner/title
  const rawArray: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  
  if (rawArray.length === 0) {
    return { headers: [], rawRows: [], sheetNames };
  }

  let headerRowIndex = 0;
  // Scan first 5 rows to see which one looks most like a header containing known keywords
  for (let r = 0; r < Math.min(rawArray.length, 5); r++) {
    const row = rawArray[r];
    if (Array.isArray(row)) {
      const rowStrings = row.map(cell => String(cell || '').trim());
      const hasKnownKeyword = rowStrings.some(cell => {
        const norm = normalizeString(cell);
        return KNOWN_NAME_HEADERS.concat(KNOWN_PHONE1_HEADERS, KNOWN_CODE_HEADERS, KNOWN_DEBT_HEADERS)
          .some(k => norm.includes(normalizeString(k)));
      });
      if (hasKnownKeyword) {
        headerRowIndex = r;
        break;
      }
    }
  }

  const rawHeaders: string[] = (rawArray[headerRowIndex] || []).map((h: any, idx: number) => {
    const str = String(h || '').trim();
    return str || `عمود ${idx + 1}`;
  });

  // Filter out empty trailing columns
  const headers = rawHeaders.filter(h => h.length > 0);

  const rawRows: Record<string, any>[] = [];
  for (let r = headerRowIndex + 1; r < rawArray.length; r++) {
    const row = rawArray[r];
    if (!Array.isArray(row) || row.every(cell => !cell || String(cell).trim() === '')) {
      continue; // Skip empty rows
    }
    const rowObj: Record<string, any> = {};
    headers.forEach((h, colIdx) => {
      rowObj[h] = row[colIdx] !== undefined ? row[colIdx] : '';
    });
    rawRows.push(rowObj);
  }

  return { headers, rawRows, sheetNames };
}

/**
 * Format phone string properly (preserving leading zeros for Egyptian/Arab mobile numbers)
 */
export function formatPhoneNumber(val: any): string {
  if (val === null || val === undefined) return '';
  let str = String(val).trim();
  if (!str) return '';
  
  // If scientific notation e.g. 1.0123E+9, handle it
  if (str.includes('e') || str.includes('E')) {
    const num = Number(val);
    if (!isNaN(num)) {
      str = num.toFixed(0);
    }
  }

  // If mobile starts with 10, 11, 12, 15 and is 10 digits long, prepend 0
  if (/^1[0125][0-9]{8}$/.test(str)) {
    str = '0' + str;
  }

  return str;
}

/**
 * Processes raw rows using a column mapping into structured ParsedCustomerItem list
 */
export function processCustomerImportRows(
  rawRows: Record<string, any>[],
  mapping: CustomerColumnMapping,
  existingCount: number = 0
): ParsedCustomerItem[] {
  const parsed = rawRows.map((row, index) => {
    const errors: string[] = [];

    // Customer Name (Required)
    const rawName = mapping.nameCol ? String(row[mapping.nameCol] || '').trim() : '';
    if (!rawName) {
      errors.push('اسم العميل فارغ');
    }

    // Customer Code
    let rawCode = mapping.codeCol ? String(row[mapping.codeCol] || '').trim() : '';
    if (!rawCode) {
      rawCode = `CUST-${(existingCount + index + 1).toString().padStart(3, '0')}`;
    }

    // Phones
    const phone = mapping.phoneCol ? formatPhoneNumber(row[mapping.phoneCol]) : '';
    const phone2 = mapping.phone2Col ? formatPhoneNumber(row[mapping.phone2Col]) : '';

    // Address
    const address = mapping.addressCol ? String(row[mapping.addressCol] || '').trim() : '';

    // Initial Debt / Balance
    let initialDebt = 0;
    if (mapping.debtCol && row[mapping.debtCol] !== undefined && row[mapping.debtCol] !== '') {
      let rawDebtStr = String(row[mapping.debtCol])
        .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString())
        .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString())
        .trim();
      rawDebtStr = rawDebtStr.replace(/,/g, '').replace(/[^0-9.-]/g, '');
      const debtVal = parseFloat(rawDebtStr);
      if (!isNaN(debtVal)) {
        initialDebt = debtVal;
      }
    }

    // Notes
    const notes = mapping.notesCol ? String(row[mapping.notesCol] || '').trim() : '';

    return {
      customer_code: rawCode,
      customer_name: rawName,
      phone,
      phone2,
      address,
      initialDebt,
      notes,
      isValid: errors.length === 0,
      errors
    };
  });

  return deduplicateCustomerItems(parsed);
}

/**
 * Compare imported customers with existing database
 */
export function compareCustomersWithExisting(
  parsed: ParsedCustomerItem[],
  existing: CustomerDebt[]
): {
  items: ComparedCustomerItem[];
  newCount: number;
  updateCount: number;
  totalDebt: number;
} {
  let newCount = 0;
  let updateCount = 0;
  let totalDebt = 0;

  const items: ComparedCustomerItem[] = parsed.map(item => {
    if (!item.isValid) {
      return {
        ...item,
        status: 'new',
        debtDiff: item.initialDebt
      };
    }

    const normName = normalizeString(item.customer_name);
    const normCode = normalizeString(item.customer_code);

    const normPhone = item.phone ? item.phone.replace(/\D/g, '') : '';

    const matched = existing.find(c => {
      // 1. Match by customer code if provided
      if (normCode && c.customer_code && normalizeString(c.customer_code) === normCode) {
        return true;
      }
      // 2. Match by phone if valid (at least 8 digits)
      if (normPhone && normPhone.length >= 8) {
        const cPhone1 = c.phone ? c.phone.replace(/\D/g, '') : '';
        const cPhone2 = c.phone2 ? c.phone2.replace(/\D/g, '') : '';
        if (cPhone1 === normPhone || cPhone2 === normPhone) return true;
      }
      // 3. Match by name
      return normalizeString(c.customer_name) === normName;
    });

    if (matched) {
      updateCount++;
      totalDebt += item.initialDebt || 0;
      return {
        ...item,
        status: 'update',
        existingCustomer: matched,
        debtDiff: item.initialDebt - (matched.current_debt || 0)
      };
    } else {
      newCount++;
      totalDebt += item.initialDebt || 0;
      return {
        ...item,
        status: 'new',
        debtDiff: item.initialDebt
      };
    }
  });

  return { items, newCount, updateCount, totalDebt };
}

/**
 * Parses raw text or table pasted from clipboard (e.g. copied from Excel/WhatsApp/Table)
 */
export function parsePastedCustomerTable(text: string, existingCount: number = 0): ParsedCustomerItem[] {
  if (!text || !text.trim()) return [];

  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) return [];

  const firstLine = lines[0];
  const isTabSeparated = firstLine.includes('\t');
  const isCommaSeparated = firstLine.includes(',');
  const isPipeSeparated = firstLine.includes('|');
  const delimiter = isTabSeparated ? '\t' : isCommaSeparated ? ',' : isPipeSeparated ? '|' : '\t';

  // Check if first line is headers
  const firstLineCols = firstLine.split(delimiter).map(c => c.trim());
  const hasHeaderKeyword = firstLineCols.some(c => {
    const norm = normalizeString(c);
    return KNOWN_NAME_HEADERS.concat(KNOWN_PHONE1_HEADERS, KNOWN_CODE_HEADERS, KNOWN_DEBT_HEADERS)
      .some(k => norm.includes(normalizeString(k)));
  });

  let headers: string[] = [];
  let dataLines = lines;

  if (hasHeaderKeyword) {
    headers = firstLineCols;
    dataLines = lines.slice(1);
  } else {
    // Default column assumptions: Code, Name, Address, Phone 1, Phone 2, Debt, Notes
    headers = ['كود العميل', 'اسم العميل', 'العنوان', 'التليفون الاول', 'التليفون الثاني', 'الرصيد'];
  }

  const rawRows = dataLines.map(line => {
    const parts = line.split(delimiter).map(p => p.trim());
    const row: Record<string, any> = {};
    headers.forEach((h, idx) => {
      row[h] = parts[idx] || '';
    });
    return row;
  });

  const mapping = autoDetectCustomerColumnMapping(headers);
  return processCustomerImportRows(rawRows, mapping, existingCount);
}

/**
 * Downloads a professionally formatted Excel (.xlsx) template for customers
 */
export function downloadCustomerExcelTemplate() {
  const data = [
    {
      'كود العميل': 'CUST-001',
      'اسم العميل': 'سوبرماركت الأمانة والبركة',
      'العنوان': 'شارع الجمهورية - وسط البلد - بجوار البنك الأهلي',
      'التليفون الاول': '01012345678',
      'التليفون الثاني': '01198765432',
      'الرصيد': 1500,
      'ملاحظات': 'عميل مميز - سداد أسبوعي'
    },
    {
      'كود العميل': 'CUST-002',
      'اسم العميل': 'أحمد محمود للتجارة والتوزيع',
      'العنوان': 'ميدان المحطة - حي السلام',
      'التليفون الاول': '01234567890',
      'التليفون الثاني': '',
      'الرصيد': 0,
      'ملاحظات': 'دفع نقدي فوري'
    },
    {
      'كود العميل': 'CUST-003',
      'اسم العميل': 'ماركت النور والهدى',
      'العنوان': 'طريق مصر إسكندرية الزراعي',
      'التليفون الاول': '01501234567',
      'التليفون الثاني': '01099887766',
      'الرصيد': 850,
      'ملاحظات': 'حد ائتماني 5000'
    },
    {
      'كود العميل': 'CUST-004',
      'اسم العميل': 'مؤسسة الصفوة للتوريدات',
      'العنوان': 'المنطقة الصناعية - قطعة 4',
      'التليفون الاول': '01155443322',
      'التليفون الثاني': '01288776655',
      'الرصيد': 3200,
      'ملاحظات': 'سداد شهري بشيكات'
    }
  ];

  const worksheet = XLSX.utils.json_to_sheet(data);

  // Set column widths for clean readability
  worksheet['!cols'] = [
    { wch: 14 }, // Code
    { wch: 32 }, // Name
    { wch: 40 }, // Address
    { wch: 18 }, // Phone 1
    { wch: 18 }, // Phone 2
    { wch: 14 }, // Debt
    { wch: 28 }  // Notes
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'دليل العملاء');
  XLSX.writeFile(workbook, 'نموذج_استرداد_العملاء.xlsx');
}

/**
 * Downloads a sample CSV template
 */
export function downloadCustomerCsvTemplate() {
  const headers = ['كود العميل', 'اسم العميل', 'العنوان', 'التليفون الاول', 'التليفون الثاني', 'الرصيد', 'ملاحظات'];
  const rows = [
    ['CUST-001', 'سوبرماركت الأمانة والبركة', 'شارع الجمهورية - وسط البلد', '01012345678', '01198765432', '1500', 'عميل مميز'],
    ['CUST-002', 'أحمد محمود للتجارة', 'ميدان المحطة - حي السلام', '01234567890', '', '0', 'دفع نقدي'],
    ['CUST-003', 'ماركت النور والهدى', 'طريق مصر إسكندرية', '01501234567', '01099887766', '850', 'حد ائتماني 5000']
  ];

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'نموذج_استرداد_العملاء.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportCustomersToExcel(customers: CustomerDebt[], customFileName?: string) {
  const rows = (customers || []).map((c, index) => ({
    'م': index + 1,
    'كود العميل': c.customer_code || `CUST-${(index + 1).toString().padStart(3, '0')}`,
    'اسم العميل': c.customer_name || '',
    'العنوان': c.address || '',
    'التليفون الأول': c.phone ? formatPhoneNumber(c.phone) : '',
    'التليفون الثاني': c.phone2 ? formatPhoneNumber(c.phone2) : '',
    'رصيد المديونية (ج.م)': Number(c.current_debt) || 0,
    'حالة الحساب': (c.current_debt || 0) > 0 ? 'عليه مديونية' : 'خالص / بدون ديون',
    'تاريخ التسجيل': c.created_at ? new Date(c.created_at).toLocaleDateString('ar-EG') : '',
    'ملاحظات': c.notes || ''
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);

  // Set column widths
  worksheet['!cols'] = [
    { wch: 6 },  // م
    { wch: 15 }, // كود
    { wch: 32 }, // الاسم
    { wch: 35 }, // العنوان
    { wch: 18 }, // تليفون 1
    { wch: 18 }, // تليفون 2
    { wch: 22 }, // الرصيد
    { wch: 20 }, // الحالة
    { wch: 16 }, // تاريخ التسجيل
    { wch: 30 }  // ملاحظات
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'دليل العملاء');

  const dateStr = new Date().toISOString().split('T')[0];
  const filename = customFileName || `دليل_سجل_العملاء_${dateStr}.xlsx`;
  XLSX.writeFile(workbook, filename);
}

/**
 * Parses customer data from a PDF document (extracts text content and structures into customers)
 */
export async function parseCustomerPdfFile(buffer: ArrayBuffer, existingCount: number = 0): Promise<ParsedCustomerItem[]> {
  try {
    const pdfjsLib = await import('pdfjs-dist');
    if (pdfjsLib.GlobalWorkerOptions && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version || '6.3.289'}/build/pdf.worker.min.mjs`;
    }

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('PDF timeout')), 6000)
    );

    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
    const pdf = await Promise.race([loadingTask.promise, timeoutPromise]) as any;
    let fullText = '';

    const maxPages = Math.min(pdf.numPages || 1, 50);
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageLines: string[] = [];
      let currentLine = '';
      let lastY: number | null = null;

      for (const item of textContent.items as any[]) {
        if (!item.str) continue;
        const y = item.transform ? Math.round(item.transform[5]) : null;
        if (lastY !== null && y !== null && Math.abs(y - lastY) > 5) {
          if (currentLine.trim()) pageLines.push(currentLine.trim());
          currentLine = item.str;
        } else {
          currentLine += (currentLine ? '\t' : '') + item.str;
        }
        lastY = y;
      }
      if (currentLine.trim()) pageLines.push(currentLine.trim());

      fullText += pageLines.join('\n') + '\n';
    }

    if (!fullText.trim()) {
      return [];
    }

    return parsePastedCustomerTable(fullText, existingCount);
  } catch (e) {
    console.error('Error in parseCustomerPdfFile:', e);
    throw e;
  }
}


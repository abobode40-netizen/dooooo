import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';
import { Product } from '../types';

try {
  if (typeof window !== 'undefined' && pdfjsLib && (pdfjsLib as any).GlobalWorkerOptions) {
    (pdfjsLib as any).GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '3.11.174'}/pdf.worker.min.js`;
  }
} catch (e) {
  console.warn('PDF.js worker initialization skipped:', e);
}

export interface ParsedImportItem {
  code: string;
  name: string;
  unit: string;
  price_retail: number;
  price_wholesale: number;
  stock?: number;
  category?: string;
  barcode?: string;
  isValid: boolean;
  errors: string[];
}

export interface ComparedImportItem extends ParsedImportItem {
  changeStatus: 'increase' | 'decrease' | 'new' | 'unchanged';
  hasPriceChange: boolean;
  oldWholesale: number;
  oldRetail: number;
  diffWholesale: number;
  diffRetail: number;
  pctWholesale: number;
  pctRetail: number;
  existingProductId?: string;
}

export interface ColumnMapping {
  codeCol: string;
  nameCol: string;
  unitCol: string;
  retailPriceCol: string;
  wholesalePriceCol: string;
  stockCol?: string;
  categoryCol?: string;
}

const KNOWN_CODE_HEADERS = [
  'كود الصنف', 'كود الصن ف', 'كود', 'code', 'item_code', 'item code', 'barcode', 'الباركود', 'رقم الصنف', 'الرمز', 'باركود', 'رقم المنتج', 'رقم_الصنف', 'كود_الصنف', 'id', 'item_no', 'item no', 'item_id'
];
const KNOWN_NAME_HEADERS = [
  'اسم الصنف', 'اسم_الصنف', 'الاسم', 'الصنف', 'name', 'product_name', 'item_name', 'item', 'product', 'البيان', 'بيان', 'اسم المنتج', 'اسم_المنتج', 'بيان الصنف', 'بيان_الصنف', 'وصف الصنف', 'وصف', 'الاصناف', 'الأصناف', 'المادة', 'اسم المادة'
];
const KNOWN_UNIT_HEADERS = [
  'الوحدة', 'الوحده', 'وحدة', 'وحده', 'unit', 'uom', 'نوع التعبئة', 'نوع التعبئه', 'العبوة', 'العبوه', 'تعبئة', 'تعبئه', 'وحدة القياس', 'الوحده الأساسيه', 'الوحدة الاساسية'
];
const KNOWN_RETAIL_HEADERS = [
  'سعر التجزئة', 'سعر التجزئه', 'سعر القطاعي', 'سعر القطاعى', 'سعر البيع', 'سعر_البيع', 'قطاعي', 'قطاعى', 'تجزئة', 'تجزئه', 'retail_price', 'price', 'retail', 'القطاعي', 'القطاعى', 'سعر المستهلك', 'سعر الجمهور', 'المستهلك', 'الجمهور', 'السعر', 'سعر', 'سعر الوحده', 'سعر الوحدة', 'سعر بيع', 'sale_price', 'selling_price', 'unit_price', 'price_retail'
];
const KNOWN_WHOLESALE_HEADERS = [
  'سعر الجملة', 'سعر الجمله', 'سعر_الجملة', 'جملة', 'جمله', 'سعر جملة', 'سعر جمله', 'wholesale_price', 'wholesale', 'price_wholesale', 'الجملة', 'الجمله', 'سعر الشراء', 'سعر_الشراء', 'سعر التكلفة', 'سعر التكلفه', 'التكلفة', 'التكلفه', 'شراء', 'سعر المورد', 'سعر_التكلفة', 'cost', 'cost_price', 'buy_price'
];
const KNOWN_STOCK_HEADERS = ['الكمية', 'الكميه', 'المخزون', 'الرصيد', 'stock', 'quantity', 'qty', 'الرصيد الحالي'];
const KNOWN_CAT_HEADERS = ['التصنيف', 'القسم', 'المجموعة', 'المجموعه', 'category', 'الفئة', 'الفئه'];

/**
 * Convert Arabic/Eastern numbers (٠١٢٣٤٥٦٧٨٩) to standard ASCII (0123456789)
 */
export function convertArabicDigitsToStandard(str: string | number | undefined | null): string {
  if (str === undefined || str === null) return '';
  return String(str)
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString())
    .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString());
}

/**
 * Parses numeric price values safely from various formats:
 * - Arabic digits (e.g. ٢١٥.٥٠)
 * - Number with currency suffixes (e.g. "215 ج.م", "215.00 EGP")
 * - Comma decimals or thousands separators (e.g. "1,250.50" or "15,50")
 */
export function parsePriceValue(val: any): number {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : Math.max(0, val);
  
  let str = convertArabicDigitsToStandard(val).trim();
  if (!str) return 0;

  // Remove currency signs and text, keep only digits, comma, dot and minus
  str = str.replace(/[^\d.,-]/g, '');
  if (!str) return 0;

  // Handle commas vs dots
  if (str.includes(',') && str.includes('.')) {
    if (str.indexOf(',') < str.indexOf('.')) {
      // 1,250.50
      str = str.replace(/,/g, '');
    } else {
      // 1.250,50
      str = str.replace(/\./g, '').replace(',', '.');
    }
  } else if (str.includes(',')) {
    const parts = str.split(',');
    // If comma is decimal separator (e.g. "15,5" or "15,50")
    if (parts.length === 2 && parts[1].length <= 2) {
      str = str.replace(',', '.');
    } else {
      str = str.replace(/,/g, '');
    }
  }

  const num = parseFloat(str);
  return isNaN(num) ? 0 : Math.max(0, num);
}

/**
 * Normalizes Arabic text for high-accuracy product name matching:
 * - Converts Arabic digits
 * - Normalizes Alef forms (أ إ آ ٱ -> ا)
 * - Normalizes Teh Marbuta (ة -> ه)
 * - Normalizes Alef Maksura (ى -> ي)
 * - Removes Arabic diacritics (tashkeel)
 * - Removes Tatweel (_)
 * - Strips punctuation and normalizes multiple whitespace
 */
export function normalizeArabicProductText(str: string): string {
  if (!str) return '';
  return convertArabicDigitsToStandard(str)
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '') // Tashkeel / Harakat
    .replace(/ـ+/g, '') // Tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[ؤ]/g, 'و')
    .replace(/[ئ]/g, 'ي')
    .replace(/[^a-z0-9\u0600-\u06FF]/gi, ' ') // Replace punctuation with space
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Cleans product code for robust matching (converts digits, trims, lowercases)
 */
export function cleanProductCode(code: string | number | undefined | null): string {
  if (code === undefined || code === null) return '';
  return convertArabicDigitsToStandard(code).trim().toLowerCase();
}

/**
 * Ultra-fast fuzzy and Arabic-normalized search matcher for products.
 * Handles:
 * - Hamzas (أ, إ, آ, ا)
 * - Taa Marbouta (ة, ه)
 * - Yaa / Alif Maqsoura (ى, ي)
 * - Waw / Hamza (ؤ, ئ)
 * - Tashkeel & Tatweel stripping
 * - Eastern Arabic digits (٠١٢٣٤٥٦٧٨٩) vs ASCII (0123456789)
 * - Multi-word tokens in any order (e.g. "شاي لورد" matches "شاي أسود لورد 100 فتلة")
 * - Arabic prefix "ال" removal / tolerance (e.g. "السكر" matches "سكر")
 * - Code & barcode matching
 * - Category matching
 */
export function matchProductSearch(product: Product, query: string): boolean {
  if (!query || !query.trim()) return true;

  const rawQ = query.trim();
  const normQ = normalizeArabicProductText(rawQ);
  if (!normQ) return true;

  const normName = normalizeArabicProductText(product.name || '');
  const normCode = normalizeArabicProductText(String(product.code || ''));
  const normBarcode = normalizeArabicProductText(product.barcode || '');
  const normCat = normalizeArabicProductText(product.category || '');
  const normUnit = normalizeArabicProductText(product.unit || '');

  // 1. Direct or contiguous substring match
  if (
    normName.includes(normQ) ||
    normCode.includes(normQ) ||
    normBarcode.includes(normQ) ||
    normCat.includes(normQ) ||
    normUnit.includes(normQ)
  ) {
    return true;
  }

  // 2. Tolerance for Arabic "ال" prefix
  const qNoAl = normQ.replace(/\bال/g, '');
  if (qNoAl.length >= 2 && (normName.includes(qNoAl) || normCat.includes(qNoAl))) {
    return true;
  }

  // 3. Multi-word token matching (all words in search must be present)
  const tokens = normQ.split(' ').filter(Boolean);
  if (tokens.length > 1) {
    const combined = `${normName} ${normCode} ${normBarcode} ${normCat} ${normUnit}`;
    const allMatch = tokens.every(t => {
      const tNoAl = t.replace(/^ال/, '');
      return combined.includes(t) || (tNoAl.length >= 2 && combined.includes(tNoAl));
    });
    if (allMatch) return true;
  }

  // 4. Raw code & numeric matching (e.g. numbers in code, barcode)
  const cleanQ = cleanProductCode(rawQ);
  if (cleanQ) {
    if (cleanProductCode(product.code).includes(cleanQ) || (product.barcode && cleanProductCode(product.barcode).includes(cleanQ))) {
      return true;
    }
  }

  return false;
}

/**
 * High-performance O(1) indexed lookup data structure for fast matching
 * without freezing the browser during large imports.
 */
export interface ProductLookupIndex {
  byCode: Map<string, Product>;
  byBarcode: Map<string, Product>;
  byNormName: Map<string, Product>;
  byNumericCode: Map<string, Product>;
  byId: Map<string, Product>;
  productIndexMap: Map<string, number>;
}

export function buildProductIndex(products: Product[]): ProductLookupIndex {
  const index: ProductLookupIndex = {
    byCode: new Map(),
    byBarcode: new Map(),
    byNormName: new Map(),
    byNumericCode: new Map(),
    byId: new Map(),
    productIndexMap: new Map()
  };

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    if (p.id) {
      index.byId.set(p.id, p);
      index.productIndexMap.set(p.id, i);
    }

    const c = cleanProductCode(p.code);
    if (c) index.byCode.set(c, p);

    const b = cleanProductCode(p.barcode);
    if (b) index.byBarcode.set(b, p);

    const n = normalizeArabicProductText(p.name);
    if (n && n.length >= 2 && !n.startsWith('صنف غير مسمى')) {
      index.byNormName.set(n, p);
    }

    const num = c.replace(/\D/g, '');
    if (num.length >= 3) {
      index.byNumericCode.set(num, p);
    }
  }

  return index;
}

export function addProductToIndex(index: ProductLookupIndex, product: Product, arrayIndex?: number) {
  if (product.id) {
    index.byId.set(product.id, product);
    if (arrayIndex !== undefined) index.productIndexMap.set(product.id, arrayIndex);
  }

  const c = cleanProductCode(product.code);
  if (c) index.byCode.set(c, product);

  const b = cleanProductCode(product.barcode);
  if (b) index.byBarcode.set(b, product);

  const n = normalizeArabicProductText(product.name);
  if (n && n.length >= 2 && !n.startsWith('صنف غير مسمى')) {
    index.byNormName.set(n, product);
  }

  const num = c.replace(/\D/g, '');
  if (num.length >= 3) {
    index.byNumericCode.set(num, product);
  }
}

export function matchProductIndexed(
  item: { code?: string; name?: string; barcode?: string; existingProductId?: string },
  index: ProductLookupIndex,
  strictByCode: boolean = true
): Product | null {
  if (item.existingProductId && index.byId.has(item.existingProductId)) {
    return index.byId.get(item.existingProductId)!;
  }

  const c = cleanProductCode(item.code);
  if (c && index.byCode.has(c)) {
    return index.byCode.get(c)!;
  }

  // Pure numeric code check (e.g. 1001 vs P-1001 or 01001)
  const num = c ? c.replace(/\D/g, '') : '';
  if (num.length >= 2 && index.byNumericCode.has(num)) {
    return index.byNumericCode.get(num)!;
  }

  const b = cleanProductCode(item.barcode);
  if (b && index.byBarcode.has(b)) {
    return index.byBarcode.get(b)!;
  }

  // When matching strictly by code (e.g. Excel import), NEVER match an item by name if it has a code or barcode!
  // If code is not found, it is considered a new product.
  if (!strictByCode && !c && !b) {
    const n = normalizeArabicProductText(item.name || '');
    if (n && n.length >= 2 && !n.startsWith('صنف غير مسمى') && index.byNormName.has(n)) {
      return index.byNormName.get(n)!;
    }
  }

  return null;
}

/**
 * Finds matching product in existing database strictly by code:
 * 1. Exact clean code match
 * 2. Pure numeric code match (e.g. 1001 vs 01001)
 * 3. Barcode match
 * 4. Only fallback to name match if code is completely absent
 */
export function findMatchingProduct(
  item: { code?: string; name?: string; barcode?: string; existingProductId?: string },
  existingProducts: Product[],
  strictByCode: boolean = true
): Product | null {
  if (!existingProducts || existingProducts.length === 0) return null;

  const itemCode = cleanProductCode(item.code);
  const itemBarcode = item.barcode ? cleanProductCode(item.barcode) : '';

  // 1. Match by ID if known
  if (item.existingProductId) {
    const idMatch = existingProducts.find(p => p.id === item.existingProductId);
    if (idMatch) return idMatch;
  }

  // 2. Match by Code if provided
  if (itemCode) {
    const codeMatch = existingProducts.find(p => cleanProductCode(p.code) === itemCode);
    if (codeMatch) return codeMatch;

    const itemCodeNumeric = itemCode.replace(/\D/g, '');
    if (itemCodeNumeric.length >= 2) {
      const numericMatch = existingProducts.find(p => cleanProductCode(p.code).replace(/\D/g, '') === itemCodeNumeric);
      if (numericMatch) return numericMatch;
    }
  }

  // 3. Match by Barcode if provided
  if (itemBarcode) {
    const barcodeMatch = existingProducts.find(p => p.barcode && cleanProductCode(p.barcode) === itemBarcode);
    if (barcodeMatch) return barcodeMatch;
  }

  // 4. Fallback to name ONLY if code and barcode are not provided and strictByCode is false
  if (!strictByCode && !itemCode && !itemBarcode) {
    const itemNameNorm = normalizeArabicProductText(item.name || '');
    if (itemNameNorm && itemNameNorm.length >= 2 && !itemNameNorm.startsWith('صنف غير مسمى')) {
      const nameMatch = existingProducts.find(p => normalizeArabicProductText(p.name) === itemNameNorm);
      if (nameMatch) return nameMatch;
    }
  }

  return null;
}

/**
 * Deduplicates parsed rows inside the same uploaded file before comparison or import.
 * If multiple rows have the same code or normalized name, the later row overrides prices,
 * preventing accidental duplicate creations from the same file.
 */
export function deduplicateImportRows(items: ParsedImportItem[]): {
  deduplicated: ParsedImportItem[];
  duplicatesMerged: number;
} {
  const codeMap = new Map<string, ParsedImportItem>();
  const nameMap = new Map<string, ParsedImportItem>();
  const result: ParsedImportItem[] = [];
  let duplicatesMerged = 0;

  for (const item of items) {
    const itemCode = cleanProductCode(item.code);
    const itemNameNorm = normalizeArabicProductText(item.name);

    let existingInBatch: ParsedImportItem | undefined;
    // Strictly match by code if code is present
    if (itemCode && codeMap.has(itemCode)) {
      existingInBatch = codeMap.get(itemCode);
    } else if (!itemCode && itemNameNorm && nameMap.has(itemNameNorm)) {
      existingInBatch = nameMap.get(itemNameNorm);
    }

    if (existingInBatch) {
      // Merge into the earlier entry with updated prices & name (إذا تغير السعر، اسم الصنف بالكود يتغير)
      duplicatesMerged++;
      if (item.name && item.name.trim() && !item.name.startsWith('صنف غير مسمى')) {
        existingInBatch.name = item.name.trim();
      }
      existingInBatch.price_retail = item.price_retail || existingInBatch.price_retail;
      existingInBatch.price_wholesale = item.price_wholesale || existingInBatch.price_wholesale;
      if (item.unit && item.unit !== 'كرتونه') existingInBatch.unit = item.unit;
      if (item.category && item.category !== 'عام') existingInBatch.category = item.category;
      if (item.stock !== undefined && item.stock !== null) existingInBatch.stock = item.stock;
    } else {
      result.push(item);
      if (itemCode) codeMap.set(itemCode, item);
      if (itemNameNorm) nameMap.set(itemNameNorm, item);
    }
  }

  return { deduplicated: result, duplicatesMerged };
}

/**
 * Extracts raw text from PDF ArrayBuffer and parses into standardized 5-column items
 */
export async function parsePdfBufferToItems(buffer: ArrayBuffer): Promise<ParsedImportItem[]> {
  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('PDF timeout')), 8000)
    );

    const loadingTask = pdfjsLib.getDocument({ data: buffer });
    const pdf = await Promise.race([loadingTask.promise, timeoutPromise]) as any;
    let fullText = '';

    const maxPages = Math.min(pdf.numPages || 1, 60);
    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      fullText += pageText + '\n';
    }

    return parseTextOrPdfTable(fullText);
  } catch (err) {
    console.warn('PDF parser error in buffer:', err);
    return [];
  }
}

function normalizeString(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/كود\s*الصن\s*ف/g, 'كود الصنف')
    .replace(/\s+/g, ' ');
}

function matchHeader(headers: string[], candidates: string[], isCodeMatching: boolean = false): string {
  const normCandidates = candidates.map(c => normalizeString(c));
  
  // 1. Exact match after normalization
  for (const h of headers) {
    const normH = normalizeString(h);
    // If matching code, NEVER match a header that explicitly means name like "الصنف" or "اسم"
    if (isCodeMatching && (normH === 'الصنف' || normH === 'اسم الصنف' || normH === 'الاسم' || normH === 'بيان' || normH === 'اسم المنتج')) {
      continue;
    }
    for (let i = 0; i < candidates.length; i++) {
      if (normH === normCandidates[i]) {
        return h;
      }
    }
  }

  // 2. Substring match
  for (const h of headers) {
    const normH = normalizeString(h);
    // If matching code, strictly require that the header contains code-related tokens
    if (isCodeMatching) {
      if (normH === 'الصنف' || normH === 'اسم الصنف' || normH === 'الاسم' || normH === 'بيان' || normH === 'اسم المنتج') {
        continue;
      }
      const hasCodeToken = normH.includes('كود') || normH.includes('code') || normH.includes('رمز') || normH.includes('باركود') || normH.includes('barcode') || normH.includes('رقم');
      if (!hasCodeToken) {
        continue;
      }
    }

    for (let i = 0; i < candidates.length; i++) {
      if (normH.includes(normCandidates[i]) || (normCandidates[i].length > 3 && normCandidates[i].includes(normH))) {
        return h;
      }
    }
  }

  return '';
}

const FIXED_MAPPING_KEY = 'fixed_product_import_mapping_v1';

export function getSavedColumnMapping(): Partial<ColumnMapping> | null {
  try {
    const saved = localStorage.getItem(FIXED_MAPPING_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error('Failed to load saved mapping', e);
  }
  return null;
}

export function saveColumnMapping(mapping: ColumnMapping) {
  try {
    localStorage.setItem(FIXED_MAPPING_KEY, JSON.stringify(mapping));
  } catch (e) {
    console.error('Failed to save mapping', e);
  }
}

/**
 * Automatically maps detected sheet columns to the 5 standard product attributes:
 * 1. كود الصنف
 * 2. اسم الصنف
 * 3. الوحدة
 * 4. سعر الجملة
 * 5. سعر التجزئة
 */
export function autoDetectColumnMapping(headers: string[], rawRows?: Record<string, any>[]): ColumnMapping {
  // Check if saved mapping matches current headers
  const saved = getSavedColumnMapping();
  if (saved && saved.codeCol && saved.nameCol && headers.includes(saved.codeCol) && headers.includes(saved.nameCol)) {
    return {
      codeCol: saved.codeCol,
      nameCol: saved.nameCol,
      unitCol: (saved.unitCol && headers.includes(saved.unitCol)) ? saved.unitCol : (matchHeader(headers, KNOWN_UNIT_HEADERS) || ''),
      wholesalePriceCol: (saved.wholesalePriceCol && headers.includes(saved.wholesalePriceCol)) ? saved.wholesalePriceCol : (matchHeader(headers, KNOWN_WHOLESALE_HEADERS) || ''),
      retailPriceCol: (saved.retailPriceCol && headers.includes(saved.retailPriceCol)) ? saved.retailPriceCol : (matchHeader(headers, KNOWN_RETAIL_HEADERS) || ''),
      stockCol: '',
      categoryCol: ''
    };
  }

  const matchedName = matchHeader(headers, KNOWN_NAME_HEADERS, false);
  const matchedCode = matchHeader(headers, KNOWN_CODE_HEADERS, true);

  // If code matched the same column as name, prioritize name and find another for code
  let safeNameCol = matchedName;
  let safeCodeCol = matchedCode;

  if (safeCodeCol === safeNameCol) {
    safeCodeCol = '';
  }

  // If name not found by exact candidate, check headers
  if (!safeNameCol) {
    const candidateName = headers.find(h => {
      const n = normalizeString(h);
      return n.includes('اسم') || n.includes('صنف') || n.includes('بيان') || n.includes('منتج');
    });
    safeNameCol = candidateName || headers[1] || headers[0] || '';
  }

  // If code not found, find a column with code tokens or pick a distinct header
  if (!safeCodeCol) {
    const candidateCode = headers.find(h => {
      if (h === safeNameCol) return false;
      const n = normalizeString(h);
      return n.includes('كود') || n.includes('code') || n.includes('رمز') || n.includes('باركود');
    });
    if (candidateCode) {
      safeCodeCol = candidateCode;
    } else {
      // Pick first header that isn't safeNameCol
      const fallback = headers.find(h => h !== safeNameCol);
      safeCodeCol = fallback || '';
    }
  }

  let matchedUnit = matchHeader(headers, KNOWN_UNIT_HEADERS) || headers.find(h => h !== safeCodeCol && h !== safeNameCol && (h.includes('وحد') || h.includes('عبو'))) || '';
  let matchedWholesale = matchHeader(headers, KNOWN_WHOLESALE_HEADERS) || '';
  let matchedRetail = matchHeader(headers, KNOWN_RETAIL_HEADERS) || '';

  // Smart price fallback:
  // If one price is matched and the other isn't, use the matched one for both
  if (matchedRetail && !matchedWholesale) {
    matchedWholesale = matchedRetail;
  } else if (matchedWholesale && !matchedRetail) {
    matchedRetail = matchedWholesale;
  }

  // If STILL no price column is detected by name, scan sample rows for numeric columns
  if (!matchedRetail && !matchedWholesale && rawRows && rawRows.length > 0) {
    const sample = rawRows.slice(0, 15);
    const numericCandidates: { col: string; count: number }[] = [];

    headers.forEach(h => {
      if (h === safeNameCol || h === safeCodeCol || h === matchedUnit) return;
      let validNumCount = 0;
      sample.forEach(row => {
        const val = row[h];
        if (parsePriceValue(val) > 0) {
          validNumCount++;
        }
      });
      if (validNumCount >= Math.min(2, sample.length)) {
        numericCandidates.push({ col: h, count: validNumCount });
      }
    });

    numericCandidates.sort((a, b) => b.count - a.count);

    if (numericCandidates.length >= 2) {
      matchedWholesale = numericCandidates[0].col;
      matchedRetail = numericCandidates[1].col;
    } else if (numericCandidates.length === 1) {
      matchedWholesale = numericCandidates[0].col;
      matchedRetail = numericCandidates[0].col;
    }
  }

  return {
    codeCol: safeCodeCol,
    nameCol: safeNameCol,
    unitCol: matchedUnit,
    wholesalePriceCol: matchedWholesale,
    retailPriceCol: matchedRetail,
    stockCol: matchHeader(headers, KNOWN_STOCK_HEADERS) || '',
    categoryCol: matchHeader(headers, KNOWN_CAT_HEADERS) || ''
  };
}

/**
 * Parses an Excel or CSV file buffer and returns raw rows and headers
 */
export function parseExcelFile(fileData: ArrayBuffer): { headers: string[]; rawRows: Record<string, any>[] } {
  try {
    const workbook = XLSX.read(fileData, { type: 'array' });
    if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
      return { headers: [], rawRows: [] };
    }
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    if (!worksheet) {
      return { headers: [], rawRows: [] };
    }

    // Try standard sheet_to_json
    const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });
    if (jsonData.length === 0) {
      return { headers: [], rawRows: [] };
    }

    let headers = Object.keys(jsonData[0]);

    // Check if row 0 was a title or empty banner
    const looksLikeBlankTitle = headers.length <= 2 && headers.some(h => h.startsWith('__EMPTY'));
    if (looksLikeBlankTitle) {
      const matrix = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
      let headerRowIndex = 0;
      for (let r = 0; r < Math.min(matrix.length, 10); r++) {
        const row = matrix[r];
        if (Array.isArray(row)) {
          const joined = row.map(c => String(c || '').trim()).join(' ');
          if (
            joined.includes('كود') || 
            joined.includes('صنف') || 
            joined.includes('اسم') || 
            joined.includes('سعر') || 
            joined.includes('code') || 
            joined.includes('name') ||
            row.filter(c => String(c || '').trim().length > 0).length >= 3
          ) {
            headerRowIndex = r;
            break;
          }
        }
      }

      if (headerRowIndex > 0) {
        const rawHeaders = (matrix[headerRowIndex] || []).map((c: any) => String(c || '').trim());
        const validHeaderRow = rawHeaders.map((h: string, idx: number) => h || `عمود_${idx + 1}`);
        const rows: Record<string, any>[] = [];
        for (let r = headerRowIndex + 1; r < matrix.length; r++) {
          const rowData = matrix[r];
          if (!Array.isArray(rowData) || rowData.every(c => !c && c !== 0)) continue;
          const obj: Record<string, any> = {};
          validHeaderRow.forEach((h: string, idx: number) => {
            obj[h] = rowData[idx] ?? '';
          });
          rows.push(obj);
        }
        return { headers: validHeaderRow, rawRows: rows };
      }
    }

    return { headers, rawRows: jsonData };
  } catch (err) {
    console.error('Error parsing excel file:', err);
    return { headers: [], rawRows: [] };
  }
}

/**
 * Normalizes and validates raw rows based on selected column mapping
 */
export function processImportRows(
  rawRows: Record<string, any>[],
  mapping: ColumnMapping
): ParsedImportItem[] {
  return rawRows.map((row, index) => {
    const errors: string[] = [];
    let rawCode = String(row[mapping.codeCol] || '').trim();
    let rawName = String(row[mapping.nameCol] || '').trim();
    const rawUnit = String(row[mapping.unitCol] || 'كرتونه').trim() || 'كرتونه';

    // Auto-detect if columns were swapped during import:
    // If rawName is numeric / code pattern and rawCode contains Arabic text or description words
    const nameIsDigits = /^\d+$/.test(rawName);
    const codeHasArabic = /[\u0600-\u06FF]/.test(rawCode);
    const nameHasArabic = /[\u0600-\u06FF]/.test(rawName);
    const codeIsDigits = /^\d+$/.test(rawCode);
    const nameIsCodePattern = /^(p|prd|itm|c)[-_]?\d+/i.test(rawName);

    if ((nameIsDigits && !codeIsDigits) || (!nameHasArabic && codeHasArabic) || (nameIsCodePattern && codeHasArabic) || (rawCode.includes(' ') && rawCode.length > 5 && (nameIsDigits || (!rawName.includes(' ') && !nameHasArabic)))) {
      // Swapped columns detected! Swap them back to protect data integrity
      const temp = rawCode;
      rawCode = rawName;
      rawName = temp;
    }

    let retailPrice = parsePriceValue(row[mapping.retailPriceCol]);
    let wholesalePrice = mapping.wholesalePriceCol ? parsePriceValue(row[mapping.wholesalePriceCol]) : 0;
    
    // If one is 0 and the other > 0, fallback gracefully so prices are never lost
    if (retailPrice > 0 && wholesalePrice === 0) wholesalePrice = retailPrice;
    if (wholesalePrice > 0 && retailPrice === 0) retailPrice = wholesalePrice;

    const stockStr = mapping.stockCol ? String(row[mapping.stockCol] || '50').replace(/[^\d.]/g, '') : '50';
    const categoryStr = mapping.categoryCol ? String(row[mapping.categoryCol] || 'عام').trim() : 'عام';
    const stock = parseInt(stockStr) || 0;

    const code = rawCode || `P-${10000 + index}`;
    const name = rawName;

    if (!name) {
      errors.push('اسم الصنف مفقود أو فارغ');
    }

    return {
      code,
      name: name || `صنف غير مسمى ${index + 1}`,
      unit: rawUnit,
      price_retail: retailPrice,
      price_wholesale: wholesalePrice,
      stock,
      category: categoryStr || 'عام',
      isValid: errors.length === 0,
      errors
    };
  });
}

/**
 * Parses text table copied from a PDF or document with robust price extraction
 */
export function parseTextOrPdfTable(text: string): ParsedImportItem[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  const items: ParsedImportItem[] = [];

  const commonUnits = [
    'كرتونه', 'كرتونة', 'بالتة', 'بالته', 'شكاره', 'شكارة', 'علبة', 'علبه', 
    'ربطة', 'ربطه', 'طرد', 'صفيحة', 'صفيحه', 'جركن', 'كيلو', 'قطعة', 'قطعه', 
    'كيس', 'باكت', 'درزن', 'دستة', 'دسته', 'لتر', 'زجاجة', 'زجاجه'
  ];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    // Skip common header lines if present
    if (
      (rawLine.includes('كود') || rawLine.includes('code')) &&
      (rawLine.includes('اسم') || rawLine.includes('صنف') || rawLine.includes('name')) &&
      (rawLine.includes('سعر') || rawLine.includes('price'))
    ) {
      continue;
    }

    const stdLine = convertArabicDigitsToStandard(rawLine);

    // Split by tabs, commas, semicolons or multiple spaces
    let parts = stdLine.split(/\t|;|,\s*|\s{2,}/).map(p => p.trim()).filter(Boolean);
    if (parts.length < 2) {
      // Fallback: split by space
      parts = stdLine.split(/\s+/).filter(Boolean);
    }

    if (parts.length >= 2) {
      let code = '';
      let name = '';
      let unit = 'كرتونه';
      let wholesale = 0;
      let retail = 0;

      // Extract numbers from the parts for wholesale & retail prices
      const priceNumbers: number[] = [];
      const nonPriceTokens: string[] = [];

      parts.forEach(p => {
        const parsedNum = parsePriceValue(p);
        const looksLikePrice = (parsedNum > 0 && parsedNum <= 1000000);
        // Exclude 6+ digits long codes from being treated as single prices unless with decimal
        const isLongCode = /^\d{6,}$/.test(p) && !p.includes('.') && !p.includes(',');

        if (looksLikePrice && !isLongCode) {
          priceNumbers.push(parsedNum);
        } else {
          nonPriceTokens.push(p);
        }
      });

      if (priceNumbers.length >= 2) {
        wholesale = priceNumbers[priceNumbers.length - 2];
        retail = priceNumbers[priceNumbers.length - 1];
      } else if (priceNumbers.length === 1) {
        wholesale = priceNumbers[0];
        retail = priceNumbers[0];
      }

      // Detect code from non-price tokens or early numeric tokens
      let codeIndex = -1;
      for (let pIdx = 0; pIdx < parts.length; pIdx++) {
        const token = parts[pIdx];
        if (!/[\u0600-\u06FF]/.test(token) && (/^\d{3,14}$/.test(token) || /^[a-zA-Z0-9_-]{3,14}$/.test(token))) {
          const numVal = parsePriceValue(token);
          if (!priceNumbers.includes(numVal) || parts.length > 3) {
            code = token;
            codeIndex = pIdx;
            break;
          }
        }
      }

      // Check for unit in tokens
      for (const p of parts) {
        if (commonUnits.includes(p)) {
          unit = p;
          break;
        }
      }

      // Formulate name from Arabic tokens or all parts except prices and code
      const nameParts = parts.filter((p, idx) => {
        if (idx === codeIndex) return false;
        if (commonUnits.includes(p)) return false;
        const numVal = parsePriceValue(p);
        if (numVal > 0 && (numVal === wholesale || numVal === retail)) return false;
        return true;
      });

      name = nameParts.join(' ').trim();
      if (!name) {
        name = nonPriceTokens.filter(t => !commonUnits.includes(t) && t !== code).join(' ').trim();
      }

      if (name || code || wholesale > 0 || retail > 0) {
        items.push({
          code: code || `P-${10000 + i}`,
          name: name || `صنف مستورد ${i + 1}`,
          unit,
          price_wholesale: wholesale,
          price_retail: retail,
          stock: 50,
          category: 'عام',
          isValid: Boolean(name),
          errors: name ? [] : ['اسم الصنف غير واضح']
        });
      }
    }
  }

  return items;
}

/**
 * Downloads a pre-formatted Excel template with strictly the 5 required columns
 */
export function downloadSampleExcelTemplate() {
  const sampleData = [
    {
      'كود الصنف': '10001',
      'اسم الصنف': 'سكر ابيض ممتاز 1 كجم * 10 كيس',
      'الوحدة': 'كرتونه',
      'سعر الجملة': 210,
      'سعر التجزئة': 215
    },
    {
      'كود الصنف': '10002',
      'اسم الصنف': 'زيت خليط قلية 700 مل * 12 زجاجة',
      'الوحدة': 'كرتونه',
      'سعر الجملة': 390,
      'سعر التجزئة': 400
    },
    {
      'كود الصنف': '10003',
      'اسم الصنف': 'مكرونة فرن 400 جم * 20 كيس',
      'الوحدة': 'كرتونه',
      'سعر الجملة': 180,
      'سعر التجزئة': 190
    },
    {
      'كود الصنف': '10004',
      'اسم الصنف': 'شاي ناعم 250 جم * 24 باكت',
      'الوحدة': 'كرتونه',
      'سعر الجملة': 580,
      'سعر التجزئة': 600
    },
    {
      'كود الصنف': '10005',
      'اسم الصنف': 'مسحوق غسيل اتوماتيك 3 كجم * 4 اكياس',
      'الوحدة': 'طرد',
      'سعر الجملة': 420,
      'سعر التجزئة': 440
    }
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleData);
  // Set column widths for the 5 fixed columns
  worksheet['!cols'] = [
    { wch: 15 }, // كود الصنف
    { wch: 40 }, // اسم الصنف
    { wch: 15 }, // الوحدة
    { wch: 15 }, // سعر الجملة
    { wch: 15 }  // سعر التجزئة
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'الأصناف');

  XLSX.writeFile(workbook, 'نموذج_استيراد_الاصناف_الخمسة_اعمدة.xlsx');
}

/**
 * Exports current products list to an Excel spreadsheet
 */
export function exportProductsToExcel(products: Product[]) {
  const exportRows = products.map(p => ({
    'كود الصنف': p.code,
    'اسم الصنف': p.name,
    'الوحدة': p.unit,
    'سعر الجملة': p.price_wholesale,
    'سعر التجزئة': p.price,
    'الرصيد الحالي': p.stock || 0,
    'التصنيف': p.category || 'عام',
    'الباركود': p.barcode || ''
  }));

  const worksheet = XLSX.utils.json_to_sheet(exportRows);
  worksheet['!cols'] = [
    { wch: 15 },
    { wch: 40 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 },
    { wch: 25 },
    { wch: 20 }
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'دليل_الأصناف');
  XLSX.writeFile(workbook, `دليل_الاصناف_${new Date().toISOString().split('T')[0]}.xlsx`);
}

/**
 * Analyzes imported items against the existing database to detect
 * Price Increases, Decreases, New Items, and Unchanged Items.
 * Uses high-performance O(1) indexed lookup to prevent UI freezing.
 */
export function compareImportWithExisting(
  importItems: ParsedImportItem[],
  existingProducts: Product[]
): {
  items: ComparedImportItem[];
  stats: {
    total: number;
    increases: number;
    decreases: number;
    newItems: number;
    unchanged: number;
    changesOnlyCount: number;
    duplicatesMerged: number;
  };
} {
  // First, deduplicate items within the imported batch itself
  const { deduplicated, duplicatesMerged } = deduplicateImportRows(importItems);

  // Build high-speed lookup index for instant O(1) matching
  const productIndex = buildProductIndex(existingProducts || []);

  let increases = 0;
  let decreases = 0;
  let newItems = 0;
  let unchanged = 0;

  const comparedList: ComparedImportItem[] = deduplicated.map(item => {
    // Strictly match by product code, NOT solely by name!
    const match = matchProductIndexed(item, productIndex, true);

    if (!match) {
      newItems++;
      return {
        ...item,
        changeStatus: 'new' as const,
        hasPriceChange: false,
        oldWholesale: 0,
        oldRetail: 0,
        diffWholesale: item.price_wholesale,
        diffRetail: item.price_retail,
        pctWholesale: 0,
        pctRetail: 0
      };
    }

    const oldWholesale = match.price_wholesale || match.price || 0;
    const oldRetail = match.price || 0;
    const diffWholesale = item.price_wholesale - oldWholesale;
    const diffRetail = item.price_retail - oldRetail;

    const pctWholesale = oldWholesale > 0 ? (diffWholesale / oldWholesale) * 100 : 0;
    const pctRetail = oldRetail > 0 ? (diffRetail / oldRetail) * 100 : 0;

    let changeStatus: 'increase' | 'decrease' | 'unchanged' = 'unchanged';

    // If either wholesale or retail price changed
    if (diffWholesale > 0 || diffRetail > 0) {
      changeStatus = 'increase';
      increases++;
    } else if (diffWholesale < 0 || diffRetail < 0) {
      changeStatus = 'decrease';
      decreases++;
    } else {
      changeStatus = 'unchanged';
      unchanged++;
    }

    const hasPriceChange = changeStatus === 'increase' || changeStatus === 'decrease';

    const resolvedName = (item.name && item.name.trim() && !item.name.startsWith('صنف غير مسمى'))
      ? item.name
      : match.name;

    return {
      ...item,
      name: resolvedName,
      code: item.code || match.code,
      unit: (item.unit && item.unit !== 'كرتونه') ? item.unit : (match.unit || item.unit),
      category: item.category || match.category || 'عام',
      changeStatus,
      hasPriceChange,
      oldWholesale,
      oldRetail,
      diffWholesale,
      diffRetail,
      pctWholesale,
      pctRetail,
      existingProductId: match.id
    };
  });

  return {
    items: comparedList,
    stats: {
      total: comparedList.length,
      increases,
      decreases,
      newItems,
      unchanged,
      changesOnlyCount: increases + decreases,
      duplicatesMerged
    }
  };
}

/**
 * Exports price changes (increases & decreases) to Excel report
 */
export function exportPriceChangesToExcel(comparedItems: ComparedImportItem[]) {
  const changeItems = comparedItems.filter(i => i.hasPriceChange || i.changeStatus === 'new');

  const exportRows = changeItems.map(item => {
    let statusLabel = 'سعر ثابت';
    if (item.changeStatus === 'increase') statusLabel = 'زيادة في السعر ⬆️';
    else if (item.changeStatus === 'decrease') statusLabel = 'نقصان في السعر ⬇️';
    else if (item.changeStatus === 'new') statusLabel = 'صنف جديد 🆕';

    return {
      'كود الصنف': item.code,
      'اسم الصنف': item.name,
      'الوحدة': item.unit,
      'حالة السعر': statusLabel,
      'سعر الجملة القديم': item.oldWholesale || '-',
      'سعر الجملة الجديد': item.price_wholesale,
      'فارق الجملة (+/-)': item.diffWholesale > 0 ? `+${item.diffWholesale}` : item.diffWholesale,
      'نسبة التغير (جملة)': item.oldWholesale > 0 ? `${item.pctWholesale.toFixed(1)}%` : '-',
      'سعر القطاعي القديم': item.oldRetail || '-',
      'سعر القطاعي الجديد': item.price_retail,
      'فارق القطاعي (+/-)': item.diffRetail > 0 ? `+${item.diffRetail}` : item.diffRetail,
      'نسبة التغير (قطاعي)': item.oldRetail > 0 ? `${item.pctRetail.toFixed(1)}%` : '-'
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(exportRows);
  worksheet['!cols'] = [
    { wch: 15 },
    { wch: 38 },
    { wch: 12 },
    { wch: 20 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 }
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'تقرير_تغيرات_الأسعار');
  XLSX.writeFile(workbook, `تقرير_الزيادات_والنقصان_${new Date().toISOString().split('T')[0]}.xlsx`);
}

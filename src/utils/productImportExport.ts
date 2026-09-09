import * as XLSX from 'xlsx';
import { Product } from '../types';

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

const KNOWN_CODE_HEADERS = ['كود الصنف', 'كود', 'code', 'item_code', 'item code', 'barcode', 'الباركود', 'رقم الصنف', 'الرمز'];
const KNOWN_NAME_HEADERS = ['اسم الصنف', 'الاسم', 'الصنف', 'name', 'product_name', 'item_name', 'item', 'product', 'البيان', 'اسم المنتج'];
const KNOWN_UNIT_HEADERS = ['الوحدة', 'وحدة', 'unit', 'uom', 'نوع التعبئة', 'العبوة'];
const KNOWN_RETAIL_HEADERS = ['سعر التجزئة', 'سعر القطاعي', 'سعر البيع', 'قطاعي', 'تجزئة', 'retail_price', 'price', 'retail', 'القطاعي'];
const KNOWN_WHOLESALE_HEADERS = ['سعر الجملة', 'جملة', 'سعر جملة', 'wholesale_price', 'wholesale', 'price_wholesale', 'الجملة'];
const KNOWN_STOCK_HEADERS = ['الكمية', 'المخزون', 'الرصيد', 'stock', 'quantity', 'qty', 'الكميه'];
const KNOWN_CAT_HEADERS = ['التصنيف', 'القسم', 'المجموعة', 'category', 'الفئة'];

function matchHeader(headers: string[], candidates: string[]): string {
  for (const h of headers) {
    const clean = h.trim().toLowerCase();
    for (const c of candidates) {
      if (clean === c.toLowerCase() || clean.includes(c.toLowerCase())) {
        return h;
      }
    }
  }
  return '';
}

/**
 * Automatically maps detected sheet columns to standard product attributes
 */
export function autoDetectColumnMapping(headers: string[]): ColumnMapping {
  return {
    codeCol: matchHeader(headers, KNOWN_CODE_HEADERS) || headers[0] || '',
    nameCol: matchHeader(headers, KNOWN_NAME_HEADERS) || headers[1] || '',
    unitCol: matchHeader(headers, KNOWN_UNIT_HEADERS) || headers[2] || '',
    retailPriceCol: matchHeader(headers, KNOWN_RETAIL_HEADERS) || headers[3] || '',
    wholesalePriceCol: matchHeader(headers, KNOWN_WHOLESALE_HEADERS) || headers[4] || '',
    stockCol: matchHeader(headers, KNOWN_STOCK_HEADERS) || '',
    categoryCol: matchHeader(headers, KNOWN_CAT_HEADERS) || ''
  };
}

/**
 * Parses an Excel or CSV file buffer and returns raw rows and headers
 */
export function parseExcelFile(fileData: ArrayBuffer): { headers: string[]; rawRows: Record<string, any>[] } {
  const workbook = XLSX.read(fileData, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });
  if (jsonData.length === 0) {
    return { headers: [], rawRows: [] };
  }

  const headers = Object.keys(jsonData[0]);
  return { headers, rawRows: jsonData };
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
    const rawCode = String(row[mapping.codeCol] || '').trim();
    const rawName = String(row[mapping.nameCol] || '').trim();
    const rawUnit = String(row[mapping.unitCol] || 'كرتونه').trim() || 'كرتونه';

    const retailStr = String(row[mapping.retailPriceCol] || '').replace(/[^\d.]/g, '');
    const wholesaleStr = String(row[mapping.wholesalePriceCol] || '').replace(/[^\d.]/g, '');
    const stockStr = mapping.stockCol ? String(row[mapping.stockCol] || '50').replace(/[^\d.]/g, '') : '50';
    const categoryStr = mapping.categoryCol ? String(row[mapping.categoryCol] || 'عام').trim() : 'عام';

    const retailPrice = parseFloat(retailStr) || 0;
    const wholesalePrice = parseFloat(wholesaleStr) || retailPrice;
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
 * Parses text table copied from a PDF or document
 */
export function parseTextOrPdfTable(text: string): ParsedImportItem[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  const items: ParsedImportItem[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip common header lines if present
    if (line.includes('كود') && line.includes('اسم') && line.includes('سعر')) {
      continue;
    }

    // Split by tabs, commas, semicolons or multiple spaces
    let parts = line.split(/\t|;|,\s*|\s{2,}/).map(p => p.trim()).filter(Boolean);
    if (parts.length < 2) {
      // Fallback: split by space
      parts = line.split(/\s+/).filter(Boolean);
    }

    if (parts.length >= 2) {
      let code = '';
      let name = '';
      let unit = 'كرتونه';
      let wholesale = 0;
      let retail = 0;

      // Check if first part looks like a code (numeric or short code)
      if (/^\d+$/.test(parts[0]) || parts[0].length <= 8) {
        code = parts[0];
        name = parts.slice(1, parts.length - 2 > 1 ? parts.length - 2 : 2).join(' ');
      } else {
        name = parts[0];
        code = `P-${10000 + i}`;
      }

      // Extract numbers from the end for wholesale & retail prices
      const numbers: number[] = [];
      parts.forEach(p => {
        const num = parseFloat(p.replace(/[^\d.]/g, ''));
        if (!isNaN(num) && num > 0) {
          numbers.push(num);
        }
      });

      if (numbers.length >= 2) {
        wholesale = numbers[numbers.length - 2];
        retail = numbers[numbers.length - 1];
      } else if (numbers.length === 1) {
        retail = numbers[0];
        wholesale = numbers[0];
      }

      // Check for unit in remaining parts
      const commonUnits = ['كرتونه', 'بالتة', 'شكاره', 'علبة', 'ربطة', 'طرد', 'صفيحة', 'جركن', 'كيلو', 'قطعة', 'كيس'];
      for (const p of parts) {
        if (commonUnits.includes(p)) {
          unit = p;
          break;
        }
      }

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

  return items;
}

/**
 * Downloads a pre-formatted Excel template with the 5 required columns
 */
export function downloadSampleExcelTemplate() {
  const sampleData = [
    {
      'كود الصنف': '10001',
      'اسم الصنف': 'سكر ابيض ممتاز 1 كجم * 10 كيس',
      'الوحدة': 'كرتونه',
      'سعر الجملة': 210,
      'سعر التجزئة': 215,
      'الرصيد': 50,
      'التصنيف': 'مواد غذائية أساسية'
    },
    {
      'كود الصنف': '10002',
      'اسم الصنف': 'زيت خليط قلية 700 مل * 12 زجاجة',
      'الوحدة': 'كرتونه',
      'سعر الجملة': 390,
      'سعر التجزئة': 400,
      'الرصيد': 30,
      'التصنيف': 'زيوت وسمن'
    },
    {
      'كود الصنف': '10003',
      'اسم الصنف': 'مكرونة فرن 400 جم * 20 كيس',
      'الوحدة': 'كرتونه',
      'سعر الجملة': 180,
      'سعر التجزئة': 190,
      'الرصيد': 45,
      'التصنيف': 'مكرونات وبقوليات'
    },
    {
      'كود الصنف': '10004',
      'اسم الصنف': 'شاي ناعم 250 جم * 24 باكت',
      'الوحدة': 'كرتونه',
      'سعر الجملة': 580,
      'سعر التجزئة': 600,
      'الرصيد': 20,
      'التصنيف': 'مشروبات وشاي'
    },
    {
      'كود الصنف': '10005',
      'اسم الصنف': 'مسحوق غسيل اتوماتيك 3 كجم * 4 اكياس',
      'الوحدة': 'طرد',
      'سعر الجملة': 420,
      'سعر التجزئة': 440,
      'الرصيد': 15,
      'التصنيف': 'منظفات وعناية'
    }
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleData);
  // Set column widths
  worksheet['!cols'] = [
    { wch: 15 }, // كود الصنف
    { wch: 40 }, // اسم الصنف
    { wch: 15 }, // الوحدة
    { wch: 15 }, // سعر الجملة
    { wch: 15 }, // سعر التجزئة
    { wch: 12 }, // الرصيد
    { wch: 25 }  // التصنيف
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'الأصناف');

  XLSX.writeFile(workbook, 'نموذج_استيراد_الاصناف.xlsx');
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
 * Supports unlimited items seamlessly.
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
  };
} {
  const byCode = new Map<string, Product>();
  const byName = new Map<string, Product>();

  existingProducts.forEach(p => {
    if (p.code) byCode.set(p.code.toLowerCase().trim(), p);
    if (p.name) byName.set(p.name.toLowerCase().trim(), p);
  });

  let increases = 0;
  let decreases = 0;
  let newItems = 0;
  let unchanged = 0;

  const comparedList: ComparedImportItem[] = importItems.map(item => {
    const codeKey = item.code?.toLowerCase().trim();
    const nameKey = item.name?.toLowerCase().trim();
    const match = (codeKey ? byCode.get(codeKey) : undefined) || (nameKey ? byName.get(nameKey) : undefined);

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

    const oldWholesale = match.price_wholesale || 0;
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

    return {
      ...item,
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
      changesOnlyCount: increases + decreases
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

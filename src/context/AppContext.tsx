import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import {
  Product,
  ShortageList,
  ShortageItem,
  PriceSnapshot,
  PriceChangeDay,
  PriceChangeItem,
  Sale,
  SaleItem,
  Purchase,
  PurchaseItem,
  CashCounterSession,
  CustomerDebt,
  DebtTransaction,
  DatabaseBackup
} from '../types';
import { INITIAL_DATABASE } from '../data/initialData';
import { normalizeArabicText } from '../utils/customerImportExport';
import { 
  findMatchingProduct, 
  cleanProductCode, 
  normalizeArabicProductText,
  buildProductIndex,
  matchProductIndexed,
  addProductToIndex
} from '../utils/productImportExport';

interface ToastInfo {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
}

interface AppContextType {
  theme: 'light' | 'dark' | 'red_dark';
  setTheme: (theme: 'light' | 'dark' | 'red_dark') => void;
  storeName: string;
  setStoreName: (name: string) => void;
  isOnline: boolean;
  showStartupAlert: boolean;
  setShowStartupAlert: (show: boolean) => void;

  products: Product[];
  shortageLists: ShortageList[];
  shortageItems: ShortageItem[];
  priceSnapshots: PriceSnapshot[];
  priceChangeDays: PriceChangeDay[];
  priceChangeItems: PriceChangeItem[];
  sales: Sale[];
  purchases: Purchase[];
  cashSessions: CashCounterSession[];
  customerDebts: CustomerDebt[];
  toasts: ToastInfo[];
  showToast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  removeToast: (id: string) => void;

  // Products
  addProduct: (product: Omit<Product, 'id' | 'created_at' | 'updated_at'>) => void;
  updateProduct: (id: string, product: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
  clearAllProducts: () => void;
  fixSwappedProductsCodeAndName: (mode?: 'auto' | 'force_all') => { fixedCount: number; totalCount: number };
  bulkImportProducts: (
    items: Array<Omit<Product, 'id' | 'created_at' | 'updated_at'>>,
    mode?: 'merge' | 'append' | 'replace'
  ) => { imported: number; updated: number; added: number; unchanged: number };
  clearProductPriceFlags: () => void;

  // Shortages
  createShortageList: (dateStr: string) => string;
  deleteShortageList: (listId: string) => void;
  addShortageItem: (listId: string, productName: string, notes?: string, productId?: string | null) => void;
  toggleShortageItemArrived: (itemId: string) => void;
  deleteShortageItem: (itemId: string) => void;

  // Price Changes
  recordPriceChangeDay: (
    dayDateOrPayload: string | {
      date?: string;
      title?: string;
      notes?: string;
      changes: Array<any>;
    },
    changes?: Array<any>
  ) => void;
  clearPriceChanges: () => void;

  // POS & Sales
  completeSale: (sale: Omit<Sale, 'id' | 'created_at' | 'invoice_number'>) => Sale;
  deleteSale: (saleId: string) => void;

  // Purchases
  completePurchase: (purchase: Omit<Purchase, 'id' | 'created_at' | 'invoice_number'>) => Purchase;
  deletePurchase: (purchaseId: string) => void;

  // Customer Debts & Directory
  addCustomer: (data: {
    customer_code?: string;
    customer_name: string;
    phone: string;
    phone2?: string;
    address?: string;
    initialDebt?: number;
    notes?: string;
  }) => CustomerDebt;
  updateCustomer: (id: string, updates: Partial<CustomerDebt>) => void;
  deleteCustomer: (id: string) => void;
  bulkImportCustomers: (
    items: Array<{
      customer_code?: string;
      customer_name: string;
      phone?: string;
      phone2?: string;
      address?: string;
      initialDebt?: number;
      notes?: string;
    }>,
    mode?: 'merge' | 'append' | 'replace'
  ) => { imported: number; updated: number; added: number };
  addCustomerDebt: (name: string, phone: string, initialDebt: number, notes?: string) => void;
  addDebtTransaction: (customerId: string, type: 'debt_increase' | 'payment', amount: number, notes: string) => void;
  deleteCustomerDebt: (customerId: string) => void;
  clearAllCustomers: () => void;

  // Cash Session
  saveCashSession: (session: CashCounterSession) => void;

  // Backup & Restore
  exportDatabaseJSON: () => string;
  importDatabaseJSON: (jsonString: string) => boolean;
  exportProductsJSON: () => string;
  importProductsJSON: (jsonString: string) => boolean;
  resetToDefaultDatabase: () => void;
  exportBackupJSON: () => string;
  importBackupJSON: (jsonString: string) => boolean;
  resetToInitialData: () => void;
}

const STORAGE_KEY = 'store_pos_erp_database_v1';

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Theme State ('red_dark' | 'dark' | 'light')
  const [theme, setThemeState] = useState<'light' | 'dark' | 'red_dark'>(() => {
    try {
      const savedTheme = localStorage.getItem('app_theme_mode');
      if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'red_dark') {
        return savedTheme;
      }
    } catch (e) {
      console.error(e);
    }
    return 'red_dark'; // Default to the Red & Dark theme matching user screenshot
  });

  const setTheme = (newTheme: 'light' | 'dark' | 'red_dark') => {
    setThemeState(newTheme);
    try {
      localStorage.setItem('app_theme_mode', newTheme);
    } catch (e) {
      console.error(e);
    }
  };

  // Store branding title
  const [storeName, setStoreNameState] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('app_store_name');
      if (saved) return saved;
    } catch (e) {
      console.error(e);
    }
    return 'أولاد طه للجملة';
  });

  const setStoreName = (name: string) => {
    setStoreNameState(name);
    try {
      localStorage.setItem('app_store_name', name);
    } catch (e) {
      console.error(e);
    }
  };

  // Real-time online/offline network monitor
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Startup alert state
  const [showStartupAlert, setShowStartupAlert] = useState<boolean>(() => {
    try {
      const hidden = localStorage.getItem('store_hide_online_startup_modal');
      return hidden !== 'true';
    } catch (e) {
      return true;
    }
  });

  const [products, setProducts] = useState<Product[]>([]);
  const [shortageLists, setShortageLists] = useState<ShortageList[]>([]);
  const [shortageItems, setShortageItems] = useState<ShortageItem[]>([]);
  const [priceSnapshots, setPriceSnapshots] = useState<PriceSnapshot[]>([]);
  const [priceChangeDays, setPriceChangeDays] = useState<PriceChangeDay[]>([]);
  const [priceChangeItems, setPriceChangeItems] = useState<PriceChangeItem[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [cashSessions, setCashSessions] = useState<CashCounterSession[]>([]);
  const [customerDebts, setCustomerDebts] = useState<CustomerDebt[]>([]);
  const [toasts, setToasts] = useState<ToastInfo[]>([]);
  const isInitialized = useRef<boolean>(false);

  // Load from LocalStorage or Initial Database
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: DatabaseBackup = JSON.parse(stored);
        if (parsed && parsed.tables) {
          let loadedProducts = Array.isArray(parsed.tables.products)
            ? parsed.tables.products
            : (INITIAL_DATABASE.tables.products || []);
          
          // Auto-detect and fix any swapped products (where name contains numeric code and code contains Arabic/name)
          let autoFixedOnLoad = 0;
          loadedProducts = loadedProducts.map((p: Product) => {
            const nameVal = String(p.name || '').trim();
            const codeVal = String(p.code || '').trim();
            const nameIsDigits = /^\d+$/.test(nameVal);
            const codeIsDigits = /^\d+$/.test(codeVal);
            const nameHasArabic = /[\u0600-\u06FF]/.test(nameVal);
            const codeHasArabic = /[\u0600-\u06FF]/.test(codeVal);
            const nameIsCodePattern = /^(p|prd|itm|c)[-_]?\d+/i.test(nameVal);

            if ((nameIsDigits && !codeIsDigits) || (!nameHasArabic && codeHasArabic) || (nameIsCodePattern && codeHasArabic) || (codeVal.length > nameVal.length && codeVal.includes(' ') && !nameVal.includes(' ') && !codeIsDigits)) {
              autoFixedOnLoad++;
              return {
                ...p,
                name: codeVal,
                code: nameVal,
                updated_at: new Date().toISOString()
              };
            }
            return p;
          });

          setProducts(loadedProducts);
          if (autoFixedOnLoad > 0) {
            console.log(`[ERP] Auto-fixed ${autoFixedOnLoad} products with swapped code and name on initialization.`);
          }
          setShortageLists(parsed.tables.shortage_lists || []);
          setShortageItems(parsed.tables.shortage_items || []);
          setPriceSnapshots(parsed.tables.price_snapshots || []);

          // Quick lookup maps for product name and code resolution
          const productsById = new Map<string, Product>();
          const productsByCode = new Map<string, Product>();
          loadedProducts.forEach((p: Product) => {
            if (p.id) productsById.set(p.id, p);
            if (p.code) productsByCode.set(String(p.code).trim().toLowerCase(), p);
          });

          // Bulletproof sanitation for price_change_days so object dates never crash React
          const rawDays = parsed.tables.price_change_days && parsed.tables.price_change_days.length > 0
            ? parsed.tables.price_change_days
            : INITIAL_DATABASE.tables.price_change_days;
          const cleanDays: PriceChangeDay[] = rawDays.map((d: any, idx: number) => {
            let cleanDate = '';
            if (typeof d?.day_date === 'string') {
              cleanDate = d.day_date;
            } else if (d?.day_date && typeof d.day_date.date === 'string') {
              cleanDate = d.day_date.date;
            } else if (d?.created_at && typeof d.created_at === 'string') {
              cleanDate = d.created_at.split('T')[0];
            } else {
              cleanDate = new Date().toISOString().split('T')[0];
            }
            return {
              id: String(d?.id || `pday-${Date.now()}-${idx}`),
              day_date: cleanDate,
              created_at: typeof d?.created_at === 'string' ? d.created_at : new Date().toISOString(),
              title: typeof d?.title === 'string' ? d.title : (typeof d?.day_date?.title === 'string' ? d.day_date.title : undefined),
              notes: typeof d?.notes === 'string' ? d.notes : (typeof d?.day_date?.notes === 'string' ? d.day_date.notes : undefined)
            };
          });

          // Price Changes MUST be strictly linked to products:
          // If products are cleared or empty, price change history must also be empty!
          if (loadedProducts.length === 0) {
            setPriceChangeDays([]);
            setPriceChangeItems([]);
          } else {
            const rawItems = parsed.tables.price_change_items && parsed.tables.price_change_items.length > 0
              ? parsed.tables.price_change_items
              : INITIAL_DATABASE.tables.price_change_items;

            // Only keep price change items that belong to an existing product in the system
            const cleanItems: PriceChangeItem[] = [];
            rawItems.forEach((item: any, idx: number) => {
              const pId = String(item?.product_id || item?.productId || '');
              const itemCode = String(item?.code || item?.item_code || '').trim();
              const matchedProd = (pId ? productsById.get(pId) : undefined) || (itemCode ? productsByCode.get(itemCode.toLowerCase()) : undefined);

              // If product no longer exists in products database, exclude it (prevents orphaned ghost items)
              if (!matchedProd) {
                return;
              }

              const rawName = String(
                item?.product_name || 
                item?.name || 
                item?.productName || 
                item?.itemName || 
                item?.item_name || 
                item?.product || 
                ''
              ).trim();

              const finalName = (rawName && rawName !== 'صنف بدون اسم' && rawName !== 'صنف' && !rawName.startsWith('صنف غير مسمى'))
                ? rawName
                : matchedProd.name;
              const finalCode = itemCode || matchedProd.code || '';

              const wNew = Number(item?.price_wholesale ?? item?.new_wholesale ?? item?.newWholesale ?? matchedProd.price_wholesale ?? 0);
              const rNew = Number(item?.price_retail ?? item?.new_retail ?? item?.newRetail ?? item?.price ?? matchedProd.price ?? 0);
              const wOld = Number(item?.old_price_wholesale ?? item?.old_wholesale ?? item?.oldWholesale ?? 0);
              const rOld = Number(item?.old_price_retail ?? item?.old_retail ?? item?.oldRetail ?? 0);

              cleanItems.push({
                id: String(item?.id || `pitem-${Date.now()}-${idx}`),
                day_id: String(item?.day_id || (cleanDays[0]?.id || 'pday-1')),
                product_id: matchedProd.id,
                product_name: finalName,
                code: finalCode,
                price_wholesale: isNaN(wNew) ? 0 : wNew,
                price_retail: isNaN(rNew) ? 0 : rNew,
                old_price_wholesale: isNaN(wOld) ? 0 : wOld,
                old_price_retail: isNaN(rOld) ? 0 : rOld,
                created_at: typeof item?.created_at === 'string' ? item.created_at : new Date().toISOString(),
                is_new: !!(item?.is_new ?? item?.isNew ?? (item?.status === 'new'))
              });
            });

            const activeDayIds = new Set(cleanItems.map(i => i.day_id));
            const filteredDays = cleanDays.filter(d => activeDayIds.has(d.id));
            setPriceChangeDays(filteredDays.length > 0 ? filteredDays : cleanDays);
            setPriceChangeItems(cleanItems);
          }

          setSales(parsed.tables.sales || []);
          setPurchases(parsed.tables.purchases || []);
          setCashSessions(parsed.tables.cash_counter_sessions || []);

          // Bulletproof sanitation for customer_debts so customer_code and address are always available
          const rawCusts = parsed.tables.customer_debts && parsed.tables.customer_debts.length > 0
            ? parsed.tables.customer_debts
            : INITIAL_DATABASE.tables.customer_debts;
          const cleanCusts: CustomerDebt[] = rawCusts.map((c: any, idx: number) => {
            const isGeneralCash = c?.customer_name === 'عميل نقدي عام' || c?.customer_code === '94';
            return {
              id: String(c?.id || `cust-${Date.now()}-${idx}`),
              customer_code: c?.customer_code ? String(c.customer_code).trim() : (isGeneralCash ? '94' : String(101 + idx)),
              customer_name: String(c?.customer_name || 'عميل بدون اسم'),
              phone: String(c?.phone || (isGeneralCash ? '01000000094' : '')),
              phone2: String(c?.phone2 || ''),
              address: String(c?.address || (isGeneralCash ? 'المنفذ والمخزن الرئيسي' : '')),
              current_debt: Number(c?.current_debt) || 0,
              notes: String(c?.notes || ''),
              created_at: typeof c?.created_at === 'string' ? c.created_at : new Date().toISOString(),
              updated_at: typeof c?.updated_at === 'string' ? c.updated_at : new Date().toISOString(),
              transactions: Array.isArray(c?.transactions) ? c.transactions : []
            };
          });

          // Ensure default cash customer 94 exists
          if (!cleanCusts.some(c => c.customer_code === '94' || c.customer_name === 'عميل نقدي عام')) {
            cleanCusts.unshift({
              id: 'debt-demo-94',
              customer_code: '94',
              customer_name: 'عميل نقدي عام',
              address: 'المنفذ والمخزن الرئيسي',
              phone: '01000000094',
              phone2: '',
              current_debt: 0,
              notes: 'حساب العميل النقدي الافتراضي للمبيعات المباشرة',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              transactions: []
            });
          }
          setCustomerDebts(cleanCusts);
          isInitialized.current = true;
          return;
        }
      }
    } catch (e) {
      console.error('Failed to load from storage, using initial dataset', e);
    }

    // Default load
    setProducts(INITIAL_DATABASE.tables.products);
    setShortageLists(INITIAL_DATABASE.tables.shortage_lists);
    setShortageItems(INITIAL_DATABASE.tables.shortage_items);
    setPriceSnapshots(INITIAL_DATABASE.tables.price_snapshots);
    setPriceChangeDays(INITIAL_DATABASE.tables.price_change_days);
    setPriceChangeItems(INITIAL_DATABASE.tables.price_change_items);
    setSales(INITIAL_DATABASE.tables.sales || []);
    setPurchases([]);
    setCashSessions(INITIAL_DATABASE.tables.cash_counter_sessions || []);
    setCustomerDebts(INITIAL_DATABASE.tables.customer_debts || []);
    isInitialized.current = true;
  }, []);

  // Debounced Save to LocalStorage (eliminates UI lag)
  useEffect(() => {
    if (!isInitialized.current) return;

    const timer = setTimeout(() => {
      const backup: DatabaseBackup = {
        version: 1,
        created_at: new Date().toISOString(),
        tables: {
          products,
          sales,
          purchases,
          sale_items: [],
          shortage_lists: shortageLists,
          shortage_items: shortageItems,
          price_snapshots: priceSnapshots,
          price_change_days: priceChangeDays,
          price_change_items: priceChangeItems,
          cash_counter_sessions: cashSessions,
          cash_counter_denominations: [],
          customer_debts: customerDebts
        }
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(backup));
      } catch (e) {
        console.warn('LocalStorage save failed:', e);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [
    products,
    sales,
    purchases,
    shortageLists,
    shortageItems,
    priceSnapshots,
    priceChangeDays,
    priceChangeItems,
    cashSessions,
    customerDebts
  ]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'success') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Products Handlers
  const addProduct = (item: Omit<Product, 'id' | 'created_at' | 'updated_at'>) => {
    const now = new Date().toISOString();
    const newProduct: Product = {
      ...item,
      id: crypto.randomUUID ? crypto.randomUUID() : 'prod-' + Date.now(),
      is_new: true,
      price_change_type: 'none',
      created_at: now,
      updated_at: now
    };
    setProducts(prev => [newProduct, ...prev]);
    showToast(`تمت إضافة الصنف "${newProduct.name}" بنجاح كصنف جديد`);
  };

  const updateProduct = (id: string, updates: Partial<Product>) => {
    setProducts(prev =>
      prev.map(p => {
        if (p.id === id) {
          const oldW = Number(p.price_wholesale) || 0;
          const oldR = Number(p.price) || 0;
          const newW = updates.price_wholesale !== undefined ? Number(updates.price_wholesale) : oldW;
          const newR = updates.price !== undefined ? Number(updates.price) : oldR;

          let priceChangeType: 'increase' | 'decrease' | 'none' = p.price_change_type || 'none';
          let prevOldW = p.old_price_wholesale ?? oldW;
          let prevOldR = p.old_price ?? oldR;

          if (newR > oldR || newW > oldW) {
            priceChangeType = 'increase';
            prevOldR = oldR;
            prevOldW = oldW;
          } else if (newR < oldR || newW < oldW) {
            priceChangeType = 'decrease';
            prevOldR = oldR;
            prevOldW = oldW;
          }

          return {
            ...p,
            ...updates,
            old_price: prevOldR,
            old_price_wholesale: prevOldW,
            price_change_type: priceChangeType,
            updated_at: new Date().toISOString()
          };
        }
        return p;
      })
    );
    showToast('تم تحديث بيانات الصنف بنجاح');
  };

  const deleteProduct = (id: string) => {
    const target = products.find(p => p.id === id);
    setProducts(prev => prev.filter(p => p.id !== id));
    // Remove linked price change items for this product
    setPriceChangeItems(prev => prev.filter(item => item.product_id !== id && item.code !== target?.code));
    showToast(`تم حذف الصنف ${target ? `"${target.name}"` : ''}`);
  };

  const clearProductPriceFlags = () => {
    setProducts(prev =>
      prev.map(p => ({
        ...p,
        price_change_type: 'none',
        is_new: false,
        old_price: undefined,
        old_price_wholesale: undefined
      }))
    );
    showToast('تم تصفير علامات الأسعار والأصناف الجديدة بنجاح');
  };

  const clearAllProducts = () => {
    const prevCount = products.length;
    setProducts([]);
    // Price changes MUST be cleared too so no phantom 4000 items remain!
    setPriceChangeDays([]);
    setPriceChangeItems([]);
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: DatabaseBackup = JSON.parse(stored);
        if (parsed && parsed.tables) {
          parsed.tables.products = [];
          parsed.tables.price_change_days = [];
          parsed.tables.price_change_items = [];
          localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
        }
      }
    } catch (e) {
      console.error('Failed to sync cleared products to storage', e);
    }
    showToast(`تم مسح كافة الأصناف (${prevCount} صنف) بنجاح. القائمة جاهزة الآن للاستيراد النظيف.`);
  };

  const clearPriceChanges = () => {
    const prevCount = priceChangeItems.length;
    setPriceChangeDays([]);
    setPriceChangeItems([]);
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: DatabaseBackup = JSON.parse(stored);
        if (parsed && parsed.tables) {
          parsed.tables.price_change_days = [];
          parsed.tables.price_change_items = [];
          localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
        }
      }
    } catch (e) {
      console.error('Failed to sync cleared price changes to storage', e);
    }
    showToast(`تم مسح وتصفير سجل الزيادة والنقصان بالكامل (${prevCount} سجل) بنجاح.`);
  };

  const bulkImportProducts = (
    items: Array<Omit<Product, 'id' | 'created_at' | 'updated_at'>>,
    mode: 'merge' | 'append' | 'replace' = 'merge'
  ) => {
    const now = new Date().toISOString();
    let updatedCount = 0;
    let addedCount = 0;
    let unchangedCount = 0;

    if (mode === 'replace') {
      const newProductList: Product[] = items.map((item, idx) => ({
        ...item,
        id: crypto.randomUUID ? crypto.randomUUID() : `prod-imp-${Date.now()}-${idx}`,
        is_new: false,
        price_change_type: 'none',
        old_price: undefined,
        old_price_wholesale: undefined,
        created_at: now,
        updated_at: now
      }));
      setProducts(newProductList);
      // Clean slate
      setPriceChangeDays([]);
      setPriceChangeItems([]);
      showToast(`تم استبدال الأصناف بـ ${newProductList.length} صنف مستورد بنجاح وبدء قائمة نظيفة`);
      return { imported: newProductList.length, updated: 0, added: newProductList.length, unchanged: 0 };
    }

    const changesToLog: Array<{
      productId: string;
      productName: string;
      code: string;
      unit: string;
      newWholesale: number;
      newRetail: number;
      oldWholesale: number;
      oldRetail: number;
      diffWholesale: number;
      diffRetail: number;
      isNew: boolean;
    }> = [];

    setProducts(prev => {
      const resultList = [...prev];
      const productIndex = buildProductIndex(resultList);

      items.forEach((item) => {
        if (!item || (!item.name?.trim() && !item.code?.trim())) return;

        // Ensure prices are valid numbers and fallback gracefully
        const incomingRetail = Number(item.price) || 0;
        const incomingWholesale = Number(item.price_wholesale) || 0;
        const validRetail = incomingRetail > 0 ? incomingRetail : (incomingWholesale > 0 ? incomingWholesale : 0);
        const validWholesale = incomingWholesale > 0 ? incomingWholesale : (incomingRetail > 0 ? incomingRetail : 0);

        // Strictly match by code, NOT solely by name!
        const match = matchProductIndexed(item, productIndex, true);

        if (match) {
          if (mode !== 'append') {
            // EXISTING PRODUCT: update prices while strictly preserving existing stock!
            const oldW = Number(match.price_wholesale) || Number(match.price) || 0;
            const newW = validWholesale > 0 ? validWholesale : oldW;
            const oldR = Number(match.price) || 0;
            const newR = validRetail > 0 ? validRetail : oldR;

            const hasPriceDiff = (newW !== oldW) || (newR !== oldR);
            let changeType: 'increase' | 'decrease' | 'none' = 'none';
            let oldP = match.old_price ?? oldR;
            let oldPW = match.old_price_wholesale ?? oldW;

            if (hasPriceDiff) {
              updatedCount++;
              if (newR > oldR || newW > oldW) {
                changeType = 'increase';
              } else if (newR < oldR || newW < oldW) {
                changeType = 'decrease';
              }
              oldP = oldR;
              oldPW = oldW;
            } else {
              unchangedCount++;
              changeType = match.price_change_type || 'none';
            }

            const targetIndex = productIndex.productIndexMap.get(match.id) ?? resultList.findIndex(p => p.id === match.id);
            if (targetIndex !== -1 && targetIndex < resultList.length) {
              const safeName = (item.name && String(item.name).trim() && !String(item.name).startsWith('صنف غير مسمى'))
                ? String(item.name).trim()
                : resultList[targetIndex].name;

              const updatedItem: Product = {
                ...resultList[targetIndex],
                name: safeName, // اسم الصنف بالكود يتغير
                code: (item.code && String(item.code).trim()) ? String(item.code).trim() : resultList[targetIndex].code,
                unit: (item.unit && String(item.unit).trim() && item.unit !== 'كرتونه') ? String(item.unit).trim() : (resultList[targetIndex].unit || item.unit),
                price: newR,
                price_wholesale: newW,
                old_price: hasPriceDiff ? oldP : resultList[targetIndex].old_price,
                old_price_wholesale: hasPriceDiff ? oldPW : resultList[targetIndex].old_price_wholesale,
                price_change_type: hasPriceDiff ? changeType : resultList[targetIndex].price_change_type,
                is_new: false,
                stock: resultList[targetIndex].stock ?? 0,
                category: (item.category && item.category !== 'عام') ? item.category : resultList[targetIndex].category,
                updated_at: now
              };
              resultList[targetIndex] = updatedItem;
              // Keep index updated
              addProductToIndex(productIndex, updatedItem, targetIndex);

              if (hasPriceDiff) {
                changesToLog.push({
                  productId: updatedItem.id,
                  productName: updatedItem.name,
                  code: updatedItem.code,
                  unit: updatedItem.unit,
                  newWholesale: newW,
                  newRetail: newR,
                  oldWholesale: oldW,
                  oldRetail: oldR,
                  diffWholesale: newW - oldW,
                  diffRetail: newR - oldR,
                  isNew: false
                });
              }
            }
          }
        } else {
          // NEW PRODUCT: register new item without duplicates (وليس أصناف فوق أصناف)
          const newId = crypto.randomUUID ? crypto.randomUUID() : `prod-imp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          const safeName = (item.name && String(item.name).trim()) ? String(item.name).trim() : `صنف جديد ${item.code || ''}`;
          const newProduct: Product = {
            ...item,
            id: newId,
            name: safeName,
            price: validRetail,
            price_wholesale: validWholesale,
            is_new: true,
            stock: item.stock !== undefined && item.stock !== null ? Number(item.stock) : 0,
            price_change_type: 'none',
            old_price: undefined,
            old_price_wholesale: undefined,
            created_at: now,
            updated_at: now
          };
          resultList.push(newProduct);
          addProductToIndex(productIndex, newProduct, resultList.length - 1);
          addedCount++;

          changesToLog.push({
            productId: newProduct.id,
            productName: newProduct.name,
            code: newProduct.code,
            unit: newProduct.unit,
            newWholesale: validWholesale,
            newRetail: validRetail,
            oldWholesale: 0,
            oldRetail: 0,
            diffWholesale: validWholesale,
            diffRetail: validRetail,
            isNew: true
          });
        }
      });

      return resultList;
    });

    // Record into Price Changes day history so it directly links to Price Changes list
    if (changesToLog.length > 0) {
      const today = new Date().toISOString().split('T')[0];
      const dayId = crypto.randomUUID ? crypto.randomUUID() : 'day-' + Date.now();
      const newDay: PriceChangeDay = {
        id: dayId,
        day_date: today,
        title: `استيراد إكسيل: ${today}`,
        notes: `تحديث أسعار ${updatedCount} صنف وإضافة ${addedCount} صنف جديد بالكود`,
        created_at: now
      };
      const newItems: PriceChangeItem[] = changesToLog.map((c, i) => ({
        id: crypto.randomUUID ? crypto.randomUUID() : `item-${Date.now()}-${i}`,
        day_id: dayId,
        product_id: c.productId,
        product_name: c.productName,
        code: c.code,
        price_wholesale: c.newWholesale,
        price_retail: c.newRetail,
        old_price_wholesale: c.oldWholesale,
        old_price_retail: c.oldRetail,
        created_at: now,
        is_new: c.isNew
      }));
      setPriceChangeDays(prev => [newDay, ...prev]);
      setPriceChangeItems(prev => [...newItems, ...prev]);
    }

    showToast(`تم الاستيراد بالكود: ${addedCount} صنف جديد، ${updatedCount} صنف تغير سعره، ${unchangedCount} بدون تغيير`);
    return { imported: items.length, updated: updatedCount, added: addedCount, unchanged: unchangedCount };
  };

  // Fix / swap product code and product name across all products (Fix All)
  const fixSwappedProductsCodeAndName = (mode: 'auto' | 'force_all' = 'auto'): { fixedCount: number; totalCount: number } => {
    let fixedCount = 0;
    const now = new Date().toISOString();
    let updatedProducts: Product[] = [];

    setProducts(prev => {
      updatedProducts = prev.map(p => {
        const codeVal = String(p.code || '').trim();
        const nameVal = String(p.name || '').trim();

        let shouldSwap = false;
        if (mode === 'force_all') {
          shouldSwap = Boolean(codeVal && nameVal && codeVal !== nameVal);
        } else {
          // Smart auto-detection:
          const nameIsDigits = /^\d+$/.test(nameVal);
          const codeIsDigits = /^\d+$/.test(codeVal);
          const nameHasArabic = /[\u0600-\u06FF]/.test(nameVal);
          const codeHasArabic = /[\u0600-\u06FF]/.test(codeVal);
          const nameIsCodePattern = /^(p|prd|itm|code|c)[-_]?\d+/i.test(nameVal);

          if (nameIsDigits && !codeIsDigits) {
            shouldSwap = true;
          } else if (!nameHasArabic && codeHasArabic) {
            shouldSwap = true;
          } else if (nameIsCodePattern && codeHasArabic) {
            shouldSwap = true;
          } else if (codeVal.length > nameVal.length && codeVal.includes(' ') && !nameVal.includes(' ') && !codeIsDigits) {
            shouldSwap = true;
          }
        }

        if (shouldSwap) {
          fixedCount++;
          return {
            ...p,
            name: codeVal,
            code: nameVal,
            updated_at: now
          };
        }
        return p;
      });
      return updatedProducts;
    });

    // Also update priceChangeItems
    setPriceChangeItems(prev => {
      return prev.map(item => {
        const nameVal = String(item.product_name || '').trim();
        const codeVal = String(item.code || '').trim();
        let shouldSwap = false;
        if (mode === 'force_all') {
          shouldSwap = Boolean(codeVal && nameVal && codeVal !== nameVal);
        } else {
          shouldSwap = (/^\d+$/.test(nameVal) && /[\u0600-\u06FF]/.test(codeVal)) ||
                       (codeVal.length > nameVal.length && codeVal.includes(' ') && !nameVal.includes(' '));
        }
        if (shouldSwap) {
          return {
            ...item,
            product_name: codeVal,
            code: nameVal
          };
        }
        return item;
      });
    });

    // Also update shortageItems
    setShortageItems(prev => {
      return prev.map(item => {
        const nameVal = String(item.product_name || '').trim();
        if (/^\d+$/.test(nameVal)) {
          const matched = updatedProducts.find(p => p.code === nameVal || p.id === item.product_id);
          if (matched && matched.name && !/^\d+$/.test(matched.name)) {
            return {
              ...item,
              product_name: matched.name
            };
          }
        }
        return item;
      });
    });

    if (fixedCount > 0) {
      showToast(`تم إصلاح وتصحيح ${fixedCount} صنف تم عكس أسمائها وأكوادها بنجاح`, 'success');
    } else {
      showToast('تم فحص جميع الأصناف وهي سليمة بالفعل', 'info');
    }

    return { fixedCount, totalCount: products.length };
  };

  // Shortage Lists Handlers
  const createShortageList = (dateStr: string) => {
    const now = new Date().toISOString();
    const existing = shortageLists.find(l => l.list_date === dateStr);
    if (existing) {
      showToast('توجد قائمة نواقص مسجلة بهذا التاريخ بالفعل', 'info');
      return existing.id;
    }
    const newList: ShortageList = {
      id: crypto.randomUUID ? crypto.randomUUID() : 'list-' + Date.now(),
      list_date: dateStr,
      archived_at: null,
      created_at: now,
      updated_at: now
    };
    setShortageLists(prev => [newList, ...prev]);
    showToast(`تم إنشاء قائمة نواقص لتاريخ ${dateStr}`);
    return newList.id;
  };

  const deleteShortageList = (listId: string) => {
    setShortageLists(prev => prev.filter(l => l.id !== listId));
    setShortageItems(prev => prev.filter(i => i.list_id !== listId));
    showToast('تم حذف قائمة النواقص وبنودها');
  };

  const addShortageItem = (
    listId: string,
    productName: string,
    notes: string = '',
    productId: string | null = null
  ) => {
    const newItem: ShortageItem = {
      id: crypto.randomUUID ? crypto.randomUUID() : 'item-' + Date.now(),
      list_id: listId,
      product_id: productId,
      product_name: productName,
      notes,
      created_at: new Date().toISOString(),
      arrived: false
    };
    setShortageItems(prev => [newItem, ...prev]);
    showToast(`تمت إضافة "${productName}" إلى قائمة النواقص`);
  };

  const toggleShortageItemArrived = (itemId: string) => {
    setShortageItems(prev =>
      prev.map(item => {
        if (item.id === itemId) {
          const nextState = !item.arrived;
          showToast(
            nextState
              ? `تم تعليم "${item.product_name}" كتم الاستلام`
              : `تم إلغاء استلام "${item.product_name}"`
          );
          return { ...item, arrived: nextState };
        }
        return item;
      })
    );
  };

  const deleteShortageItem = (itemId: string) => {
    setShortageItems(prev => prev.filter(i => i.id !== itemId));
    showToast('تم حذف الصنف من قائمة النواقص');
  };

  // Price Change Tracking
  const recordPriceChangeDay = (
    dayDateOrPayload: string | {
      date?: string;
      title?: string;
      notes?: string;
      changes: Array<any>;
    },
    changesParam?: Array<any>
  ) => {
    const now = new Date().toISOString();
    let dayDate: string;
    let rawChanges: any[] = [];
    let customTitle = '';
    let customNotes = '';

    if (typeof dayDateOrPayload === 'object' && dayDateOrPayload !== null) {
      dayDate = typeof dayDateOrPayload.date === 'string' ? dayDateOrPayload.date : now.split('T')[0];
      rawChanges = Array.isArray(dayDateOrPayload.changes) ? dayDateOrPayload.changes : [];
      customTitle = dayDateOrPayload.title || '';
      customNotes = dayDateOrPayload.notes || '';
    } else {
      dayDate = typeof dayDateOrPayload === 'string' ? dayDateOrPayload : now.split('T')[0];
      rawChanges = Array.isArray(changesParam) ? changesParam : [];
    }

    if (!rawChanges || rawChanges.length === 0) {
      return;
    }

    // Strictly record only items where price increased or decreased (per user requirement)
    const validChanges = rawChanges.filter(c => {
      const isNew = Boolean(c.isNew ?? c.is_new ?? (c.status === 'new'));
      if (isNew) return false;

      const newWholesale = Number(c.newWholesale ?? c.new_wholesale ?? c.price_wholesale ?? 0);
      const newRetail = Number(c.newRetail ?? c.new_retail ?? c.price_retail ?? c.price ?? 0);
      const oldWholesale = Number(c.oldWholesale ?? c.old_wholesale ?? c.old_price_wholesale ?? 0);
      const oldRetail = Number(c.oldRetail ?? c.old_retail ?? c.old_price_retail ?? 0);

      const diffW = oldWholesale > 0 ? Math.abs(newWholesale - oldWholesale) : 0;
      const diffR = oldRetail > 0 ? Math.abs(newRetail - oldRetail) : 0;
      const explicitDiffW = Math.abs(Number(c.diffWholesale ?? c.diff_wholesale ?? 0));
      const explicitDiffR = Math.abs(Number(c.diffRetail ?? c.diff_retail ?? 0));

      return diffW > 0.001 || diffR > 0.001 || explicitDiffW > 0.001 || explicitDiffR > 0.001;
    });

    if (validChanges.length === 0) {
      showToast('لم يتم رصد أي تغير في الأسعار (لا توجد زيادات أو نقصانات لتوثيقها)', 'info');
      return;
    }

    let day = priceChangeDays.find(d => {
      const dDate = typeof d?.day_date === 'string' ? d.day_date : (d?.day_date as any)?.date;
      return dDate === dayDate;
    });
    let dayId = day?.id;

    if (!day) {
      dayId = crypto.randomUUID ? crypto.randomUUID() : 'pday-' + Date.now();
      const newDay: PriceChangeDay = {
        id: dayId,
        day_date: dayDate,
        created_at: now,
        title: customTitle || undefined,
        notes: customNotes || undefined
      };
      setPriceChangeDays(prev => [newDay, ...prev]);
    }

    const newChangeItems: PriceChangeItem[] = validChanges.map((c, idx) => {
      const pId = c.productId || c.product_id || c.id || `prod-${Date.now()}-${idx}`;
      const codeStr = String(c.code || c.item_code || '').trim();
      const codeKey = codeStr.toLowerCase();
      
      const matchedProd = products.find(p => 
        (pId && p.id === pId) || 
        (codeKey && p.code && String(p.code).trim().toLowerCase() === codeKey)
      );

      const rawPName = String(c.productName || c.product_name || c.name || c.itemName || c.item_name || '').trim();
      const pName = (rawPName && rawPName !== 'صنف بدون اسم' && rawPName !== 'صنف' && !rawPName.startsWith('صنف غير مسمى'))
        ? rawPName
        : (matchedProd?.name || rawPName || 'صنف بدون اسم');
      const pCode = codeStr || matchedProd?.code || '';

      const newWholesale = Number(c.newWholesale ?? c.new_wholesale ?? c.price_wholesale ?? (matchedProd?.price_wholesale ?? 0));
      const newRetail = Number(c.newRetail ?? c.new_retail ?? c.price_retail ?? c.price ?? (matchedProd?.price ?? 0));
      const oldWholesale = Number(c.oldWholesale ?? c.old_wholesale ?? c.old_price_wholesale ?? 0);
      const oldRetail = Number(c.oldRetail ?? c.old_retail ?? c.old_price_retail ?? 0);

      return {
        id: crypto.randomUUID ? crypto.randomUUID() : 'pchange-' + Math.random().toString(36).substring(2, 9),
        day_id: dayId!,
        product_id: pId || matchedProd?.id || `prod-${idx}`,
        product_name: pName,
        code: pCode,
        price_wholesale: isNaN(newWholesale) ? 0 : newWholesale,
        price_retail: isNaN(newRetail) ? 0 : newRetail,
        old_price_wholesale: isNaN(oldWholesale) ? 0 : oldWholesale,
        old_price_retail: isNaN(oldRetail) ? 0 : oldRetail,
        created_at: now,
        is_new: false
      };
    });

    setPriceChangeItems(prev => [...newChangeItems, ...prev]);

    // Also update product prices in products table
    setProducts(prev =>
      prev.map(prod => {
        const matchingChange = validChanges.find(c => {
          const cId = c.productId || c.product_id || c.id;
          const cCode = c.code ? String(c.code).trim().toLowerCase() : '';
          const pCode = prod.code ? String(prod.code).trim().toLowerCase() : '';
          return (cId && cId === prod.id) || (cCode && pCode && cCode === pCode);
        });

        if (matchingChange) {
          const newW = Number(matchingChange.newWholesale ?? matchingChange.new_wholesale ?? matchingChange.price_wholesale ?? prod.price_wholesale);
          const newR = Number(matchingChange.newRetail ?? matchingChange.new_retail ?? matchingChange.price_retail ?? matchingChange.price ?? prod.price);
          return {
            ...prod,
            price_wholesale: isNaN(newW) ? prod.price_wholesale : newW,
            price: isNaN(newR) ? prod.price : newR,
            updated_at: now
          };
        }
        return prod;
      })
    );

    showToast(`تم توثيق ${newChangeItems.length} صنف تغيرت أسعارها (زيادة أو نقصان) بنجاح`);
  };

  // Sales & POS Checkout
  const completeSale = (saleData: Omit<Sale, 'id' | 'created_at' | 'invoice_number'>): Sale => {
    const now = new Date().toISOString();
    const invoiceNumber = 'INV-' + (sales.length + 1).toString().padStart(5, '0');
    const newSaleId = crypto.randomUUID ? crypto.randomUUID() : 'sale-' + Date.now();

    const newSale: Sale = {
      ...saleData,
      id: newSaleId,
      invoice_number: invoiceNumber,
      created_at: now,
      customer_code: saleData.customer_code?.trim() || undefined,
      customer_name: saleData.customer_name?.trim() || 'عميل نقدي عام',
      customer_phone: saleData.customer_phone?.trim() || undefined,
      customer_address: saleData.customer_address?.trim() || undefined,
      items: saleData.items.map(item => ({
        ...item,
        id: crypto.randomUUID ? crypto.randomUUID() : 'sitem-' + Math.random().toString(36).substr(2, 9),
        sale_id: newSaleId
      }))
    };

    setSales(prev => [newSale, ...prev]);

    // Deduct stock for products
    setProducts(prev =>
      prev.map(p => {
        const soldItem = newSale.items.find(si => si.product_id === p.id);
        if (soldItem) {
          return {
            ...p,
            stock: Math.max(0, (p.stock || 0) - soldItem.quantity),
            updated_at: now
          };
        }
        return p;
      })
    );

    // If sale is 'debt', automatically update or create customer debt
    if (newSale.payment_type === 'debt' && newSale.customer_name) {
      const existingCust = customerDebts.find(
        c => (newSale.customer_code && c.customer_code && c.customer_code.trim().toLowerCase() === newSale.customer_code.trim().toLowerCase()) ||
             c.customer_name.trim().toLowerCase() === newSale.customer_name.trim().toLowerCase()
      );
      if (existingCust) {
        if ((!existingCust.address && newSale.customer_address) || (!existingCust.phone && newSale.customer_phone)) {
          updateCustomer(existingCust.id, {
            address: existingCust.address || newSale.customer_address || '',
            phone: existingCust.phone || newSale.customer_phone || ''
          });
        }
        addDebtTransaction(
          existingCust.id,
          'debt_increase',
          newSale.final_amount,
          `فاتورة مبيعات آجل #${newSale.invoice_number}`
        );
      } else {
        addCustomer({
          customer_code: newSale.customer_code,
          customer_name: newSale.customer_name,
          phone: newSale.customer_phone || '',
          address: newSale.customer_address || '',
          initialDebt: newSale.final_amount,
          notes: `فاتورة أولى آجل #${newSale.invoice_number}`
        });
      }
    }

    showToast(`تم إصدار الفاتورة ${newSale.invoice_number} بنجاح بقيمة ${newSale.final_amount} ج.م`);
    return newSale;
  };

  const deleteSale = (saleId: string) => {
    const target = sales.find(s => s.id === saleId);
    setSales(prev => prev.filter(s => s.id !== saleId));
    showToast(`تم حذف الفاتورة ${target ? target.invoice_number : ''} بنجاح`);
  };

  // Purchases & Warehouse Inward
  const completePurchase = (purchaseData: Omit<Purchase, 'id' | 'created_at' | 'invoice_number'>): Purchase => {
    const now = new Date().toISOString();
    const invoiceNumber = 'PUR-' + (purchases.length + 1).toString().padStart(5, '0');
    const newPurchaseId = crypto.randomUUID ? crypto.randomUUID() : 'pur-' + Date.now();

    const newPurchase: Purchase = {
      ...purchaseData,
      id: newPurchaseId,
      invoice_number: invoiceNumber,
      created_at: now,
      items: purchaseData.items.map(item => ({
        ...item,
        id: crypto.randomUUID ? crypto.randomUUID() : 'pitem-' + Math.random().toString(36).substr(2, 9),
        purchase_id: newPurchaseId
      }))
    };

    setPurchases(prev => [newPurchase, ...prev]);

    // Add stock for products & update cost price
    setProducts(prev =>
      prev.map(p => {
        const boughtItem = newPurchase.items.find(pi => pi.product_id === p.id);
        if (boughtItem) {
          return {
            ...p,
            stock: (p.stock || 0) + boughtItem.quantity,
            cost_price: boughtItem.unit_cost > 0 ? boughtItem.unit_cost : p.cost_price,
            updated_at: now
          };
        }
        return p;
      })
    );

    showToast(`تم حفظ إذن التوريد والمشتريات ${newPurchase.invoice_number} وإضافة الكميات للمخزن بنجاح`);
    return newPurchase;
  };

  const deletePurchase = (purchaseId: string) => {
    const target = purchases.find(p => p.id === purchaseId);
    setPurchases(prev => prev.filter(p => p.id !== purchaseId));
    showToast(`تم حذف إذن الشراء ${target ? target.invoice_number : ''} بنجاح`);
  };

  // Customer Debts & Directory
  const addCustomer = (data: {
    customer_code?: string;
    customer_name: string;
    phone: string;
    phone2?: string;
    address?: string;
    initialDebt?: number;
    notes?: string;
  }): CustomerDebt => {
    const now = new Date().toISOString();
    const initialDebt = Number(data.initialDebt) || 0;
    const code = data.customer_code?.trim() || `CUST-${(customerDebts.length + 1).toString().padStart(3, '0')}`;
    const newCust: CustomerDebt = {
      id: crypto.randomUUID ? crypto.randomUUID() : 'cust-' + Date.now(),
      customer_code: code,
      customer_name: data.customer_name.trim(),
      phone: data.phone.trim(),
      phone2: data.phone2?.trim() || '',
      address: data.address?.trim() || '',
      current_debt: initialDebt,
      notes: data.notes?.trim() || '',
      created_at: now,
      updated_at: now,
      transactions: initialDebt > 0 ? [
        {
          id: 'tx-' + Date.now(),
          date: now.split('T')[0],
          type: 'debt_increase',
          amount: initialDebt,
          notes: data.notes || 'رصيد افتتاحي / مديونية سابقة'
        }
      ] : []
    };
    setCustomerDebts(prev => [newCust, ...prev]);
    showToast(`تمت إضافة العميل "${newCust.customer_name}" بنجاح`);
    return newCust;
  };

  const updateCustomer = (id: string, updates: Partial<CustomerDebt>) => {
    const now = new Date().toISOString();
    setCustomerDebts(prev =>
      prev.map(c => {
        if (c.id === id) {
          return {
            ...c,
            ...updates,
            updated_at: now
          };
        }
        return c;
      })
    );
    showToast('تم تحديث بيانات العميل بنجاح');
  };

  const deleteCustomer = (id: string) => {
    const target = customerDebts.find(c => c.id === id);
    setCustomerDebts(prev => prev.filter(c => c.id !== id));
    showToast(`تم حذف سجل العميل ${target ? `"${target.customer_name}"` : ''} بنجاح`);
  };

  const bulkImportCustomers = (
    items: Array<{
      customer_code?: string;
      customer_name: string;
      phone?: string;
      phone2?: string;
      address?: string;
      initialDebt?: number;
      notes?: string;
    }>,
    mode: 'merge' | 'append' | 'replace' = 'merge'
  ) => {
    const now = new Date().toISOString();
    let updatedCount = 0;
    let addedCount = 0;

    setCustomerDebts(prev => {
      let currentList = mode === 'replace' ? [] : [...prev];

      items.forEach((item, idx) => {
        if (!item.customer_name?.trim()) return;

        const code = item.customer_code?.trim() || '';
        const normName = normalizeArabicText(item.customer_name);

        // Match existing customer by code or normalized name (prevents duplicate customers with the same name!)
        const existingIdx = currentList.findIndex(
          c => (code && c.customer_code && c.customer_code.trim().toLowerCase() === code.toLowerCase()) ||
               (normalizeArabicText(c.customer_name) === normName)
        );

        if (existingIdx !== -1) {
          if (mode !== 'append') {
            // Update address, phone1, phone2, notes
            const existing = currentList[existingIdx];
            const newPhone = item.phone?.trim();
            const newPhone2 = item.phone2?.trim();
            const newAddress = item.address?.trim();
            const newNotes = item.notes?.trim();

            currentList[existingIdx] = {
              ...existing,
              customer_code: code || existing.customer_code || `CUST-${(existingIdx + 1).toString().padStart(3, '0')}`,
              phone: newPhone || existing.phone,
              phone2: newPhone2 || existing.phone2 || (newPhone && newPhone !== existing.phone ? newPhone : ''),
              address: newAddress || existing.address || '',
              notes: newNotes ? (existing.notes && !existing.notes.includes(newNotes) ? `${existing.notes} | ${newNotes}` : existing.notes || newNotes) : existing.notes,
              current_debt: (item.initialDebt !== undefined && item.initialDebt !== null && item.initialDebt > 0 && !existing.current_debt)
                ? Number(item.initialDebt)
                : existing.current_debt,
              updated_at: now
            };
            updatedCount++;
          }
        } else {
          // Add new customer
          const initialDebt = Number(item.initialDebt) || 0;
          const assignedCode = code || `CUST-${(currentList.length + idx + 1).toString().padStart(3, '0')}`;
          const newCust: CustomerDebt = {
            id: crypto.randomUUID ? crypto.randomUUID() : 'cust-' + Date.now() + '-' + idx,
            customer_code: assignedCode,
            customer_name: item.customer_name.trim(),
            phone: item.phone?.trim() || '',
            phone2: item.phone2?.trim() || '',
            address: item.address?.trim() || '',
            current_debt: initialDebt,
            notes: item.notes?.trim() || '',
            created_at: now,
            updated_at: now,
            transactions: initialDebt > 0 ? [
              {
                id: 'tx-' + Date.now() + '-' + idx,
                date: now.split('T')[0],
                type: 'debt_increase',
                amount: initialDebt,
                notes: 'رصيد افتتاحي من الاستيراد'
              }
            ] : []
          };
          currentList.unshift(newCust);
          addedCount++;
        }
      });

      // Ensure default cash customer 94 exists if replaced
      if (mode === 'replace' && !currentList.some(c => c.customer_code === '94' || c.customer_name === 'عميل نقدي عام')) {
        currentList.unshift({
          id: 'debt-demo-94',
          customer_code: '94',
          customer_name: 'عميل نقدي عام',
          phone: '01000000094',
          phone2: '',
          address: 'المنفذ والمخزن الرئيسي',
          current_debt: 0,
          notes: 'حساب نقدي للمبيعات الفورية',
          created_at: now,
          updated_at: now,
          transactions: []
        });
      }

      return currentList;
    });

    if (mode === 'replace') {
      showToast(`تم استبدال دليل العملاء واستيراد ${addedCount} عميل بنجاح`, 'success');
    } else {
      showToast(`تم استيراد ${addedCount + updatedCount} عميل (إضافة جديد: ${addedCount}، تحديث بيانات: ${updatedCount})`, 'success');
    }
    return { imported: addedCount + updatedCount, updated: updatedCount, added: addedCount };
  };

  const clearAllCustomers = () => {
    const prevCount = customerDebts.length;
    const now = new Date().toISOString();
    const defaultCashCustomer: CustomerDebt = {
      id: 'debt-demo-94',
      customer_code: '94',
      customer_name: 'عميل نقدي عام',
      phone: '01000000094',
      phone2: '',
      address: 'المنفذ والمخزن الرئيسي',
      current_debt: 0,
      notes: 'حساب نقدي للمبيعات الفورية',
      created_at: now,
      updated_at: now,
      transactions: []
    };

    setCustomerDebts([defaultCashCustomer]);

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: DatabaseBackup = JSON.parse(stored);
        if (parsed && parsed.tables) {
          parsed.tables.customer_debts = [defaultCashCustomer];
          localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
        }
      }
    } catch (e) {
      console.error('Failed to sync cleared customers to storage', e);
    }

    showToast(`تم مسح وتصفير كافة سجلات العملاء (${prevCount} عميل) بنجاح`);
  };

  const addCustomerDebt = (name: string, phone: string, initialDebt: number, notes: string = '') => {
    addCustomer({
      customer_name: name,
      phone,
      initialDebt,
      notes
    });
  };

  const addDebtTransaction = (
    customerId: string,
    type: 'debt_increase' | 'payment',
    amount: number,
    notes: string
  ) => {
    const now = new Date().toISOString();
    const newTx: DebtTransaction = {
      id: 'tx-' + Date.now() + Math.random().toString(36).substr(2, 4),
      date: now.split('T')[0],
      type,
      amount,
      notes
    };

    setCustomerDebts(prev =>
      prev.map(cust => {
        if (cust.id === customerId) {
          const newDebt =
            type === 'debt_increase'
              ? cust.current_debt + amount
              : Math.max(0, cust.current_debt - amount);
          return {
            ...cust,
            current_debt: newDebt,
            updated_at: now,
            transactions: [newTx, ...(cust.transactions || [])]
          };
        }
        return cust;
      })
    );

    showToast(
      type === 'payment'
        ? `تم تسجيل سداد دفعة بقيمة ${amount} ج.م`
        : `تم تسجيل زيادة دين بقيمة ${amount} ج.م`
    );
  };

  const deleteCustomerDebt = (customerId: string) => {
    deleteCustomer(customerId);
  };

  // Cash Session
  const saveCashSession = (session: CashCounterSession) => {
    setCashSessions(prev => {
      const idx = prev.findIndex(s => s.id === session.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = session;
        return next;
      }
      return [session, ...prev];
    });
    showToast('تم حفظ جلسة الكاشير وإجمالي النقدية بنجاح');
  };

  // Backup and Restore
  const exportDatabaseJSON = (): string => {
    const backup: DatabaseBackup = {
      version: 1,
      created_at: new Date().toISOString(),
      tables: {
        products,
        sales,
        purchases,
        sale_items: sales.flatMap(s => s.items),
        shortage_lists: shortageLists,
        shortage_items: shortageItems,
        price_snapshots: priceSnapshots,
        price_change_days: priceChangeDays,
        price_change_items: priceChangeItems,
        cash_counter_sessions: cashSessions,
        cash_counter_denominations: [],
        customer_debts: customerDebts
      }
    };
    return JSON.stringify(backup, null, 2);
  };

  const importDatabaseJSON = (jsonString: string): boolean => {
    try {
      const parsed: DatabaseBackup = JSON.parse(jsonString);
      if (!parsed || !parsed.tables || !Array.isArray(parsed.tables.products)) {
        showToast('ملف النسخ الاحتياطي غير صالح أو تالف', 'error');
        return false;
      }

      let restoredProducts: Product[] = parsed.tables.products || [];
      // Auto-detect and fix swapped product name/code upon database restore
      let swappedRestored = 0;
      restoredProducts = restoredProducts.map((p: Product) => {
        const nameVal = String(p.name || '').trim();
        const codeVal = String(p.code || '').trim();
        const nameIsDigits = /^\d+$/.test(nameVal);
        const codeIsDigits = /^\d+$/.test(codeVal);
        const nameHasArabic = /[\u0600-\u06FF]/.test(nameVal);
        const codeHasArabic = /[\u0600-\u06FF]/.test(codeVal);
        const nameIsCodePattern = /^(p|prd|itm|c)[-_]?\d+/i.test(nameVal);

        if ((nameIsDigits && !codeIsDigits) || (!nameHasArabic && codeHasArabic) || (nameIsCodePattern && codeHasArabic) || (codeVal.length > nameVal.length && codeVal.includes(' ') && !nameVal.includes(' ') && !codeIsDigits)) {
          swappedRestored++;
          return {
            ...p,
            name: codeVal,
            code: nameVal,
            updated_at: new Date().toISOString()
          };
        }
        return p;
      });

      setProducts(restoredProducts);
      setShortageLists(parsed.tables.shortage_lists || []);
      setShortageItems(parsed.tables.shortage_items || []);
      setPriceSnapshots(parsed.tables.price_snapshots || []);
      setPriceChangeDays(parsed.tables.price_change_days || []);
      setPriceChangeItems(parsed.tables.price_change_items || []);
      setSales(parsed.tables.sales || []);
      if (parsed.tables.purchases) {
        setPurchases(parsed.tables.purchases || []);
      }
      setCashSessions(parsed.tables.cash_counter_sessions || []);
      setCustomerDebts(parsed.tables.customer_debts || []);

      if (swappedRestored > 0) {
        showToast(`تم استيراد قاعدة البيانات وتصحيح ${swappedRestored} صنف كانت أسماؤها وأكوادها معكوسة!`, 'success');
      } else {
        showToast(`تم استيراد قاعدة البيانات بنجاح (${restoredProducts.length} صنف)`, 'success');
      }
      return true;
    } catch (err) {
      console.error(err);
      showToast('حدث خطأ أثناء قراءة ملف النسخ الاحتياطي', 'error');
      return false;
    }
  };

  const exportProductsJSON = (): string => {
    const productsBackup = {
      type: 'products_backup',
      version: 1,
      created_at: new Date().toISOString(),
      count: products.length,
      products
    };
    return JSON.stringify(productsBackup, null, 2);
  };

  const importProductsJSON = (jsonString: string): boolean => {
    try {
      const parsed = JSON.parse(jsonString);
      let list: Product[] = [];
      if (Array.isArray(parsed)) {
        list = parsed;
      } else if (parsed && Array.isArray(parsed.products)) {
        list = parsed.products;
      } else if (parsed && parsed.tables && Array.isArray(parsed.tables.products)) {
        list = parsed.tables.products;
      } else {
        showToast('ملف النسخة الاحتياطية للأصناف غير صالح', 'error');
        return false;
      }

      setProducts(list);
      showToast(`تم استعادة نسخة الأصناف بنجاح (${list.length} صنف)`, 'success');
      return true;
    } catch (e) {
      console.error(e);
      showToast('خطأ أثناء قراءة ملف الأصناف', 'error');
      return false;
    }
  };

  const resetToDefaultDatabase = () => {
    setProducts(INITIAL_DATABASE.tables.products);
    setShortageLists(INITIAL_DATABASE.tables.shortage_lists);
    setShortageItems(INITIAL_DATABASE.tables.shortage_items);
    setPriceSnapshots(INITIAL_DATABASE.tables.price_snapshots);
    setPriceChangeDays(INITIAL_DATABASE.tables.price_change_days);
    setPriceChangeItems(INITIAL_DATABASE.tables.price_change_items);
    setSales(INITIAL_DATABASE.tables.sales || []);
    setCashSessions(INITIAL_DATABASE.tables.cash_counter_sessions || []);
    setCustomerDebts(INITIAL_DATABASE.tables.customer_debts || []);
    showToast('تمت استعادة قاعدة البيانات الأصلية بنجاح');
  };

  return (
    <AppContext.Provider
      value={{
        theme,
        setTheme,
        storeName,
        setStoreName,
        isOnline,
        showStartupAlert,
        setShowStartupAlert,
        products,
        shortageLists,
        shortageItems,
        priceSnapshots,
        priceChangeDays,
        priceChangeItems,
        sales,
        purchases,
        cashSessions,
        customerDebts,
        toasts,
        showToast,
        removeToast,
        addProduct,
        updateProduct,
        deleteProduct,
        clearAllProducts,
        fixSwappedProductsCodeAndName,
        bulkImportProducts,
        clearProductPriceFlags,
        createShortageList,
        deleteShortageList,
        addShortageItem,
        toggleShortageItemArrived,
        deleteShortageItem,
        recordPriceChangeDay,
        clearPriceChanges,
        completeSale,
        deleteSale,
        completePurchase,
        deletePurchase,
        addCustomer,
        updateCustomer,
        deleteCustomer,
        bulkImportCustomers,
        addCustomerDebt,
        addDebtTransaction,
        deleteCustomerDebt,
        clearAllCustomers,
        saveCashSession,
        exportDatabaseJSON,
        importDatabaseJSON,
        exportProductsJSON,
        importProductsJSON,
        resetToDefaultDatabase,
        exportBackupJSON: exportDatabaseJSON,
        importBackupJSON: importDatabaseJSON,
        resetToInitialData: resetToDefaultDatabase
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};

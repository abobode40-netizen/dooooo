import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  Product,
  ShortageList,
  ShortageItem,
  PriceSnapshot,
  PriceChangeDay,
  PriceChangeItem,
  Sale,
  SaleItem,
  CashCounterSession,
  CustomerDebt,
  DebtTransaction,
  DatabaseBackup
} from '../types';
import { INITIAL_DATABASE } from '../data/initialData';

interface ToastInfo {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface AppContextType {
  products: Product[];
  shortageLists: ShortageList[];
  shortageItems: ShortageItem[];
  priceSnapshots: PriceSnapshot[];
  priceChangeDays: PriceChangeDay[];
  priceChangeItems: PriceChangeItem[];
  sales: Sale[];
  cashSessions: CashCounterSession[];
  customerDebts: CustomerDebt[];
  toasts: ToastInfo[];
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  removeToast: (id: string) => void;

  // Products
  addProduct: (product: Omit<Product, 'id' | 'created_at' | 'updated_at'>) => void;
  updateProduct: (id: string, product: Partial<Product>) => void;
  deleteProduct: (id: string) => void;

  // Shortages
  createShortageList: (dateStr: string) => string;
  deleteShortageList: (listId: string) => void;
  addShortageItem: (listId: string, productName: string, notes?: string, productId?: string | null) => void;
  toggleShortageItemArrived: (itemId: string) => void;
  deleteShortageItem: (itemId: string) => void;

  // Price Changes
  recordPriceChangeDay: (
    dayDate: string,
    changes: {
      productId: string;
      productName: string;
      code: string;
      newWholesale: number;
      newRetail: number;
      oldWholesale: number;
      oldRetail: number;
      isNew?: boolean;
    }[]
  ) => void;

  // POS & Sales
  completeSale: (sale: Omit<Sale, 'id' | 'created_at' | 'invoice_number'>) => Sale;

  // Customer Debts
  addCustomerDebt: (name: string, phone: string, initialDebt: number, notes?: string) => void;
  addDebtTransaction: (customerId: string, type: 'debt_increase' | 'payment', amount: number, notes: string) => void;
  deleteCustomerDebt: (customerId: string) => void;

  // Cash Session
  saveCashSession: (session: CashCounterSession) => void;

  // Backup & Restore
  exportDatabaseJSON: () => string;
  importDatabaseJSON: (jsonString: string) => boolean;
  resetToDefaultDatabase: () => void;
}

const STORAGE_KEY = 'store_pos_erp_database_v1';

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [shortageLists, setShortageLists] = useState<ShortageList[]>([]);
  const [shortageItems, setShortageItems] = useState<ShortageItem[]>([]);
  const [priceSnapshots, setPriceSnapshots] = useState<PriceSnapshot[]>([]);
  const [priceChangeDays, setPriceChangeDays] = useState<PriceChangeDay[]>([]);
  const [priceChangeItems, setPriceChangeItems] = useState<PriceChangeItem[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [cashSessions, setCashSessions] = useState<CashCounterSession[]>([]);
  const [customerDebts, setCustomerDebts] = useState<CustomerDebt[]>([]);
  const [toasts, setToasts] = useState<ToastInfo[]>([]);

  // Load from LocalStorage or Initial Database
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: DatabaseBackup = JSON.parse(stored);
        if (parsed && parsed.tables) {
          setProducts(parsed.tables.products || []);
          setShortageLists(parsed.tables.shortage_lists || []);
          setShortageItems(parsed.tables.shortage_items || []);
          setPriceSnapshots(parsed.tables.price_snapshots || []);
          setPriceChangeDays(parsed.tables.price_change_days || []);
          setPriceChangeItems(parsed.tables.price_change_items || []);
          setSales(parsed.tables.sales || []);
          setCashSessions(parsed.tables.cash_counter_sessions || []);
          setCustomerDebts(parsed.tables.customer_debts || []);
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
    setCashSessions(INITIAL_DATABASE.tables.cash_counter_sessions || []);
    setCustomerDebts(INITIAL_DATABASE.tables.customer_debts || []);
  }, []);

  // Save to LocalStorage whenever state changes
  useEffect(() => {
    if (products.length === 0 && shortageLists.length === 0) return;
    const backup: DatabaseBackup = {
      version: 1,
      created_at: new Date().toISOString(),
      tables: {
        products,
        sales,
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
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(backup));
    } catch (e) {
      console.warn('LocalStorage save failed:', e);
    }
  }, [
    products,
    sales,
    shortageLists,
    shortageItems,
    priceSnapshots,
    priceChangeDays,
    priceChangeItems,
    cashSessions,
    customerDebts
  ]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
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
      created_at: now,
      updated_at: now
    };
    setProducts(prev => [newProduct, ...prev]);
    showToast(`تمت إضافة الصنف "${newProduct.name}" بنجاح`);
  };

  const updateProduct = (id: string, updates: Partial<Product>) => {
    setProducts(prev =>
      prev.map(p => {
        if (p.id === id) {
          return {
            ...p,
            ...updates,
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
    showToast(`تم حذف الصنف ${target ? `"${target.name}"` : ''}`);
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
    dayDate: string,
    changes: {
      productId: string;
      productName: string;
      code: string;
      newWholesale: number;
      newRetail: number;
      oldWholesale: number;
      oldRetail: number;
      isNew?: boolean;
    }[]
  ) => {
    const now = new Date().toISOString();
    let day = priceChangeDays.find(d => d.day_date === dayDate);
    let dayId = day?.id;

    if (!day) {
      dayId = crypto.randomUUID ? crypto.randomUUID() : 'pday-' + Date.now();
      const newDay: PriceChangeDay = {
        id: dayId,
        day_date: dayDate,
        created_at: now
      };
      setPriceChangeDays(prev => [newDay, ...prev]);
    }

    const newChangeItems: PriceChangeItem[] = changes.map(c => ({
      id: crypto.randomUUID ? crypto.randomUUID() : 'pchange-' + Math.random().toString(36).substr(2, 9),
      day_id: dayId!,
      product_id: c.productId,
      product_name: c.productName,
      code: c.code,
      price_wholesale: c.newWholesale,
      price_retail: c.newRetail,
      old_price_wholesale: c.oldWholesale,
      old_price_retail: c.oldRetail,
      created_at: now,
      is_new: !!c.isNew
    }));

    setPriceChangeItems(prev => [...newChangeItems, ...prev]);

    // Also update product prices in products table
    setProducts(prev =>
      prev.map(prod => {
        const matchingChange = changes.find(c => c.productId === prod.id);
        if (matchingChange) {
          return {
            ...prod,
            price_wholesale: matchingChange.newWholesale,
            price: matchingChange.newRetail,
            updated_at: now
          };
        }
        return prod;
      })
    );

    showToast(`تم تسجيل ${changes.length} تعديل في أسعار الأصناف بنجاح`);
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
        c => c.customer_name.trim().toLowerCase() === newSale.customer_name.trim().toLowerCase()
      );
      if (existingCust) {
        addDebtTransaction(
          existingCust.id,
          'debt_increase',
          newSale.final_amount,
          `فاتورة مبيعات آجل #${newSale.invoice_number}`
        );
      } else {
        addCustomerDebt(
          newSale.customer_name,
          newSale.customer_phone || '',
          newSale.final_amount,
          `فاتورة أولى آجل #${newSale.invoice_number}`
        );
      }
    }

    showToast(`تم إصدار الفاتورة ${newSale.invoice_number} بنجاح بقيمة ${newSale.final_amount} ج.م`);
    return newSale;
  };

  // Customer Debts
  const addCustomerDebt = (name: string, phone: string, initialDebt: number, notes: string = '') => {
    const now = new Date().toISOString();
    const newCust: CustomerDebt = {
      id: crypto.randomUUID ? crypto.randomUUID() : 'debt-' + Date.now(),
      customer_name: name,
      phone,
      current_debt: initialDebt,
      notes,
      created_at: now,
      updated_at: now,
      transactions: initialDebt > 0 ? [
        {
          id: 'tx-' + Date.now(),
          date: now.split('T')[0],
          type: 'debt_increase',
          amount: initialDebt,
          notes: notes || 'رصيد افتتاحي / مديونية سابقة'
        }
      ] : []
    };
    setCustomerDebts(prev => [newCust, ...prev]);
    showToast(`تمت إضافة حساب العميل "${name}" بنجاح`);
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
            transactions: [newTx, ...cust.transactions]
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
    setCustomerDebts(prev => prev.filter(c => c.id !== customerId));
    showToast('تم حذف سجل حساب العميل');
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

      setProducts(parsed.tables.products || []);
      setShortageLists(parsed.tables.shortage_lists || []);
      setShortageItems(parsed.tables.shortage_items || []);
      setPriceSnapshots(parsed.tables.price_snapshots || []);
      setPriceChangeDays(parsed.tables.price_change_days || []);
      setPriceChangeItems(parsed.tables.price_change_items || []);
      setSales(parsed.tables.sales || []);
      setCashSessions(parsed.tables.cash_counter_sessions || []);
      setCustomerDebts(parsed.tables.customer_debts || []);

      showToast(`تم استيراد قاعدة البيانات بنجاح (${parsed.tables.products.length} صنف)`, 'success');
      return true;
    } catch (err) {
      console.error(err);
      showToast('حدث خطأ أثناء قراءة ملف النسخ الاحتياطي', 'error');
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
        products,
        shortageLists,
        shortageItems,
        priceSnapshots,
        priceChangeDays,
        priceChangeItems,
        sales,
        cashSessions,
        customerDebts,
        toasts,
        showToast,
        removeToast,
        addProduct,
        updateProduct,
        deleteProduct,
        createShortageList,
        deleteShortageList,
        addShortageItem,
        toggleShortageItemArrived,
        deleteShortageItem,
        recordPriceChangeDay,
        completeSale,
        addCustomerDebt,
        addDebtTransaction,
        deleteCustomerDebt,
        saveCashSession,
        exportDatabaseJSON,
        importDatabaseJSON,
        resetToDefaultDatabase
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

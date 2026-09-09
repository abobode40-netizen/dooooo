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
  Purchase,
  PurchaseItem,
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
  purchases: Purchase[];
  cashSessions: CashCounterSession[];
  customerDebts: CustomerDebt[];
  toasts: ToastInfo[];
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  removeToast: (id: string) => void;

  // Products
  addProduct: (product: Omit<Product, 'id' | 'created_at' | 'updated_at'>) => void;
  updateProduct: (id: string, product: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
  bulkImportProducts: (
    items: Array<Omit<Product, 'id' | 'created_at' | 'updated_at'>>,
    mode?: 'merge' | 'append' | 'replace'
  ) => { imported: number; updated: number; added: number; unchanged: number };

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
    }>
  ) => { imported: number; updated: number; added: number };
  addCustomerDebt: (name: string, phone: string, initialDebt: number, notes?: string) => void;
  addDebtTransaction: (customerId: string, type: 'debt_increase' | 'payment', amount: number, notes: string) => void;
  deleteCustomerDebt: (customerId: string) => void;

  // Cash Session
  saveCashSession: (session: CashCounterSession) => void;

  // Backup & Restore
  exportDatabaseJSON: () => string;
  importDatabaseJSON: (jsonString: string) => boolean;
  resetToDefaultDatabase: () => void;
  exportBackupJSON: () => string;
  importBackupJSON: (jsonString: string) => boolean;
  resetToInitialData: () => void;
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
  const [purchases, setPurchases] = useState<Purchase[]>([]);
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
          setPurchases(parsed.tables.purchases || []);
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
    setPurchases([]);
    setCashSessions(INITIAL_DATABASE.tables.cash_counter_sessions || []);
    setCustomerDebts(INITIAL_DATABASE.tables.customer_debts || []);
  }, []);

  // Debounced Save to LocalStorage (eliminates UI lag)
  useEffect(() => {
    if (products.length === 0 && shortageLists.length === 0) return;

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

  const bulkImportProducts = (
    items: Array<Omit<Product, 'id' | 'created_at' | 'updated_at'>>,
    mode: 'merge' | 'append' | 'replace' = 'merge'
  ) => {
    const now = new Date().toISOString();
    const todayStr = now.split('T')[0];
    let updatedCount = 0;
    let addedCount = 0;
    let unchangedCount = 0;

    if (mode === 'replace') {
      const newProductList: Product[] = items.map((item, idx) => ({
        ...item,
        id: crypto.randomUUID ? crypto.randomUUID() : `prod-imp-${Date.now()}-${idx}`,
        created_at: now,
        updated_at: now
      }));
      setProducts(newProductList);
      showToast(`تم استبدال الأصناف بـ ${newProductList.length} صنف مستورد بنجاح`);
      return { imported: newProductList.length, updated: 0, added: newProductList.length, unchanged: 0 };
    }

    let day = priceChangeDays.find(d => d.day_date === todayStr);
    let dayId = day?.id;
    if (!dayId) {
      dayId = crypto.randomUUID ? crypto.randomUUID() : 'pday-' + Date.now();
      const newDay: PriceChangeDay = {
        id: dayId,
        day_date: todayStr,
        created_at: now
      };
      setPriceChangeDays(prev => [newDay, ...prev]);
    }

    setProducts(prev => {
      const existingByCode = new Map<string, Product>(prev.map(p => [p.code.toLowerCase().trim(), p]));
      const existingByName = new Map<string, Product>(prev.map(p => [p.name.toLowerCase().trim(), p]));
      const resultList = [...prev];
      const newChangeItems: PriceChangeItem[] = [];

      items.forEach((item, idx) => {
        const codeKey = item.code?.toLowerCase().trim();
        const nameKey = item.name?.toLowerCase().trim();
        const match: Product | undefined = (codeKey ? existingByCode.get(codeKey) : undefined) || (nameKey ? existingByName.get(nameKey) : undefined);

        if (match && mode !== 'append') {
          // EXISTING PRODUCT: check price differences
          const oldW = Number(match.price_wholesale) || 0;
          const newW = Number(item.price_wholesale) > 0 ? Number(item.price_wholesale) : oldW;
          const oldR = Number(match.price) || 0;
          const newR = Number(item.price) > 0 ? Number(item.price) : oldR;

          const hasPriceDiff = (newW !== oldW) || (newR !== oldR);

          const targetIndex = resultList.findIndex(p => p.id === match.id);
          if (targetIndex !== -1) {
            resultList[targetIndex] = {
              ...resultList[targetIndex],
              name: item.name || resultList[targetIndex].name,
              unit: item.unit || resultList[targetIndex].unit,
              price: newR,
              price_wholesale: newW,
              stock: item.stock !== undefined && item.stock !== null ? item.stock : resultList[targetIndex].stock,
              category: item.category || resultList[targetIndex].category,
              updated_at: now
            };
          }

          if (hasPriceDiff) {
            updatedCount++;
            newChangeItems.push({
              id: crypto.randomUUID ? crypto.randomUUID() : `pitem-${Date.now()}-${idx}`,
              day_id: dayId!,
              product_id: match.id,
              product_name: match.name,
              code: match.code,
              price_wholesale: newW,
              price_retail: newR,
              old_price_wholesale: oldW,
              old_price_retail: oldR,
              created_at: now,
              is_new: false
            });
          } else {
            unchangedCount++;
          }
        } else {
          // NEW PRODUCT
          const newId = crypto.randomUUID ? crypto.randomUUID() : `prod-imp-${Date.now()}-${idx}`;
          const newProduct: Product = {
            ...item,
            id: newId,
            created_at: now,
            updated_at: now
          };
          resultList.unshift(newProduct);
          addedCount++;

          newChangeItems.push({
            id: crypto.randomUUID ? crypto.randomUUID() : `pitem-${Date.now()}-${idx}`,
            day_id: dayId!,
            product_id: newId,
            product_name: newProduct.name,
            code: newProduct.code,
            price_wholesale: newProduct.price_wholesale || 0,
            price_retail: newProduct.price || 0,
            old_price_wholesale: 0,
            old_price_retail: 0,
            created_at: now,
            is_new: true
          });
        }
      });

      if (newChangeItems.length > 0) {
        setPriceChangeItems(prevItems => [...newChangeItems, ...prevItems]);
      }

      return resultList;
    });

    showToast(`تم الاستيراد: ${addedCount} صنف جديد، ${updatedCount} صنف تغير سعره، ${unchangedCount} بدون تغيير`);
    return { imported: items.length, updated: updatedCount, added: addedCount, unchanged: unchangedCount };
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
    }>
  ) => {
    const now = new Date().toISOString();
    let updatedCount = 0;
    let addedCount = 0;

    setCustomerDebts(prev => {
      const currentList = [...prev];
      items.forEach((item, idx) => {
        if (!item.customer_name?.trim()) return;

        const code = item.customer_code?.trim() || '';
        const name = item.customer_name.trim().toLowerCase();

        // Match existing customer by code or name
        const existingIdx = currentList.findIndex(
          c => (code && c.customer_code && c.customer_code.trim().toLowerCase() === code.toLowerCase()) ||
               (c.customer_name.trim().toLowerCase() === name)
        );

        if (existingIdx !== -1) {
          // Update address, phone1, phone2, notes
          const existing = currentList[existingIdx];
          currentList[existingIdx] = {
            ...existing,
            customer_code: code || existing.customer_code || `CUST-${(existingIdx + 1).toString().padStart(3, '0')}`,
            phone: item.phone?.trim() || existing.phone,
            phone2: item.phone2?.trim() || existing.phone2 || '',
            address: item.address?.trim() || existing.address || '',
            notes: item.notes?.trim() || existing.notes || '',
            updated_at: now
          };
          updatedCount++;
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
      return currentList;
    });

    showToast(`تم استيراد ${addedCount + updatedCount} عميل (إضافة جديد: ${addedCount}، تحديث بيانات: ${updatedCount})`);
    return { imported: addedCount + updatedCount, updated: updatedCount, added: addedCount };
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
        purchases,
        cashSessions,
        customerDebts,
        toasts,
        showToast,
        removeToast,
        addProduct,
        updateProduct,
        deleteProduct,
        bulkImportProducts,
        createShortageList,
        deleteShortageList,
        addShortageItem,
        toggleShortageItemArrived,
        deleteShortageItem,
        recordPriceChangeDay,
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
        saveCashSession,
        exportDatabaseJSON,
        importDatabaseJSON,
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

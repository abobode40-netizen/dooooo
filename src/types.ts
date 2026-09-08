export interface Product {
  id: string;
  name: string;
  barcode: string | null;
  price: number; // Retail price (قطاعي)
  cost: number;
  stock: number;
  category: string | null;
  created_at: string;
  updated_at: string;
  code: string;
  unit: string;
  price_wholesale: number; // Wholesale price (جملة)
}

export interface ShortageList {
  id: string;
  list_date: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShortageItem {
  id: string;
  list_id: string;
  product_id: string | null;
  product_name: string;
  notes: string;
  created_at: string;
  arrived: boolean;
}

export interface PriceSnapshot {
  product_id: string;
  price_wholesale: number;
  price_retail: number;
  updated_at: string;
}

export interface PriceChangeDay {
  id: string;
  day_date: string;
  created_at: string;
}

export interface PriceChangeItem {
  id: string;
  day_id: string;
  product_id: string;
  product_name: string;
  code: string;
  price_wholesale: number;
  price_retail: number;
  old_price_wholesale: number;
  old_price_retail: number;
  created_at: string;
  is_new: boolean;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string;
  product_name: string;
  unit: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  price_type: 'retail' | 'wholesale';
}

export interface Sale {
  id: string;
  invoice_number: string;
  created_at: string;
  total_amount: number;
  discount: number;
  final_amount: number;
  payment_type: 'cash' | 'debt' | 'visa';
  customer_name: string;
  customer_phone?: string;
  cashier_name?: string;
  notes?: string;
  items: SaleItem[];
}

export interface CashCounterDenomination {
  id: string;
  session_id: string;
  denomination_value: number; // 200, 100, 50, 20, 10, 5, 1, 0.5
  count: number;
  total: number;
}

export interface CashCounterSession {
  id: string;
  session_date: string;
  opened_at: string;
  closed_at: string | null;
  opening_balance: number;
  cash_sales: number;
  total_cash_counted: number;
  difference: number;
  notes: string;
  cashier_name: string;
  denominations: Record<number, number>; // value -> count
  status: 'open' | 'closed';
}

export interface DebtTransaction {
  id: string;
  date: string;
  type: 'debt_increase' | 'payment';
  amount: number;
  notes: string;
  sale_id?: string;
}

export interface CustomerDebt {
  id: string;
  customer_name: string;
  phone: string;
  current_debt: number;
  notes: string;
  created_at: string;
  updated_at: string;
  transactions: DebtTransaction[];
}

export interface DatabaseBackup {
  version: number;
  created_at: string;
  tables: {
    products: Product[];
    sales: Sale[];
    sale_items: SaleItem[];
    shortage_lists: ShortageList[];
    shortage_items: ShortageItem[];
    price_snapshots: PriceSnapshot[];
    price_change_days: PriceChangeDay[];
    price_change_items: PriceChangeItem[];
    cash_counter_sessions: CashCounterSession[];
    cash_counter_denominations: CashCounterDenomination[];
    customer_debts: CustomerDebt[];
  };
}

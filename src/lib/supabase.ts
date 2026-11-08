import { createClient } from '@supabase/supabase-js';
const url = (import.meta.env.VITE_SUPABASE_URL as string) || 'https://lbpuronnlmqmtbgtyrdt.supabase.co';
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxicHVyb25ubG1xbXRiZ3R5cmR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0MzQ5MTAsImV4cCI6MjEwMDAxMDkxMH0.5TDVKCsL6nQToGrvtY1F6t5wVjtoHB2IPuiTvJGQYbM';
export const supabase = createClient(url, anonKey);
export type Product = {
  id: string; code: string | null; name: string; unit: string | null;
  barcode: string | null; price: number; price_wholesale: number; cost: number;
  stock: number; category: string | null; created_at: string; updated_at: string;
};
export type Customer = {
  id: string; code: string | null; name: string; phone1: string | null; phone2: string | null;
  address: string | null; notes: string | null; created_at: string; updated_at: string;
};

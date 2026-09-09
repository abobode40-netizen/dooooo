import React from 'react';
import { 
  ShoppingCart, 
  Package, 
  TrendingUp, 
  Receipt, 
  CreditCard, 
  Coins, 
  Settings,
  Truck,
  FileText,
  Users
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export type TabType = 
  | 'pos' 
  | 'purchases'
  | 'products' 
  | 'price_changes' 
  | 'customers' 
  | 'debts' 
  | 'sales' 
  | 'cash_drawer' 
  | 'settings';

interface NavbarProps {
  activeTab: TabType;
  onTabChange?: (tab: TabType) => void;
  setActiveTab?: (tab: TabType) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onTabChange,
  setActiveTab
}) => {
  const { 
    products, 
    customerDebts, 
    sales,
    purchases 
  } = useApp();

  const handleSelectTab = (tab: TabType) => {
    if (onTabChange) onTabChange(tab);
    else if (setActiveTab) setActiveTab(tab);
  };

  const productsCount = products?.length || 0;
  const purchasesCount = purchases?.length || 0;
  const customersCount = customerDebts?.length || 0;
  const totalDebtsSum = (customerDebts || []).reduce((sum, c) => sum + (Number(c?.current_debt) || 0), 0);
  
  const todayStr = new Date().toISOString().split('T')[0];
  const todaySalesSum = (sales || [])
    .filter(s => s && typeof s.created_at === 'string' && s.created_at.startsWith(todayStr))
    .reduce((sum, s) => sum + (Number(s?.final_amount) || 0), 0);

  const tabs = [
    { id: 'pos' as TabType, label: 'فاتورة مبيعات', icon: Receipt, badge: 'صرف' },
    { id: 'purchases' as TabType, label: 'فاتورة مشتريات', icon: Truck, badge: purchasesCount > 0 ? purchasesCount : 'توريد' },
    { id: 'products' as TabType, label: 'الأصناف والمخزون', icon: Package, badge: productsCount },
    { id: 'price_changes' as TabType, label: 'قائمة الزيادة والنقصان', icon: TrendingUp, badge: null },
    { id: 'customers' as TabType, label: 'دليل وسجل العملاء', icon: Users, badge: customersCount > 0 ? `${customersCount}` : null, badgeColor: 'bg-blue-600 text-white' },
    { id: 'debts' as TabType, label: 'حسابات الآجل والديون', icon: CreditCard, badge: totalDebtsSum > 0 ? `${(totalDebtsSum || 0).toLocaleString()} ج.م` : null },
    { id: 'sales' as TabType, label: 'سجل الفواتير السابقة', icon: FileText, badge: null },
    { id: 'cash_drawer' as TabType, label: 'درج النقدية والتفقيط', icon: Coins, badge: null },
    { id: 'settings' as TabType, label: 'الإعدادات والاسترداد', icon: Settings, badge: null },
  ];

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top bar with branding and summary metrics */}
        <div className="flex items-center justify-between py-2.5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white font-black shadow-sm">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-black text-slate-900 tracking-tight">نظام الحسابات وإدارة المخازن</h1>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                  متصل وقيد التشغيل
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                فواتير مبيعات ومشتريات موحدة • متابعة المخزون • قائمة الزيادة والنقصان
              </p>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="hidden lg:flex items-center gap-3 text-xs">
            <div className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center gap-2">
              <Package className="w-4 h-4 text-blue-600" />
              <span className="text-slate-500">الأصناف:</span>
              <span className="font-bold text-slate-900">{productsCount} صنف</span>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-amber-600" />
              <span className="text-slate-500">إجمالي الآجل:</span>
              <span className="font-bold text-amber-700">{(totalDebtsSum || 0).toLocaleString()} ج.م</span>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 flex items-center gap-2">
              <Coins className="w-4 h-4 text-blue-600" />
              <span className="text-blue-700">مبيعات اليوم:</span>
              <span className="font-bold text-blue-800">{(todaySalesSum || 0).toLocaleString()} ج.م</span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs (Clean White & Blue theme) */}
        <nav className="flex space-x-1 space-x-reverse overflow-x-auto py-2 scrollbar-none">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`tab-${tab.id}`}
                onClick={() => handleSelectTab(tab.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
                {tab.badge !== null && tab.badge !== undefined && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : tab.badgeColor || 'bg-slate-100 text-slate-600 border border-slate-200'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};

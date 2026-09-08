import React from 'react';
import { 
  ShoppingCart, 
  Package, 
  AlertTriangle, 
  TrendingUp, 
  Receipt, 
  CreditCard, 
  Coins, 
  Cloud, 
  Github,
  Search
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export type TabType = 
  | 'pos' 
  | 'products' 
  | 'shortages' 
  | 'price_changes' 
  | 'sales' 
  | 'debts' 
  | 'cash_drawer' 
  | 'backup';

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
    shortageItems, 
    customerDebts, 
    sales 
  } = useApp();

  const handleSelectTab = (tab: TabType) => {
    if (onTabChange) onTabChange(tab);
    else if (setActiveTab) setActiveTab(tab);
  };

  const productsCount = products?.length || 0;
  const openShortagesCount = (shortageItems || []).filter(item => item.status === 'pending').length;
  const totalDebtsSum = (customerDebts || []).reduce((sum, c) => sum + (Number(c?.current_debt) || 0), 0);
  
  const todayStr = new Date().toISOString().split('T')[0];
  const todaySalesSum = (sales || [])
    .filter(s => s && typeof s.created_at === 'string' && s.created_at.startsWith(todayStr))
    .reduce((sum, s) => sum + (Number(s?.final_amount) || 0), 0);

  const tabs = [
    { id: 'pos' as TabType, label: 'نقطة البيع (الكاشير)', icon: ShoppingCart, badge: null },
    { id: 'products' as TabType, label: 'الأصناف والمخزون', icon: Package, badge: productsCount },
    { id: 'shortages' as TabType, label: 'سجل النواقص اليومية', icon: AlertTriangle, badge: openShortagesCount > 0 ? openShortagesCount : null, badgeColor: 'bg-amber-500' },
    { id: 'price_changes' as TabType, label: 'تغيرات الأسعار', icon: TrendingUp, badge: null },
    { id: 'sales' as TabType, label: 'سجل الفواتير', icon: Receipt, badge: null },
    { id: 'debts' as TabType, label: 'حسابات الآجل والديون', icon: CreditCard, badge: totalDebtsSum > 0 ? `${(totalDebtsSum || 0).toLocaleString()} ج.م` : null },
    { id: 'cash_drawer' as TabType, label: 'درج النقدية والتفقيط', icon: Coins, badge: null },
    { id: 'backup' as TabType, label: 'Google Drive والنسخ السحابي', icon: Cloud, badge: 'سحابي' },
  ];

  return (
    <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur border-b border-slate-800 shadow-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top bar with branding and summary metrics */}
        <div className="flex items-center justify-between py-3 border-b border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-600 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-amber-500/20">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-white tracking-tight">نظام إدارة المخازن والمبيعات</h1>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-semibold border border-emerald-500/30">
                  متصل وقيد التشغيل
                </span>
              </div>
              <p className="text-xs text-slate-400">إدارة متكاملة للبضائع، النواقص، تسعير الجملة والقطاعي والنسخ السحابي على Google Drive</p>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="hidden lg:flex items-center gap-4 text-xs">
            <div className="px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 flex items-center gap-2">
              <Package className="w-4 h-4 text-sky-400" />
              <span className="text-slate-400">الأصناف:</span>
              <span className="font-bold text-slate-100">{productsCount} صنف</span>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span className="text-slate-400">نواقص معلقة:</span>
              <span className="font-bold text-amber-300">{openShortagesCount} صنف</span>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-rose-400" />
              <span className="text-slate-400">إجمالي الآجل:</span>
              <span className="font-bold text-rose-300">{(totalDebtsSum || 0).toLocaleString()} ج.م</span>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center gap-2">
              <Coins className="w-4 h-4 text-amber-400" />
              <span className="text-slate-300">مبيعات اليوم:</span>
              <span className="font-bold text-amber-400">{(todaySalesSum || 0).toLocaleString()} ج.م</span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex space-x-1 space-x-reverse overflow-x-auto py-2.5 scrollbar-none">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`tab-${tab.id}`}
                onClick={() => handleSelectTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-150 ${
                  isActive
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-slate-950' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
                {tab.badge !== null && tab.badge !== undefined && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      isActive
                        ? 'bg-slate-950/20 text-slate-950'
                        : tab.badgeColor || 'bg-slate-800 text-slate-300 border border-slate-700'
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


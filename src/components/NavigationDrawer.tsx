import React from 'react';
import { 
  Package, 
  Search, 
  ClipboardList, 
  TrendingUp, 
  Calculator, 
  FileText, 
  Users, 
  Settings, 
  X, 
  ChevronLeft,
  Receipt,
  Truck,
  Sun,
  Moon,
  Wifi,
  Store,
  Layers
} from 'lucide-react';
import { TabType } from './Navbar';
import { useApp } from '../context/AppContext';

interface NavigationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab?: any;
  onSelectTab: (tab: any) => void;
  onOpenQuickSearch?: () => void;
  onOpenOnlineAlert?: () => void;
}

export const NavigationDrawer: React.FC<NavigationDrawerProps> = ({
  isOpen,
  onClose,
  activeTab,
  onSelectTab,
  onOpenQuickSearch,
  onOpenOnlineAlert
}) => {
  const { 
    theme, 
    setTheme, 
    storeName, 
    products, 
    shortageLists,
    priceChangeItems, 
    customerDebts, 
    isOnline 
  } = useApp();

  if (!isOpen) return null;

  const handleItemClick = (tab: any) => {
    onSelectTab(tab);
    onClose();
  };

  const handleSearchClick = () => {
    onSelectTab('products');
    onClose();
    if (onOpenQuickSearch) {
      setTimeout(() => onOpenQuickSearch(), 100);
    }
  };

  // Exactly matching the screenshot items
  const menuItems = [
    {
      id: 'products' as TabType,
      label: 'الأصناف',
      icon: Package,
      badge: products.length > 0 ? `${products.length}` : null,
      onClick: () => handleItemClick('products')
    },
    {
      id: 'search' as any,
      label: 'بحث',
      icon: Search,
      badge: null,
      onClick: handleSearchClick
    },
    {
      id: 'shortages' as TabType,
      label: 'النواقص',
      icon: ClipboardList,
      badge: shortageLists.length > 0 ? `${shortageLists.length}` : null,
      onClick: () => handleItemClick('shortages')
    },
    {
      id: 'cash_drawer' as TabType,
      label: 'عداد النقدية',
      icon: Calculator,
      badge: null,
      onClick: () => handleItemClick('cash_drawer')
    },
    {
      id: 'sales' as TabType,
      label: 'الفواتير',
      icon: FileText,
      badge: null,
      onClick: () => handleItemClick('sales')
    },
    {
      id: 'debts' as TabType,
      label: 'مديونية العملاء',
      icon: Users,
      badge: customerDebts.length > 0 ? `${customerDebts.length}` : null,
      onClick: () => handleItemClick('debts')
    },
    {
      id: 'settings' as TabType,
      label: 'الإعدادات',
      icon: Settings,
      badge: null,
      onClick: () => handleItemClick('settings')
    }
  ];

  const extraItems = [
    {
      id: 'pos' as TabType,
      label: 'إصدار فاتورة بيع جديدة',
      icon: Receipt,
      onClick: () => handleItemClick('pos')
    },
    {
      id: 'purchases' as TabType,
      label: 'إصدار فاتورة توريد / شراء',
      icon: Truck,
      onClick: () => handleItemClick('purchases')
    },
    {
      id: 'customers' as TabType,
      label: 'دليل وسجل العملاء',
      icon: Users,
      onClick: () => handleItemClick('customers')
    }
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" dir="rtl">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Slide-out Drawer (Styled identical to screenshot) */}
      <div className="fixed inset-y-0 right-0 max-w-full flex">
        <div className="w-72 sm:w-80 bg-[#161922] text-slate-100 shadow-2xl flex flex-col z-10 border-l border-slate-800">
          
          {/* Header matching screenshot: "القوائم" with arrow/close */}
          <div className="p-4 bg-[#12151d] border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center text-white font-black shadow-sm">
                <Store className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-black text-white tracking-wide">القوائم</h2>
                <span className="text-[11px] text-slate-400 block truncate max-w-[170px]">{storeName || 'أولاد طه للجملة'}</span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              title="إغلاق القائمة"
            >
              <ChevronLeft className="w-5 h-5 rotate-180" />
            </button>
          </div>

          {/* Primary Menu Items (8 icons matching user photo) */}
          <div className="flex-1 overflow-y-auto py-2 px-2.5 space-y-1">
            <div className="text-[11px] font-bold text-slate-400 px-3 py-1.5 uppercase tracking-wider">
              القوائم الرئيسية
            </div>

            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.label}
                  onClick={item.onClick}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-red-600 text-white shadow-md'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                    <span className="text-[13px]">{item.label}</span>
                  </div>

                  {item.badge && (
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                      isActive ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-300 border border-slate-700'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Quick Operations */}
            <div className="pt-3 pb-1 border-t border-slate-800/80 mt-3">
              <div className="text-[11px] font-bold text-slate-400 px-3 py-1.5 uppercase tracking-wider">
                عمليات إضافية سريعة
              </div>
              {extraItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={item.onClick}
                    className={`w-full flex items-center justify-between px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      isActive
                        ? 'bg-red-600 text-white shadow-md'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                      <span>{item.label}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bottom Footer: Themes & Online Alert Trigger */}
          <div className="p-3 bg-[#12151d] border-t border-slate-800 space-y-2 text-xs">
            {/* Online Status button */}
            <button
              onClick={() => {
                onClose();
                if (onOpenOnlineAlert) onOpenOnlineAlert();
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-300 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Wifi className={`w-3.5 h-3.5 ${isOnline ? 'text-emerald-400' : 'text-rose-400'}`} />
                <span className="text-[11px]">حالة الاتصال والأسعار</span>
              </div>
              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                isOnline ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-rose-950 text-rose-300 border border-rose-800'
              }`}>
                {isOnline ? 'متصل' : 'غير متصل'}
              </span>
            </button>

            {/* Quick Theme Buttons (Day / Night / Red-Dark) */}
            <div className="flex items-center justify-between bg-slate-900/90 p-1 rounded-lg border border-slate-800">
              <button
                onClick={() => setTheme('light')}
                className={`flex-1 py-1.5 rounded-md text-[11px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                  theme === 'light' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-400 hover:text-slate-200'
                }`}
                title="الوضع النهاري (فاتح)"
              >
                <Sun className="w-3 h-3 text-amber-500" />
                <span>نهاري</span>
              </button>
              <button
                onClick={() => setTheme('dark')}
                className={`flex-1 py-1.5 rounded-md text-[11px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                  theme === 'dark' ? 'bg-slate-700 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'
                }`}
                title="الوضع الليلي (داكن)"
              >
                <Moon className="w-3 h-3 text-blue-400" />
                <span>ليلي</span>
              </button>
              <button
                onClick={() => setTheme('red_dark')}
                className={`flex-1 py-1.5 rounded-md text-[11px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                  theme === 'red_dark' ? 'bg-red-600 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'
                }`}
                title="سمة أولاد طه (أحمر وداكن)"
              >
                <span className="w-2 h-2 rounded-full bg-red-400" />
                <span>طه أحمر</span>
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { 
  Store, 
  ChevronDown, 
  Wifi, 
  WifiOff, 
  Sun, 
  Moon
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export type TabType = 
  | 'products' 
  | 'search'
  | 'settings'
  | 'price_changes' 
  | 'customers' 
  | 'debts' 
  | 'sales' 
  | 'import';

interface NavbarProps {
  activeTab: TabType;
  onTabChange?: (tab: TabType) => void;
  setActiveTab?: (tab: TabType) => void;
  onOpenOnlineModal?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onTabChange,
  setActiveTab,
  onOpenOnlineModal
}) => {
  const { 
    products, 
    theme,
    setTheme,
    storeName,
    isOnline
  } = useApp();

  const handleSelectTab = (tab: TabType) => {
    if (onTabChange) onTabChange(tab);
    else if (setActiveTab) setActiveTab(tab);
  };

  const productsCount = products?.length || 0;

  const isRedDark = theme === 'red_dark';
  const isDark = theme === 'dark';

  const headerBgClass = isRedDark 
    ? 'bg-gradient-to-r from-red-800 via-red-700 to-rose-800 text-white border-b border-red-900 shadow-md'
    : isDark 
      ? 'bg-slate-900 text-white border-b border-slate-800 shadow-md' 
      : 'bg-white text-slate-900 border-b border-slate-200 shadow-sm';

  return (
    <header className={`sticky top-0 z-40 transition-colors ${headerBgClass}`} dir="rtl">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5">
        <div className="flex items-center justify-between gap-3">
          
          {/* Right Side: Store Branding */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black shadow-xs ${
              isRedDark ? 'bg-white text-red-700' : isDark ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white'
            }`}>
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-black tracking-tight leading-tight">
                {storeName || 'أولاد طه للجملة'}
              </h1>
              <p className={`text-[10px] hidden sm:block ${isRedDark || isDark ? 'text-white/70' : 'text-slate-500'}`}>
                الأصناف • البحث • الإعدادات
              </p>
            </div>
          </div>

          {/* Center: THE PRIMARY DROPDOWN MENU (القوائم المطلوبة فقط: الأصناف، البحث، الإعدادات) */}
          <div className="flex-1 max-w-sm mx-2">
            <div className="relative">
              <select
                value={activeTab}
                onChange={(e) => handleSelectTab(e.target.value as TabType)}
                aria-label="اختر القائمة المطلوبة"
                className={`w-full py-2.5 pr-10 pl-4 rounded-xl text-sm font-black appearance-none cursor-pointer transition-all border outline-none shadow-xs text-right ${
                  isRedDark || isDark
                    ? 'bg-black/40 border-white/20 text-white focus:border-white focus:ring-2 focus:ring-white/20'
                    : 'bg-slate-50 hover:bg-white border-slate-300 text-slate-900 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20'
                }`}
              >
                <option value="products" className="text-slate-900 bg-white font-bold py-1">
                  📦 الأصناف ({productsCount} صنف)
                </option>
                <option value="search" className="text-slate-900 bg-white font-bold py-1">
                  🔍 البحث السريع في الأصناف
                </option>
                <option value="settings" className="text-slate-900 bg-white font-bold py-1">
                  ⚙️ الإعدادات
                </option>
              </select>
              <ChevronDown className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-80" />
            </div>
          </div>

          {/* Left Side: Status & Theme */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Online Indicator */}
            <button
              type="button"
              onClick={onOpenOnlineModal}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                isOnline 
                  ? (isRedDark || isDark ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/60' : 'bg-emerald-50 text-emerald-700 border border-emerald-200')
                  : (isRedDark || isDark ? 'bg-rose-950/80 text-rose-300 border border-rose-700 animate-pulse' : 'bg-rose-50 text-rose-700 border border-rose-200 animate-pulse')
              }`}
              title="حالة اتصال الإنترنت"
            >
              {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              <span className="hidden md:inline">{isOnline ? 'النت متصل' : 'غير متصل'}</span>
            </button>

            {/* Theme Toggle */}
            <div className={`flex items-center p-0.5 rounded-xl border ${
              isRedDark || isDark ? 'bg-black/30 border-white/20' : 'bg-slate-100 border-slate-200'
            }`}>
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                  theme === 'light' 
                    ? 'bg-white text-slate-900 shadow-xs' 
                    : (isRedDark || isDark ? 'text-white/70 hover:text-white' : 'text-slate-500 hover:text-slate-800')
                }`}
                title="الوضع النهاري"
              >
                <Sun className="w-3.5 h-3.5 text-amber-500" />
              </button>

              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                  theme === 'dark' 
                    ? 'bg-slate-800 text-white shadow-xs' 
                    : (isRedDark || isDark ? 'text-white/70 hover:text-white' : 'text-slate-500 hover:text-slate-800')
                }`}
                title="الوضع الليلي"
              >
                <Moon className="w-3.5 h-3.5 text-blue-400" />
              </button>

              <button
                type="button"
                onClick={() => setTheme('red_dark')}
                className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                  theme === 'red_dark' 
                    ? 'bg-red-600 text-white shadow-xs' 
                    : (isRedDark || isDark ? 'text-white/70 hover:text-white' : 'text-slate-500 hover:text-slate-800')
                }`}
                title="سمة أولاد طه"
              >
                <span className="w-3.5 h-3.5 rounded-full bg-red-400 flex items-center justify-center text-[9px] font-black text-white">
                  ط
                </span>
              </button>
            </div>
          </div>

        </div>
      </div>
    </header>
  );
};

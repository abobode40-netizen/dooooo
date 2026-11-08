import React, { useState, useEffect } from 'react';
import { 
  Wifi, 
  WifiOff, 
  CheckCircle2, 
  AlertTriangle, 
  TrendingUp, 
  RefreshCw, 
  X, 
  ShieldCheck,
  Info
} from 'lucide-react';
import { useApp } from '../context/AppContext';

interface StartupOnlineModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const StartupOnlineModal: React.FC<StartupOnlineModalProps> = ({
  isOpen,
  onClose
}) => {
  const { isOnline, showToast } = useApp();
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('store_hide_online_startup_modal');
    if (saved === 'true') {
      setDontShowAgain(true);
    }
  }, []);

  const handleConfirm = () => {
    if (dontShowAgain) {
      localStorage.setItem('store_hide_online_startup_modal', 'true');
    } else {
      localStorage.removeItem('store_hide_online_startup_modal');
    }
    onClose();
  };

  const handleCheckConnection = () => {
    setIsChecking(true);
    setTimeout(() => {
      setIsChecking(false);
      if (navigator.onLine) {
        showToast('الاتصال بالإنترنت نشط والأسعار جاهزة للمزامنة والتحديث', 'success');
      } else {
        showToast('تنبيه: أنت غير متصل بالإنترنت حالياً، يرجى التحقق من الشبكة', 'error');
      }
    }, 600);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden text-slate-800 dark:text-slate-100"
        dir="rtl"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-red-600 via-rose-600 to-red-700 p-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-xs">
              <Wifi className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-black text-base text-white">تنبيه اتصال الإنترنت</h3>
              <p className="text-xs text-red-100">ضروري لتحديث الأسعار والمزامنة الفورية</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-black/20 hover:bg-black/30 flex items-center justify-center text-white transition-colors cursor-pointer"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 text-sm">
          {/* Main Notice Box */}
          <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl p-3.5 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed font-medium">
              <span className="font-bold block mb-1">تنبيه هام عند فتح التطبيق:</span>
              لابد أن يكون التطبيق <strong className="font-black text-amber-950 dark:text-amber-100">متصلاً بشبكة الإنترنت</strong> حتى يتم تحديث ومزامنة أحدث أسعار البيع والشراء وقوائم الزيادة والنقصان في الأسعار بصورة دورية ودقيقة.
            </div>
          </div>

          {/* Current Status Box */}
          <div className="bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 rounded-xl p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isOnline ? (
                <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <Wifi className="w-5 h-5" />
                </div>
              ) : (
                <div className="w-9 h-9 rounded-lg bg-rose-100 dark:bg-rose-900/50 flex items-center justify-center text-rose-600 dark:text-rose-400">
                  <WifiOff className="w-5 h-5" />
                </div>
              )}
              <div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">حالة الاتصال بالإنترنت الحالية</span>
                <span className={`text-xs font-black ${isOnline ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  {isOnline ? 'متصل بالإنترنت الآن (جاهز لتحديث الأسعار)' : 'غير متصل بالإنترنت (يرجى الاتصال بالشبكة)'}
                </span>
              </div>
            </div>

            <button
              onClick={handleCheckConnection}
              disabled={isChecking}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              title="إعادة فحص الاتصال"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin text-blue-600' : ''}`} />
              <span>فحص</span>
            </button>
          </div>

          {/* Key Advantages */}
          <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>تحديث تلقائي لقوائم الزيادة والنقصان في الأسعار</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>منع أي أخطاء في تسعير الفواتير بالجملة والقطاعي</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>مزامنة فواتير المبيعات ومديونية العملاء بأمان</span>
            </div>
          </div>

          {/* Do not show again checkbox */}
          <label className="flex items-center gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="w-4 h-4 rounded text-red-600 focus:ring-red-500 border-slate-300 dark:border-slate-700"
            />
            <span>عدم إظهار هذه الرسالة تلقائياً عند فتح التطبيق</span>
          </label>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
          <button
            onClick={handleConfirm}
            className="w-full py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-sm shadow-md transition-colors cursor-pointer flex items-center justify-center gap-2"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>حسناً، فهمت ذلك ومتابعة للبرنامج</span>
          </button>
        </div>
      </div>
    </div>
  );
};

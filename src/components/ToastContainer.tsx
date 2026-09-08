import React from 'react';
import { useApp } from '../context/AppContext';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toast } = useApp();

  if (!toast) return null;

  return (
    <div className="fixed bottom-6 left-6 z-50 animate-in slide-in-from-bottom-5 duration-200">
      <div
        className={`px-4 py-3 rounded-2xl shadow-2xl border flex items-center gap-3 text-xs font-bold ${
          toast.type === 'success'
            ? 'bg-emerald-950/95 border-emerald-500/50 text-emerald-200'
            : toast.type === 'error'
            ? 'bg-rose-950/95 border-rose-500/50 text-rose-200'
            : 'bg-slate-900/95 border-amber-500/50 text-amber-200'
        }`}
      >
        {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
        {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-400" />}
        {toast.type === 'info' && <Info className="w-4 h-4 text-amber-400" />}
        <span>{toast.message}</span>
      </div>
    </div>
  );
};

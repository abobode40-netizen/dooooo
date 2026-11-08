import React, { useState } from 'react';
import { Receipt, FileText, PlusCircle } from 'lucide-react';
import { POSView } from './POSView';
import { SalesHistoryView } from './SalesHistoryView';

export const SalesView: React.FC<{ initialSubTab?: 'pos' | 'history' }> = ({ initialSubTab = 'pos' }) => {
  const [subTab, setSubTab] = useState<'pos' | 'history'>(initialSubTab);

  return (
    <div className="space-y-3 font-sans animate-in fade-in duration-150">
      {/* Top Simple Sub-Navigation Toggle */}
      <div className="flex items-center justify-between bg-white rounded-xl p-2.5 border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">
            <Receipt className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-black text-slate-900">
              {subTab === 'pos' ? 'فاتورة بيع جديدة (POS)' : 'سجل وأرشيف فواتير البيع'}
            </h2>
            <p className="text-[11px] text-slate-500">
              مرتبطة بحسابات مديونية العملاء وحركة المخزون
            </p>
          </div>
        </div>

        <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200">
          <button
            type="button"
            onClick={() => setSubTab('pos')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              subTab === 'pos'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>إصدار فاتورة بيع جديدة</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('history')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              subTab === 'history'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>سجل فواتير البيع</span>
          </button>
        </div>
      </div>

      {/* Render selected view */}
      {subTab === 'pos' ? <POSView /> : <SalesHistoryView />}
    </div>
  );
};

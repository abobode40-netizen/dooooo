import React, { useState, useMemo } from 'react';
import { 
  CreditCard, 
  Plus, 
  Search, 
  DollarSign, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Calendar, 
  User, 
  Phone, 
  Trash2, 
  X,
  FileText
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { CustomerDebt } from '../types';

export const DebtLedgerView: React.FC = () => {
  const { customerDebts, addCustomerDebt, addDebtTransaction, deleteCustomerDebt, showToast } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    customerDebts[0]?.id || ''
  );

  // Add Customer Modal
  const [isAddCustModalOpen, setIsAddCustModalOpen] = useState(false);
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [initialDebt, setInitialDebt] = useState<number | ''>('');
  const [custNotes, setCustNotes] = useState('');

  // Transaction Modal
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [txType, setTxType] = useState<'debt_increase' | 'payment'>('payment');
  const [txAmount, setTxAmount] = useState<number | ''>('');
  const [txNotes, setTxNotes] = useState('');

  const filteredCustomers = useMemo(() => {
    return (customerDebts || []).filter(c =>
      !searchQuery ||
      (c?.customer_name && c.customer_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (c?.phone && c.phone.includes(searchQuery))
    );
  }, [customerDebts, searchQuery]);

  const activeCustomer = useMemo(() => {
    if (!customerDebts || customerDebts.length === 0) return null;
    return customerDebts.find(c => c.id === selectedCustomerId) || customerDebts[0] || null;
  }, [customerDebts, selectedCustomerId]);

  const totalDebtsSum = useMemo(() => {
    if (!customerDebts || !Array.isArray(customerDebts)) return 0;
    return customerDebts.reduce((sum, c) => sum + (Number(c?.current_debt) || 0), 0);
  }, [customerDebts]);

  const handleAddCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!custName.trim()) {
      showToast('يرجى إدخال اسم العميل', 'error');
      return;
    }
    addCustomerDebt(custName.trim(), custPhone.trim(), Number(initialDebt) || 0, custNotes.trim());
    setCustName('');
    setCustPhone('');
    setInitialDebt('');
    setCustNotes('');
    setIsAddCustModalOpen(false);
  };

  const handleAddTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCustomer || !txAmount || Number(txAmount) <= 0) {
      showToast('يرجى إدخال مبلغ صحيح', 'error');
      return;
    }

    addDebtTransaction(
      activeCustomer.id,
      txType,
      Number(txAmount),
      txNotes.trim() || (txType === 'payment' ? 'سداد دفعة نقدية' : 'زيادة مديونية / مسحوبات')
    );

    setTxAmount('');
    setTxNotes('');
    setIsTxModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-800/80 rounded-2xl p-5 border border-slate-700 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-rose-400" />
            دفتر حسابات الآجل والديون
          </h2>
          <p className="text-xs text-slate-400">متابعة حسابات العملاء، تسجيل دفعات السداد والمستحقات الآجلة</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-4 py-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs">
            <span className="text-slate-300">إجمالي المديونيات المستحقة: </span>
            <span className="font-black text-rose-400 text-sm font-mono">{(totalDebtsSum || 0).toLocaleString()} ج.م</span>
          </div>

          <button
            onClick={() => setIsAddCustModalOpen(true)}
            className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-500/20 transition-all flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            إضافة حساب عميل جديد
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Customers List Sidebar */}
        <div className="lg:col-span-4 bg-slate-800/80 rounded-2xl p-4 border border-slate-700 shadow-xl space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="ابحث باسم العميل أو الهاتف..."
              className="w-full bg-slate-900 border border-slate-700 rounded-xl pr-9 pl-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="space-y-1.5 max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
            {filteredCustomers.map(cust => {
              const isSelected = activeCustomer?.id === cust.id;

              return (
                <div
                  key={cust.id}
                  onClick={() => setSelectedCustomerId(cust.id)}
                  className={`cursor-pointer rounded-xl p-3 border transition-all flex items-center justify-between group ${
                    isSelected
                      ? 'bg-rose-500/10 border-rose-500/60 shadow-md'
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                        isSelected ? 'bg-rose-500 text-white font-black' : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      <User className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h4 className={`text-xs font-bold truncate ${isSelected ? 'text-rose-400' : 'text-slate-200'}`}>
                        {cust.customer_name}
                      </h4>
                      {cust.phone && (
                        <p className="text-[10px] text-slate-400 font-mono">
                          {cust.phone}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="text-left font-mono font-bold text-xs text-rose-400">
                    {(Number(cust?.current_debt) || 0).toLocaleString()} ج.م
                  </div>
                </div>
              );
            })}

            {filteredCustomers.length === 0 && (
              <p className="text-xs text-slate-500 text-center py-6">لا يوجد عملاء مسجلين</p>
            )}
          </div>
        </div>

        {/* Customer Statement & Transactions Ledger */}
        <div className="lg:col-span-8 bg-slate-800/80 rounded-2xl p-5 border border-slate-700 shadow-xl space-y-4">
          {activeCustomer ? (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-700">
                <div>
                  <h3 className="text-base font-black text-white flex items-center gap-2">
                    <User className="w-5 h-5 text-amber-400" />
                    {activeCustomer.customer_name}
                  </h3>
                  {activeCustomer.phone && (
                    <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1 font-mono">
                      <Phone className="w-3.5 h-3.5" />
                      {activeCustomer.phone}
                    </p>
                  )}
                  {activeCustomer.notes && (
                    <p className="text-xs text-slate-400 mt-1 bg-slate-900/60 p-1.5 rounded-lg border border-slate-800">
                      ملاحظة: {activeCustomer.notes}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-center min-w-32">
                    <div className="text-[10px] text-slate-400">الرصيد المستحق الحالي</div>
                    <div className="text-base font-black text-rose-400 font-mono">
                      {(Number(activeCustomer?.current_debt) || 0).toLocaleString()} ج.م
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setTxType('payment');
                      setTxAmount('');
                      setTxNotes('');
                      setIsTxModalOpen(true);
                    }}
                    className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-md shadow-emerald-600/20"
                  >
                    <ArrowDownLeft className="w-4 h-4" />
                    تسديد دفعة
                  </button>

                  <button
                    onClick={() => {
                      setTxType('debt_increase');
                      setTxAmount('');
                      setTxNotes('');
                      setIsTxModalOpen(true);
                    }}
                    className="px-3.5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-md shadow-rose-600/20"
                  >
                    <ArrowUpRight className="w-4 h-4" />
                    إضافة دين
                  </button>

                  <button
                    onClick={() => {
                      if (window.confirm(`هل أنت متأكد من حذف حساب العميل "${activeCustomer.customer_name}"؟`)) {
                        deleteCustomerDebt(activeCustomer.id);
                      }
                    }}
                    className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors"
                    title="حذف حساب العميل"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Transactions Ledger */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-amber-400" />
                  كشف حساب الحركات والمدفوعات ({activeCustomer.transactions.length} حركة)
                </h4>

                <div className="overflow-x-auto border border-slate-700/60 rounded-xl overflow-hidden">
                  <table className="w-full text-right border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-900/90 text-slate-400 font-semibold border-b border-slate-700">
                        <th className="py-2.5 px-3">التاريخ</th>
                        <th className="py-2.5 px-3">نوع الحركة</th>
                        <th className="py-2.5 px-3">المبلغ</th>
                        <th className="py-2.5 px-3">البيان / ملاحظات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                      {activeCustomer.transactions.map(tx => (
                        <tr key={tx.id} className="hover:bg-slate-700/20">
                          <td className="py-2.5 px-3 text-slate-300 font-mono">{tx.date}</td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                tx.type === 'payment'
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              }`}
                            >
                              {tx.type === 'payment' ? 'سداد دفعة (-)' : 'زيادة مديونية (+)'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold">
                            <span className={tx.type === 'payment' ? 'text-emerald-400' : 'text-rose-400'}>
                              {tx.type === 'payment' ? '-' : '+'}{(Number(tx?.amount) || 0).toLocaleString()} ج.م
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-300">{tx.notes}</td>
                        </tr>
                      ))}

                      {activeCustomer.transactions.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-slate-400">
                            لا توجد حركات مسجلة لهذا العميل حتى الآن
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="py-16 text-center text-slate-400">
              اختر عميلاً من القائمة أو أضف عميلاً جديداً
            </div>
          )}
        </div>
      </div>

      {/* Add Customer Modal */}
      {isAddCustModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between p-4 bg-slate-800 border-b border-slate-700">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <User className="w-4 h-4 text-amber-400" />
                إضافة حساب عميل آجل جديد
              </h3>
              <button
                onClick={() => setIsAddCustModalOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddCustomer} className="p-5 space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">اسم العميل / المحل *</label>
                <input
                  type="text"
                  required
                  value={custName}
                  onChange={e => setCustName(e.target.value)}
                  placeholder="مثال: بقالة الأمانة / الحاج محمد"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">رقم الهاتف</label>
                <input
                  type="text"
                  value={custPhone}
                  onChange={e => setCustPhone(e.target.value)}
                  placeholder="010..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">الرصيد الافتتاحي للدين (ج.م)</label>
                <input
                  type="number"
                  step="any"
                  value={initialDebt}
                  onChange={e => setInitialDebt(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  placeholder="0"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-rose-400 font-bold focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">ملاحظات</label>
                <input
                  type="text"
                  value={custNotes}
                  onChange={e => setCustNotes(e.target.value)}
                  placeholder="ملاحظات إضافية..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-800">
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition-colors"
                >
                  حفظ العميل
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddCustModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-800 text-slate-300 text-xs rounded-xl font-semibold hover:bg-slate-700 transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Transaction Modal */}
      {isTxModalOpen && activeCustomer && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between p-4 bg-slate-800 border-b border-slate-700">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                {txType === 'payment' ? (
                  <>
                    <ArrowDownLeft className="w-4 h-4 text-emerald-400" />
                    تسجيل سداد دفعة للعميل ({activeCustomer.customer_name})
                  </>
                ) : (
                  <>
                    <ArrowUpRight className="w-4 h-4 text-rose-400" />
                    تسجيل زيادة دين على العميل ({activeCustomer.customer_name})
                  </>
                )}
              </h3>
              <button
                onClick={() => setIsTxModalOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddTransaction} className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">المبلغ (ج.م) *</label>
                <input
                  type="number"
                  step="any"
                  required
                  min="0.1"
                  value={txAmount}
                  onChange={e => setTxAmount(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  placeholder="المبلغ بالجنيه..."
                  className={`w-full bg-slate-800 border rounded-xl px-3.5 py-2.5 text-sm font-black focus:outline-none ${
                    txType === 'payment'
                      ? 'border-emerald-500/50 text-emerald-400'
                      : 'border-rose-500/50 text-rose-400'
                  }`}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">البيان / ملاحظات الحركة</label>
                <input
                  type="text"
                  value={txNotes}
                  onChange={e => setTxNotes(e.target.value)}
                  placeholder={txType === 'payment' ? 'سداد نقدي من الحساب' : 'مسحوبات بضاعة آجل'}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-800">
                <button
                  type="submit"
                  className={`flex-1 py-2.5 font-bold text-xs rounded-xl transition-colors ${
                    txType === 'payment'
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      : 'bg-rose-600 hover:bg-rose-500 text-white'
                  }`}
                >
                  تأكيد الحركة
                </button>
                <button
                  type="button"
                  onClick={() => setIsTxModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-800 text-slate-300 text-xs rounded-xl font-semibold hover:bg-slate-700 transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

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
  const { customerDebts, addCustomer, addDebtTransaction, deleteCustomerDebt, showToast } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    customerDebts[0]?.id || ''
  );

  // Add Customer Modal
  const [isAddCustModalOpen, setIsAddCustModalOpen] = useState(false);
  const [custCode, setCustCode] = useState('');
  const [custName, setCustName] = useState('');
  const [custAddress, setCustAddress] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custPhone2, setCustPhone2] = useState('');
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
    const newCust = addCustomer({
      customer_code: custCode.trim() || undefined,
      customer_name: custName.trim(),
      address: custAddress.trim(),
      phone: custPhone.trim(),
      phone2: custPhone2.trim(),
      initialDebt: Number(initialDebt) || 0,
      notes: custNotes.trim()
    });
    setSelectedCustomerId(newCust.id);
    setCustCode('');
    setCustName('');
    setCustAddress('');
    setCustPhone('');
    setCustPhone2('');
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
    showToast('تم تسجيل الحركة وتحديث الرصيد', 'success');
  };

  return (
    <div className="space-y-4 font-sans text-slate-800 animate-in fade-in duration-150">
      {/* Header */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              دفتر حسابات الآجل والديون
            </h2>
            <p className="text-xs text-slate-500">متابعة أرصدة العملاء، تسجيل دفعات السداد والمستحقات الآجلة</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-3.5 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-xs">
            <span className="text-rose-700 font-bold">إجمالي المديونيات المستحقة: </span>
            <span className="font-black text-rose-800 text-sm font-mono">{(totalDebtsSum || 0).toLocaleString()} ج.م</span>
          </div>

          <button
            onClick={() => setIsAddCustModalOpen(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            إضافة حساب عميل جديد
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Customers List Sidebar */}
        <div className="lg:col-span-4 bg-white rounded-xl p-4 border border-slate-200 shadow-sm space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="ابحث باسم العميل أو الهاتف..."
              className="w-full bg-slate-50 border border-slate-300 rounded-lg pr-9 pl-3 py-1.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
            />
          </div>

          <div className="space-y-1.5 max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
            {filteredCustomers.map(cust => {
              const isSelected = activeCustomer?.id === cust.id;

              return (
                <div
                  key={cust.id}
                  onClick={() => setSelectedCustomerId(cust.id)}
                  className={`cursor-pointer rounded-lg p-2.5 border transition-all flex items-center justify-between group ${
                    isSelected
                      ? 'bg-blue-50 border-blue-400 shadow-xs'
                      : 'bg-slate-50/70 border-slate-200 hover:border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-md flex items-center justify-center font-bold text-xs ${
                        isSelected ? 'bg-blue-600 text-white font-black' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      <User className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <h4 className={`text-xs font-bold truncate ${isSelected ? 'text-blue-900' : 'text-slate-800'}`}>
                        {cust.customer_name}
                      </h4>
                      {cust.phone && (
                        <p className="text-[10px] text-slate-500 font-mono">
                          {cust.phone}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="text-left font-mono font-bold text-xs text-rose-700">
                    {(Number(cust?.current_debt) || 0).toLocaleString()} ج.م
                  </div>
                </div>
              );
            })}

            {filteredCustomers.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-6">لا يوجد عملاء مسجلين</p>
            )}
          </div>
        </div>

        {/* Customer Statement & Transactions Ledger */}
        <div className="lg:col-span-8 bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-4">
          {activeCustomer ? (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                      <User className="w-4 h-4 text-blue-600" />
                      {activeCustomer.customer_name}
                    </h3>
                    {activeCustomer.customer_code && (
                      <span className="text-[11px] font-mono font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                        {activeCustomer.customer_code}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1">
                    {activeCustomer.phone && (
                      <span className="flex items-center gap-1 font-mono">
                        <Phone className="w-3 h-3 text-slate-400" />
                        {activeCustomer.phone}
                      </span>
                    )}
                    {activeCustomer.phone2 && (
                      <span className="flex items-center gap-1 font-mono text-slate-500">
                        <Phone className="w-3 h-3 text-slate-400" />
                        (2) {activeCustomer.phone2}
                      </span>
                    )}
                    {activeCustomer.address && (
                      <span className="text-slate-600">
                        <strong>العنوان:</strong> {activeCustomer.address}
                      </span>
                    )}
                  </div>
                  {activeCustomer.notes && (
                    <p className="text-xs text-slate-600 mt-1.5 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                      ملاحظة: {activeCustomer.notes}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-center min-w-28">
                    <div className="text-[10px] text-slate-500">الرصيد المستحق</div>
                    <div className="text-sm font-black text-rose-700 font-mono">
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
                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg flex items-center gap-1 shadow-sm transition-colors cursor-pointer"
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
                    className="px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg flex items-center gap-1 shadow-sm transition-colors cursor-pointer"
                  >
                    <ArrowUpRight className="w-4 h-4" />
                    إضافة دين
                  </button>

                  <button
                    onClick={() => {
                      if (window.confirm(`هل أنت متأكد من حذف حساب العميل "${activeCustomer.customer_name}"؟`)) {
                        deleteCustomerDebt(activeCustomer.id);
                        showToast('تم حذف حساب العميل', 'info');
                      }
                    }}
                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                    title="حذف حساب العميل"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Transactions Ledger */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-blue-600" />
                  كشف حساب الحركات والمدفوعات ({activeCustomer.transactions.length} حركة)
                </h4>

                <div className="overflow-x-auto border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-right border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-800 text-white font-bold border-b border-slate-700 text-[11px]">
                        <th className="py-2 px-3">التاريخ</th>
                        <th className="py-2 px-3">نوع الحركة</th>
                        <th className="py-2 px-3">المبلغ</th>
                        <th className="py-2 px-3">البيان / ملاحظات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {activeCustomer.transactions.map((tx, idx) => (
                        <tr
                          key={tx.id}
                          className={`hover:bg-slate-50 transition-colors ${
                            idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                          }`}
                        >
                          <td className="py-2 px-3 text-slate-500 font-mono text-[11px]">{tx.date}</td>
                          <td className="py-2 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                tx.type === 'payment'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}
                            >
                              {tx.type === 'payment' ? 'سداد دفعة (-)' : 'زيادة مديونية (+)'}
                            </span>
                          </td>
                          <td className="py-2 px-3 font-mono font-bold">
                            <span className={tx.type === 'payment' ? 'text-emerald-700' : 'text-rose-700'}>
                              {tx.type === 'payment' ? '-' : '+'}{(Number(tx?.amount) || 0).toLocaleString()} ج.م
                            </span>
                          </td>
                          <td className="py-2 px-3 text-slate-700">{tx.notes}</td>
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
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md overflow-hidden shadow-xl animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between p-4 bg-slate-900 text-white">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <User className="w-4 h-4 text-blue-400" />
                إضافة حساب عميل آجل جديد
              </h3>
              <button
                onClick={() => setIsAddCustModalOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddCustomer} className="p-5 space-y-3.5 text-xs">
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">كود العميل</label>
                  <input
                    type="text"
                    value={custCode}
                    onChange={e => setCustCode(e.target.value)}
                    placeholder="CUST-001"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-slate-900 font-mono font-bold focus:bg-white focus:outline-none focus:border-blue-600"
                  />
                </div>
                <div className="col-span-2">
                  <label className="font-bold text-slate-700 block mb-1">اسم العميل *</label>
                  <input
                    type="text"
                    required
                    value={custName}
                    onChange={e => setCustName(e.target.value)}
                    placeholder="مثال: الحاج إبراهيم الشرقاوي"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-bold focus:bg-white focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">العنوان</label>
                <input
                  type="text"
                  value={custAddress}
                  onChange={e => setCustAddress(e.target.value)}
                  placeholder="عنوان العميل بالتفصيل..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">التليفون الأول</label>
                  <input
                    type="text"
                    value={custPhone}
                    onChange={e => setCustPhone(e.target.value)}
                    placeholder="010..."
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-mono text-left dir-ltr"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">التليفون الثاني</label>
                  <input
                    type="text"
                    value={custPhone2}
                    onChange={e => setCustPhone2(e.target.value)}
                    placeholder="011..."
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-mono text-left dir-ltr"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">رصيد أول المدة المتبقي (إن وجد)</label>
                <input
                  type="number"
                  step="any"
                  value={initialDebt}
                  onChange={e => setInitialDebt(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  placeholder="0.00"
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-bold font-mono focus:bg-white focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">ملاحظات إضافية</label>
                <textarea
                  rows={2}
                  value={custNotes}
                  onChange={e => setCustNotes(e.target.value)}
                  placeholder="أية ملاحظات أخرى..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <button
                  type="submit"
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-sm transition-colors cursor-pointer"
                >
                  إضافة الحساب
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddCustModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transaction Modal (Payment or Debt Increase) */}
      {isTxModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-sm overflow-hidden shadow-xl animate-in fade-in zoom-in duration-150">
            <div className={`flex items-center justify-between p-4 text-white ${
              txType === 'payment' ? 'bg-emerald-800' : 'bg-rose-800'
            }`}>
              <h3 className="text-sm font-bold flex items-center gap-2">
                {txType === 'payment' ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                {txType === 'payment' ? 'تسديد دفعة نقدية من العميل' : 'تسجيل دين إضافي على العميل'}
              </h3>
              <button
                onClick={() => setIsTxModalOpen(false)}
                className="text-white/70 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddTransaction} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  المبلغ (ج.م) *
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  autoFocus
                  value={txAmount}
                  onChange={e => setTxAmount(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  placeholder="مثال: 500"
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-black text-sm font-mono focus:bg-white focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">البيان / تفاصيل الحركة</label>
                <input
                  type="text"
                  value={txNotes}
                  onChange={e => setTxNotes(e.target.value)}
                  placeholder={txType === 'payment' ? 'مثال: سداد نقدي يد بيد' : 'مثال: مسحوبات بضاعة إضافية'}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <button
                  type="submit"
                  className={`flex-1 py-2 text-white font-bold rounded-lg shadow-sm transition-colors cursor-pointer ${
                    txType === 'payment'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {txType === 'payment' ? 'تسجيل السداد' : 'تسجيل الدين'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsTxModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition-colors cursor-pointer"
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

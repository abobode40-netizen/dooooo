import React, { useState, useMemo, useRef } from 'react';
import { 
  Users, 
  Plus, 
  Search, 
  Phone, 
  MapPin, 
  FileSpreadsheet, 
  Printer, 
  Download, 
  Upload, 
  Trash2, 
  Edit3, 
  CreditCard, 
  X, 
  Check, 
  AlertCircle, 
  Building2, 
  ExternalLink,
  MessageCircle,
  Hash,
  UserCheck,
  RefreshCw
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useApp } from '../context/AppContext';
import { CustomerDebt } from '../types';

interface CustomerFormData {
  customer_code: string;
  customer_name: string;
  address: string;
  phone: string;
  phone2: string;
  initialDebt: number | '';
  notes: string;
}

export const CustomersView: React.FC = () => {
  const { 
    customerDebts, 
    addCustomer, 
    updateCustomer, 
    deleteCustomer, 
    bulkImportCustomers, 
    showToast 
  } = useApp();

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [debtFilter, setDebtFilter] = useState<'all' | 'has_debt' | 'zero_debt'>('all');

  // Add / Edit Modal state
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [formData, setFormData] = useState<CustomerFormData>({
    customer_code: '',
    customer_name: '',
    address: '',
    phone: '',
    phone2: '',
    initialDebt: '',
    notes: ''
  });

  // Import Modal state
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importedRows, setImportedRows] = useState<any[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // PDF Print Modal state
  const [isPdfPrintModalOpen, setIsPdfPrintModalOpen] = useState(false);

  // Filtered customers
  const filteredCustomers = useMemo(() => {
    return (customerDebts || []).filter(c => {
      // Search matching
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q ||
        (c.customer_name && c.customer_name.toLowerCase().includes(q)) ||
        (c.customer_code && c.customer_code.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(q)) ||
        (c.phone2 && c.phone2.includes(q)) ||
        (c.address && c.address.toLowerCase().includes(q));

      // Filter by debt
      if (!matchesSearch) return false;
      if (debtFilter === 'has_debt') return (c.current_debt || 0) > 0;
      if (debtFilter === 'zero_debt') return (c.current_debt || 0) <= 0;
      return true;
    });
  }, [customerDebts, searchQuery, debtFilter]);

  // Summary Metrics
  const totalCustomersCount = customerDebts.length;
  const customersWithDebtCount = customerDebts.filter(c => (c.current_debt || 0) > 0).length;
  const totalDebtsSum = customerDebts.reduce((acc, c) => acc + (Number(c.current_debt) || 0), 0);
  const customersWithPhonesCount = customerDebts.filter(c => (c.phone && c.phone.trim()) || (c.phone2 && c.phone2.trim())).length;

  // Open Add Modal
  const handleOpenAddModal = () => {
    setEditingCustomerId(null);
    const nextCode = `CUST-${(customerDebts.length + 1).toString().padStart(3, '0')}`;
    setFormData({
      customer_code: nextCode,
      customer_name: '',
      address: '',
      phone: '',
      phone2: '',
      initialDebt: '',
      notes: ''
    });
    setIsFormModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (customer: CustomerDebt) => {
    setEditingCustomerId(customer.id);
    setFormData({
      customer_code: customer.customer_code || '',
      customer_name: customer.customer_name,
      address: customer.address || '',
      phone: customer.phone || '',
      phone2: customer.phone2 || '',
      initialDebt: customer.current_debt || 0,
      notes: customer.notes || ''
    });
    setIsFormModalOpen(true);
  };

  // Submit Add / Edit Form
  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.customer_name.trim()) {
      showToast('يرجى إدخال اسم العميل', 'error');
      return;
    }

    if (editingCustomerId) {
      updateCustomer(editingCustomerId, {
        customer_code: formData.customer_code.trim() || undefined,
        customer_name: formData.customer_name.trim(),
        address: formData.address.trim(),
        phone: formData.phone.trim(),
        phone2: formData.phone2.trim(),
        notes: formData.notes.trim()
      });
    } else {
      addCustomer({
        customer_code: formData.customer_code.trim() || undefined,
        customer_name: formData.customer_name.trim(),
        address: formData.address.trim(),
        phone: formData.phone.trim(),
        phone2: formData.phone2.trim(),
        initialDebt: Number(formData.initialDebt) || 0,
        notes: formData.notes.trim()
      });
    }

    setIsFormModalOpen(false);
  };

  // Delete Customer
  const handleDeleteCustomer = (customer: CustomerDebt) => {
    if (window.confirm(`هل أنت متأكد من حذف العميل "${customer.customer_name}"؟`)) {
      deleteCustomer(customer.id);
    }
  };

  // Handle File Upload (Excel or CSV or JSON)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    setIsProcessingFile(true);

    const reader = new FileReader();
    const isJson = file.name.endsWith('.json');

    reader.onload = evt => {
      try {
        if (isJson) {
          const content = evt.target?.result as string;
          const parsed = JSON.parse(content);
          const list = Array.isArray(parsed) ? parsed : (parsed.customers || parsed.customer_debts || []);
          const normalized = list.map((item: any, idx: number) => ({
            customer_code: item.customer_code || item.code || item['كود العميل'] || item['الكود'] || `CUST-${(customerDebts.length + idx + 1).toString().padStart(3, '0')}`,
            customer_name: item.customer_name || item.name || item['اسم العميل'] || item['الاسم'] || '',
            address: item.address || item['العنوان'] || item['عنوان العميل'] || '',
            phone: item.phone || item.phone1 || item['التليفون الاول'] || item['الهاتف'] || item['الموبايل'] || '',
            phone2: item.phone2 || item['التليفون الثاني'] || item['هاتف 2'] || item['موبايل 2'] || '',
            initialDebt: Number(item.initialDebt || item.current_debt || item.debt || item['الرصيد'] || item['المديونية'] || 0)
          })).filter((c: any) => c.customer_name.trim());
          setImportedRows(normalized);
        } else {
          // XLSX or CSV
          const data = new Uint8Array(evt.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

          const normalized = rawRows.map((row: any, idx: number) => {
            // Find fields with flexible arabic / english matching
            const findKey = (candidates: string[]) => {
              for (const key of Object.keys(row)) {
                const normKey = key.trim().toLowerCase();
                if (candidates.some(c => normKey.includes(c.toLowerCase()))) {
                  return row[key];
                }
              }
              return '';
            };

            const code = findKey(['كود العميل', 'كود', 'code', 'cust_code']) || `CUST-${(customerDebts.length + idx + 1).toString().padStart(3, '0')}`;
            const name = findKey(['اسم العميل', 'الاسم', 'اسم', 'name', 'customer']);
            const address = findKey(['عنوان العميل', 'العنوان', 'عنوان', 'address']);
            const phone = findKey(['التليفون الاول', 'تليفون 1', 'هاتف 1', 'موبايل 1', 'phone', 'phone1', 'mobile']);
            const phone2 = findKey(['التليفون الثاني', 'تليفون 2', 'هاتف 2', 'موبايل 2', 'phone2', 'mobile2']);
            const debt = findKey(['رصيد', 'الرصيد', 'مديونية', 'debt', 'balance']);

            return {
              customer_code: String(code).trim(),
              customer_name: String(name).trim(),
              address: String(address).trim(),
              phone: String(phone).trim(),
              phone2: String(phone2).trim(),
              initialDebt: Number(debt) || 0
            };
          }).filter(c => c.customer_name.trim());

          setImportedRows(normalized);
        }
      } catch (err) {
        console.error(err);
        showToast('تعذر قراءة الملف! يرجى التأكد من أن الملف سليم بصيغة Excel أو CSV', 'error');
      } finally {
        setIsProcessingFile(false);
      }
    };

    if (isJson) {
      reader.readAsText(file);
    } else {
      reader.readAsArrayBuffer(file);
    }
  };

  // Confirm Import
  const handleConfirmImport = () => {
    if (importedRows.length === 0) {
      showToast('لا توجد بيانات عملاء صالحة للاستيراد في هذا الملف', 'error');
      return;
    }

    bulkImportCustomers(importedRows);
    setIsImportModalOpen(false);
    setImportedRows([]);
    setImportFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Download Sample CSV
  const handleDownloadSampleFile = () => {
    const headers = ['كود العميل', 'اسم العميل', 'العنوان', 'التليفون الاول', 'التليفون الثاني', 'الرصيد'];
    const sampleRows = [
      ['CUST-001', 'سوبرماركت الأمانة', 'شارع الجمهورية - وسط البلد', '01012345678', '01198765432', '1500'],
      ['CUST-002', 'أحمد محمود للتجارة', 'ميدان المحطة - بجوار المسجد', '01234567890', '', '0'],
      ['CUST-003', 'بقالة النور والبركة', 'حي السلام - شارع 15', '01501234567', '01099887766', '850']
    ];

    const csvContent = '\uFEFF' + [headers.join(','), ...sampleRows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'نموذج_استيراد_العملاء.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('تم تنزيل نموذج ملف العملاء بنجاح');
  };

  return (
    <div className="space-y-4 font-sans text-slate-800 animate-in fade-in duration-150">
      {/* Top Header Card */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black text-slate-900">دليل وسجل العملاء</h1>
              <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold font-mono">
                {totalCustomersCount} عميل
              </span>
            </div>
            <p className="text-xs text-slate-500">
              كود العميل، اسم العميل، العنوان، أرقام الاتصال، واسترداد ملفات العملاء وطباعة كشوف PDF
            </p>
          </div>
        </div>

        {/* Header Action Buttons (ضرب استرداد ملف أو PDF) */}
        <div className="flex flex-wrap items-center gap-2">
          {/* ضرب استرداد ملف */}
          <button
            onClick={() => {
              setImportedRows([]);
              setImportFileName('');
              setIsImportModalOpen(true);
            }}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
            title="استرداد ملف عملاء بصيغة Excel أو CSV"
          >
            <Upload className="w-4 h-4 text-blue-400" />
            استرداد ملف عملاء
          </button>

          {/* ضرب PDF */}
          <button
            onClick={() => setIsPdfPrintModalOpen(true)}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
            title="تصدير وطباعة دليل العملاء PDF"
          >
            <Printer className="w-4 h-4" />
            تصدير / طباعة PDF
          </button>

          {/* إضافة عميل جديد */}
          <button
            onClick={handleOpenAddModal}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
          >
            <Plus className="w-4 h-4" />
            عميل جديد
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] text-slate-500 font-medium">إجمالي العملاء</div>
            <div className="text-lg font-black text-slate-900 mt-0.5">{totalCustomersCount} عميل</div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <Users className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] text-slate-500 font-medium">أرقام الهواتف المسجلة</div>
            <div className="text-lg font-black text-slate-900 mt-0.5">{customersWithPhonesCount} مسجل</div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Phone className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] text-slate-500 font-medium">عملاء عليهم مديونيات</div>
            <div className="text-lg font-black text-amber-600 mt-0.5">{customersWithDebtCount} عميل</div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
            <CreditCard className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] text-slate-500 font-medium">إجمالي الآجل والمستحق</div>
            <div className="text-lg font-black text-rose-600 mt-0.5">{totalDebtsSum.toLocaleString()} ج.م</div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
            <Building2 className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Main Customers Directory Table Container */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Search & Filter Bar */}
        <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute right-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="بحث باسم العميل، الكود، التليفون، أو العنوان..."
              className="w-full bg-white border border-slate-300 rounded-lg pr-9 pl-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-600 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute left-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 bg-slate-200/70 p-1 rounded-lg">
            <button
              onClick={() => setDebtFilter('all')}
              className={`px-3 py-1 rounded-md font-bold transition-colors cursor-pointer ${
                debtFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              الكل ({customerDebts.length})
            </button>
            <button
              onClick={() => setDebtFilter('has_debt')}
              className={`px-3 py-1 rounded-md font-bold transition-colors cursor-pointer ${
                debtFilter === 'has_debt'
                  ? 'bg-white text-amber-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              عليهم آجل ({customersWithDebtCount})
            </button>
            <button
              onClick={() => setDebtFilter('zero_debt')}
              className={`px-3 py-1 rounded-md font-bold transition-colors cursor-pointer ${
                debtFilter === 'zero_debt'
                  ? 'bg-white text-emerald-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              خالص / بدون دين ({customerDebts.length - customersWithDebtCount})
            </button>
          </div>
        </div>

        {/* Customer Directory Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100/80 text-slate-700 border-b border-slate-200 font-black">
                <th className="py-3 px-3 w-12 text-center">م</th>
                <th className="py-3 px-3 w-28">كود العميل</th>
                <th className="py-3 px-3">اسم العميل</th>
                <th className="py-3 px-3">العنوان</th>
                <th className="py-3 px-3">التليفون الأول</th>
                <th className="py-3 px-3">التليفون الثاني</th>
                <th className="py-3 px-3 text-left">رصيد الآجل</th>
                <th className="py-3 px-3 w-28 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <Users className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                    <p className="font-bold text-sm text-slate-600">لا يوجد عملاء مطابقين للبحث</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      يمكنك إضافة عميل جديد أو استرداد ملف عملاء من الأعلى
                    </p>
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((customer, index) => {
                  const debt = Number(customer.current_debt) || 0;
                  const phone1 = customer.phone?.trim() || '';
                  const phone2 = customer.phone2?.trim() || '';

                  return (
                    <tr 
                      key={customer.id} 
                      className="hover:bg-blue-50/50 transition-colors group"
                    >
                      <td className="py-3 px-3 text-center text-slate-400 font-mono text-[11px]">
                        {index + 1}
                      </td>

                      {/* كود العميل */}
                      <td className="py-3 px-3 font-mono font-bold text-slate-800">
                        <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded border border-slate-200 text-[11px]">
                          {customer.customer_code || `CUST-${(index + 1).toString().padStart(3, '0')}`}
                        </span>
                      </td>

                      {/* اسم العميل */}
                      <td className="py-3 px-3 font-bold text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <span>{customer.customer_name}</span>
                          {customer.notes && (
                            <span 
                              className="text-[10px] text-slate-400 font-normal truncate max-w-xs" 
                              title={customer.notes}
                            >
                              ({customer.notes})
                            </span>
                          )}
                        </div>
                      </td>

                      {/* العنوان */}
                      <td className="py-3 px-3 text-slate-600">
                        {customer.address ? (
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate max-w-xs">{customer.address}</span>
                          </div>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* التليفون الأول */}
                      <td className="py-3 px-3 font-mono">
                        {phone1 ? (
                          <div className="flex items-center gap-2">
                            <a
                              href={`tel:${phone1}`}
                              className="text-blue-700 hover:text-blue-800 font-bold hover:underline flex items-center gap-1"
                              title="اتصال بالعميل"
                            >
                              <Phone className="w-3.5 h-3.5 text-blue-600" />
                              {phone1}
                            </a>
                            <a
                              href={`https://wa.me/2${phone1.replace(/\D/g, '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                              title="مراسلة واتساب"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* التليفون الثاني */}
                      <td className="py-3 px-3 font-mono">
                        {phone2 ? (
                          <div className="flex items-center gap-2">
                            <a
                              href={`tel:${phone2}`}
                              className="text-slate-700 hover:text-slate-900 font-bold hover:underline flex items-center gap-1"
                              title="اتصال برقم الهاتف البديل"
                            >
                              <Phone className="w-3.5 h-3.5 text-slate-400" />
                              {phone2}
                            </a>
                            <a
                              href={`https://wa.me/2${phone2.replace(/\D/g, '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                              title="مراسلة واتساب (رقم 2)"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* رصيد الآجل */}
                      <td className="py-3 px-3 text-left font-mono">
                        {debt > 0 ? (
                          <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 font-black border border-rose-200">
                            {debt.toLocaleString()} ج.م
                          </span>
                        ) : (
                          <span className="text-emerald-700 font-bold text-[11px] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            خالص
                          </span>
                        )}
                      </td>

                      {/* الإجراءات */}
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleOpenEditModal(customer)}
                            className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                            title="تعديل بيانات العميل"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleDeleteCustomer(customer)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                            title="حذف العميل"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer info */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 text-slate-500 text-xs flex flex-wrap items-center justify-between gap-2">
          <span>يتم الحفظ والتحديث التلقائي لكافة بيانات العملاء وأرقام الاتصال</span>
          <span className="font-bold text-slate-700">عدد النتائج المعروضة: {filteredCustomers.length} عميل</span>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 1. Modal: إضافة / تعديل عميل */}
      {/* ------------------------------------------------------------- */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-lg shadow-xl overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-bold">
                  {editingCustomerId ? 'تعديل بيانات العميل' : 'إضافة عميل جديد للدليل'}
                </h3>
              </div>
              <button 
                onClick={() => setIsFormModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="p-5 space-y-3.5 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    كود العميل
                  </label>
                  <input
                    type="text"
                    value={formData.customer_code}
                    onChange={e => setFormData({ ...formData, customer_code: e.target.value })}
                    placeholder="CUST-001"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 font-mono font-bold text-slate-900 focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    اسم العميل <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.customer_name}
                    onChange={e => setFormData({ ...formData, customer_name: e.target.value })}
                    placeholder="مثال: سوبرماركت الأمانة أو محمد أحمد"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 font-bold text-slate-900 focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  العنوان بتاع العميل
                </label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={e => setFormData({ ...formData, address: e.target.value })}
                  placeholder="المدينة، الشارع، علامة مميزة أو رقم العقار..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    التليفون الأول (الأساسي)
                  </label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="010xxxxxxxx"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 font-mono font-bold text-slate-900 focus:outline-none focus:border-blue-600 text-left dir-ltr"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    التليفون الثاني (إضافي / واتساب)
                  </label>
                  <input
                    type="text"
                    value={formData.phone2}
                    onChange={e => setFormData({ ...formData, phone2: e.target.value })}
                    placeholder="011xxxxxxxx"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 font-mono font-bold text-slate-900 focus:outline-none focus:border-blue-600 text-left dir-ltr"
                  />
                </div>
              </div>

              {!editingCustomerId && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    رصيد مديونية افتتاحي (اختياري)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.initialDebt}
                    onChange={e => setFormData({ ...formData, initialDebt: e.target.value === '' ? '' : Number(e.target.value) })}
                    placeholder="0"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 font-mono font-bold text-slate-900 focus:outline-none focus:border-blue-600"
                  />
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  ملاحظات
                </label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={e => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="أية شروط ائتمان أو بيانات إضافية..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-900 focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg shadow-sm transition-colors cursor-pointer"
                >
                  {editingCustomerId ? 'حفظ التعديلات' : 'إضافة العميل'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 2. Modal: ضرب استرداد ملف عملاء (Excel / CSV / JSON) */}
      {/* ------------------------------------------------------------- */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-3xl shadow-xl overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-blue-400" />
                <div>
                  <h3 className="text-sm font-bold">ضرب واسترداد ملف العملاء (Excel / CSV / JSON)</h3>
                  <p className="text-[11px] text-slate-400">
                    استيراد مباشر لأعمدة: كود العميل، اسم العميل، العنوان، التليفون الأول، التليفون الثاني
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsImportModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {/* File Select Area */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-slate-50 border border-dashed border-slate-300 rounded-xl">
                <div>
                  <div className="font-bold text-slate-900">اختر ملف العملاء من جهازك</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    يدعم ملفات إكسل (.xlsx, .xls) وملفات القيم المفصولة (.csv) وملفات JSON
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadSampleFile}
                    className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                    title="تنزيل نموذج ملف جاهز للتعبئة"
                  >
                    <Download className="w-3.5 h-3.5 text-blue-600" />
                    تحميل نموذج Excel/CSV
                  </button>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv,.json"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    اختيار ملف
                  </button>
                </div>
              </div>

              {isProcessingFile && (
                <div className="p-4 text-center text-slate-500 font-bold flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                  جاري قراءة واستخراج بيانات العملاء من الملف...
                </div>
              )}

              {/* Preview Table */}
              {importedRows.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">
                      معاينة البيانات المستخرجة من ({importFileName}): {importedRows.length} عميل
                    </span>
                    <span className="text-emerald-700 font-bold text-[11px] bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-200">
                      جاهز للاستيراد
                    </span>
                  </div>

                  <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-right text-[11px]">
                      <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0">
                        <tr className="border-b border-slate-200">
                          <th className="py-2 px-2.5">الكود</th>
                          <th className="py-2 px-2.5">اسم العميل</th>
                          <th className="py-2 px-2.5">العنوان</th>
                          <th className="py-2 px-2.5">التليفون الأول</th>
                          <th className="py-2 px-2.5">التليفون الثاني</th>
                          <th className="py-2 px-2.5 text-left">الرصيد</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {importedRows.slice(0, 50).map((row, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="py-2 px-2.5 font-mono text-slate-600">{row.customer_code || '-'}</td>
                            <td className="py-2 px-2.5 font-bold text-slate-900">{row.customer_name}</td>
                            <td className="py-2 px-2.5 text-slate-600">{row.address || '-'}</td>
                            <td className="py-2 px-2.5 font-mono text-slate-600">{row.phone || '-'}</td>
                            <td className="py-2 px-2.5 font-mono text-slate-600">{row.phone2 || '-'}</td>
                            <td className="py-2 px-2.5 font-mono text-left">{row.initialDebt ? `${row.initialDebt} ج.م` : '0'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {importedRows.length > 50 && (
                    <div className="text-[10px] text-slate-400 text-center">
                      يتم عرض أول 50 سجلاً فقط في المعاينة، وسيتم استيراد كافة الـ {importedRows.length} عميل بالكامل.
                    </div>
                  )}
                </div>
              ) : (
                !isProcessingFile && (
                  <div className="py-8 text-center bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <FileSpreadsheet className="w-8 h-8 text-slate-400 mx-auto" />
                    <div className="font-bold text-slate-700">لم يتم اختيار ملف بعد</div>
                    <div className="text-[11px] text-slate-400 max-w-sm mx-auto">
                      اضغط على "اختيار ملف" لاختيار ملف Excel أو CSV من جهازك لدمج واسترداد العملاء تلقائياً.
                    </div>
                  </div>
                )
              )}

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <div className="text-[11px] text-slate-500">
                  ملاحظة: في حالة وجود عميل مسجل بنفس الكود أو الاسم سيتم تحديث بياناته وعنوانه وهواتفه دون تكرار.
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsImportModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition-colors cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="button"
                    disabled={importedRows.length === 0}
                    onClick={handleConfirmImport}
                    className="px-5 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white font-bold rounded-lg shadow-sm transition-colors cursor-pointer"
                  >
                    بدء الاسترداد والحفظ
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 3. Modal: تصدير وطباعة PDF (دليل العملاء الرسمي) */}
      {/* ------------------------------------------------------------- */}
      {isPdfPrintModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto print:p-0 print:bg-white print:static">
          <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[96vh] animate-in fade-in zoom-in duration-150 print:max-h-none print:w-full print:border-none print:shadow-none print:rounded-none">
            {/* Top Toolbar (Hidden when printing) */}
            <div className="flex items-center justify-between p-4 bg-slate-900 text-white border-b border-slate-800 print:hidden">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold">
                  <Printer className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">معاينة وطباعة كشف دليل العملاء (PDF)</h3>
                  <p className="text-[11px] text-slate-400">
                    كشف معتمد يشتمل على: كود العميل، اسم العميل، العنوان، التليفون الأول، التليفون الثاني، ورصيد المديونية
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-sm flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  طباعة الآن / حفظ كـ PDF
                </button>
                <button
                  onClick={() => setIsPdfPrintModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Document Body */}
            <div className="p-6 overflow-y-auto flex-1 bg-slate-100/60 print:p-0 print:bg-white print:overflow-visible">
              <div 
                id="printable-customers-directory"
                className="bg-white text-slate-950 mx-auto max-w-3xl p-8 rounded-xl shadow-md border border-slate-200 font-sans print:border-none print:shadow-none print:p-2 print:max-w-full"
                style={{ direction: 'rtl' }}
              >
                {/* Store Header */}
                <div className="border-b-2 border-slate-900 pb-4 mb-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h1 className="text-lg font-black text-slate-900 tracking-tight">
                        مؤسسة البركة لتجارة المواد الغذائية والتوزيع
                      </h1>
                      <p className="text-xs text-slate-600">
                        سجل ودليل العملاء وأرقام الاتصال ومسؤولي المشتريات
                      </p>
                    </div>

                    <div className="text-left bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-[11px]">
                      <div><strong>تاريخ التقرير:</strong> {new Date().toLocaleDateString('ar-EG')}</div>
                      <div><strong>إجمالي العملاء:</strong> {customerDebts.length} عميل</div>
                    </div>
                  </div>
                </div>

                {/* Printable Table */}
                <table className="w-full text-right text-xs border-collapse border border-slate-300">
                  <thead>
                    <tr className="bg-slate-100 text-slate-900 font-black border-b border-slate-300">
                      <th className="py-2.5 px-2 border border-slate-300 text-center w-8">م</th>
                      <th className="py-2.5 px-2 border border-slate-300 w-24">كود العميل</th>
                      <th className="py-2.5 px-2 border border-slate-300">اسم العميل</th>
                      <th className="py-2.5 px-2 border border-slate-300">العنوان</th>
                      <th className="py-2.5 px-2 border border-slate-300">التليفون الأول</th>
                      <th className="py-2.5 px-2 border border-slate-300">التليفون الثاني</th>
                      <th className="py-2.5 px-2 border border-slate-300 text-left w-24">الرصيد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerDebts.map((c, i) => (
                      <tr key={c.id} className="border-b border-slate-200 text-[11px]">
                        <td className="py-2 px-2 border border-slate-200 text-center font-mono">{i + 1}</td>
                        <td className="py-2 px-2 border border-slate-200 font-mono font-bold">{c.customer_code || `CUST-${(i+1).toString().padStart(3, '0')}`}</td>
                        <td className="py-2 px-2 border border-slate-200 font-bold">{c.customer_name}</td>
                        <td className="py-2 px-2 border border-slate-200 text-slate-700">{c.address || '-'}</td>
                        <td className="py-2 px-2 border border-slate-200 font-mono text-slate-800 dir-ltr text-right">{c.phone || '-'}</td>
                        <td className="py-2 px-2 border border-slate-200 font-mono text-slate-800 dir-ltr text-right">{c.phone2 || '-'}</td>
                        <td className="py-2 px-2 border border-slate-200 font-mono text-left font-bold">
                          {c.current_debt > 0 ? `${c.current_debt.toLocaleString()} ج.م` : 'خالص'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Footer summary */}
                <div className="mt-6 pt-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
                  <div>إجمالي المديونيات المستحقة: <strong>{totalDebtsSum.toLocaleString()} ج.م</strong></div>
                  <div>طبع بواسطة نظام إدارة المخازن والحسابات</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

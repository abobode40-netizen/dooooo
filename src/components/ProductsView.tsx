import React, { useState, useMemo } from 'react';
import { 
  Plus, 
  Search, 
  Edit3, 
  Trash2, 
  Package, 
  ArrowUpDown, 
  Layers, 
  Check, 
  X, 
  DollarSign, 
  Hash, 
  AlertCircle,
  Download,
  Sliders
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Product } from '../types';
import { exportProductsToExcel } from '../utils/productImportExport';

export const ProductsView: React.FC = () => {
  const { products, addProduct, updateProduct, deleteProduct, showToast } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedUnit, setSelectedUnit] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'price' | 'price_wholesale' | 'code'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Form Fields
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formUnit, setFormUnit] = useState('كرتونه');
  const [formCategory, setFormCategory] = useState('مواد غذائية أساسية');
  const [formRetailPrice, setFormRetailPrice] = useState<number | ''>('');
  const [formWholesalePrice, setFormWholesalePrice] = useState<number | ''>('');
  const [formStock, setFormStock] = useState<number | ''>(50);
  const [formBarcode, setFormBarcode] = useState('');

  // Units & Categories lists
  const categories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach(p => {
      if (p.category) cats.add(p.category);
    });
    return Array.from(cats);
  }, [products]);

  const units = useMemo(() => {
    const u = new Set<string>();
    products.forEach(p => {
      if (p.unit) u.add(p.unit);
    });
    return Array.from(u);
  }, [products]);

  // Filtered & Sorted Products
  const filteredProducts = useMemo(() => {
    return products
      .filter(p => {
        const matchSearch =
          !searchQuery ||
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.code.toLowerCase().includes(searchQuery.toLowerCase());
        const matchCat = selectedCategory === 'all' || p.category === selectedCategory;
        const matchUnit = selectedUnit === 'all' || p.unit === selectedUnit;
        return matchSearch && matchCat && matchUnit;
      })
      .sort((a, b) => {
        let valA = a[sortBy];
        let valB = b[sortBy];
        if (typeof valA === 'string') {
          return sortOrder === 'asc'
            ? valA.localeCompare(valB as string, 'ar')
            : (valB as string).localeCompare(valA, 'ar');
        }
        return sortOrder === 'asc' ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
      });
  }, [products, searchQuery, selectedCategory, selectedUnit, sortBy, sortOrder]);

  const openAddModal = () => {
    setEditingProduct(null);
    setFormName('');
    setFormCode((Math.floor(10000 + Math.random() * 90000)).toString());
    setFormUnit('كرتونه');
    setFormCategory('مواد غذائية أساسية');
    setFormRetailPrice('');
    setFormWholesalePrice('');
    setFormStock(50);
    setFormBarcode('');
    setIsModalOpen(true);
  };

  const openEditModal = (p: Product) => {
    setEditingProduct(p);
    setFormName(p.name);
    setFormCode(p.code);
    setFormUnit(p.unit || 'كرتونه');
    setFormCategory(p.category || 'مواد غذائية أساسية');
    setFormRetailPrice(p.price || 0);
    setFormWholesalePrice(p.price_wholesale || p.price || 0);
    setFormStock(p.stock ?? 0);
    setFormBarcode(p.barcode || '');
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formCode.trim()) {
      showToast('يرجى ملء اسم الصنف وكوده بشكل صحيح', 'error');
      return;
    }

    const retail = Number(formRetailPrice) || 0;
    const wholesale = Number(formWholesalePrice) || retail;

    if (editingProduct) {
      updateProduct(editingProduct.id, {
        name: formName.trim(),
        code: formCode.trim(),
        unit: formUnit.trim(),
        category: formCategory.trim() || null,
        price: retail,
        price_wholesale: wholesale,
        stock: Number(formStock) || 0,
        barcode: formBarcode.trim() || null
      });
      showToast('تم تحديث بيانات الصنف بنجاح', 'success');
    } else {
      addProduct({
        name: formName.trim(),
        code: formCode.trim(),
        unit: formUnit.trim(),
        category: formCategory.trim() || null,
        price: retail,
        price_wholesale: wholesale,
        cost: 0,
        stock: Number(formStock) || 0,
        barcode: formBarcode.trim() || null
      });
      showToast('تمت إضافة الصنف الجديد بنجاح', 'success');
    }

    setIsModalOpen(false);
  };

  const commonUnits = ['كرتونه', 'بالتة', 'شكاره', 'علبة', 'ربطة', 'طرد', 'صفيحة', 'جركن', 'كيلو', 'قطعة', 'شريط', 'كيس', 'حصيرة'];

  return (
    <div className="space-y-4 font-sans text-slate-800 animate-in fade-in duration-150">
      {/* Header with Search and Actions */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                دليل الأصناف والمخزون
              </h2>
              <p className="text-xs text-slate-500">
                إدارة البضائع، أسعار الجملة والقطاعي، الأرصدة، وتوثيق الأكواد
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => exportProductsToExcel(products)}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-lg border border-slate-300 transition-colors flex items-center gap-1.5 cursor-pointer"
              title="تصدير جميع الأصناف إلى ملف إكسيل"
            >
              <Download className="w-4 h-4 text-emerald-600" />
              تصدير Excel
            </button>

            <button
              onClick={openAddModal}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              إضافة صنف جديد
            </button>
          </div>
        </div>

        {/* Filters and Search Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 pt-2 border-t border-slate-100">
          <div className="md:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="ابحث بالاسم أو كود الصنف (مثلاً: سكر، أريال، 10009)..."
              className="w-full bg-slate-50 border border-slate-300 rounded-lg pr-9 pl-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-blue-600 transition-colors"
            />
          </div>

          <div>
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 font-bold focus:bg-white focus:outline-none focus:border-blue-600"
            >
              <option value="all">جميع التصنيفات</option>
              {categories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={selectedUnit}
              onChange={e => setSelectedUnit(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 font-bold focus:bg-white focus:outline-none focus:border-blue-600"
            >
              <option value="all">جميع الوحدات</option>
              {units.map(u => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Products Table (Clean White & High Contrast) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse text-xs">
            <thead>
              <tr className="bg-slate-800 text-white font-bold border-b border-slate-700 text-[11px]">
                <th className="py-2.5 px-3 text-center w-14">م</th>
                <th className="py-2.5 px-3 text-center w-28">كود الصنف</th>
                <th className="py-2.5 px-4">اسم الصنف والتصنيف</th>
                <th className="py-2.5 px-3 text-center w-24">الوحدة</th>
                <th className="py-2.5 px-3 text-center">سعر الجملة</th>
                <th className="py-2.5 px-3 text-center">سعر القطاعي</th>
                <th className="py-2.5 px-3 text-center">الرصيد بالمخزن</th>
                <th className="py-2.5 px-3 text-center w-24">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredProducts.map((product, idx) => (
                <tr
                  key={product.id}
                  className={`hover:bg-slate-50 transition-colors ${
                    idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                  }`}
                >
                  <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-400">
                    {idx + 1}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono font-bold text-slate-800 text-xs">
                      #{product.code}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 font-bold text-slate-900">
                    <div>{product.name}</div>
                    {product.category && (
                      <span className="text-[10px] text-slate-400 font-normal">
                        {product.category}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold border border-slate-200 text-[11px]">
                      {product.unit}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-center font-bold text-slate-900 font-mono">
                    {product.price_wholesale} ج.م
                  </td>
                  <td className="py-2.5 px-3 text-center font-bold text-blue-700 font-mono">
                    {product.price} ج.م
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <span className={`font-black font-mono px-2 py-0.5 rounded ${
                      (product.stock ?? 0) <= 5
                        ? 'bg-rose-50 text-rose-700 border border-rose-200'
                        : 'text-slate-800'
                    }`}>
                      {product.stock ?? 0}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => openEditModal(product)}
                        className="p-1.5 rounded-lg bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-700 transition-colors cursor-pointer"
                        title="تعديل الصنف"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm(`هل أنت متأكد من حذف الصنف "${product.name}"؟`)) {
                            deleteProduct(product.id);
                            showToast('تم حذف الصنف بنجاح', 'info');
                          }
                        }}
                        className="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-600 hover:text-white text-slate-700 transition-colors cursor-pointer"
                        title="حذف الصنف"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    لا توجد أصناف مطابقة لخيارات البحث المحددة
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>إجمالي الأصناف المعروضة: <strong className="text-slate-900">{filteredProducts.length}</strong> من أصل {products.length} صنف</span>
          <span className="text-[11px] text-slate-400">
            لاسترداد وتحديث ملف الأصناف والأسعار (Excel)، انتقل إلى الإعدادات
          </span>
        </div>
      </div>

      {/* Add/Edit Product Modal (Clean White & Blue theme) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg overflow-hidden shadow-xl animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between p-4 bg-slate-900 text-white">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-400" />
                {editingProduct ? 'تعديل بيانات صنف' : 'إضافة صنف جديد إلى المخزون'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">اسم الصنف بالكامل *</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="مثال: سكر ابيض 900جرام *10كيس"
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-bold focus:bg-white focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">كود الصنف *</label>
                  <input
                    type="text"
                    required
                    value={formCode}
                    onChange={e => setFormCode(e.target.value)}
                    placeholder="10006"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono font-bold focus:bg-white focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">الوحدة *</label>
                  <input
                    type="text"
                    list="units-list"
                    required
                    value={formUnit}
                    onChange={e => setFormUnit(e.target.value)}
                    placeholder="كرتونه / بالتة / شكاره"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-bold focus:bg-white focus:outline-none focus:border-blue-600"
                  />
                  <datalist id="units-list">
                    {commonUnits.map(u => (
                      <option key={u} value={u} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">سعر الجملة (ج.م) *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={formWholesalePrice}
                    onChange={e => setFormWholesalePrice(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    placeholder="210"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono font-bold focus:bg-white focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">سعر القطاعي (ج.م) *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={formRetailPrice}
                    onChange={e => setFormRetailPrice(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    placeholder="212"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-blue-700 font-mono font-bold focus:bg-white focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">التصنيف</label>
                  <input
                    type="text"
                    value={formCategory}
                    onChange={e => setFormCategory(e.target.value)}
                    placeholder="مواد غذائية / منظفات..."
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">الرصيد المبدئي</label>
                  <input
                    type="number"
                    value={formStock}
                    onChange={e => setFormStock(e.target.value === '' ? '' : parseInt(e.target.value))}
                    placeholder="50"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono font-bold focus:bg-white focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-100">
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer shadow-sm"
                >
                  {editingProduct ? 'حفظ التعديلات' : 'إضافة الصنف'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs rounded-lg font-bold transition-colors cursor-pointer"
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

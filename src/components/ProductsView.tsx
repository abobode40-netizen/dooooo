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
  AlertCircle
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Product } from '../types';

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
    setFormUnit(p.unit);
    setFormCategory(p.category || 'عام');
    setFormRetailPrice(p.price);
    setFormWholesalePrice(p.price_wholesale);
    setFormStock(p.stock || 0);
    setFormBarcode(p.barcode || '');
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formCode.trim()) {
      showToast('يرجى كتابة اسم الصنف وكوده بشكل صحيح', 'error');
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
    }

    setIsModalOpen(false);
  };

  const commonUnits = ['كرتونه', 'بالتة', 'شكاره', 'علبة', 'ربطة', 'طرد', 'صفيحة', 'جركن', 'كيلو', 'قطعة', 'شريط', 'كيس', 'حصيرة'];

  return (
    <div className="space-y-6">
      {/* Header with Search and Actions */}
      <div className="bg-slate-800/80 rounded-2xl p-5 border border-slate-700 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Package className="w-5 h-5 text-amber-400" />
              دليل الأصناف والمخزون
            </h2>
            <p className="text-xs text-slate-400">إدارة تفاصيل البضائع، كود الصنف، الوحدة، أسعار الجملة والقطاعي</p>
          </div>

          <button
            onClick={openAddModal}
            className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            إضافة صنف جديد
          </button>
        </div>

        {/* Filters and Search Bar */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="ابحث بالاسم أو كود الصنف (مثلاً: سكر، أريال، 10009)..."
              className="w-full bg-slate-900 border border-slate-700 rounded-xl pr-10 pl-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-all"
            />
          </div>

          <div>
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
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
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
            >
              <option value="all">جميع الوحدات</option>
              {units.map(u => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-slate-800/80 rounded-2xl border border-slate-700 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-slate-900/90 text-slate-400 text-xs font-semibold border-b border-slate-700">
                <th className="py-3 px-4">كود الصنف</th>
                <th className="py-3 px-4">اسم الصنف</th>
                <th className="py-3 px-4">الوحدة</th>
                <th className="py-3 px-4">سعر الجملة</th>
                <th className="py-3 px-4">سعر القطاعي</th>
                <th className="py-3 px-4">المخزون الحالي</th>
                <th className="py-3 px-4 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50 text-xs">
              {filteredProducts.map(product => (
                <tr
                  key={product.id}
                  className="hover:bg-slate-700/30 transition-colors group"
                >
                  <td className="py-3 px-4 font-mono font-bold text-amber-400">
                    #{product.code}
                  </td>
                  <td className="py-3 px-4 font-bold text-slate-100">
                    {product.name}
                    {product.category && (
                      <span className="block text-[10px] font-normal text-slate-400 mt-0.5">
                        {product.category}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 rounded-md bg-slate-900 text-slate-300 border border-slate-700 font-medium">
                      {product.unit}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-bold text-amber-400">
                    {product.price_wholesale} ج.م
                  </td>
                  <td className="py-3 px-4 font-bold text-emerald-400">
                    {product.price} ج.م
                  </td>
                  <td className="py-3 px-4">
                    <span className={`font-semibold ${product.stock < 10 ? 'text-rose-400' : 'text-slate-300'}`}>
                      {product.stock ?? 0}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => openEditModal(product)}
                        className="p-1.5 rounded-lg bg-slate-700/60 hover:bg-amber-500 hover:text-slate-950 text-slate-300 transition-colors"
                        title="تعديل"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm(`هل أنت متأكد من حذف الصنف "${product.name}"؟`)) {
                            deleteProduct(product.id);
                          }
                        }}
                        className="p-1.5 rounded-lg bg-slate-700/60 hover:bg-rose-500 hover:text-white text-slate-300 transition-colors"
                        title="حذف"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    لا توجد أصناف مطابقة لخيارات البحث المحددة
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="p-3 bg-slate-900/60 border-t border-slate-700 flex items-center justify-between text-xs text-slate-400">
          <span>إجمالي الأصناف المعروضة: <strong className="text-white">{filteredProducts.length}</strong> من أصل {products.length} صنف</span>
        </div>
      </div>

      {/* Add/Edit Product Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between p-4 bg-slate-800 border-b border-slate-700">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Package className="w-4 h-4 text-amber-400" />
                {editingProduct ? 'تعديل بيانات صنف' : 'إضافة صنف جديد'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">اسم الصنف بالكامل *</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="مثال: سكر ابيض 900جرام *10كيس"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">كود الصنف (رقم/رمز) *</label>
                  <input
                    type="text"
                    required
                    value={formCode}
                    onChange={e => setFormCode(e.target.value)}
                    placeholder="10006"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">الوحدة *</label>
                  <input
                    type="text"
                    list="units-list"
                    required
                    value={formUnit}
                    onChange={e => setFormUnit(e.target.value)}
                    placeholder="كرتونه / بالتة / شكاره"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
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
                  <label className="text-xs font-semibold text-slate-300 block mb-1">سعر الجملة (ج.م) *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={formWholesalePrice}
                    onChange={e => setFormWholesalePrice(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    placeholder="210"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-amber-400 font-bold focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">سعر القطاعي (ج.م) *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={formRetailPrice}
                    onChange={e => setFormRetailPrice(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    placeholder="212"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-emerald-400 font-bold focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">التصنيف</label>
                  <input
                    type="text"
                    value={formCategory}
                    onChange={e => setFormCategory(e.target.value)}
                    placeholder="مواد غذائية / منظفات..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">المخزون الأولي</label>
                  <input
                    type="number"
                    value={formStock}
                    onChange={e => setFormStock(e.target.value === '' ? '' : parseInt(e.target.value))}
                    placeholder="50"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-3 border-t border-slate-800">
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition-colors"
                >
                  {editingProduct ? 'حفظ التعديلات' : 'إضافة الصنف'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-xl font-semibold transition-colors"
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

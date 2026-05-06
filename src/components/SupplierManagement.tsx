import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  MapPin, 
  Phone, 
  User, 
  Search, 
  Plus, 
  Edit2, 
  Trash2, 
  X, 
  Save, 
  ArrowLeft,
  Truck,
  CreditCard,
  Star,
  AlertTriangle,
  Package
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Supplier {
  id: string;
  name: string;
  contact_person: string;
  phone: string;
  category: string;
  address: string;
  bank_account: string;
  reliability_score: number;
  remarks: string;
  created_at?: string;
}

interface Offering {
  id?: number;
  supplier_id: string;
  product_name: string;
  category: string;
  particle_size?: string;
  specification?: string;
  unit_price?: number;
  discount_policy?: string;
  purchase_date?: string;
  purchase_quantity?: number;
  protein_content?: string;
}

interface SupplierProps {
  onBack: () => void;
}

export default function SupplierManagement({ onBack }: SupplierProps) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeModal, setActiveModal] = useState<'create' | 'edit' | null>(null);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [formData, setFormData] = useState<Partial<Supplier>>({
    reliability_score: 100
  });
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Supplier Offerings State
  const [viewingOfferings, setViewingOfferings] = useState<Supplier | null>(null);
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [isOfferingModalOpen, setIsOfferingModalOpen] = useState(false);
  const [offeringForm, setOfferingForm] = useState<Partial<Offering>>({});
  const [isOfferingsLoading, setIsOfferingsLoading] = useState(false);

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const fetchOfferings = async (supplierId: string) => {
    setIsOfferingsLoading(true);
    try {
      const res = await fetch(`/api/suppliers/${supplierId}/offerings`);
      if (res.ok) {
        const data = await res.json();
        setOfferings(data);
      }
    } catch (err) {
      showToast('获取供应物资失败', 'error');
    } finally {
      setIsOfferingsLoading(false);
    }
  };

  const handleSaveOffering = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewingOfferings) return;

    try {
      const res = await fetch(`/api/suppliers/${viewingOfferings.id}/offerings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...offeringForm,
          category: viewingOfferings.category
        })
      });
      if (res.ok) {
        showToast('物资信息已录入');
        setOfferingForm({});
        setIsOfferingModalOpen(false);
        fetchOfferings(viewingOfferings.id);
      }
    } catch (err) {
      showToast('录入失败', 'error');
    }
  };

  const handleDeleteOffering = async (id: number) => {
    try {
      const res = await fetch(`/api/supplier-offerings/${id}`, { method: 'DELETE' });
      if (res.ok && viewingOfferings) {
        showToast('物资已移除');
        fetchOfferings(viewingOfferings.id);
      }
    } catch (err) {
      showToast('移除失败', 'error');
    }
  };

  const fetchSuppliers = async () => {
    try {
      const res = await fetch('/api/suppliers');
      const data = await res.json();
      setSuppliers(data);
    } catch (err) {
      showToast('获取供应商数据失败', 'error');
    }
  };

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const endpoint = activeModal === 'create' ? '/api/suppliers' : `/api/suppliers/${editingSupplier?.id}`;
    const method = activeModal === 'create' ? 'POST' : 'PUT';

    // Auto-generate ID if creating
    const payload = activeModal === 'create' 
      ? { ...formData, id: `SUP-${Date.now().toString().slice(-6)}` }
      : formData;

    try {
      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        showToast(activeModal === 'create' ? '新增供应商成功' : '修改供应商成功');
        setActiveModal(null);
        fetchSuppliers();
      } else {
        const err = await res.json();
        showToast(`操作失败: ${err.error}`, 'error');
      }
    } catch (err) {
      showToast('操作失败，请检查网络', 'error');
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      const res = await fetch(`/api/suppliers/${confirmDelete.id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('供应商已删除');
        setConfirmDelete(null);
        fetchSuppliers();
      }
    } catch (err) {
      showToast('删除失败', 'error');
    }
  };

  const filteredSuppliers = suppliers.filter(s => {
    const matchesSearch = 
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.contact_person.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.category.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = activeCategory === 'all' || s.category === activeCategory;
    
    return matchesSearch && matchesCategory;
  });

  const categories = [
    { id: 'all', label: '全部' },
    { id: 'feed', label: '饲料' },
    { id: 'med', label: '动保' },
    { id: 'fry', label: '鱼苗' },
    { id: 'fish', label: '成品鱼' },
    { id: 'material', label: '物资' }
  ];

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-200">
      {/* Header */}
      <div className="p-6 border-b border-slate-800 bg-slate-900/50 flex flex-col gap-6 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-full transition-colors">
              <ArrowLeft size={20} className="text-slate-400" />
            </button>
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-500/20 rounded-xl">
                <Truck className="text-indigo-400" size={24} />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">供应商管理</h1>
                <p className="text-xs text-slate-500 font-medium">维护物资合作伙伴及信用档案</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400 transition-colors" size={18} />
              <input 
                type="text" 
                placeholder="搜索供应商、联系人、类别..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500/50 w-64 transition-all"
              />
            </div>
            <button 
              onClick={() => {
                setFormData({ reliability_score: 100, category: activeCategory === 'all' ? 'feed' : activeCategory });
                setActiveModal('create');
              }}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-500/20 transition-all"
            >
              <Plus size={18} />
              合作方准入
            </button>
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex items-center gap-2">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                activeCategory === cat.id 
                  ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' 
                  : 'bg-slate-900 text-slate-400 hover:bg-slate-800 border border-slate-800'
              }`}
            >
              {cat.label}
              <span className="ml-2 text-[10px] opacity-60">
                ({cat.id === 'all' ? suppliers.length : suppliers.filter(s => s.category === cat.id).length})
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6 overflow-y-auto flex-1">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          <AnimatePresence>
            {filteredSuppliers.map((supplier) => (
              <motion.div 
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                key={supplier.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-slate-600 transition-all group relative overflow-hidden"
              >
                {/* Reliability Score Badge */}
                <div className="absolute top-0 right-0 p-3">
                  <div className={`flex items-center gap-1.5 px-2 py-1 rounded-bl-xl rounded-tr-lg text-[10px] font-bold ${
                    supplier.reliability_score >= 90 ? 'bg-emerald-500/10 text-emerald-400' : 
                    supplier.reliability_score >= 70 ? 'bg-amber-500/10 text-amber-400' : 'bg-rose-500/10 text-rose-400'
                  }`}>
                    <Star size={10} fill={supplier.reliability_score >= 90 ? "currentColor" : "none"} />
                    信用 {supplier.reliability_score}
                  </div>
                </div>

                <div className="flex items-center gap-4 mb-4">
                  <div className="p-3 bg-slate-800 rounded-xl group-hover:bg-indigo-500 transition-colors cursor-pointer" onClick={() => {
                    setViewingOfferings(supplier);
                    fetchOfferings(supplier.id);
                  }}>
                    <Building2 className="text-slate-400 group-hover:text-white" size={20} />
                  </div>
                  <div className="cursor-pointer flex-1" onClick={() => {
                    setViewingOfferings(supplier);
                    fetchOfferings(supplier.id);
                  }}>
                    <h3 className="font-bold text-slate-100 group-hover:text-indigo-400 transition-colors">{supplier.name}</h3>
                    <span className="inline-block px-2 py-0.5 mt-1 bg-indigo-500/10 text-indigo-400 text-[10px] font-bold rounded uppercase">
                      {categories.find(c => c.id === supplier.category)?.label || supplier.category}
                    </span>
                  </div>
                </div>

                <div className="space-y-2.5 mb-6 text-sm">
                  <div className="flex items-center gap-3 text-slate-400">
                    <User size={14} />
                    <span>{supplier.contact_person || '未设置联系人'}</span>
                  </div>
                  <div className="flex items-center gap-3 text-slate-400">
                    <Phone size={14} />
                    <span>{supplier.phone || '未设置电话'}</span>
                  </div>
                  <div className="flex items-center gap-3 text-slate-400">
                    <MapPin size={14} />
                    <span className="truncate">{supplier.address || '未设置地址'}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                  <button 
                    onClick={() => {
                      setEditingSupplier(supplier);
                      setFormData(supplier);
                      setActiveModal('edit');
                    }}
                    className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-indigo-400 transition-colors"
                  >
                    <Edit2 size={14} />
                    档案修改
                  </button>
                  <button 
                    onClick={() => setConfirmDelete({ id: supplier.id, name: supplier.name })}
                    className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-rose-400 transition-colors"
                  >
                    <Trash2 size={14} />
                    删除
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {filteredSuppliers.length === 0 && (
            <div className="col-span-full py-20 text-center text-slate-500 italic bg-slate-900/30 rounded-3xl border border-dashed border-slate-800 uppercase tracking-widest text-sm">
               未找到匹配的供应商记录
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {activeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveModal(null)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-800/20">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-500/20 rounded-lg">
                    {activeModal === 'create' ? <Plus className="text-indigo-400" size={20} /> : <Edit2 className="text-indigo-400" size={20} />}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">{activeModal === 'create' ? '供应商准入登记' : '档案修改'}</h2>
                    <p className="text-xs text-slate-500">完善合作伙伴详细资料以供调拨决策参考</p>
                  </div>
                </div>
                <button onClick={() => setActiveModal(null)} className="p-2 hover:bg-slate-800 rounded-full transition-colors">
                  <X size={20} className="text-slate-500" />
                </button>
              </div>

              <form onSubmit={handleSave} className="p-6 grid grid-cols-2 gap-5">
                <div className="space-y-1.5 col-span-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">供应商名称 <span className="text-rose-500">*</span></label>
                  <input 
                    required
                    type="text" 
                    value={formData.name || ''}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm focus:outline-none focus:border-indigo-500 transition-colors" 
                    placeholder="例如：海大饲料有限公司" 
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">主营类别</label>
                  <select 
                    value={formData.category || ''}
                    onChange={(e) => setFormData({...formData, category: e.target.value})}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                  >
                    <option value="">选择类别</option>
                    <option value="feed">配合饲料</option>
                    <option value="med">动保/药物</option>
                    <option value="fry">苗种/生物</option>
                    <option value="fish">成品鱼交易</option>
                    <option value="material">生产物资</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">信用评分 (0-100)</label>
                  <input 
                    type="number" 
                    min="0"
                    max="100"
                    value={formData.reliability_score || 100}
                    onChange={(e) => setFormData({...formData, reliability_score: parseInt(e.target.value)})}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm focus:outline-none focus:border-indigo-500 font-mono" 
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">联系人</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
                    <input 
                      type="text" 
                      value={formData.contact_person || ''}
                      onChange={(e) => setFormData({...formData, contact_person: e.target.value})}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-3 py-3 text-sm focus:outline-none focus:border-indigo-500 transition-colors" 
                      placeholder="姓名" 
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">联系电话</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
                    <input 
                      type="text" 
                      value={formData.phone || ''}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-3 py-3 text-sm focus:outline-none focus:border-indigo-500 transition-colors" 
                      placeholder="手机号或固话" 
                    />
                  </div>
                </div>

                <div className="space-y-1.5 col-span-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">结算账号 / 银行信息</label>
                  <div className="relative">
                    <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
                    <input 
                      type="text" 
                      value={formData.bank_account || ''}
                      onChange={(e) => setFormData({...formData, bank_account: e.target.value})}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-3 py-3 text-sm focus:outline-none focus:border-indigo-500 transition-colors" 
                      placeholder="公司开户行及账号" 
                    />
                  </div>
                </div>

                <div className="space-y-1.5 col-span-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">经营地址</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 text-slate-600" size={16} />
                    <textarea 
                      value={formData.address || ''}
                      onChange={(e) => setFormData({...formData, address: e.target.value})}
                      rows={2}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-3 py-3 text-sm focus:outline-none focus:border-indigo-500 transition-colors" 
                      placeholder="供应商注册或发货地址" 
                    />
                  </div>
                </div>

                <div className="p-6 border-t border-slate-800 flex justify-end gap-3 col-span-2 -mx-6 -mb-6 bg-slate-800/10">
                  <button 
                    type="button"
                    onClick={() => setActiveModal(null)}
                    className="px-6 py-2.5 text-sm font-bold text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    取消
                  </button>
                  <button 
                    type="submit"
                    className="flex items-center gap-2 px-8 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-500/20 transition-all"
                  >
                    <Save size={18} />
                    保存档案
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Offerings Modal */}
      <AnimatePresence>
        {viewingOfferings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setViewingOfferings(null)}
              className="absolute inset-0 bg-slate-950/90 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, x: 50 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.95, x: 50 }}
              className="relative w-full max-w-4xl max-h-[85vh] bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-slate-800 bg-slate-900 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-indigo-500/20 rounded-2xl">
                    <Package className="text-indigo-400" size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">{viewingOfferings.name} - 供应物资明细</h2>
                    <p className="text-xs text-slate-500">查看及管理从该供应商采购的物资清单</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => {
                      setOfferingForm({
                        purchase_date: new Date().toISOString().split('T')[0]
                      });
                      setIsOfferingModalOpen(true);
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl text-sm font-bold hover:bg-emerald-500/20 transition-all"
                  >
                    <Plus size={16} />
                    采购录入
                  </button>
                  <button onClick={() => setViewingOfferings(null)} className="p-2 hover:bg-slate-800 rounded-full transition-colors">
                    <X size={20} className="text-slate-500" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {isOfferingsLoading ? (
                  <div className="py-20 flex justify-center">
                    <div className="w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                  </div>
                ) : offerings.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {offerings.map((off) => (
                      <div key={off.id} className="bg-slate-950/50 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-all group">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h4 className="text-lg font-bold text-slate-100">{off.product_name}</h4>
                            <p className="text-[10px] text-slate-500 font-mono">{off.purchase_date || '未记录日期'}</p>
                          </div>
                          <button 
                            onClick={() => off.id && handleDeleteOffering(off.id)}
                            className="p-2 text-slate-600 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-y-3 gap-x-6 text-sm mb-4">
                          <div className="space-y-1">
                            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">采购单价</p>
                            <p className="text-indigo-400 font-mono text-base font-bold">¥{off.unit_price || '0.00'}</p>
                          </div>
                          <div className="space-y-1 text-right">
                            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">采购数量</p>
                            <p className="text-emerald-400 font-mono text-base font-bold">{off.purchase_quantity || 0} <span className="text-[10px]">包</span></p>
                          </div>
                          
                          <div className="space-y-1">
                            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">规格</p>
                            <p className="text-slate-300 font-medium">{off.specification || '-'}</p>
                          </div>

                          {viewingOfferings.category === 'feed' && (
                            <div className="space-y-1 text-right">
                              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">蛋白含量 / 粒径</p>
                              <p className="text-slate-300 font-medium">
                                {off.protein_content ? `${off.protein_content}%` : '-'} / {off.particle_size || '-'}mm
                              </p>
                            </div>
                          )}

                          <div className="col-span-2 mt-2 pt-2 border-t border-slate-800/50">
                            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">优惠政策</p>
                            <p className="text-xs text-slate-400 italic">
                              {off.discount_policy || '暂无相关政策说明'}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-20 text-center text-slate-600 border border-dashed border-slate-800 rounded-3xl">
                    <Package size={48} className="mx-auto mb-4 opacity-20" />
                    <p className="text-sm font-medium">尚未录入供应物资信息</p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Offering Modal */}
      <AnimatePresence>
        {isOfferingModalOpen && viewingOfferings && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOfferingModalOpen(false)}
              className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              className="relative w-full max-w-lg bg-slate-900 border border-emerald-500/30 rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 bg-emerald-500/10 border-b border-emerald-500/20 flex items-center justify-between">
                <h3 className="text-lg font-bold text-emerald-400">采购录入 - {viewingOfferings.name}</h3>
                <button onClick={() => setIsOfferingModalOpen(false)}>
                  <X size={20} className="text-slate-500 hover:text-white" />
                </button>
              </div>
              <form onSubmit={handleSaveOffering} className="p-6 space-y-4">
                <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-emerald-500/5 rounded-lg border border-emerald-500/10 text-[10px] text-emerald-400 font-bold uppercase tracking-widest">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                  录入后将自动同步至一级仓库(饲料仓)
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5 col-span-2 md:col-span-1">
                    <label className="text-xs font-bold text-slate-400">物资名称 <span className="text-rose-500">*</span></label>
                    <input 
                      required
                      type="text"
                      value={offeringForm.product_name || ''}
                      onChange={(e) => setOfferingForm({...offeringForm, product_name: e.target.value})}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none"
                      placeholder="如：特种水产配合饲料"
                    />
                  </div>
                  <div className="space-y-1.5 col-span-2 md:col-span-1">
                    <label className="text-xs font-bold text-slate-400">购买日期 <span className="text-rose-500">*</span></label>
                    <input 
                      required
                      type="date"
                      value={offeringForm.purchase_date || ''}
                      onChange={(e) => setOfferingForm({...offeringForm, purchase_date: e.target.value})}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-400">单价 (¥/包)</label>
                    <input 
                      type="number"
                      step="0.01"
                      value={offeringForm.unit_price || ''}
                      onChange={(e) => setOfferingForm({...offeringForm, unit_price: parseFloat(e.target.value)})}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-400">购买数量 (包) <span className="text-rose-500">*</span></label>
                    <input 
                      required
                      type="number"
                      value={offeringForm.purchase_quantity || ''}
                      onChange={(e) => setOfferingForm({...offeringForm, purchase_quantity: parseInt(e.target.value)})}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none"
                      placeholder="0"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-400">规格 (斤/包)</label>
                    <input 
                      type="text"
                      value={offeringForm.specification || ''}
                      onChange={(e) => setOfferingForm({...offeringForm, specification: e.target.value})}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none"
                      placeholder="40"
                    />
                  </div>
                  {viewingOfferings.category === 'feed' && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-400">饲料蛋白 (%)</label>
                      <input 
                        type="text"
                        value={offeringForm.protein_content || ''}
                        onChange={(e) => setOfferingForm({...offeringForm, protein_content: e.target.value})}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none"
                        placeholder="如：32"
                      />
                    </div>
                  )}
                </div>

                {viewingOfferings.category === 'feed' && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-400">饲料粒径 (mm)</label>
                    <input 
                      type="text"
                      value={offeringForm.particle_size || ''}
                      onChange={(e) => setOfferingForm({...offeringForm, particle_size: e.target.value})}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none"
                      placeholder="1.5mm - 2.0mm"
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400">优惠政策 / 备注说明</label>
                  <textarea 
                    rows={3}
                    value={offeringForm.discount_policy || ''}
                    onChange={(e) => setOfferingForm({...offeringForm, discount_policy: e.target.value})}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none"
                    placeholder="如：现金结算立减2元/包；购满10吨免运费"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    type="button" 
                    onClick={() => setIsOfferingModalOpen(false)}
                    className="flex-1 py-3 bg-slate-800 text-slate-400 rounded-xl font-bold"
                  >
                    取消
                  </button>
                  <button 
                    type="submit" 
                    className="flex-1 py-3 bg-emerald-500 text-white rounded-xl font-bold shadow-lg shadow-emerald-500/20"
                  >
                    确认录入
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {confirmDelete && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmDelete(null)}
              className="absolute inset-0 bg-slate-950/90 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-slate-900 border border-rose-500/30 rounded-3xl p-8 text-center shadow-2xl"
            >
              <div className="mx-auto w-20 h-20 bg-rose-500/20 rounded-full flex items-center justify-center mb-6 border border-rose-500/30">
                <AlertTriangle className="text-rose-500" size={40} />
              </div>
              <h2 className="text-2xl font-bold mb-2 text-white">确认删除供应商?</h2>
              <p className="text-slate-400 text-sm mb-8">
                您确定要移除 <span className="text-rose-400 font-bold">"{confirmDelete.name}"</span> 的所有档案信息吗？<br/>
                此操作具有不可逆性，可能影响历史入库单的关联查询。
              </p>
              <div className="flex gap-4 px-4">
                <button 
                  onClick={() => setConfirmDelete(null)}
                  className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-2xl font-bold transition-all text-sm uppercase tracking-wider"
                >
                  取消
                </button>
                <button 
                  onClick={handleDelete}
                  className="flex-1 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl font-bold shadow-lg shadow-rose-500/20 transition-all text-sm uppercase tracking-wider"
                >
                  彻底删除
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 backdrop-blur-md border ${
              toast.type === 'success' 
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
            }`}
          >
            <div className={`w-2 h-2 rounded-full ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            <span className="text-sm font-bold tracking-wide">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

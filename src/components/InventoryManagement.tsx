import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { createPortal } from 'react-dom';
import { ArrowDownToLine, ArrowUpFromLine, Search, AlertCircle, X, Loader2, ClipboardList, History, Filter, Truck } from 'lucide-react';
import SupplierManagement from './SupplierManagement';

interface InventoryProps {
  onBack: () => void;
}

interface WarehouseItem {
  id: string;
  category: 'feed' | 'med' | 'fry' | 'prod';
  name: string;
  spec: string;
  stock: number;
  unit: string;
  minStock: number;
  location?: string;
  unit_price?: number;
}

export default function InventoryManagement({ onBack }: InventoryProps) {
  const [activeTab, setActiveTab] = useState<'transaction' | 'history' | 'supplier'>('transaction');
  const [warehouseData, setWarehouseData] = useState<WarehouseItem[]>([]);
  const [historyRecords, setHistoryRecords] = useState<any[]>([]);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [newDateValue, setNewDateValue] = useState('');
  const [isUpdatingRecord, setIsUpdatingRecord] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeModal, setActiveModal] = useState<'inbound' | 'outbound' | 'transfer' | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  // Form states
  const [selectedItemId, setSelectedItemId] = useState('');
  const [targetLocation, setTargetLocation] = useState('A区生产仓');
  const [newCategory, setNewCategory] = useState<'feed' | 'med' | 'fry' | 'prod'>('feed');
  const [itemName, setItemName] = useState('');
  const [itemSpec, setItemSpec] = useState('');
  const [itemUnit, setItemUnit] = useState('');
  const [transactionAmount, setTransactionAmount] = useState<number | ''>('');
  const [transactionDate, setTransactionDate] = useState(new Date().toISOString().split('T')[0]);
  const [transactionPrice, setTransactionPrice] = useState<number | ''>('');
  const [transactionRemarks, setTransactionRemarks] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');

  useEffect(() => {
    setIsMounted(true);
    fetchWarehouse();
    fetchSuppliers();
  }, []);

  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory();
    }
  }, [activeTab]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const fetchWarehouse = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/warehouse');
      if (res.ok) {
        const data = await res.json();
        setWarehouseData(data);
      }
    } catch (err) {
      console.error('Failed to fetch warehouse:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSuppliers = async () => {
    try {
      const res = await fetch('/api/suppliers');
      if (res.ok) {
        const data = await res.json();
        setSuppliers(data);
      }
    } catch (err) {
      console.error('Failed to fetch suppliers:', err);
    }
  };

  const fetchHistory = async () => {
    try {
      setIsLoadingHistory(true);
      const res = await fetch('/api/records');
      if (res.ok) {
        const data = await res.json();
        // Filter records of type 'warehouse' or relevant 'inout' records
        const relevant = data.filter((r: any) => r.type === 'warehouse' || r.type === 'inout')
          .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setHistoryRecords(relevant);
      }
    } catch (err) {
      console.error('Failed to fetch history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleUpdateRecordDate = async () => {
    if (!editingRecord || !newDateValue) return;
    try {
      setIsUpdatingRecord(true);
      let data: any = {};
      try {
        data = typeof editingRecord.data === 'string' ? JSON.parse(editingRecord.data) : (editingRecord.data || {});
      } catch (e) {
        console.error('Failed to parse editing record data:', e);
        data = {};
      }
      
      const res = await fetch(`/api/records/${editingRecord.type}/${editingRecord.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          date: newDateValue,
          tankId: editingRecord.tankId
        })
      });
      if (res.ok) {
        showToast('记录更新成功');
        setEditingRecord(null);
        fetchHistory();
      } else {
        showToast('更新失败');
      }
    } catch (err) {
      console.error('Update record failed:', err);
      showToast('网络错误');
    } finally {
      setIsUpdatingRecord(false);
    }
  };

  const resetForm = () => {
    setSelectedItemId('');
    setSelectedSupplierId('');
    setNewCategory('feed');
    setItemName('');
    setItemSpec('');
    setItemUnit('');
    setTransactionAmount('');
    setTransactionPrice('');
    setTransactionRemarks('');
    setTransactionDate(new Date().toISOString().split('T')[0]);
  };

  const executeTransfer = async () => {
    if (isSubmitting || !selectedItemId || !transactionAmount || !targetLocation) {
        showToast('请完整填写调拨信息');
        return;
    }

    try {
      setIsSubmitting(true);
      const res = await fetch('/api/warehouse/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceId: selectedItemId,
          targetLocation,
          amount: Number(transactionAmount),
          date: transactionDate,
          remarks: transactionRemarks
        })
      });

      if (res.ok) {
          await fetchWarehouse();
          setActiveModal(null);
          resetForm();
          showToast('库间调拨成功');
          if (activeTab === 'history') fetchHistory();
      } else {
          const err = await res.json();
          showToast(`调拨失败: ${err.error}`);
      }
    } catch (err) {
      console.error('Transfer error:', err);
      showToast('调拨失败，请检查网络');
    } finally {
      setIsSubmitting(false);
    }
  };

  const executeTransaction = async () => {
    if (isSubmitting) return;

    // Validation
    if (activeModal === 'inbound') {
      if (!itemName || !transactionAmount) {
        showToast('请填写名称和数量');
        return;
      }
    } else {
      if (!selectedItemId || !transactionAmount) {
        showToast('请选择物资并填写数量');
        return;
      }
    }

    try {
      setIsSubmitting(true);
      let finalItemId = selectedItemId;
      let currentStock = 0;
      let finalItemName = itemName;
      let finalSpec = itemSpec;
      let finalUnit = itemUnit;

      if (activeModal === 'inbound') {
        // Re-fetch warehouse data right before check to minimize race conditions
        const latestRes = await fetch('/api/warehouse');
        let latestData: WarehouseItem[] = warehouseData;
        if (latestRes.ok) {
          latestData = await latestRes.json();
          setWarehouseData(latestData);
        }

        // Find if item exists by name and category
        const existing = latestData.find(i => i.name === itemName && i.category === newCategory);
        if (existing) {
          finalItemId = existing.id;
          currentStock = existing.stock;
          finalItemName = existing.name;
        } else {
          // Auto create new item category
          const newId = `ITEM-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          const createRes = await fetch('/api/warehouse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: newId,
              name: itemName,
              category: newCategory,
              spec: itemSpec || '默认',
              unit: itemUnit || '个',
              location: '一级主仓',
              stock: 0,
              minStock: 10,
              unit_price: Number(transactionPrice) || 0
            })
          });
          if (!createRes.ok) throw new Error('创建新物资失败');
          finalItemId = newId;
          currentStock = 0;
        }
      } else {
        const item = warehouseData.find(i => i.id === selectedItemId);
        if (!item) {
          setIsSubmitting(false);
          return;
        }
        finalItemId = item.id;
        currentStock = item.stock;
        finalItemName = item.name;
      }

      const amountNum = Number(transactionAmount);
      let newStock = currentStock;
      if (activeModal === 'inbound') {
        newStock += amountNum;
      } else if (activeModal === 'outbound') {
        newStock -= amountNum;
        if (newStock < 0) {
          showToast('库存不足，无法出库！');
          setIsSubmitting(false);
          return;
        }
      }

      const res = await fetch(`/api/warehouse/${finalItemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          stock: newStock,
          transaction: {
            itemId: finalItemId,
            itemName: finalItemName,
            type: activeModal,
            amount: amountNum,
            date: transactionDate,
            price: transactionPrice || 0,
            remarks: transactionRemarks,
            supplierId: activeModal === 'inbound' ? selectedSupplierId : undefined,
            supplierName: activeModal === 'inbound' ? suppliers.find(s => s.id === selectedSupplierId)?.name : undefined
          }
        })
      });

      if (res.ok) {
        await fetchWarehouse(); // Refresh full data to include potential new items
        setActiveModal(null);
        resetForm();
        showToast(`${activeModal === 'inbound' ? '入库' : '出库'}成功`);
        if (activeTab === 'history') fetchHistory();
      } else {
        showToast('操作失败');
      }
    } catch (err) {
      console.error('Transaction error:', err);
      showToast('操作失败，请检查网络');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] md:h-[calc(100vh-6rem)] bg-slate-950/20 rounded-3xl overflow-hidden border border-slate-800 relative">
      {/* Header Tabs */}
      <div className="bg-slate-900/40 border-b border-slate-800 p-6 backdrop-blur-md pb-0 shrink-0">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center text-blue-400">
            <ClipboardList size={18} />
          </div>
          <div className="flex flex-col">
            <h2 className="text-xl font-bold text-slate-100 tracking-wider">进销存管理</h2>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">
              记录物资流通的全生命周期
            </div>
          </div>
        </div>
        
        <div className="flex gap-2">
          <button
            id="inventory-tab-transaction"
            onClick={() => setActiveTab('transaction')}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-bold transition-all rounded-t-lg whitespace-nowrap ${
              activeTab === 'transaction'
                ? 'bg-slate-800 text-white border-b-2 border-blue-400'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <ArrowDownToLine size={16} />
            出入库操作
          </button>
          <button
            id="inventory-tab-history"
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-bold transition-all rounded-t-lg whitespace-nowrap ${
              activeTab === 'history'
                ? 'bg-slate-800 text-white border-b-2 border-blue-400'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <History size={16} />
            流通历史记录
          </button>
          <button
            id="inventory-tab-supplier"
            onClick={() => setActiveTab('supplier')}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-bold transition-all rounded-t-lg whitespace-nowrap ${
              activeTab === 'supplier'
                ? 'bg-slate-800 text-white border-b-2 border-blue-400'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Truck size={16} />
            供应商档案
          </button>
        </div>
      </div>

      <div className="flex-1 p-4 md:p-6 overflow-y-auto bg-slate-900/10 custom-scrollbar">
        {activeTab === 'supplier' ? (
          <SupplierManagement onBack={() => setActiveTab('transaction')} />
        ) : activeTab === 'transaction' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Inbound Card */}
            <motion.div 
              whileHover={{ scale: 1.01 }}
              className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl flex flex-col gap-4"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center text-emerald-400">
                  <ArrowDownToLine size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-100">物资入库</h3>
                  <p className="text-xs text-slate-500">采购入库、移库转入或库存初始化</p>
                </div>
              </div>
              <button 
                id="btn-inventory-inbound"
                onClick={() => { resetForm(); setActiveModal('inbound'); }}
                className="w-full py-3 bg-emerald-500/20 text-emerald-400 rounded-xl font-bold border border-emerald-500/30 hover:bg-emerald-500/30 transition-all uppercase tracking-wider text-sm"
              >
                立即办理入库
              </button>
            </motion.div>

            {/* Outbound Card */}
            <motion.div 
              whileHover={{ scale: 1.01 }}
              className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl flex flex-col gap-4"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 bg-orange-500/20 rounded-xl flex items-center justify-center text-orange-400">
                  <ArrowUpFromLine size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-100">物资出库</h3>
                  <p className="text-xs text-slate-500">生产领用、损耗报废或销售出库</p>
                </div>
              </div>
              <button 
                id="btn-inventory-outbound"
                onClick={() => { resetForm(); setActiveModal('outbound'); }}
                className="w-full py-3 bg-orange-500/20 text-orange-400 rounded-xl font-bold border border-orange-500/30 hover:bg-orange-500/30 transition-all uppercase tracking-wider text-sm"
              >
                立即办理出库
              </button>
            </motion.div>

            {/* Transfer Card */}
            <motion.div 
              whileHover={{ scale: 1.01 }}
              className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl flex flex-col gap-4 md:col-span-2"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 bg-indigo-500/20 rounded-xl flex items-center justify-center text-indigo-400">
                  <ClipboardList size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-100">库间调拨</h3>
                  <p className="text-xs text-slate-500">从一类中心仓库调拨物资至各区域二级生产仓</p>
                </div>
              </div>
              <button 
                id="btn-inventory-transfer"
                onClick={() => { resetForm(); setActiveModal('transfer'); }}
                className="w-full py-3 bg-indigo-500/20 text-indigo-400 rounded-xl font-bold border border-indigo-500/30 hover:bg-indigo-500/30 transition-all uppercase tracking-wider text-sm"
              >
                启动库间调拨
              </button>
            </motion.div>

            {/* Quick Stats Placeholder */}
            <div className="md:col-span-2 bg-slate-900/30 border border-slate-800/50 rounded-2xl p-6">
              <h4 className="text-sm font-bold text-slate-400 mb-4 flex items-center gap-2">
                <Filter size={16} /> 近期变动提示
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800">
                  <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">今日入库</div>
                  <div className="text-xl font-mono font-bold text-emerald-400">0</div>
                </div>
                <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800">
                  <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">今日领用</div>
                  <div className="text-xl font-mono font-bold text-orange-400">0</div>
                </div>
                <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800">
                  <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">待盘点异常</div>
                  <div className="text-xl font-mono font-bold text-red-500">0</div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden flex flex-col shadow-xl">
            <div className="p-4 border-b border-slate-800 bg-slate-800/30 flex justify-between items-center">
              <span className="font-bold text-slate-300">物资流转历史</span>
            </div>
            <div className="overflow-x-auto">
              {isLoadingHistory ? (
                <div className="py-20 flex flex-col items-center gap-3 text-blue-400">
                  <Loader2 size={32} className="animate-spin" />
                  <span className="text-sm font-bold">加载历史记录...</span>
                </div>
              ) : historyRecords.length === 0 ? (
                <div className="py-10 text-center text-slate-500 italic">暂无历史流转记录</div>
              ) : (
                <table className="w-full text-left text-sm border-collapse min-w-max">
                  <thead>
                    <tr className="bg-slate-900 text-slate-400 border-b border-slate-800">
                      <th className="py-3 px-4">日期</th>
                      <th className="py-3 px-4">类型</th>
                      <th className="py-3 px-4">物资名称</th>
                      <th className="py-3 px-4">供应商</th>
                      <th className="py-3 px-4">数量</th>
                      <th className="py-3 px-4">单价</th>
                      <th className="py-3 px-4">备注</th>
                      <th className="py-3 px-4 text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyRecords.map((r, idx) => {
                      let data: any = {};
                      try {
                        data = typeof r.data === 'string' ? JSON.parse(r.data) : (r.data || {});
                      } catch (e) {
                        console.error('Failed to parse history data:', e);
                        data = {};
                      }
                      
                      const isWarehouse = r.type === 'warehouse';
                      const isOut = isWarehouse ? data.type === 'outbound' : data.type === 'salesOut' || data.type === 'transferOut';
                      const dateDisplay = r.date || data.date || '-';
                      const itemNameDisplay = data.itemName || data.species || r.tankId || '-';
                      
                      return (
                        <tr key={r.id || idx} className="border-b border-slate-800/50 hover:bg-slate-800/40 transition-colors">
                          <td className="py-3 px-4 font-mono text-slate-500">{dateDisplay}</td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isOut ? 'bg-orange-500/10 text-orange-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                              {isWarehouse ? (data.type === 'inbound' ? '入库' : data.type === 'transfer' ? '调拨' : '出库') : (data.type?.includes('In') ? '入账' : '报损/售出')}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-200">{itemNameDisplay}</td>
                          <td className="py-3 px-4 text-xs text-slate-400 font-medium">{data.supplierName || '-'}</td>
                          <td className="py-3 px-4">
                            <span className={isOut ? 'text-orange-400' : 'text-emerald-400'}>
                              {isOut ? '-' : '+'}{data.amount || 0}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-400">¥{(data.price || 0).toFixed(2)}</td>
                          <td className="py-3 px-4 text-xs text-slate-500 max-w-xs truncate">{data.remarks || '-'}</td>
                          <td className="py-3 px-4 text-center">
                            <button 
                              onClick={() => {
                                setEditingRecord(r);
                                setNewDateValue(r.date || data.date || new Date().toISOString().split('T')[0]);
                              }}
                              className="text-blue-400 hover:text-blue-300 text-[10px] font-bold px-2 py-1 bg-blue-500/10 rounded border border-blue-500/20"
                            >
                              修改日期
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>

      {isMounted && document.body && createPortal(
        <AnimatePresence>
          {activeModal && (
            <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
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
                className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
              >
                <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-800/30">
                  <h3 className="font-bold text-slate-100 flex items-center gap-2">
                    {activeModal === 'inbound' ? <ArrowDownToLine size={20} className="text-emerald-400" /> : activeModal === 'outbound' ? <ArrowUpFromLine size={20} className="text-orange-400" /> : <ClipboardList size={20} className="text-indigo-400" />}
                    {activeModal === 'inbound' ? '补货入库单' : activeModal === 'outbound' ? '生产出库单' : '库间调拨申请'}
                  </h3>
                  <button id="modal-close-btn" onClick={() => setActiveModal(null)} className="text-slate-400 hover:text-white"><X size={20} /></button>
                </div>

                <div className="p-6 space-y-4">
                  {activeModal === 'inbound' ? (
                    <>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-400">入库分类 <span className="text-red-400">*</span></label>
                        <select 
                            value={newCategory}
                            onChange={(e) => setNewCategory(e.target.value as any)}
                            className="w-full bg-slate-950/50 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
                        >
                            <option value="feed">🐟 饲料仓库</option>
                            <option value="med">💊 动保仓库</option>
                            <option value="fry">📦 苗种及采购品</option>
                            <option value="prod">🛠️ 生产物资</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-400">供应商名称</label>
                        <select
                          value={selectedSupplierId}
                          onChange={(e) => setSelectedSupplierId(e.target.value)}
                          className="w-full bg-slate-950/50 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
                        >
                          <option value="">-- 请选择供应商 (可选) --</option>
                          {suppliers.filter(s => {
                            if (newCategory === 'feed') return s.category === 'feed';
                            if (newCategory === 'med') return s.category === 'med';
                            if (newCategory === 'fry') return s.category === 'fry';
                            if (newCategory === 'prod') return s.category === 'material' || s.category === 'equipment';
                            return true;
                          }).map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-400">物资名称 <span className="text-red-400">*</span></label>
                        <input 
                          type="text" 
                          value={itemName}
                          onChange={(e) => setItemName(e.target.value)}
                          className="w-full bg-slate-950/50 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
                          placeholder="输入具体物资名称"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-400">包装规格</label>
                          <input 
                            type="text" 
                            value={itemSpec}
                            onChange={(e) => setItemSpec(e.target.value)}
                            className="w-full bg-slate-950/50 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
                            placeholder="如: 25kg/包"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-400">计量单位</label>
                          <input 
                            type="text" 
                            value={itemUnit}
                            onChange={(e) => setItemUnit(e.target.value)}
                            className="w-full bg-slate-950/50 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
                            placeholder="如: 包"
                          />
                        </div>
                      </div>
                    </>
                  ) : activeModal === 'outbound' ? (
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-400">选择领用物资 <span className="text-red-400">*</span></label>
                        <select 
                            id="inventory-item-select"
                            value={selectedItemId}
                            onChange={(e) => {
                              const id = e.target.value;
                              setSelectedItemId(id);
                              const item = warehouseData.find(i => i.id === id);
                              if (item && item.unit_price !== undefined) {
                                setTransactionPrice(item.unit_price);
                              }
                            }}
                            className="w-full bg-slate-950/50 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
                        >
                            <option value="">-- 请选择物资 --</option>
                            {[
                              { id: 'feed', label: '🐟 饲料仓库' },
                              { id: 'med', label: '💊 动保仓库' },
                              { id: 'fry', label: '📦 苗种及采购品' },
                              { id: 'prod', label: '🛠️ 生产物资' }
                            ].map(cat => (
                              <optgroup key={cat.id} label={cat.label}>
                                {warehouseData
                                  .filter(item => item.category === cat.id)
                                  .map(item => (
                                    <option key={item.id} value={item.id}>
                                      {item.name} ({item.spec}) - {item.location} - 当前: {item.stock}{item.unit}
                                    </option>
                                  ))}
                              </optgroup>
                            ))}
                        </select>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-400">选择主仓调拨物资 <span className="text-red-400">*</span></label>
                          <select 
                              id="transfer-item-select"
                              value={selectedItemId}
                              onChange={(e) => {
                                const id = e.target.value;
                                setSelectedItemId(id);
                                const item = warehouseData.find(i => i.id === id);
                                if (item && item.unit_price !== undefined) {
                                  setTransactionPrice(item.unit_price);
                                }
                              }}
                              className="w-full bg-slate-950/50 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
                          >
                              <option value="">-- 从一级主仓选择 --</option>
                              {warehouseData
                                .filter(item => (item.location as any) === '一级主仓' || !item.location)
                                .map(item => (
                                  <option key={item.id} value={item.id}>
                                    [{item.category}] {item.name} ({item.spec}) - 库存: {item.stock}{item.unit}
                                  </option>
                                ))}
                          </select>
                      </div>
                      <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-400">目的二级仓库 <span className="text-red-400">*</span></label>
                          <select 
                              value={targetLocation}
                              onChange={(e) => setTargetLocation(e.target.value)}
                              className="w-full bg-slate-950/50 border border-slate-700 rounded-lg p-2.5 text-sm text-indigo-400 font-bold focus:border-indigo-500 focus:outline-none"
                          >
                              <option value="A区生产仓">A区生产仓</option>
                              <option value="B区生产仓">B区生产仓</option>
                              <option value="C区生产仓">C区生产仓</option>
                              <option value="车间生产仓">车间生产仓</option>
                          </select>
                      </div>
                    </>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-400">数量 <span className="text-red-400">*</span></label>
                          <input 
                              id="inventory-amount-input"
                              type="number"
                              value={transactionAmount}
                              onChange={(e) => setTransactionAmount(e.target.value ? Number(e.target.value) : '')}
                              className="w-full bg-slate-950/50 border border-slate-700 rounded-lg p-2.5 text-sm text-white font-mono focus:border-blue-500 focus:outline-none"
                              placeholder="0"
                          />
                      </div>
                      <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-400">日期 <span className="text-red-400">*</span></label>
                          <input 
                              id="inventory-date-input"
                              type="date"
                              value={transactionDate}
                              onChange={(e) => setTransactionDate(e.target.value)}
                              className="w-full bg-slate-950/50 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                          />
                      </div>
                  </div>

                  <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-400">{activeModal === 'transfer' ? '调拨单价 (锁定入库价)' : '单价 (¥/单位)'}</label>
                      <input 
                          id="inventory-price-input"
                          type="number"
                          value={transactionPrice}
                          readOnly={activeModal === 'transfer'}
                          onChange={(e) => setTransactionPrice(e.target.value ? Number(e.target.value) : '')}
                          className={`w-full bg-slate-950/50 border border-slate-700 rounded-lg p-2.5 text-sm text-white font-mono focus:border-blue-500 focus:outline-none ${activeModal === 'transfer' ? 'opacity-70 cursor-not-allowed' : ''}`}
                          placeholder="0.00"
                      />
                  </div>

                  <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-400">备注</label>
                      <textarea 
                          id="inventory-remarks-input"
                          value={transactionRemarks}
                          onChange={(e) => setTransactionRemarks(e.target.value)}
                          className="w-full bg-slate-950/50 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:border-blue-500 focus:outline-none min-h-[80px]"
                          placeholder="选填..."
                      />
                  </div>

                  <div className="pt-4 flex gap-3">
                      <button 
                          id="inventory-modal-cancel"
                          onClick={() => setActiveModal(null)}
                          className="flex-1 py-2.5 border border-slate-700 text-slate-400 rounded-lg font-bold hover:bg-slate-800 transition-colors"
                      >
                          取消
                      </button>
                      <button 
                          id="inventory-modal-confirm"
                          onClick={activeModal === 'transfer' ? executeTransfer : executeTransaction}
                          disabled={isSubmitting}
                          className={`flex-1 py-2.5 text-slate-900 rounded-lg font-bold shadow-lg transition-all flex items-center justify-center gap-2 ${isSubmitting ? 'opacity-70 cursor-not-allowed' : ''} ${activeModal === 'inbound' ? 'bg-emerald-500 hover:bg-emerald-400' : activeModal === 'outbound' ? 'bg-orange-500 hover:bg-orange-400' : 'bg-indigo-500 hover:bg-indigo-400'}`}
                      >
                          {isSubmitting && <Loader2 size={16} className="animate-spin" />}
                          {isSubmitting ? '正在处理...' : '确认办理'}
                      </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}


      <AnimatePresence>
        {editingRecord && (
          <div className="fixed inset-0 z-[2100] flex items-center justify-center p-4 text-left font-sans">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setEditingRecord(null)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.9 }} 
              className="relative bg-slate-900 border border-slate-700 p-6 rounded-2xl shadow-xl w-full max-w-xs"
            >
              <h4 className="text-white font-bold mb-4 flex items-center gap-2">
                <History size={18} className="text-blue-400" /> 修改记录日期
              </h4>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">新日期</label>
                  <input 
                    type="date"
                    value={newDateValue}
                    onChange={(e) => setNewDateValue(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setEditingRecord(null)} className="flex-1 py-2 text-slate-400 hover:text-white transition-colors text-sm font-bold">
                    取消
                  </button>
                  <button 
                    onClick={handleUpdateRecordDate}
                    disabled={isUpdatingRecord}
                    className="flex-1 py-2 bg-blue-500 text-white rounded-lg font-bold hover:bg-blue-400 transition-colors text-sm flex items-center justify-center gap-2"
                  >
                    {isUpdatingRecord && <Loader2 size={14} className="animate-spin" />}
                    确认修改
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[2000] bg-slate-900 border border-slate-700 px-6 py-3 rounded-full text-sm font-bold text-white shadow-2xl flex items-center gap-2"
          >
            <AlertCircle size={16} className="text-cyan-400" />
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

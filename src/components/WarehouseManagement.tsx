import { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { createPortal } from 'react-dom';
import { Package, Wheat, Syringe, Plus, Search, AlertCircle, X, Loader2, Trash2, Shield, ArrowRightLeft } from 'lucide-react';

interface WarehouseProps {
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
  location: string;
  tank_id?: string;
  unit_price?: number;
  batch_no?: string;
  expiry_date?: string;
}

export default function WarehouseManagement({ onBack }: WarehouseProps) {
  const [activeTab, setActiveTab] = useState<'feed' | 'med' | 'fry' | 'prod'>('feed');
  const [activeLevel, setActiveLevel] = useState<'level1' | 'level2'>('level1');
  const [activeLocation, setActiveLocation] = useState<string>('一级主仓');
  const [activeTank, setActiveTank] = useState<string>(''); // For level 2 specific tank view
  const tableRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeModal, setActiveModal] = useState<'new' | null>(null);
  const [warehouseData, setWarehouseData] = useState<WarehouseItem[]>([]);
  const [tanks, setTanks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  
  const level1Locations = ['一级主仓'];
  const level2Locations = ['A区生产仓', 'B区生产仓', 'C区生产仓', '车间生产仓'];
  const locations = [...level1Locations, ...level2Locations];
  
  // Update location when level changes
  useEffect(() => {
    if (activeLevel === 'level1') {
      setActiveLocation('一级主仓');
      setActiveTank('');
    } else {
      setActiveLocation('A区生产仓');
      setActiveTank(''); // Default to area-wide view
    }
  }, [activeLevel]);

  useEffect(() => {
    setIsMounted(true);
    fetchTanks();
  }, []);
  
  const fetchTanks = async () => {
    try {
      const res = await fetch('/api/tanks');
      if (res.ok) {
        const data = await res.json();
        setTanks(data);
      }
    } catch (err) {
      console.error('Failed to fetch tanks:', err);
    }
  };
  
  // Form states
  const [newItem, setNewItem] = useState<Partial<WarehouseItem>>({ category: 'feed', stock: 0, unit_price: 0 });
  const [editingItem, setEditingItem] = useState<WarehouseItem | null>(null);
  
  const [toast, setToast] = useState<string | null>(null);
  const [confirmDeleteObj, setConfirmDeleteObj] = useState<{id: string, name: string} | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
 
  // Transfer states
  const [transferItem, setTransferItem] = useState<WarehouseItem | null>(null);
  const [transferAmount, setTransferAmount] = useState<number>(0);
  const [transferTarget, setTransferTarget] = useState<string>('A区生产仓');
  const [transferTankId, setTransferTankId] = useState<string>('');
  const [transferDate, setTransferDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [isTransferring, setIsTransferring] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyRecords, setHistoryRecords] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Reset transfer tank when target changes
  useEffect(() => {
    const area = transferTarget?.includes('A区') ? 'A' : transferTarget?.includes('B区') ? 'B' : transferTarget?.includes('C区') ? 'C' : 'W';
    const firstTank = tanks.find(t => t.id.startsWith(area))?.id || '';
    setTransferTankId(firstTank);
  }, [transferTarget, tanks]);

  const resetForm = () => {
    setEditingItem(null);
    setNewItem({ category: activeTab, stock: 0, unit_price: 0 });
  };

  const openNew = () => {
    resetForm();
    setActiveModal('new');
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    fetchWarehouse();
  }, []);

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

  const fetchHistory = async () => {
    try {
      setIsLoadingHistory(true);
      const res = await fetch('/api/records');
      if (res.ok) {
        const data = await res.json();
        const relevant = data.filter((r: any) => r.type === 'warehouse')
          .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setHistoryRecords(relevant);
      }
    } catch (err) {
      console.error('Failed to fetch history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [newDateValue, setNewDateValue] = useState('');
  const [isUpdatingRecord, setIsUpdatingRecord] = useState(false);

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
          tankId: editingRecord.tankId,
          date_orig: newDateValue // Also update the top-level date if needed
        })
      });
      if (res.ok) {
        showToast('修改成功');
        setEditingRecord(null);
        fetchHistory();
      } else {
        showToast('修改失败');
      }
    } catch (err) {
      console.error('Update record failed:', err);
      showToast('网络错误');
    } finally {
      setIsUpdatingRecord(false);
    }
  };

  const handleCreateCategory = async () => {
    if (!newItem.id || !newItem.name || !newItem.category) return;

    try {
      const res = await fetch('/api/warehouse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newItem)
      });

      if (res.ok) {
        setWarehouseData(prev => [...prev, newItem as WarehouseItem]);
        setActiveModal(null);
        resetForm();
      } else {
        showToast('新建失败');
      }
    } catch (err) {
      console.error('Create category failed:', err);
      showToast('新建失败，请检查网络');
    }
  };

  const handleUpdateItem = async () => {
    if (!editingItem) return;

    try {
      const res = await fetch(`/api/warehouse/${editingItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingItem)
      });

      if (res.ok) {
        setWarehouseData(prev => prev.map(i => i.id === editingItem.id ? editingItem : i));
        setActiveModal(null);
        resetForm();
      } else {
        showToast('修改失败');
      }
    } catch (err) {
      console.error('Update item failed:', err);
      showToast('修改失败，请检查网络');
    }
  };

  const requestDelete = (id: string, name: string) => {
    setConfirmDeleteObj({ id, name });
  };

  const getExpiryStatus = (expiryDate?: string) => {
    if (!expiryDate) return null;
    const now = new Date();
    const expiry = new Date(expiryDate);
    const diffTime = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 0) return 'expired';
    if (diffDays <= 30) return 'near';
    return 'safe';
  };

  const executeDelete = async () => {
    if (!confirmDeleteObj || isDeleting) return;
    const { id } = confirmDeleteObj;

    try {
      setIsDeleting(true);
      const res = await fetch(`/api/warehouse/${id}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        setWarehouseData(prev => prev.filter(i => i.id !== id));
        showToast('删除成功');
        setConfirmDeleteObj(null);
      } else {
        const errData = await res.json();
        showToast(`删除失败: ${errData.error || '服务器错误'}`);
      }
    } catch (err) {
      console.error('Delete item failed:', err);
      showToast('删除失败，请检查网络');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleTransfer = async () => {
    if (!transferItem || transferAmount <= 0) return;
    if (transferAmount > transferItem.stock) {
      showToast('调拨数量超过现有库存');
      return;
    }

    try {
      setIsTransferring(true);
      const res = await fetch('/api/warehouse/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceId: transferItem.id,
          amount: transferAmount,
          targetLocation: transferTarget,
          targetTankId: transferTankId || null,
          date: transferDate,
          remarks: `调拨至 ${transferTarget}${transferTankId ? ` (${transferTankId})` : ''}`
        })
      });

      if (res.ok) {
        showToast('调拨成功');
        setTransferItem(null);
        fetchWarehouse(); // Refresh lists
      } else {
        const err = await res.json();
        showToast(`调拨失败: ${err.error || '未知错误'}`);
      }
    } catch (err) {
      console.error('Transfer failed:', err);
      showToast('调拨失败，请检查网络');
    } finally {
      setIsTransferring(false);
    }
  };

  const filteredData = useMemo(() => {
    return warehouseData
      .filter(item => item.category === activeTab && item.location === activeLocation)
      .filter(item => {
        if (!activeTank) return true; // Show all in this area if no tank selected
        return item.tank_id === activeTank;
      })
      .filter(item => 
        (item.name || '').toLowerCase().includes((searchQuery || '').toLowerCase()) || 
        (item.id || '').toLowerCase().includes((searchQuery || '').toLowerCase())
      );
  }, [warehouseData, activeTab, activeLocation, activeTank, searchQuery]);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] md:h-[calc(100vh-6rem)] bg-slate-950/20 rounded-3xl overflow-hidden border border-slate-800 relative">
      {/* Header Tabs */}
      <div className="bg-slate-900/40 border-b border-slate-800 p-6 backdrop-blur-md pb-0 shrink-0">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 bg-amber-500/20 rounded-lg flex items-center justify-center text-amber-400">
            <Package size={18} />
          </div>
          <div className="flex flex-col">
            <h2 className="text-xl font-bold text-slate-100 tracking-wider">仓储资产管理</h2>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">
              <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
              物资品类与实时库存监控
            </div>
          </div>
        </div>
        
        <div className="flex overflow-x-auto scrollbar-hide gap-2">
          {['level1', 'level2'].map(level => (
            <button
              key={level}
              onClick={() => setActiveLevel(level as 'level1' | 'level2')}
              className={`flex items-center gap-2 px-6 py-3 text-sm font-bold transition-all rounded-t-lg whitespace-nowrap ${
                activeLevel === level
                  ? 'bg-slate-800 text-white border-b-2 border-cyan-400 shadow-[0_-4px_10px_rgba(0,0,0,0.2)]'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 border-b-2 border-transparent'
              }`}
            >
              <Package size={16} />
              {level === 'level1' ? '一级主仓' : '二级主仓'}
            </button>
          ))}
        </div>
      </div>

      {activeLevel === 'level2' && (
        <div className="bg-slate-900 border-b border-slate-800 px-6 py-2 flex items-center gap-2 overflow-x-auto scrollbar-hide">
          {level2Locations.map(loc => (
            <button
              key={loc}
              onClick={() => setActiveLocation(loc)}
              className={`px-4 py-2 text-xs font-bold transition-all rounded-lg whitespace-nowrap ${
                activeLocation === loc
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {loc}
            </button>
          ))}
        </div>
      )}

      <div className="bg-slate-900 border-b border-slate-800 px-6 py-2 flex items-center gap-2 overflow-x-auto scrollbar-hide">
          <button
            onClick={() => setActiveTab('feed')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-black transition-all rounded-lg whitespace-nowrap uppercase tracking-tighter ${
              activeTab === 'feed'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Wheat size={14} />
            饲料库存
          </button>
          <button
            onClick={() => setActiveTab('med')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-black transition-all rounded-lg whitespace-nowrap uppercase tracking-tighter ${
              activeTab === 'med'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Syringe size={14} />
            动保物资
          </button>
          <button
            onClick={() => setActiveTab('fry')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-black transition-all rounded-lg whitespace-nowrap uppercase tracking-tighter ${
              activeTab === 'fry'
                ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Package size={14} />
            苗种及采购
          </button>
          <button
            onClick={() => setActiveTab('prod')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-black transition-all rounded-lg whitespace-nowrap uppercase tracking-tighter ${
              activeTab === 'prod'
                ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Shield size={14} />
            生产物料
          </button>
      </div>

      <div className="flex-1 p-4 md:p-6 overflow-y-auto bg-slate-900/10 custom-scrollbar flex flex-col gap-4">
        {/* Tanks Associated (only for Level 2) */}
        {activeLocation !== '一级主仓' && (
          <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-black text-cyan-400 uppercase tracking-widest flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                {activeLocation} 所辖养殖单元 (小仓库)
              </h4>
              <button 
                onClick={() => setActiveTank('')}
                className={`text-[10px] font-bold px-3 py-1 rounded transition-colors ${!activeTank ? 'bg-cyan-500 text-slate-900 shadow-[0_0_10px_rgba(34,211,238,0.4)]' : 'text-slate-500 hover:text-cyan-400 border border-slate-800 hover:border-cyan-500/50'}`}
              >
                查看全部
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
              {tanks
                .filter(tank => {
                  const area = activeLocation.includes('A区') ? 'A' : activeLocation.includes('B区') ? 'B' : activeLocation.includes('C区') ? 'C' : '车间';
                  return (area !== '车间' && tank.id.startsWith(area)) || (area === '车间' && tank.id.startsWith('W'));
                })
                .map(tank => (
                  <button 
                    key={tank.id} 
                    onClick={() => {
                      const newTank = activeTank === tank.id ? '' : tank.id;
                      setActiveTank(newTank);
                      setTimeout(() => {
                        if (newTank && tableRef.current) {
                          tableRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                      }, 100);
                    }}
                    className={`relative border rounded-lg p-2 text-center transition-all duration-300 ${activeTank === tank.id ? 'bg-cyan-900/80 border-cyan-400 ring-1 ring-cyan-400/50 shadow-[0_0_15px_rgba(34,211,238,0.3)] scale-[1.02] z-10' : 'bg-slate-900/80 border-slate-800 hover:bg-slate-800/80 hover:border-slate-700'}`}
                  >
                    <div className="text-[10px] font-bold text-slate-500 mb-1">{tank.id}</div>
                    <div className={`text-xs font-black ${tank.status === 'alarm' ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {tank.status === 'normal' ? '管理中' : '预警'}
                    </div>
                  </button>
                ))
              }
              {tanks.filter(tank => {
                  const prefix = activeLocation.charAt(0);
                  if (activeLocation === '车间生产仓') return tank.id.startsWith('W');
                  return tank.id.startsWith(prefix);
                }).length === 0 && (
                <div className="col-span-full py-2 text-center text-xs text-slate-600 italic">
                  该区域暂无登记养殖桶
                </div>
              )}
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900/50 p-4 rounded-xl border border-slate-800">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input
              type="text"
              placeholder="搜索物资名称 / 编号..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950/50 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
             <button 
                onClick={() => {
                  fetchHistory();
                  setShowHistory(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-sm font-bold border border-slate-700 hover:bg-slate-700 transition-colors whitespace-nowrap"
             >
                <Package size={16} />
                调拨历史
             </button>
             <button id="warehouse-new-btn" onClick={openNew} className="flex items-center gap-2 px-4 py-2 bg-indigo-500/20 text-indigo-400 rounded-lg text-sm font-bold border border-indigo-500/30 hover:bg-indigo-500/30 transition-colors whitespace-nowrap">
                <Plus size={16} />
                新增物资
             </button>
          </div>
        </div>

        {/* Table */}
        <div ref={tableRef} className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden flex-1 flex flex-col shadow-xl">
           <div className="p-4 border-b border-slate-800 bg-slate-800/30 font-bold text-slate-300">
             {activeTab === 'feed' ? '饲料库存清单' : activeTab === 'med' ? '动保库存清单' : activeTab === 'fry' ? '苗种及采购品库存' : '生产物资库存清单'}
           </div>
           <div className="overflow-x-auto">
             <table className="w-full text-center border-collapse text-sm min-w-max">
               <thead>
                 <tr className="bg-slate-900 text-slate-400 border-b border-slate-800">
                   <th className="py-3 px-4 font-bold whitespace-nowrap">物资编号</th>
                   <th className="py-3 px-4 font-bold whitespace-nowrap text-left">物资名称 / 批次</th>
                   <th className="py-3 px-4 font-bold whitespace-nowrap">规格</th>
                   <th className="py-3 px-4 font-bold whitespace-nowrap">结余库存</th>
                   <th className="py-3 px-4 font-bold whitespace-nowrap">入库单价</th>
                   <th className="py-3 px-4 font-bold whitespace-nowrap">有效期</th>
                   <th className="py-3 px-4 font-bold whitespace-nowrap">状态</th>
                   <th className="py-3 px-4 font-bold whitespace-nowrap">操作</th>
                 </tr>
               </thead>
               <tbody>
                 {isLoading ? (
                   <tr>
                     <td colSpan={8} className="py-20 text-center">
                       <div className="flex flex-col items-center gap-3 text-cyan-400">
                         <Loader2 size={32} className="animate-spin" />
                         <span className="text-sm font-bold animate-pulse">正在同步云端库存数据...</span>
                       </div>
                     </td>
                   </tr>
                 ) : (() => {
                     if (filteredData.length === 0 && activeLocation === '一级主仓' || (filteredData.length === 0 && !activeTank)) {
                       return (
                         <tr>
                           <td colSpan={8} className="py-10 text-center text-slate-500">
                               未找到相关物资记录
                           </td>
                         </tr>
                       );
                     }
                    const renderRow = (item: WarehouseItem) => {
                       return (
                      <tr key={item.id} className="border-b border-slate-800/50 hover:bg-slate-800/40 transition-colors group">
                        <td className="py-3 px-4 font-mono text-slate-500 group-hover:text-amber-400 transition-colors">
                          {item.id}
                          {item.tank_id && <div className="text-[10px] text-cyan-500/70 font-bold">{item.tank_id} 桶储</div>}
                        </td>
                        <td className="py-3 px-4 text-left">
                          <div className="font-bold text-slate-200">{item.name}</div>
                          {item.batch_no && <div className="text-[10px] text-slate-500 font-mono">批次: {item.batch_no}</div>}
                        </td>
                        <td className="py-3 px-4 text-slate-400">{item.spec}</td>
                        <td className="py-3 px-4">
                          <span className={`font-mono text-lg font-bold ${item.stock <= item.minStock ? 'text-red-400' : 'text-emerald-400'}`}>
                            {item.stock}
                          </span>
                          <span className="text-slate-500 text-xs ml-1">{item.unit}</span>
                        </td>
                        <td className="py-3 px-4 text-emerald-500 font-mono">¥{item.unit_price || 0}</td>
                        <td className="py-3 px-4">
                          {item.expiry_date ? (
                            <div className="flex flex-col items-center">
                              <span className={`font-mono text-xs ${getExpiryStatus(item.expiry_date) === 'expired' ? 'text-red-500 font-black' : getExpiryStatus(item.expiry_date) === 'near' ? 'text-amber-500' : 'text-slate-400'}`}>
                                {item.expiry_date}
                              </span>
                              {getExpiryStatus(item.expiry_date) === 'expired' && <span className="text-[8px] bg-red-500 text-white px-1 rounded leading-tight">已过期</span>}
                              {getExpiryStatus(item.expiry_date) === 'near' && <span className="text-[8px] bg-amber-500 text-slate-900 px-1 rounded leading-tight">即将到期</span>}
                            </div>
                          ) : (
                            <span className="text-slate-600 text-xs">-</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col gap-1 items-center">
                            {item.stock <= item.minStock && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 text-[10px] font-bold border border-red-500/20">
                                低库存
                              </span>
                            )}
                            {getExpiryStatus(item.expiry_date) === 'expired' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 text-[10px] font-bold border border-red-500/20">
                                效期预警
                              </span>
                            )}
                            {item.stock > item.minStock && getExpiryStatus(item.expiry_date) !== 'expired' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-bold border border-emerald-500/20">
                                状态正常
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-center gap-2">
                            {activeLocation === '一级主仓' && (
                              <button 
                                id={`transfer-item-${item.id}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setTransferItem(item);
                                  setTransferAmount(0);
                                  setTransferDate(new Date().toISOString().split('T')[0]);
                                }}
                                className="text-amber-400 hover:text-amber-300 font-bold text-xs px-2 py-1 bg-amber-500/10 rounded-lg whitespace-nowrap transition-colors flex items-center gap-1"
                              >
                                <ArrowRightLeft size={12} />
                                调拨
                              </button>
                            )}
                            <button 
                              id={`edit-item-${item.id}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingItem(item);
                                setActiveModal('new'); // Reuse new modal for editing
                              }}
                              className="text-cyan-400 hover:text-cyan-300 font-bold text-xs px-2 py-1 bg-cyan-500/10 rounded-lg whitespace-nowrap transition-colors"
                            >
                              更改
                            </button>
                            <button 
                              id={`delete-item-${item.id}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                requestDelete(item.id, item.name);
                              }}
                              className="text-rose-400 hover:text-rose-300 font-bold text-xs px-2 py-1 bg-rose-500/10 rounded-lg whitespace-nowrap transition-colors"
                            >
                              删除
                            </button>
                          </div>
                        </td>
                      </tr>
                       );
                    };

                    if (activeLocation === '一级主仓') {
                       return filteredData.map(renderRow);
                    }

                    const grouped = filteredData.reduce((acc, item) => {
                      const tId = item.tank_id || '区域统筹';
                      if (!acc[tId]) acc[tId] = [];
                      acc[tId].push(item);
                      return acc;
                    }, {} as Record<string, WarehouseItem[]>);

                    if (activeTank && !grouped[activeTank]) {
                      grouped[activeTank] = [];
                    }

                    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).flatMap(([tId, items]) => {
                      const typedItems = items as WarehouseItem[];
                      return [
                        <tr key={`header-${tId}`} className="bg-slate-900 border-b border-cyan-900/40">
                          <td colSpan={8} className="py-3 px-4 text-left font-bold text-cyan-400 text-xs tracking-widest bg-cyan-950/30">
                             <div className="flex items-center justify-between">
                               <div className="flex items-center gap-2">
                                 <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></div>
                                 <span className="text-sm">
                                   {tId === '区域统筹' ? '区域统筹物资 (未指定池)' : `${tId} 养殖单元入库详情`}
                                 </span>
                               </div>
                               <span className="text-cyan-500/70 text-[10px] bg-cyan-950 px-2 py-1 rounded border border-cyan-500/20 font-mono">
                                 共计 {typedItems.length} 条记录
                               </span>
                             </div>
                          </td>
                        </tr>,
                        ...(typedItems.length > 0 ? typedItems.map(renderRow) : [
                          <tr key={`empty-${tId}`}>
                            <td colSpan={8} className="py-6 text-center text-slate-600 text-xs">
                              暂无物资
                            </td>
                          </tr>
                        ])
                      ];
                    });
                  })()}
                </tbody>
             </table>
           </div>
        </div>
      </div>

      <AnimatePresence>
        {activeModal && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setActiveModal(null);
                resetForm();
              }}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-800/30">
                <h3 className="font-bold text-slate-100 flex items-center gap-2 text-sm md:text-base">
                  {editingItem 
                      ? <><Plus size={18} className="text-indigo-400" /> 修改物资信息</>
                      : <><Plus size={18} className="text-indigo-400" /> 新增物资品类</>
                  }
                </h3>
                <button 
                  onClick={() => {
                    setActiveModal(null);
                    resetForm();
                  }}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 overflow-y-auto max-h-[70vh] custom-scrollbar">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5 col-span-2">
                       <label className="text-xs font-bold text-slate-400">归属仓库 (Level) <span className="text-red-400">*</span></label>
                       <select 
                        value={editingItem ? editingItem.location : (newItem.location || activeLocation)}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (editingItem) setEditingItem({ ...editingItem, location: val });
                          else setNewItem(prev => ({ ...prev, location: val }));
                        }}
                        className="w-full bg-slate-950/50 border border-slate-700 rounded-lg p-2.5 text-sm text-cyan-400 font-bold focus:outline-none focus:border-indigo-500"
                      >
                        {locations.map(loc => <option key={loc} value={loc} className="bg-slate-900">{loc}</option>)}
                      </select>
                    </div>
                    {((editingItem ? editingItem.location : newItem.location) !== '一级主仓') && (
                      <div className="space-y-1.5 col-span-2">
                        <label className="text-xs font-bold text-slate-400">池号 (仓库桶) <span className="text-slate-500">(可选)</span></label>
                        <select 
                          value={editingItem ? editingItem.tank_id : (newItem.tank_id || '')}
                          onChange={(e) => editingItem 
                            ? setEditingItem({ ...editingItem, tank_id: e.target.value }) 
                            : setNewItem(prev => ({ ...prev, tank_id: e.target.value }))
                          }
                          className="w-full bg-slate-950/50 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                        >
                          <option value="">-- 全区统筹 --</option>
                          {tanks.filter(t => {
                            const loc = editingItem ? editingItem.location : (newItem.location || activeLocation);
                            const area = loc.includes('A区') ? 'A' : loc.includes('B区') ? 'B' : loc.includes('C区') ? 'C' : '车间';
                            return (area !== '车间' && t.id.startsWith(area)) || (area === '车间' && t.id.startsWith('W'));
                          }).map(tank => (
                            <option key={tank.id} value={tank.id} className="bg-slate-900">{tank.id}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="space-y-1.5 col-span-2">
                       <label className="text-xs font-bold text-slate-400">物资编号 <span className="text-red-400">*</span></label>
                       <input 
                        type="text" 
                        value={editingItem ? editingItem.id : (newItem.id || '')}
                        disabled={!!editingItem}
                        onChange={(e) => !editingItem && setNewItem(prev => ({ ...prev, id: e.target.value }))}
                        className={`w-full bg-slate-950/50 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 ${editingItem ? 'opacity-50 cursor-not-allowed' : ''}`} 
                        placeholder="如：F005" 
                      />
                    </div>
                    <div className="space-y-1.5 col-span-2">
                      <label className="text-xs font-bold text-slate-400">物资名称 <span className="text-red-400">*</span></label>
                      <input 
                        type="text" 
                        value={editingItem ? editingItem.name : (newItem.name || '')}
                        onChange={(e) => editingItem 
                          ? setEditingItem({ ...editingItem, name: e.target.value }) 
                          : setNewItem(prev => ({ ...prev, name: e.target.value }))
                        }
                        className="w-full bg-slate-950/50 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500" 
                        placeholder="如：恒兴虾青素强化料" 
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-400">归属大类 <span className="text-red-400">*</span></label>
                      <select 
                        value={editingItem ? editingItem.category : (newItem.category || 'feed')}
                        onChange={(e) => editingItem
                          ? setEditingItem({ ...editingItem, category: e.target.value as any })
                          : setNewItem(prev => ({ ...prev, category: e.target.value as any }))
                        }
                        className="w-full bg-slate-950/50 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                      >
                        <option value="feed">🐟 饲料仓库</option>
                        <option value="med">💊 动保仓库</option>
                        <option value="fry">📦 苗种及采购品</option>
                        <option value="prod">🛠️ 生产物资</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-400">包装规格 <span className="text-red-400">*</span></label>
                      <input 
                        type="text" 
                        value={editingItem ? editingItem.spec : (newItem.spec || '')}
                        onChange={(e) => editingItem
                          ? setEditingItem({ ...editingItem, spec: e.target.value })
                          : setNewItem(prev => ({ ...prev, spec: e.target.value }))
                        }
                        className="w-full bg-slate-950/50 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500" 
                        placeholder="如：25kg/包" 
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-400">基础单位 <span className="text-red-400">*</span></label>
                      <input 
                        type="text" 
                        value={editingItem ? editingItem.unit : (newItem.unit || '')}
                        onChange={(e) => editingItem
                          ? setEditingItem({ ...editingItem, unit: e.target.value })
                          : setNewItem(prev => ({ ...prev, unit: e.target.value }))
                        }
                        className="w-full bg-slate-950/50 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500" 
                        placeholder="如：包、瓶、箱" 
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-400">安全库存警告阈值 <span className="text-red-400">*</span></label>
                      <input 
                        type="number" 
                        value={editingItem ? editingItem.minStock : (newItem.minStock || 10)}
                        onChange={(e) => editingItem
                          ? setEditingItem({ ...editingItem, minStock: Number(e.target.value) })
                          : setNewItem(prev => ({ ...prev, minStock: Number(e.target.value) }))
                        }
                        className="w-full bg-slate-950/50 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 font-mono" 
                        placeholder="0" 
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-400">入库单价 (¥/单位)</label>
                      <input 
                        type="number" 
                        value={editingItem ? editingItem.unit_price : (newItem.unit_price || 0)}
                        onChange={(e) => editingItem
                          ? setEditingItem({ ...editingItem, unit_price: Number(e.target.value) })
                          : setNewItem(prev => ({ ...prev, unit_price: Number(e.target.value) }))
                        }
                        className="w-full bg-slate-950/50 border border-slate-700 rounded-lg p-2.5 text-sm text-emerald-400 focus:outline-none focus:border-indigo-500 font-mono" 
                        placeholder="0.00" 
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-400 text-amber-400">生产批次号 (Batch No.)</label>
                      <input 
                        type="text" 
                        value={editingItem ? editingItem.batch_no : (newItem.batch_no || '')}
                        onChange={(e) => editingItem
                          ? setEditingItem({ ...editingItem, batch_no: e.target.value })
                          : setNewItem(prev => ({ ...prev, batch_no: e.target.value }))
                        }
                        className="w-full bg-slate-950/50 border border-slate-700 rounded-lg p-2.5 text-sm text-amber-500 focus:outline-none focus:border-amber-500 font-mono" 
                        placeholder="如：20260401-01" 
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-400 text-rose-400">有效期至 (Expiry Date)</label>
                      <input 
                        type="date" 
                        value={editingItem ? editingItem.expiry_date : (newItem.expiry_date || '')}
                        onChange={(e) => editingItem
                          ? setEditingItem({ ...editingItem, expiry_date: e.target.value })
                          : setNewItem(prev => ({ ...prev, expiry_date: e.target.value }))
                        }
                        className="w-full bg-slate-950/50 border border-slate-700 rounded-lg p-2.5 text-sm text-rose-400 focus:outline-none focus:border-rose-500 font-mono" 
                      />
                    </div>
                    {!editingItem && (
                      <div className="space-y-1.5 col-span-2">
                        <label className="text-xs font-bold text-slate-400">初始库存</label>
                        <input 
                          type="number" 
                          value={newItem.stock || 0}
                          onChange={(e) => setNewItem(prev => ({ ...prev, stock: Number(e.target.value) }))}
                          className="w-full bg-slate-950/50 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 font-mono" 
                          placeholder="0" 
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-8 flex gap-3">
                  <button 
                    onClick={() => {
                        setActiveModal(null);
                        resetForm();
                    }}
                    className="flex-1 py-3 bg-slate-800 text-slate-400 rounded-xl font-bold hover:bg-slate-700 transition-colors"
                  >
                    取消
                  </button>
                  <button 
                    onClick={editingItem ? handleUpdateItem : handleCreateCategory}
                    className="flex-1 py-3 bg-indigo-500 text-slate-900 rounded-xl font-bold hover:bg-indigo-400 transition-colors shadow-lg shadow-indigo-500/20"
                  >
                    确认保存
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {transferItem && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setTransferItem(null)} className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative bg-slate-900 border border-slate-700 w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl">
              <div className="p-4 border-b border-slate-800 bg-slate-800/30 flex items-center justify-between">
                <h3 className="font-bold text-slate-100 flex items-center gap-2 text-sm">
                  <ArrowRightLeft size={16} className="text-amber-400" /> 物资调拨
                </h3>
                <button onClick={() => setTransferItem(null)} className="text-slate-400 hover:text-white"><X size={18} /></button>
              </div>
              <div className="p-6 space-y-4">
                <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800">
                  <div className="text-[10px] text-slate-500 font-bold uppercase mb-1">调拨物资</div>
                  <div className="text-sm font-bold text-slate-200">{transferItem.name} ({transferItem.id})</div>
                  <div className="text-[10px] text-slate-400 mt-1">当前库存: <span className="text-cyan-400 font-mono">{transferItem.stock}</span> {transferItem.unit}</div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">目标仓库</label>
                  <select 
                    value={transferTarget}
                    onChange={(e) => setTransferTarget(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-cyan-400 font-bold focus:outline-none"
                  >
                    {level2Locations.map(loc => (
                      <option key={loc} value={loc} className="bg-slate-900">{loc}</option>
                    ))}
                  </select>
                </div>

                {level2Locations.includes(transferTarget) && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">池号 (仓库桶)</label>
                    <select 
                      value={transferTankId}
                      onChange={(e) => setTransferTankId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-white font-bold focus:outline-none"
                    >
                      {tanks.filter(t => {
                        const area = transferTarget.includes('A区') ? 'A' : transferTarget.includes('B区') ? 'B' : transferTarget.includes('C区') ? 'C' : '车间';
                        return (area !== '车间' && t.id.startsWith(area)) || (area === '车间' && t.id.startsWith('W'));
                      }).map(tank => (
                        <option key={tank.id} value={tank.id} className="bg-slate-900">{tank.id}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">调拨日期</label>
                  <input 
                    type="date"
                    value={transferDate}
                    onChange={(e) => setTransferDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-300 font-mono focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">调拨数量</label>
                  <div className="flex items-center gap-2">
                    <input 
                      type="number" 
                      value={transferAmount}
                      max={transferItem.stock}
                      min={0}
                      onChange={(e) => setTransferAmount(Number(e.target.value))}
                      className="flex-1 bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
                      placeholder="0"
                    />
                    <div className="text-xs text-slate-500 font-bold">{transferItem.unit}</div>
                  </div>
                  <div className="flex justify-between items-center px-1">
                    <button 
                      onClick={() => setTransferAmount(Math.floor(transferItem.stock / 2))}
                      className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      50%
                    </button>
                    <button 
                      onClick={() => setTransferAmount(transferItem.stock)}
                      className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      全部
                    </button>
                  </div>
                </div>

                <button 
                  onClick={handleTransfer}
                  disabled={isTransferring || transferAmount <= 0 || transferAmount > transferItem.stock}
                  className="w-full py-3 bg-amber-500 text-slate-950 rounded-xl font-black text-sm uppercase tracking-widest hover:bg-amber-400 transition-all shadow-lg shadow-amber-500/10 disabled:opacity-50 disabled:grayscale"
                >
                  {isTransferring ? '正在处理...' : '确认调动执行'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmDeleteObj && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setConfirmDeleteObj(null)} className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative bg-slate-900 border border-slate-700 w-full max-w-sm rounded-xl p-6 shadow-2xl text-center">
              <div className="w-12 h-12 rounded-full bg-red-500/20 text-red-500 mx-auto mb-4 flex items-center justify-center">
                <Trash2 size={24} />
              </div>
              <h3 className="text-lg font-bold text-slate-100 mb-2">确认删除该物资？</h3>
              <p className="text-sm text-slate-400 mb-6">您确定要删除 "{confirmDeleteObj.name}" 吗？此操作将永久删除该物资类别及其规格记录，无法撤销。</p>
              <div className="flex justify-center gap-3">
                <button 
                  onClick={() => !isDeleting && setConfirmDeleteObj(null)} 
                  disabled={isDeleting}
                  className="px-4 py-2 text-sm font-bold text-slate-400 hover:text-white bg-slate-800 rounded-lg disabled:opacity-50"
                >
                  取消
                </button>
                <button 
                  onClick={executeDelete} 
                  disabled={isDeleting}
                  className="px-6 py-2 bg-red-500 hover:bg-red-400 font-bold text-sm text-white rounded-lg transition-colors flex items-center gap-2 min-w-[100px] justify-center disabled:opacity-50"
                >
                  {isDeleting ? <><Loader2 size={14} className="animate-spin" /> 处理中</> : '确认删除'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showHistory && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowHistory(false)} className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.95 }} 
              className="relative bg-slate-900 border border-slate-700 w-full max-w-4xl max-h-[80vh] rounded-2xl overflow-hidden shadow-2xl flex flex-col"
            >
              <div className="p-4 border-b border-slate-800 bg-slate-800/30 flex items-center justify-between">
                <h3 className="font-bold text-slate-100 flex items-center gap-2">
                  <Package size={18} className="text-cyan-400" /> 物资调拨历史记录
                </h3>
                <button onClick={() => setShowHistory(false)} className="text-slate-400 hover:text-white"><X size={20} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {isLoadingHistory ? (
                  <div className="py-20 flex flex-col items-center gap-3 text-cyan-400">
                    <Loader2 size={32} className="animate-spin" />
                    <span className="text-sm font-bold">载入历史数据...</span>
                  </div>
                ) : historyRecords.length === 0 ? (
                  <div className="py-10 text-center text-slate-500 italic">暂无调拨历史记录</div>
                ) : (
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="bg-slate-900 text-slate-400 border-b border-slate-800">
                        <th className="py-3 px-4">调拨日期</th>
                        <th className="py-3 px-4">物资名称</th>
                        <th className="py-3 px-4">由 (源Id)</th>
                        <th className="py-3 px-4">至 (目标)</th>
                        <th className="py-3 px-4">数量</th>
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
                          console.error('Failed to parse record data:', e);
                          data = {};
                        }
                        
                        const dateDisplay = r.date || data.date || '-';
                        const itemNameDisplay = data.itemName || data.name || '-';
                        
                        return (
                          <tr key={r.id || idx} className="border-b border-slate-800/50 hover:bg-slate-800/40 transition-colors">
                            <td className="py-3 px-4 font-mono text-cyan-400/80">{dateDisplay}</td>
                            <td className="py-3 px-4 font-bold text-slate-200">{itemNameDisplay}</td>
                            <td className="py-3 px-4 text-slate-500 font-mono text-xs">{data.sourceLocation || '-'} ({data.sourceId || '-'})</td>
                            <td className="py-3 px-4 text-slate-300 font-bold">{data.targetLocation || '-'}</td>
                            <td className="py-3 px-4 text-amber-400 font-bold">{data.amount || 0}</td>
                            <td className="py-3 px-4 text-xs text-slate-500 truncate max-w-[150px]">{data.remarks || '-'}</td>
                            <td className="py-3 px-4 text-center">
                              <button 
                                onClick={() => {
                                  setEditingRecord(r);
                                  setNewDateValue(r.date || data.date || new Date().toISOString().split('T')[0]);
                                }}
                                className="text-cyan-400 hover:text-cyan-300 text-xs font-bold px-2 py-1 bg-cyan-500/10 rounded border border-cyan-500/20"
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
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editingRecord && (
          <div className="fixed inset-0 z-[2100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setEditingRecord(null)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.9 }} 
              className="relative bg-slate-900 border border-slate-700 p-6 rounded-2xl shadow-xl w-full max-w-xs"
            >
              <h4 className="text-white font-bold mb-4 flex items-center gap-2">
                <History size={18} className="text-cyan-400" /> 修改调拨日期
              </h4>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">新日期</label>
                  <input 
                    type="date"
                    value={newDateValue}
                    onChange={(e) => setNewDateValue(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setEditingRecord(null)} className="flex-1 py-2 text-slate-400 hover:text-white transition-colors text-sm font-bold">
                    取消
                  </button>
                  <button 
                    onClick={handleUpdateRecordDate}
                    disabled={isUpdatingRecord}
                    className="flex-1 py-2 bg-cyan-500 text-slate-900 rounded-lg font-bold hover:bg-cyan-400 transition-colors text-sm flex items-center justify-center gap-2"
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
            initial={{ opacity: 0, y: 50, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} exit={{ opacity: 0, y: 20, x: '-50%' }}
            className="fixed bottom-10 left-1/2 bg-slate-800 text-cyan-50 px-6 py-3 rounded-full shadow-2xl border border-slate-700 z-[220] text-sm font-bold flex items-center gap-2"
          >
            <Shield size={16} className="text-cyan-400" />
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

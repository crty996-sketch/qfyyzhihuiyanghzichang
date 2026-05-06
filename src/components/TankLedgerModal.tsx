import { motion } from 'motion/react';
import { X, FileText, ClipboardList, LogOut, Calendar, Package, Activity, Info, Droplets, Edit3, Plus, Save, Trash2, Fish } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { TankData } from '../types';

interface TankLedgerModalProps {
  tank: TankData;
  onClose: () => void;
  records: any[];
  onRecordsChange: (records: any[]) => void;
}

type TabType = 'intake' | 'ledger' | 'outbound';

// Helper to convert "20条/斤" to "0.05斤/条" for display
const formatFishSize = (size: any): string => {
  if (!size || size === '-') return '-';
  const str = String(size);
  const match = str.match(/^(\d+(\.\d+)?)条\/斤$/);
  if (match) {
    const val = parseFloat(match[1]);
    if (val > 0) {
      const result = (1 / val).toFixed(3).replace(/\.?0+$/, '');
      return `${result}斤/条`;
    }
  }
  return str;
};

// Helper to parse size value for weight calculations
const parseFishSize = (size: any): number => {
  if (!size || size === '-') return NaN;
  const str = String(size);
  const match = str.match(/^(\d+(\.\d+)?)条\/斤$/);
  if (match) {
    const val = parseFloat(match[1]);
    return val > 0 ? 1 / val : 0;
  }
  const parsed = parseFloat(str);
  return isNaN(parsed) ? NaN : parsed;
};

export default function TankLedgerModal({ tank, onClose, records, onRecordsChange }: TankLedgerModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('intake');
  const [isEditing, setIsEditing] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [localRecords, setLocalRecords] = useState(records);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [warehouseFeeds, setWarehouseFeeds] = useState<any[]>([]);

  useEffect(() => {
    setIsMounted(true);
    setLocalRecords(records);
    
    // Fetch feed list
    fetch('/api/warehouse?category=feed')
      .then(res => res.json())
      .then(data => setWarehouseFeeds(data))
      .catch(err => console.error('Failed to fetch feeds:', err));
  }, [records]);

  const initialSeedCount = useMemo(() => {
    return localRecords
      .filter(r => r.type === 'inout' && ['purchaseIn', 'transferIn'].includes(r.subType))
      .reduce((sum, r) => sum + (r.count || 0), 0);
  }, [localRecords]);

  const intakeData = useMemo(() => {
    return localRecords
      .filter(r => r.type === 'inout' && ['purchaseIn', 'transferIn'].includes(r.subType))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [localRecords]);

  const outboundData = useMemo(() => {
    return localRecords
      .filter(r => r.type === 'inout' && ['salesOut', 'transferOut'].includes(r.subType))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [localRecords]);

  const ledgerData = useMemo(() => {
    const sorted = [...localRecords]
      .filter(r => ['feedmed', 'loss'].includes(r.type))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let cumulativeLoss = 0;
    
    const computed = sorted.map(record => {
      cumulativeLoss += (record.lossCount || 0);
      const currentCount = initialSeedCount - cumulativeLoss;
      const spec = record.spec || 0.85;
      return {
        ...record,
        _originalRef: record,
        lossWeight: (record.lossCount || 0) * spec,
        inventoryCount: currentCount,
        inventoryWeight: currentCount * spec
      };
    });

    return computed.reverse(); // Back to date descending for display
  }, [localRecords, initialSeedCount]);

  const currentStatus = useMemo(() => {
    let lossCount = 0;
    let outCount = 0;
    let mostRecentSpec: number | null = null;
    let initialSeedWeight = 0;
    let initialCount = 0;
    
    localRecords.forEach(r => {
      if (r.type === 'inout' && ['purchaseIn', 'transferIn'].includes(r.subType)) {
        const parsedSize = parseFishSize(r.size || '0');
        const sizeToUse = isNaN(parsedSize) ? 0 : parsedSize;
        initialSeedWeight += ((Number(r.count) || 0) * sizeToUse);
        initialCount += (r.count || 0);
      }
      if (r.type === 'loss') {
        lossCount += (Number(r.lossCount) || 0);
      }
      if (r.type === 'inout' && ['salesOut', 'transferOut'].includes(r.subType)) {
        outCount += (Number(r.count) || 0);
      }
    });

    const sortedFeedLoss = [...localRecords]
      .filter(r => ['feedmed', 'loss'].includes(r.type))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    if (sortedFeedLoss.length > 0 && sortedFeedLoss[0].spec) {
      mostRecentSpec = Number(sortedFeedLoss[0].spec);
    }

    const initialInRecords = localRecords.filter(r => r.type === 'inout' && ['purchaseIn', 'transferIn'].includes(r.subType));
    
    if (mostRecentSpec === null) {
      if (initialInRecords.length > 0 && initialInRecords[0].size) {
         mostRecentSpec = parseFishSize(initialInRecords[0].size);
         if (isNaN(mostRecentSpec)) mostRecentSpec = 0.85;
      } else {
         mostRecentSpec = 0.85;
      }
    }

    const currentCount = Math.max(0, initialCount - lossCount - outCount);
    // currentWeight should be initialWeight minus loss weight (which is mostRecentSpec * lossCount) minus out weight ...
    // Wait, the specification says: 现存总量等于入池总量-损耗量 (Current amount equals intake amount minus loss amount).
    // Let's just use currentCount * mostRecentSpec
    const currentWeight = currentCount * mostRecentSpec;
    
    return {
       currentCount,
       currentWeight
    }
  }, [localRecords]);

  const ledgerTotals = useMemo(() => {
    return localRecords
      .filter(r => ['feedmed', 'loss'].includes(r.type))
      .reduce((acc, record) => {
        const feedQty = typeof record.feeding?.qty === 'string' ? parseFloat(record.feeding.qty) : (record.feeding?.qty || 0);
        const spec = record.spec || 0.85;
        const lossWeight = (record.lossCount || 0) * spec;
        return {
          totalFeeding: acc.totalFeeding + (feedQty || 0),
          totalLoss: acc.totalLoss + lossWeight
        };
      }, { totalFeeding: 0, totalLoss: 0 });
  }, [localRecords]);

  const intakeTotals = useMemo(() => {
    return intakeData.reduce((acc, r) => {
      const parsedSize = parseFishSize(r.size || '0');
      const sizeToUse = isNaN(parsedSize) ? 0 : parsedSize;
      return {
        count: acc.count + (r.count || 0),
        weight: acc.weight + ((r.count || 0) * sizeToUse)
      };
    }, { count: 0, weight: 0 });
  }, [intakeData]);

  const farmingDays = useMemo(() => {
    if (intakeData.length === 0) return 0;
    const firstDate = new Date(intakeData[intakeData.length - 1].date);
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - firstDate.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }, [intakeData]);

  const handleAddRecord = () => {
    const today = new Date().toISOString().split('T')[0];
    let newRecord: any;

    if (activeTab === 'intake') {
      newRecord = {
        date: today,
        type: 'inout',
        subType: 'purchaseIn',
        species: intakeData[0]?.species || tank.farming?.species || '未知',
        size: tank.farming?.size || '0.02',
        count: 0,
        amount: 0,
        remarks: '新入池记录'
      };
    } else if (activeTab === 'ledger') {
      newRecord = {
        date: today,
        type: 'feedmed',
        feeding: { type: '高效配合饲料', qty: 0 },
        medication: { name: '无', dose: '0' },
        spec: 0.8,
        lossCount: 0
      };
    } else {
      newRecord = {
        date: today,
        type: 'inout',
        subType: 'salesOut',
        species: intakeData[0]?.species || tank.farming?.species || '未知',
        size: tank.farming?.currentSize || '0.85',
        count: 0,
        amount: 0,
        remarks: '销售出库'
      };
    }

    const updated = [newRecord, ...localRecords];
    setLocalRecords(updated);
    setEditingIndex(0);
    setIsEditing(true);
  };

  const handleSaveRow = async (record?: any) => {
    if (record) {
      try {
        let res;
        if (record.id) {
          res = await fetch(`/api/records/${record.type}/${record.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...record, type: record.subType || record.type, tankId: tank.id })
          });
        } else {
          res = await fetch(`/api/records/${record.type}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...record, type: record.subType || record.type, tankId: tank.id })
          });
        }

        if (!res.ok) {
          try {
            const body = await res.json();
            alert(`保存失败: ${body.error || res.statusText}`);
          } catch(e) {
            alert(`保存失败: ${res.statusText}`);
          }
          return;
        }

        if (!record.id) {
          const data = await res.json();
          if (data.id) {
            const realIdx = localRecords.indexOf(record);
            if (realIdx >= 0) {
              const updated = [...localRecords];
              updated[realIdx] = { ...record, id: data.id };
              setLocalRecords(updated);
              onRecordsChange(updated);
              setEditingIndex(null);
              return;
            }
          }
        }
      } catch (e: any) {
        console.error('Failed to save record', e);
        alert(`保存失败: ${e.message}`);
        return;
      }
    }
    setEditingIndex(null);
    onRecordsChange([...localRecords]); // sync state anyway
  };

  const executeDeleteRecord = async (record: any) => {
    if (record.id) {
      try {
        const res = await fetch(`/api/records/${record.type}/${record.id}`, { method: 'DELETE' });
        if (!res.ok) {
          const body = await res.json();
          alert(`删除失败: ${body.error || res.statusText}`);
          return;
        }
      } catch (e: any) {
        console.error('Failed to delete record', e);
        alert(`删除失败: ${e.message}`);
        return;
      }
    }
    const updated = localRecords.filter(r => {
      if (r.id && record.id) return String(r.id) !== String(record.id);
      return r !== record;
    });
    setLocalRecords(updated);
    onRecordsChange(updated);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        exit={{ opacity: 0 }} 
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
        onClick={onClose}
      />
      
      <motion.div 
        initial={{ opacity: 0, scale: 1, y: 0 }} 
        animate={{ opacity: 1, scale: 1, y: 0 }} 
        exit={{ opacity: 0, scale: 1, y: 0 }} 
        className="relative w-full h-full bg-slate-950 overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="p-4 md:p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-cyan-500/20 rounded-xl flex items-center justify-center text-cyan-400 border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.2)]">
              <ClipboardList size={20} />
            </div>
            <div>
              <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-3">
                <span className="text-cyan-400 font-mono text-2xl">{tank.id}</span>
                <span className="bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">养殖全周期档案</span>
              </h2>
              <p className="text-xs text-slate-500 uppercase tracking-widest mt-0.5 font-black">Farming Lifecycle Records & Industrial Data Ledger</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2.5 bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-all border border-slate-700/50 hover:scale-105 active:scale-95"
          >
            <X size={18} />
          </button>
        </div>

        {/* Top Summary Cards */}
        <div className="px-10 py-5 bg-slate-900/40 border-b border-slate-800/50">
          <div className="grid grid-cols-6 gap-3">
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-3 flex items-center gap-3 shadow-xl backdrop-blur-md group hover:border-emerald-500/30 transition-all">
              <div className="bg-emerald-500/10 p-2 rounded-xl">
                <Fish size={18} className="text-emerald-400" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-0.5 truncate">当前养殖品种</span>
                <span className="text-sm font-black text-emerald-400 font-sans tracking-tight truncate block">{intakeData[0]?.species || tank.farming?.species || '未知'}</span>
              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-3 flex items-center gap-3 shadow-xl backdrop-blur-md group hover:border-cyan-500/30 transition-all">
              <div className="bg-cyan-500/10 p-2 rounded-xl">
                <Package size={18} className="text-cyan-400" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-0.5 truncate">入池总量(条/重)</span>
                <div className="flex flex-col">
                  <span className="text-sm font-black text-cyan-400 font-mono tracking-tighter leading-none">{intakeTotals.count.toLocaleString()}<span className="text-[10px] ml-0.5">条</span></span>
                  <span className="text-xs font-black text-slate-400 font-mono leading-none mt-1">{intakeTotals.weight.toLocaleString(undefined, { maximumFractionDigits: 1 })}<span className="text-[10px] ml-0.5">斤</span></span>
                </div>
              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-3 flex items-center gap-3 shadow-xl backdrop-blur-md group hover:border-orange-500/30 transition-all">
              <div className="bg-orange-500/10 p-2 rounded-xl">
                <Calendar size={18} className="text-orange-400" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-0.5 truncate">养殖周期(天数)</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-sm font-black text-orange-400 font-mono tracking-tighter">{farmingDays}</span>
                  <span className="text-xs font-black text-slate-600 uppercase">DAYS</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-3 flex items-center gap-3 shadow-xl backdrop-blur-md group hover:border-blue-500/30 transition-all">
              <div className="bg-blue-500/10 p-2 rounded-xl">
                <Activity size={18} className="text-blue-400" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-0.5 truncate">养殖累计投喂</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-sm font-black text-blue-400 font-mono tracking-tighter">{ledgerTotals.totalFeeding.toLocaleString(undefined, { minimumFractionDigits: 1 })}</span>
                  <span className="text-xs font-black text-slate-600 uppercase">KG</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-3 flex items-center gap-3 shadow-xl backdrop-blur-md group hover:border-red-500/30 transition-all">
              <div className="bg-red-500/10 p-2 rounded-xl">
                <Droplets size={18} className="text-red-400" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-0.5 truncate">周期累计损耗</span>
                <div className="flex items-baseline gap-1">
                   <span className="text-sm font-black text-red-400 font-mono tracking-tighter">{ledgerTotals.totalLoss.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
                   <span className="text-xs font-black text-slate-600 uppercase">斤</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-3 flex items-center gap-3 shadow-xl backdrop-blur-md group hover:border-cyan-500/30 transition-all">
              <div className="bg-cyan-500/10 p-2 rounded-xl">
                <ClipboardList size={18} className="text-cyan-400" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-0.5 truncate">现存总量(条/重)</span>
                <div className="flex flex-col">
                  <span className="text-sm font-black text-cyan-400 font-mono tracking-tighter leading-none">{currentStatus.currentCount.toLocaleString() || 0}<span className="text-[10px] ml-0.5">条</span></span>
                  <span className="text-xs font-black text-slate-400 font-mono leading-none mt-1">{currentStatus.currentWeight.toLocaleString(undefined, { maximumFractionDigits: 1 }) || 0}<span className="text-[10px] ml-0.5">斤</span></span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex px-10 border-b border-slate-800/50 bg-slate-900/20">
          {[
            { id: 'intake', label: '进苗记录', icon: Package },
            { id: 'ledger', label: '养殖台账', icon: Activity },
            { id: 'outbound', label: '出库记录', icon: LogOut },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id as TabType); setEditingIndex(null); }}
              className={`flex items-center gap-3 px-8 py-4 text-sm font-black transition-all relative group ${
                activeTab === tab.id ? 'text-cyan-400' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <tab.icon size={16} className={activeTab === tab.id ? 'animate-pulse' : 'opacity-50'} />
              <span className="tracking-widest">{tab.label}</span>
              {activeTab === tab.id && (
                <motion.div 
                  layoutId="activeTabUnderline"
                  className="absolute bottom-0 left-0 right-0 h-1 bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.8)] rounded-t-full"
                />
              )}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar bg-slate-950/30">
          {activeTab === 'intake' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 bg-cyan-500/5 border border-cyan-500/20 px-6 py-2 rounded-2xl">
                  <Info size={14} className="text-cyan-500" />
                  <span className="text-slate-300 text-xs font-bold tracking-widest uppercase">进苗及转入记录 (数据实时同步仓储系统)</span>
                </div>
                <button 
                  onClick={handleAddRecord}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl transition-all text-xs font-black uppercase tracking-widest"
                >
                  <Plus size={14} /> 新增日志
                </button>
              </div>
              <div className="overflow-hidden rounded-[1.5rem] border border-slate-800 shadow-2xl bg-slate-900/40 backdrop-blur-sm">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-800/30 border-b border-slate-700/50">
                      <th className="px-4 py-4 text-xs font-black text-slate-500 uppercase tracking-widest text-center w-32">日期</th>
                      <th className="px-4 py-4 text-xs font-black text-slate-500 uppercase tracking-widest text-center">类型</th>
                      <th className="px-4 py-4 text-xs font-black text-slate-500 uppercase tracking-widest text-center">品种</th>
                      <th className="px-4 py-4 text-xs font-black text-slate-500 uppercase tracking-widest text-center">规格（斤/条）</th>
                      <th className="px-4 py-4 text-xs font-black text-slate-500 uppercase tracking-widest text-center">入池总量(条)</th>
                      <th className="px-4 py-4 text-xs font-black text-slate-500 uppercase tracking-widest text-center">备注说明</th>
                      <th className="px-4 py-4 text-xs font-black text-slate-500 uppercase tracking-widest text-center w-24">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {intakeData.map((record, idx) => {
                      const isCurrentEditing = activeTab === 'intake' && editingIndex === idx;
                      return (
                      <tr key={record.id || `intake-${idx}`} className="hover:bg-slate-800/50 transition-colors group">
                        <td className="px-4 py-3.5 text-center">
                          {isCurrentEditing ? (
                            <input 
                              type="date"
                              className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-[10px] text-white"
                              value={record.date}
                              onChange={(e) => {
                                const newRecords = [...localRecords];
                                const realIdx = localRecords.indexOf(record);
                                newRecords[realIdx] = { ...newRecords[realIdx], date: e.target.value };
                                setLocalRecords(newRecords);
                              }}
                            />
                          ) : (
                            <div className="flex items-center justify-center gap-2">
                               <Calendar size={12} className="text-slate-600" />
                               <span className="text-xs font-mono text-slate-400 font-bold">{record.date}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          {isCurrentEditing ? (
                            <select 
                              className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-[10px] text-white"
                              value={record.subType}
                              onChange={(e) => {
                                const newRecords = [...localRecords];
                                const realIdx = localRecords.indexOf(record);
                                newRecords[realIdx] = { ...newRecords[realIdx], subType: e.target.value };
                                setLocalRecords(newRecords);
                              }}
                            >
                              <option value="purchaseIn">采购入库</option>
                              <option value="transferIn">转池入库</option>
                            </select>
                          ) : (
                            <span className="text-xs font-bold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-lg border border-cyan-500/20">
                              {record.subType === 'purchaseIn' ? '采购入库' : '转池入库'}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          {isCurrentEditing ? (
                            <input 
                              className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white w-24 mx-auto"
                              value={record.species}
                              onChange={(e) => {
                                const newRecords = [...localRecords];
                                const realIdx = localRecords.indexOf(record);
                                newRecords[realIdx] = { ...newRecords[realIdx], species: e.target.value };
                                setLocalRecords(newRecords);
                              }}
                            />
                          ) : (
                            <span className="font-bold text-white text-sm">{record.species}</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                           {isCurrentEditing ? (
                            <input 
                              className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-emerald-400 w-16 mx-auto font-black"
                              value={record.size}
                              onChange={(e) => {
                                const newRecords = [...localRecords];
                                const realIdx = localRecords.indexOf(record);
                                newRecords[realIdx] = { ...newRecords[realIdx], size: e.target.value };
                                setLocalRecords(newRecords);
                              }}
                            />
                          ) : (
                            <span className="text-xs font-mono text-slate-400 bg-slate-800 px-3 py-0.5 rounded-lg border border-slate-700">{formatFishSize(record.size)}</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                           {isCurrentEditing ? (
                            <input 
                              type="number"
                              className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white w-20 mx-auto"
                              value={record.count}
                              onChange={(e) => {
                                const newRecords = [...localRecords];
                                const realIdx = localRecords.indexOf(record);
                                newRecords[realIdx] = { ...newRecords[realIdx], count: parseInt(e.target.value) || 0 };
                                setLocalRecords(newRecords);
                              }}
                            />
                          ) : (
                            <div className="flex flex-col items-center">
                              <span className="text-sm font-black text-cyan-400 font-mono tracking-tighter">{(record.count || 0).toLocaleString()} <span className="text-xs font-bold opacity-60 ml-0.5">条</span></span>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                           {isCurrentEditing ? (
                            <input 
                              className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white w-full"
                              value={record.remarks}
                              onChange={(e) => {
                                const newRecords = [...localRecords];
                                const realIdx = localRecords.indexOf(record);
                                newRecords[realIdx] = { ...newRecords[realIdx], remarks: e.target.value };
                                setLocalRecords(newRecords);
                              }}
                            />
                          ) : (
                            <span className="text-slate-400 text-xs font-medium italic">{record.remarks}</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                           <div className="flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                             {isCurrentEditing ? (
                                <button 
                                  onClick={() => handleSaveRow(record)}
                                  className="p-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-all"
                                >
                                  <Save size={12} />
                                </button>
                             ) : (
                               <button 
                                onClick={() => setEditingIndex(idx)}
                                className="p-1.5 bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-all"
                               >
                                 <Edit3 size={12} />
                               </button>
                             )}
                             <button 
                              onClick={() => setDeleteTarget(record)}
                              className="p-1.5 bg-slate-800 text-slate-400 hover:text-red-400 rounded-lg transition-all"
                             >
                               <Trash2 size={12} />
                             </button>
                           </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {activeTab === 'ledger' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 bg-emerald-500/5 border border-emerald-500/20 px-6 py-2 rounded-2xl">
                  <FileText size={14} className="text-emerald-500" />
                  <span className="text-slate-300 text-xs font-bold tracking-widest uppercase">生产运行台账 (每日作业档案)</span>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={handleAddRecord}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl transition-all text-xs font-black uppercase tracking-widest"
                  >
                    <Plus size={14} /> 新增日志
                  </button>
                </div>
              </div>
              
              <div className="overflow-hidden rounded-[1.5rem] border border-slate-800 shadow-2xl bg-slate-900/40 backdrop-blur-sm overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-800/30 border-b border-slate-700/50">
                      <th className="px-4 py-4 text-xs font-black text-slate-500 uppercase tracking-widest text-center">日期</th>
                      <th className="px-4 py-4 text-xs font-black text-slate-500 uppercase tracking-widest text-center">每日投喂</th>
                      <th className="px-4 py-4 text-xs font-black text-slate-500 uppercase tracking-widest text-center">每日用药</th>
                      <th className="px-4 py-4 text-xs font-black text-slate-500 uppercase tracking-widest text-center">规格(斤/条)</th>
                      <th className="px-4 py-4 text-xs font-black text-slate-500 uppercase tracking-widest text-center">每日损耗(条)</th>
                      <th className="px-4 py-4 text-xs font-black text-slate-500 uppercase tracking-widest text-center">现存总量</th>
                      <th className="px-4 py-4 text-xs font-black text-slate-500 uppercase tracking-widest text-center w-24">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {ledgerData.map((record, idx) => {
                      const isCurrentEditing = activeTab === 'ledger' && editingIndex === idx;
                      return (
                        <tr key={record.id || `ledger-${idx}`} className="hover:bg-cyan-500/[0.02] transition-colors group">
                          <td className="px-4 py-3.5 text-center">
                            {isCurrentEditing ? (
                              <input 
                                type="date" 
                                className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white"
                                value={record.date}
                                onChange={(e) => {
                                  const newRecords = [...localRecords];
                                  const realIdx = localRecords.indexOf(record._originalRef || record);
                                  newRecords[realIdx] = { ...newRecords[realIdx], date: e.target.value };
                                  setLocalRecords(newRecords);
                                }}
                              />
                            ) : (
                              <span className="text-xs font-mono text-slate-400 font-bold">{record.date}</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            {isCurrentEditing ? (
                              <div className="flex flex-col gap-1">
                                <input 
                                  type="number"
                                  step="0.01"
                                  className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-blue-400 w-16 mx-auto font-bold"
                                  value={record.feeding?.qty ?? 0}
                                  onChange={(e) => {
                                    const newRecords = [...localRecords];
                                    const realIdx = localRecords.indexOf(record._originalRef || record);
                                    newRecords[realIdx] = { ...newRecords[realIdx], feeding: { ...newRecords[realIdx].feeding, qty: e.target.value } };
                                    setLocalRecords(newRecords);
                                  }}
                                />
                                <select 
                                  className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-0.5 text-[10px] text-slate-400 w-20 mx-auto focus:border-cyan-500/50 outline-none"
                                  value={record.feeding?.type || ''}
                                  onChange={(e) => {
                                    const newRecords = [...localRecords];
                                    const realIdx = localRecords.indexOf(record._originalRef || record);
                                    newRecords[realIdx] = { ...newRecords[realIdx], feeding: { ...newRecords[realIdx].feeding, type: e.target.value } };
                                    setLocalRecords(newRecords);
                                  }}
                                >
                                  <option value="">选择饲料</option>
                                  {warehouseFeeds.map(f => (
                                    <option key={f.id} value={f.name}>{f.name}</option>
                                  ))}
                                  {!warehouseFeeds.some(f => f.name === record.feeding?.type) && record.feeding?.type && (
                                    <option value={record.feeding.type}>{record.feeding.type}</option>
                                  )}
                                </select>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center">
                                <span className="text-xs font-black text-blue-400 font-mono italic">{record.feeding?.qty || 0}kg</span>
                                <span className="text-[10px] font-bold text-slate-500 mt-0.5 uppercase tracking-wider">{record.feeding?.type || '未记录'}</span>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            {isCurrentEditing ? (
                              <div className="flex flex-col gap-1">
                                <input 
                                  className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-purple-400 w-16 mx-auto font-bold"
                                  value={record.medication?.dose || '0'}
                                  onChange={(e) => {
                                    const newRecords = [...localRecords];
                                    const realIdx = localRecords.indexOf(record._originalRef || record);
                                    newRecords[realIdx] = { ...newRecords[realIdx], medication: { ...newRecords[realIdx].medication, dose: e.target.value } };
                                    setLocalRecords(newRecords);
                                  }}
                                />
                                <input 
                                  className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-0.5 text-[10px] text-slate-400 w-20 mx-auto"
                                  value={record.medication?.name || ''}
                                  onChange={(e) => {
                                    const newRecords = [...localRecords];
                                    const realIdx = localRecords.indexOf(record._originalRef || record);
                                    newRecords[realIdx] = { ...newRecords[realIdx], medication: { ...newRecords[realIdx].medication, name: e.target.value } };
                                    setLocalRecords(newRecords);
                                  }}
                                />
                              </div>
                            ) : (
                              <div className="flex flex-col items-center">
                                <span className="text-xs font-black text-purple-400 font-mono italic">{record.medication?.dose || '0'}</span>
                                <span className="text-[10px] font-bold text-slate-500 mt-0.5 uppercase tracking-wider">{record.medication?.name || '无用药'}</span>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            {isCurrentEditing ? (
                              <input 
                                type="number"
                                step="0.01"
                                className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-emerald-400 w-16 mx-auto font-black"
                                value={record.spec ?? 0.8}
                                onChange={(e) => {
                                  const newRecords = [...localRecords];
                                  const realIdx = localRecords.indexOf(record._originalRef || record);
                                  newRecords[realIdx] = { ...newRecords[realIdx], spec: e.target.value };
                                  setLocalRecords(newRecords);
                                }}
                              />
                            ) : (
                              <span className="text-sm font-black text-slate-300 font-mono italic">{record.spec || 0.8}</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            {isCurrentEditing ? (
                              <input 
                                type="number"
                                step="1"
                                className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-red-400 w-16 mx-auto font-bold"
                                value={record.lossCount ?? 0}
                                onChange={(e) => {
                                  const newRecords = [...localRecords];
                                  const realIdx = localRecords.indexOf(record._originalRef || record);
                                  newRecords[realIdx] = { ...newRecords[realIdx], lossCount: e.target.value };
                                  setLocalRecords(newRecords);
                                }}
                              />
                            ) : (
                              <span className={`text-xs font-black font-mono ${record.lossCount > 0 ? 'text-red-400' : 'text-slate-600'}`}>
                                {record.lossCount.toLocaleString()} 条
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            <div className="flex flex-col items-center bg-cyan-500/5 py-1.5 rounded-xl border border-cyan-500/10">
                              <span className="text-xs font-black text-cyan-400 font-mono tracking-tighter italic">{record.inventoryCount.toLocaleString()} 条</span>
                              <span className="text-[10px] font-black text-slate-500 uppercase mt-0.5 tracking-widest">{record.inventoryWeight.toFixed(1)} 斤</span>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-center">
                             <div className="flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                               {isCurrentEditing ? (
                                  <button onClick={() => handleSaveRow(record)} className="p-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-all">
                                    <Save size={12} />
                                  </button>
                               ) : (
                                 <button onClick={() => setEditingIndex(idx)} className="p-1.5 bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-all">
                                   <Edit3 size={12} />
                                 </button>
                               )}
                               <button onClick={() => setDeleteTarget(record._originalRef || record)} className="p-1.5 bg-slate-800 text-slate-400 hover:text-red-400 rounded-lg transition-all">
                                 <Trash2 size={12} />
                               </button>
                             </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {activeTab === 'outbound' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 bg-orange-500/5 border border-orange-500/20 px-6 py-2 rounded-2xl">
                  <LogOut size={14} className="text-orange-500" />
                  <span className="text-slate-300 text-xs font-bold tracking-widest uppercase">销售出库及跨池转拨记录</span>
                </div>
                <button 
                  onClick={handleAddRecord}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl transition-all text-xs font-black uppercase tracking-widest"
                >
                  <Plus size={14} /> 新增日志
                </button>
              </div>
              <div className="overflow-hidden rounded-[1.5rem] border border-slate-800 shadow-2xl bg-slate-900/40 backdrop-blur-sm overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-800/30 border-b border-slate-700/50">
                      <th className="px-4 py-4 text-xs font-black text-slate-500 uppercase tracking-widest text-center w-40">日期</th>
                      <th className="px-4 py-4 text-xs font-black text-slate-500 uppercase tracking-widest text-center w-32">出库类型</th>
                      <th className="px-4 py-4 text-xs font-black text-slate-500 uppercase tracking-widest text-center">品种</th>
                      <th className="px-4 py-4 text-xs font-black text-slate-500 uppercase tracking-widest text-center">规格</th>
                      <th className="px-4 py-4 text-xs font-black text-slate-500 uppercase tracking-widest text-center">出库总量(斤)</th>
                      <th className="px-4 py-4 text-xs font-black text-slate-500 uppercase tracking-widest text-center">去向备注</th>
                      <th className="px-4 py-4 text-xs font-black text-slate-500 uppercase tracking-widest text-center w-24">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {outboundData.map((record, idx) => {
                      const isCurrentEditing = activeTab === 'outbound' && editingIndex === idx;
                      return (
                      <tr key={record.id || `outbound-${idx}`} className="hover:bg-slate-800/50 transition-colors group">
                        <td className="px-4 py-3.5 text-center">
                          {isCurrentEditing ? (
                            <input 
                              type="date"
                              className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white"
                              value={record.date}
                              onChange={(e) => {
                                const newRecords = [...localRecords];
                                const realIdx = localRecords.indexOf(record);
                                newRecords[realIdx] = { ...newRecords[realIdx], date: e.target.value };
                                setLocalRecords(newRecords);
                              }}
                            />
                          ) : (
                            <span className="text-xs font-mono text-slate-400 font-bold tracking-tighter italic">{record.date}</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          {isCurrentEditing ? (
                            <select 
                              className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white"
                              value={record.subType}
                              onChange={(e) => {
                                const newRecords = [...localRecords];
                                const realIdx = localRecords.indexOf(record);
                                newRecords[realIdx] = { ...newRecords[realIdx], subType: e.target.value };
                                setLocalRecords(newRecords);
                              }}
                            >
                              <option value="salesOut">销售出库</option>
                              <option value="transferOut">转池出库</option>
                            </select>
                          ) : (
                            <span className={`text-xs font-black px-3 py-1 rounded-xl border-2 transition-all uppercase ${
                              record.subType === 'salesOut' ? 'bg-orange-500/10 text-orange-400 border-orange-500/30' : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                            }`}>
                              {record.subType === 'salesOut' ? '销售出库' : '转池出库'}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          {isCurrentEditing ? (
                            <input 
                              className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white w-24 mx-auto"
                              value={record.species}
                              onChange={(e) => {
                                const newRecords = [...localRecords];
                                const realIdx = localRecords.indexOf(record);
                                newRecords[realIdx] = { ...newRecords[realIdx], species: e.target.value };
                                setLocalRecords(newRecords);
                              }}
                            />
                          ) : (
                            <span className="font-black text-white text-sm tracking-tight">
                              {record.species === '未知' ? (intakeData[0]?.species || '未知') : record.species}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          {isCurrentEditing ? (
                            <input 
                              className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-emerald-400 w-16 mx-auto font-black"
                              value={record.size}
                              onChange={(e) => {
                                const newRecords = [...localRecords];
                                const realIdx = localRecords.indexOf(record);
                                newRecords[realIdx] = { ...newRecords[realIdx], size: e.target.value };
                                setLocalRecords(newRecords);
                              }}
                            />
                          ) : (
                            <span className="text-xs font-mono text-slate-400 bg-slate-800 px-3 py-0.5 rounded-lg border border-slate-700">{formatFishSize(record.size)}</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          {isCurrentEditing ? (
                            <input 
                              type="number"
                              className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-orange-400 w-20 mx-auto font-black"
                              value={record.amount}
                              onChange={(e) => {
                                const newRecords = [...localRecords];
                                const realIdx = localRecords.indexOf(record);
                                newRecords[realIdx] = { ...newRecords[realIdx], amount: parseFloat(e.target.value) || 0 };
                                setLocalRecords(newRecords);
                              }}
                            />
                          ) : (
                            <span className="text-sm font-black text-orange-400 font-mono tracking-tighter">{(record.amount || 0).toLocaleString()} <span className="text-xs font-bold opacity-60 ml-0.5">斤</span></span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                           {isCurrentEditing ? (
                            <input 
                              className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white w-full"
                              value={record.remarks}
                              onChange={(e) => {
                                const newRecords = [...localRecords];
                                const realIdx = localRecords.indexOf(record);
                                newRecords[realIdx] = { ...newRecords[realIdx], remarks: e.target.value };
                                setLocalRecords(newRecords);
                              }}
                            />
                          ) : (
                            <span className="text-slate-400 text-xs font-medium italic">{record.remarks}</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                           <div className="flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                             {isCurrentEditing ? (
                                <button onClick={() => handleSaveRow(record)} className="p-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-all">
                                  <Save size={12} />
                                </button>
                             ) : (
                               <button onClick={() => setEditingIndex(idx)} className="p-1.5 bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-all">
                                 <Edit3 size={12} />
                               </button>
                             )}
                             <button onClick={() => setDeleteTarget(record)} className="p-1.5 bg-slate-800 text-slate-400 hover:text-red-400 rounded-lg transition-all">
                               <Trash2 size={12} />
                             </button>
                           </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
      
      {deleteTarget && isMounted && createPortal(
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
           <div className="bg-slate-900 border border-slate-700/50 p-6 rounded-2xl shadow-2xl max-w-sm w-full mx-4">
               <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                 <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center text-red-500">
                   <X size={16} />
                 </div>
                 确认删除记录
               </h3>
               <p className="text-slate-400 text-sm mb-6 mt-4">确定要删除这条记录吗？此操作将同步减少相关的仓库库存记录，且不可撤销。</p>
               <div className="flex items-center justify-end gap-3">
                   <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 font-bold text-sm text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-all">取消</button>
                   <button onClick={() => { executeDeleteRecord(deleteTarget); setDeleteTarget(null); }} className="px-4 py-2 font-bold text-sm text-white bg-red-500 hover:bg-red-600 rounded-xl transition-all shadow-lg shadow-red-500/20">确认删除</button>
               </div>
           </div>
        </div>,
        document.body
      )}
    </div>
  );
}

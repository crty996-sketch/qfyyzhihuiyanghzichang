import { TankData } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Settings, Fan, RefreshCw, Filter as FilterIcon, Sun, Search, X, Check } from 'lucide-react';
import { useState, useMemo } from 'react';

import { db } from '../firebase';
import { setDoc, doc } from 'firebase/firestore';

interface EquipmentStatusProps {
  allTanks: TankData[];
  onBack: () => void;
  onUpdateTanks?: (updatedTanks: Record<string, any>) => void;
}

export default function EquipmentStatus({ allTanks, onBack, onUpdateTanks }: EquipmentStatusProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const filteredTanks = useMemo(() => {
    if (!searchQuery.trim()) return allTanks;
    return allTanks.filter(tank => 
      (tank.id || '').toLowerCase().includes((searchQuery || '').toLowerCase())
    );
  }, [allTanks, searchQuery]);

  const handleEquipmentChange = async (tankId: string, equipmentType: string, newStatus: string | number | undefined) => {
    if (!onUpdateTanks) return;

    const tank = allTanks.find(t => t.id === tankId);
    if (!tank) return;

    setIsSaving(true);
    setSaveError(null);

    const updatedEquipment = {
      ...(tank.equipment || {}),
      [equipmentType]: newStatus
    };

    // Link with tank status
    let newTankStatus = tank.status;
    if (newStatus === '故障') {
      newTankStatus = 'maintenance'; // 设备异常
    } else {
      // Check if any other equipment is in fault state
      const hasFault = Object.entries(updatedEquipment).some(([key, val]) => 
        ['filter', 'pump', 'oxygen', 'uv'].includes(key) && val === '故障'
      );
      if (!hasFault && tank.status === 'maintenance') {
        newTankStatus = 'normal'; // Recover to normal if no faults
      }
    }

    const updatedData = {
      status: newTankStatus,
      equipment: updatedEquipment
    };

    // Update local state immediately for fast UI response
    onUpdateTanks({
      [tankId]: updatedData
    });

    // Try to update Firebase
    try {
      await setDoc(doc(db, 'tanks', tankId), updatedData, { merge: true });
      // Brief delay to show "Saved" state
      setTimeout(() => setIsSaving(false), 1500);
    } catch (err: any) {
      console.warn('Firebase update failed, using local state only:', err);
      const errorMsg = err.message || '网络连接错误';
      setSaveError(`保存失败: ${errorMsg}`);
      setIsSaving(false);
      // Automatically clear error after 10 seconds to give time to read
      setTimeout(() => setSaveError(null), 10000);
    }
  };

  const getStatusColor = (status: string) => {
    if (status === '运行中' || status === '自动模式') return { text: 'text-emerald-400', bg: 'bg-emerald-400/10', dot: 'bg-emerald-500' };
    if (status === '待机' || status === '手动模式') return { text: 'text-cyan-400', bg: 'bg-cyan-400/10', dot: 'bg-cyan-500' };
    if (status === '停止') return { text: 'text-slate-500', bg: 'bg-slate-500/10', dot: 'bg-slate-500' };
    if (status === '故障') return { text: 'text-red-400', bg: 'bg-red-400/10', dot: 'bg-red-500 animate-pulse' };
    return { text: 'text-slate-500', bg: 'bg-slate-500/10', dot: 'bg-slate-500' };
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="bg-slate-900/90 border border-slate-700 rounded-3xl p-3 md:p-6 shadow-2xl backdrop-blur-xl relative overflow-hidden flex flex-col h-full ios-bottom"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 relative z-10 border-b border-slate-800 pb-4 gap-4">
        <div className="flex items-center justify-between w-full md:w-auto">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 -ml-2 text-slate-400 hover:text-white md:hidden">
              <ArrowLeft size={20} />
            </button>
            <div className="w-8 h-8 bg-cyan-500/20 rounded-lg hidden md:flex items-center justify-center text-cyan-400">
              <Settings size={18} />
            </div>
            <h2 className="text-lg md:text-xl font-bold text-slate-100 uppercase tracking-tighter">
              机电运行状态
            </h2>
          </div>
          <div className="md:hidden">
            <AnimatePresence mode="wait">
              {isSaving ? (
                <div className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse" />
              ) : (
                <div className="w-2 h-2 bg-emerald-500 rounded-full" />
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
          <AnimatePresence>
            {(isSaving || saveError) && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={`flex items-center gap-2 text-[10px] font-bold px-3 py-1 rounded-full border ${saveError ? 'text-rose-400 bg-rose-500/10 border-rose-500/20' : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'}`}
              >
                {isSaving ? <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" /> : <X size={10} />}
                {isSaving ? "云端同步中..." : saveError}
              </motion.div>
            )}
            {!isSaving && !saveError && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.5 }}
                className="text-slate-500 text-[10px] font-bold tracking-widest uppercase hidden md:block"
              >
                云端已就绪
              </motion.div>
            )}
          </AnimatePresence>
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
            <input 
              type="text"
              placeholder="快速检索池号..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950/50 border border-slate-700 rounded-lg py-2 pl-9 pr-4 text-sm focus:outline-none focus:border-cyan-500 transition-colors font-mono text-slate-300"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                <X size={14} />
              </button>
            )}
          </div>
          <button 
            onClick={onBack}
            className="hidden md:flex items-center gap-2 px-4 py-1.5 bg-emerald-500/80 hover:bg-emerald-500 text-slate-950 rounded-lg transition-all text-xs font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20"
          >
            完成
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 relative z-10 overflow-y-auto flex-1 pr-2 custom-scrollbar pb-10">
        {filteredTanks.map(tank => (
          <div key={tank.id} className={`bg-slate-800/50 border ${tank.status === 'maintenance' ? 'border-red-500/50' : 'border-slate-700'} rounded-2xl p-4 hover:border-cyan-500/50 transition-colors`}>
            <div className="flex justify-between items-center mb-4 border-b border-slate-700/50 pb-2">
              <span className="text-lg font-mono font-bold text-cyan-400">{tank.id}</span>
              <div className={`w-2 h-2 rounded-full ${tank.status === 'normal' ? 'bg-emerald-500 animate-pulse' : tank.status === 'maintenance' ? 'bg-orange-500 animate-pulse' : 'bg-red-500'}`} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { id: 'filter', name: '微滤机', icon: FilterIcon, status: tank.status === 'empty' ? '停止' : (tank.equipment?.filter || '自动模式'), options: ['自动模式', '手动模式', '停止', '故障'] },
                { id: 'pump', name: '循环泵', icon: RefreshCw, status: tank.status === 'empty' ? '停止' : (tank.equipment?.pump || '运行中'), options: ['运行中', '停止', '故障'] },
                { id: 'oxygen', name: '增氧泵', icon: Fan, status: tank.status === 'empty' ? '停止' : (tank.equipment?.oxygen || '运行中'), options: ['运行中', '停止', '故障'] },
                { id: 'uv', name: '紫外杀菌', icon: Sun, status: tank.status === 'empty' ? '停止' : (tank.equipment?.uv || '待机'), options: ['运行中', '待机', '停止', '故障'] },
              ].map(dev => {
                const Icon = dev.icon;
                const colors = getStatusColor(dev.status);
                return (
                  <div key={dev.name} className="flex flex-col items-center justify-center p-2 rounded-xl bg-slate-900/50 border border-slate-700/50 relative group">
                    <div className={`absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full ${colors.dot}`} />
                    <div className={`p-1.5 rounded-lg ${colors.bg} mb-1`}>
                      <Icon size={14} className={colors.text} />
                    </div>
                    <span className="text-[10px] text-slate-400 font-bold mb-0.5">{dev.name}</span>
                    
                    <select 
                      value={dev.status}
                      disabled={tank.status === 'empty'}
                      onChange={(e) => handleEquipmentChange(tank.id, dev.id, e.target.value)}
                      className={`text-[9px] ${colors.text} bg-transparent text-center appearance-none ${tank.status === 'empty' ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:bg-slate-800'} focus:outline-none rounded px-1`}
                    >
                      {dev.options.map(opt => (
                        <option key={opt} value={opt} className="bg-slate-800 text-slate-200">{opt}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 pt-3 border-t border-slate-700/50 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">上次维保:</span>
                <input 
                  type="date" 
                  value={tank.equipment?.lastMaintenance || ''}
                  onChange={(e) => handleEquipmentChange(tank.id, 'lastMaintenance', e.target.value)}
                  className="bg-slate-950/50 border border-slate-700 rounded px-2 py-1 text-slate-300 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div className="text-xs space-y-2">
                <div className="text-slate-500 mb-1">额定功率设置 (kW):</div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-slate-600 text-[10px]">微滤机</span>
                    <input 
                      type="number" 
                      step="0.1"
                      min="0"
                      placeholder="1.5"
                      value={tank.equipment?.powerFilter ?? ''}
                      onChange={(e) => handleEquipmentChange(tank.id, 'powerFilter', e.target.value ? parseFloat(e.target.value) : undefined)}
                      className="bg-slate-950/50 border border-slate-700 rounded px-2 py-1 text-cyan-400 focus:outline-none focus:border-cyan-500 w-full text-center font-mono"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-slate-600 text-[10px]">循环泵</span>
                    <input 
                      type="number" 
                      step="0.1"
                      min="0"
                      placeholder="2.0"
                      value={tank.equipment?.powerPump ?? ''}
                      onChange={(e) => handleEquipmentChange(tank.id, 'powerPump', e.target.value ? parseFloat(e.target.value) : undefined)}
                      className="bg-slate-950/50 border border-slate-700 rounded px-2 py-1 text-cyan-400 focus:outline-none focus:border-cyan-500 w-full text-center font-mono"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-slate-600 text-[10px]">增氧泵</span>
                    <input 
                      type="number" 
                      step="0.1"
                      min="0"
                      placeholder="3.0"
                      value={tank.equipment?.powerOxygen ?? ''}
                      onChange={(e) => handleEquipmentChange(tank.id, 'powerOxygen', e.target.value ? parseFloat(e.target.value) : undefined)}
                      className="bg-slate-950/50 border border-slate-700 rounded px-2 py-1 text-cyan-400 focus:outline-none focus:border-cyan-500 w-full text-center font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

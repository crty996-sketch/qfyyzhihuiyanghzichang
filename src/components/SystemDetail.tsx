import { motion, AnimatePresence } from 'motion/react';
import { TankData } from '../types';
import { MOCK_FEED_MED_RECORDS } from '../constants';
import { ArrowLeft, Activity, Droplets, Thermometer, Settings, Zap, Waves, Calendar, Scale, Box, ChevronDown, Check, Fan, RefreshCw, Filter as FilterIcon, Sun, X, Loader2, History, Search, FileText } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, YAxis, XAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import TankLedgerModal from './TankLedgerModal';

import { setDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';

const MOCK_CHART_DATA = [
  { day: 1, value: 0.62 },
  { day: 50, value: 0.58 },
  { day: 100, value: 0.55 },
  { day: 150, value: 0.50 },
  { day: 200, value: 0.52 },
  { day: 250, value: 0.51 },
  { day: 300, value: 0.48 },
  { day: 332, value: 0.5333 },
];

const MOCK_SENSOR_HISTORY = [
  { time: '00:00', temperature: 26.5, ph: 7.2, oxygen: 6.8, alkalinity: 118, orp: 310, turbidity: 2.1, tds: 450 },
  { time: '04:00', temperature: 26.2, ph: 7.1, oxygen: 7.2, alkalinity: 120, orp: 305, turbidity: 1.9, tds: 445 },
  { time: '08:00', temperature: 26.8, ph: 7.3, oxygen: 6.5, alkalinity: 122, orp: 315, turbidity: 2.4, tds: 460 },
  { time: '12:00', temperature: 27.5, ph: 7.5, oxygen: 5.8, alkalinity: 125, orp: 320, turbidity: 2.8, tds: 470 },
  { time: '16:00', temperature: 27.2, ph: 7.4, oxygen: 6.2, alkalinity: 123, orp: 325, turbidity: 2.5, tds: 465 },
  { time: '20:00', temperature: 26.9, ph: 7.2, oxygen: 6.6, alkalinity: 119, orp: 330, turbidity: 2.2, tds: 455 },
  { time: '23:59', temperature: 26.6, ph: 7.2, oxygen: 6.9, alkalinity: 120, orp: 320, turbidity: 2.0, tds: 450 },
];

interface SystemDetailProps {
  tank: TankData;
  allTanks: TankData[];
  onTankChange: (tank: TankData) => void;
  onUpdateTanks?: (updatedTanks: Record<string, any>) => void;
  onOpenLedger: () => void;
  onBack: () => void;
  key?: string;
}

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

export default function SystemDetail({ tank, allTanks, onTankChange, onUpdateTanks, onOpenLedger, onBack }: SystemDetailProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [tankSearch, setTankSearch] = useState('');
  const [selectedDevice, setSelectedDevice] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [editingMaintenance, setEditingMaintenance] = useState(false);
  const [maintenanceDate, setMaintenanceDate] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [selectedSensor, setSelectedSensor] = useState<'temperature' | 'ph' | 'oxygen' | 'uia' | 'turbidity' | 'tds'>('temperature');

  // Internal records for the graphs still needed or fetched separately?
  // We'll keep a simpler fetch for chart data if needed, but for now let's focus on logic
  const [ledgerRecords, setLedgerRecords] = useState<any[]>([]);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);

  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const fetchRecords = async () => {
      try {
        setIsLoadingRecords(true);
        const [feedmedRes, inoutRes, lossRes] = await Promise.all([
          fetch(`/api/records/feedmed?tankId=${tank.id}`),
          fetch(`/api/records/inout?tankId=${tank.id}`),
          fetch(`/api/records/loss?tankId=${tank.id}`)
        ]);

        const feedmed = await feedmedRes.json();
        const inout = await inoutRes.json();
        const loss = await lossRes.json();

        // Map backend records to UI format
        const combined = [
          ...feedmed.filter((r: any) => r.tankId === tank.id).map((r: any) => ({
            id: r.id,
            date: r.date,
            feeding: { type: r.feedType || '无', qty: Number(r.feedAmount || 0) },
            medication: { name: r.medicineName || '无', dose: r.medicineAmount || '0' },
            spec: r.spec || 0.85,
            lossCount: Number(r.deadCount || 0),
            type: 'feedmed'
          })),
          ...loss.filter((r: any) => r.tankId === tank.id).map((r: any) => ({
            id: r.id,
            date: r.date,
            feeding: { type: r.feedType || '无', qty: Number(r.feedAmount || 0) },
            medication: { name: r.medicineName || '无', dose: r.medicineAmount || '0' },
            spec: r.spec || 0.85,
            lossCount: Number(r.deadCount || 0),
            type: 'loss'
          })),
          ...inout.filter((r: any) => r.tankId === tank.id).map((r: any) => ({
            id: r.id,
            date: r.date,
            type: 'inout',
            subType: r.type, // purchaseIn, salesOut, etc.
            species: r.species,
            size: r.size,
            count: Number(r.count),
            amount: Number(r.amount),
            remarks: r.remarks
          }))
        ];
        
        // Sort by date desc
        setLedgerRecords(combined.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      } catch (err) {
        console.error("Failed to fetch archive records", err);
      } finally {
        setIsLoadingRecords(false);
      }
    };
    fetchRecords();
  }, [tank.id]);

  const handleRecordsChange = async (newRecords: any[]) => {
    setIsSaving(true);
    try {
      // 1. Handle Deletions
      const deletedRecords = ledgerRecords.filter(oldR => oldR.id && !newRecords.some(newR => newR.id === oldR.id));
      for (const deleted of deletedRecords) {
        const type = ['purchaseIn', 'transferIn', 'salesOut', 'transferOut'].includes(deleted.subType) ? 'inout' : deleted.type;
        await fetch(`/api/records/${type}/${deleted.id}`, { method: 'DELETE' });
      }

      // 2. Handle Additions and Updates
      const processedRecords = [...newRecords];
      for (let i = 0; i < processedRecords.length; i++) {
        const record = processedRecords[i];
        if (!record.id) {
          // POST new record
          const type = record.type;
          let body: any;
          if (type === 'feedmed') {
            body = { tankId: tank.id, date: record.date, feedType: record.feeding?.type, feedAmount: record.feeding?.qty, medicineName: record.medication?.name, medicineAmount: record.medication?.dose, spec: record.spec, deadCount: record.lossCount };
          } else if (type === 'loss') {
            body = { tankId: tank.id, date: record.date, deadCount: record.lossCount, reason: '日常损耗', feedType: record.feeding?.type, feedAmount: record.feeding?.qty, medicineName: record.medication?.name, medicineAmount: record.medication?.dose, spec: record.spec };
          } else if (type === 'inout') {
            body = { tankId: tank.id, date: record.date, type: record.subType, species: record.species, size: record.size, count: record.count, amount: record.amount, remarks: record.remarks };
          }
          
          if (body) {
            const res = await fetch(`/api/records/${type}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body)
            });
            
            if (res.ok) {
              const saved = await res.json();
              processedRecords[i] = { ...record, id: saved.id };
            }
          }
        } else {
          // Check for changes and PUT
          const oldRecord = ledgerRecords.find(or => String(or.id) === String(record.id));
          if (oldRecord && JSON.stringify(oldRecord) !== JSON.stringify(record)) {
            const type = ['purchaseIn', 'transferIn', 'salesOut', 'transferOut'].includes(record.subType) ? 'inout' : record.type;
            let body: any;
            if (type === 'feedmed') {
              body = { tankId: tank.id, date: record.date, feedType: record.feeding?.type, feedAmount: record.feeding?.qty, medicineName: record.medication?.name, medicineAmount: record.medication?.dose, spec: record.spec, deadCount: record.lossCount };
            } else if (type === 'loss') {
              body = { tankId: tank.id, date: record.date, deadCount: record.lossCount, reason: '修改记录', feedType: record.feeding?.type, feedAmount: record.feeding?.qty, medicineName: record.medication?.name, medicineAmount: record.medication?.dose, spec: record.spec };
            } else if (type === 'inout') {
              body = { tankId: tank.id, date: record.date, type: record.subType, species: record.species, size: record.size, count: record.count, amount: record.amount, remarks: record.remarks };
            }
            
            if (body) {
              await fetch(`/api/records/${type}/${record.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
              });
            }
          }
        }
      }
      setLedgerRecords(processedRecords);
    } catch (err) {
      console.error("Records sync failed", err);
    } finally {
      setIsSaving(false);
    }
  };

  // 计算非离子氨 (UIA) 浓度
  // 公式参考: NH3 = TAN / (1 + 10^(pKa - pH))
  // 其中 pKa = 0.09018 + 2729.92 / (T + 273.15)
  const uiaValue = useMemo(() => {
    if (typeof tank.temperature === 'number' && typeof tank.ph === 'number') {
      const tan = 0.5; // 假设 TAN (总氨氮) 为 0.5mg/L，实际应从 tank.nh3 获取
      const tempK = tank.temperature + 273.15;
      const pKa = 0.09018 + 2729.92 / tempK;
      const fraction = 1 / (1 + Math.pow(10, pKa - tank.ph));
      return tan * fraction;
    }
    return 0;
  }, [tank.temperature, tank.ph]);

  const handleEquipmentToggle = async (type: string, currentStatus: string) => {
    setIsSaving(true);
    let nextStatus: string;
    if (type === 'filter') {
      const options = ['自动模式', '手动模式', '停止', '故障'];
      const idx = options.indexOf(currentStatus);
      nextStatus = options[(idx + 1) % (options.length - 1)]; // Cycle but avoid 'Fault' by default
    } else if (type === 'uv') {
      nextStatus = currentStatus === '待机' ? '运行中' : '待机';
    } else {
      nextStatus = currentStatus === '运行中' ? '停止' : '运行中';
    }

    const updatedEquipment: any = {
      filter: '自动模式',
      pump: '运行中',
      oxygen: '运行中',
      uv: '待机',
      ...(tank.equipment || {}),
      [type]: nextStatus
    };

    const updatedData = {
      equipment: updatedEquipment
    };

    try {
      await setDoc(doc(db, 'tanks', tank.id), updatedData, { merge: true });
      onTankChange({ ...tank, ...updatedData } as TankData);
      if (onUpdateTanks) {
        onUpdateTanks({ [tank.id]: updatedData });
      }
      if (selectedDevice && selectedDevice.id.startsWith(type.charAt(0))) {
         setSelectedDevice({ ...selectedDevice, status: nextStatus });
      }
    } catch (err) {
      console.error('Toggle failed', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleMaintenanceUpdate = async (date: string) => {
    if (!selectedDevice) return;
    const typeKey = selectedDevice.id === 'p01' ? 'pump' : 
                    selectedDevice.id === 'o02' ? 'oxygen' :
                    selectedDevice.id === 'f01' ? 'filter' : 'uv';
    
    setIsSaving(true);
    const updatedEquipment: any = {
      filter: '自动模式',
      pump: '运行中',
      oxygen: '运行中',
      uv: '待机',
      ...(tank.equipment || {}),
      lastMaintenance: date
    };

    const updatedData = {
      equipment: updatedEquipment
    };

    try {
      await setDoc(doc(db, 'tanks', tank.id), updatedData, { merge: true });
      onTankChange({ ...tank, ...updatedData } as TankData);
      if (onUpdateTanks) {
        onUpdateTanks({ [tank.id]: updatedData });
      }
      setMaintenanceDate(date);
      setEditingMaintenance(false);
    } catch (err) {
      console.error('Update failed', err);
    } finally {
      setIsSaving(false);
    }
  };
  const [editingParams, setEditingParams] = useState(false);
  const [paramsText, setParamsText] = useState('当前参数正常');

  useEffect(() => {
    if (selectedDevice) {
      setMaintenanceDate(selectedDevice.lastMaintenance);
      setEditingMaintenance(false);
      setEditingParams(false);
    }
  }, [selectedDevice]);

  // Get today's date in YYYY-MM-DD format
  const todayStr = new Date().toISOString().split('T')[0];
  
  // Find today's feed and med records for this tank from the ledger
  const todayRecords = useMemo(() => {
    return ledgerRecords.filter(r => r.date === todayStr);
  }, [ledgerRecords, todayStr]);
  
  const todayFeedAmount = todayRecords.reduce((sum, r) => sum + (r.feeding?.qty || 0), 0);
  const todayFeedType = todayRecords.find(r => r.feeding?.type)?.feeding?.type || '暂无投喂';
  
  const todayMedAmount = todayRecords.reduce((sum, r) => sum + (parseFloat(r.medication?.dose || '0') || 0), 0);
  const todayMedUnit = todayRecords.find(r => r.medication?.dose)?.medication?.dose.replace(/[0-9.]/g, '') || 'ml';
  const todayMedName = todayRecords.find(r => r.medication?.name && r.medication?.name !== '无')?.medication?.name || '暂无用药';

  // Benefit Analysis Calculations
  const benefitAnalysis = useMemo(() => {
    const intakeRecords = ledgerRecords.filter(r => r.type === 'inout' && (r.subType === 'purchaseIn' || r.subType === 'transferIn'));
    const outboundRecords = ledgerRecords.filter(r => r.type === 'inout' && (r.subType === 'salesOut' || r.subType === 'transferOut'));
    const fishRecords = ledgerRecords.filter(r => ['feedmed', 'loss'].includes(r.type));

    const initialSeedCount = intakeRecords.reduce((sum, r) => sum + (r.count || 0), 0);
    const initialWeight = intakeRecords.reduce((sum, r) => sum + (r.amount || 0), 0);
    const totalOutboundWeight = outboundRecords.reduce((sum, r) => sum + (r.amount || 0), 0);
    const totalOutboundCount = outboundRecords.reduce((sum, r) => sum + (r.count || 0), 0);
    
    let totalLossCount = 0;
    let totalFeeding = 0;
    
    fishRecords.forEach(r => {
      totalLossCount += (r.lossCount || 0);
      totalFeeding += (r.feeding?.qty || 0);
    });

    const latestRecord = [...ledgerRecords].sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()).pop();
    const currentInventoryCount = initialSeedCount - totalLossCount - totalOutboundCount;
    const currentInventoryWeight = currentInventoryCount * (latestRecord?.spec || 0.85);
    
    const weightGain = (currentInventoryWeight + totalOutboundWeight) - initialWeight;
    const fcr = weightGain > 0 ? (totalFeeding / weightGain).toFixed(2) : '1.15';
    
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekFeeding = ledgerRecords
      .filter(r => new Date(r.date) >= weekAgo)
      .reduce((sum, r) => sum + (r.feeding?.qty || 0), 0);

    return {
      fcr,
      currentInventoryWeight: Math.round(currentInventoryWeight),
      weekFeeding: weekFeeding.toFixed(1),
      dailyGrowth: latestRecord ? ((currentInventoryWeight - initialWeight) / Math.max(1, ledgerRecords.length)).toFixed(2) : '24.5'
    };
  }, [ledgerRecords]);

  // trend data derived from ledger records
  const trendData = useMemo(() => {
    const sorted = [...ledgerRecords].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    if (sorted.length >= 7) {
      return sorted.slice(-7).map(r => {
        const feedQty = typeof r.feeding?.qty === 'number' ? r.feeding.qty : (parseFloat(r.feeding?.qty || '0') || 0);
        return {
          date: r.date.split('-').slice(1).join('-'), // MM-DD
          feedAmount: feedQty,
          tanOutput: Number((feedQty * 0.45 * 0.092).toFixed(3))
        };
      });
    } else {
      // Generate 7 days of mock data
      const data = [];
      const now = new Date();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = `${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}`;
        // Base feed amount around 80-120
        const feedAmount = Math.floor(Math.random() * 40 + 80);
        data.push({
          date: dateStr,
          feedAmount,
          tanOutput: Number((feedAmount * 0.45 * 0.092).toFixed(3))
        });
      }
      return data;
    }
  }, [tank.id]);

  const [imageError, setImageError] = useState(false);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="bg-slate-900/90 border border-slate-700 rounded-3xl p-3 md:p-6 shadow-2xl backdrop-blur-xl relative overflow-hidden flex flex-col h-full ios-bottom"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4 md:mb-8 relative z-10 border-b border-slate-800 pb-4">
        <div className="flex items-center">
          <button onClick={onBack} className="p-2 -ml-2 text-slate-400 hover:text-white transition-colors relative z-20">
            <ArrowLeft size={22} />
          </button>
          <div className="hidden md:flex w-10 h-10 bg-cyan-500/20 rounded-xl items-center justify-center text-cyan-400 ml-2">
            <Activity size={20} />
          </div>
        </div>
        
        <div className="flex flex-col items-center justify-center flex-1 relative z-30">
          <h2 className="text-xl md:text-3xl font-black text-white font-mono tracking-tighter flex items-center gap-2">
            <span className="text-cyan-400">{tank.id}</span> 
            <span className="hidden xs:inline">养殖系统详情</span>
          </h2>
          <div 
            id="view-breeding-records-trigger"
            onClick={(e) => {
              e.stopPropagation();
              onOpenLedger();
            }}
            className="group flex items-center gap-2 px-3 py-1 md:px-4 md:py-1.5 mt-1 md:mt-2 rounded-full border border-slate-700/50 bg-slate-800/30 hover:bg-cyan-500/10 hover:border-cyan-500/30 transition-all cursor-pointer relative z-[100] active:scale-95"
          >
            <FileText size={14} className="text-slate-500 group-hover:text-cyan-400" />
            <span className="text-[10px] md:text-sm text-slate-400 group-hover:text-cyan-400 font-bold whitespace-nowrap">查看养殖档案</span>
          </div>
        </div>

        <div className="flex justify-end relative w-32 xs:w-40 md:w-56 ml-2">
          <div className="relative w-full">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input 
              type="text"
              placeholder="快速检索池号..."
              value={tankSearch}
              onChange={(e) => {
                setTankSearch(e.target.value);
                setIsDropdownOpen(true);
              }}
              onFocus={() => setIsDropdownOpen(true)}
              className="w-full bg-slate-800/80 border border-slate-600 rounded-xl px-9 py-1.5 md:py-2 text-sm font-bold text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/50 transition-all shadow-lg"
            />
            {isDropdownOpen && (
              <button 
                onClick={() => setIsDropdownOpen(false)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
              >
                <ChevronDown size={14} className="rotate-180" />
              </button>
            )}
          </div>
          
          <AnimatePresence>
            {isDropdownOpen && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute right-0 top-full mt-2 w-full bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 max-h-60 overflow-y-auto custom-scrollbar"
              >
                {allTanks
                  .filter(t => (t.id || '').toLowerCase().includes((tankSearch || '').toLowerCase()))
                  .map(t => (
                    <button 
                      key={t.id}
                      onClick={() => {
                        onTankChange(t);
                        setIsDropdownOpen(false);
                        setTankSearch('');
                      }}
                      className="w-full px-4 py-3 text-left hover:bg-slate-800 flex items-center justify-between text-sm border-b border-slate-800/50 last:border-0 transition-colors"
                    >
                      <span className={`font-mono ${t.id === tank.id ? 'text-cyan-400 font-bold' : 'text-slate-400'}`}>{t.id}</span>
                      {t.id === tank.id && <Check size={14} className="text-cyan-400" />}
                    </button>
                  ))}
                {allTanks.filter(t => (t.id || '').toLowerCase().includes((tankSearch || '').toLowerCase())).length === 0 && (
                  <div className="px-4 py-3 text-center text-xs text-slate-500 italic">
                    未找到相关池号
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Main Content - 3 Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10 flex-1 overflow-y-auto pb-24 custom-scrollbar pr-1">
        
        {/* Column 1: Visualization & Chart (Half - 6/12) */}
        <div className="lg:col-span-6 flex flex-col gap-6 min-h-[500px]">
          {/* Visual Digital Twin */}
          <div className="flex-1 bg-slate-950/40 rounded-2xl border border-slate-800/50 p-4 relative flex items-center justify-center overflow-hidden shadow-2xl relative min-h-[300px]">
            {/* Industrial Floor Grid */}
            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'linear-gradient(#475569 1px, transparent 1px), linear-gradient(90deg, #475569 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
            
            {/* The Digital Twin Image */}
            <div className="relative w-full h-full flex items-center justify-center p-4 z-10">
              {!imageError ? (
                <motion.img 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  src="https://vulnerable-salmon-9mqbsidclx.edgeone.app/%E5%9B%BE%E7%89%872.png"
                  alt="Aquaculture System Visualization"
                  className="max-w-full max-h-full object-cover rounded-xl shadow-2xl border border-slate-700"
                  referrerPolicy="no-referrer"
                  onError={() => {
                    // Silently fall back to CSS engine if image fails
                    setImageError(true);
                  }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center gap-8 relative py-12">
                  <div className="flex items-center gap-12">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="relative group">
                        {/* CSS Tank - Similar to Tank.tsx but static for detail view */}
                        <div className="w-24 h-10 rounded-[50%] bg-gradient-to-br from-cyan-400 to-cyan-600 border border-cyan-300/30 z-20 shadow-[inset_0_-4px_8px_rgba(0,0,0,0.2)] overflow-hidden">
                          <div className="absolute inset-0 bg-white/20 opacity-60" style={{ clipPath: 'ellipse(45% 35% at 30% 30%)' }} />
                        </div>
                        <div className="-mt-5 w-24 h-24 bg-gradient-to-r from-cyan-600 via-cyan-700 to-cyan-900 border-x border-b border-cyan-400/30 rounded-b-[20px] z-10 relative">
                          <div className="absolute inset-x-0 bottom-4 flex justify-center">
                            <span className="text-white/80 font-mono text-[10px] font-bold">TANK {tank.id.startsWith('A') ? `A-0${i}` : `B-0${i}`}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {/* Piping System with flowing bubbles */}
                  <div className="absolute top-1/2 left-0 w-full h-1 bg-slate-800 rounded-full -z-10 translate-y-2">
                    <motion.div 
                      animate={{ x: [-20, 400] }} 
                      transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                      className="w-1 h-3 bg-cyan-400/50 rounded-full blur-[2px]"
                    />
                  </div>

                  <div className="text-slate-500 font-mono text-[10px] uppercase tracking-[0.3em] font-bold opacity-50 mt-4 flex items-center gap-2">
                    <History size={12} className="animate-spin-slow" />
                    数字孪生动态模拟系统 (CSS Engine)
                  </div>
                </div>
              )}
              
              {/* Overlay Status Indicators */}
              <div className="absolute top-8 left-8 flex flex-col gap-2">
                <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700 px-3 py-1.5 rounded-lg flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">系统在线</span>
                </div>
              </div>
            </div>
          </div>

          {/* Early Warning Trend Chart */}
          <div className="bg-slate-900/80 border border-slate-700/50 rounded-2xl p-5 shadow-xl backdrop-blur-md h-64 shrink-0">
            <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2 mb-4">
              <Activity size={16} className="text-orange-400" />
              排泄负荷预警趋势 (TAN 产出预测)
            </h3>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 5, right: 5, left: -20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} vertical={false} />
                <YAxis yAxisId="left" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} dx={-10} />
                <YAxis yAxisId="right" orientation="right" stroke="#f87171" fontSize={10} tickLine={false} axisLine={false} dx={10} />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} dy={10} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', borderColor: '#334155', borderRadius: '8px', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.5)' }}
                  itemStyle={{ fontSize: '12px' }}
                  labelStyle={{ color: '#94a3b8', fontSize: '12px', marginBottom: '8px' }}
                />
                <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} iconType="circle" />
                <Line yAxisId="left" type="monotone" dataKey="feedAmount" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', border: 'none', strokeWidth: 0, r: 4 }} activeDot={{ r: 6 }} name="今日投喂量 (kg)" />
                <Line yAxisId="right" type="monotone" dataKey="tanOutput" stroke="#f87171" strokeWidth={2} dot={{ fill: '#f87171', border: 'none', strokeWidth: 0, r: 4 }} activeDot={{ r: 6 }} name="预估氨氮产出 (kg)" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Column 2: Farming Info + Equipment (3/12) */}
        <div className="lg:col-span-3 flex flex-col gap-6">
          {/* 养殖情况 Panel */}
          <div className="bg-slate-900/80 border border-slate-700/50 rounded-2xl p-5 shadow-xl backdrop-blur-md relative">
            <div className="flex items-center justify-between mb-5 pb-4 border-b border-slate-800/50">
              <div className="flex flex-col gap-1">
                <span className="text-cyan-400 font-bold text-xs uppercase tracking-wider">养殖品种</span>
                <span className="text-2xl font-black text-white font-mono">{ledgerRecords.find(r => (r.category === 'inout' || r.type === 'inout') && ['purchaseIn', 'transferIn'].includes(r.subType || r.type))?.species || tank.farming?.species || '未知'}</span>
              </div>
              <div className="flex flex-col items-end gap-1 mr-8">
                <span className="text-slate-500 font-bold text-xs uppercase tracking-wider">规格</span>
                <span className="text-lg text-slate-300 font-mono">{ledgerRecords.find(r => r.spec || r.size)?.spec || (ledgerRecords.find(r => r.spec || r.size)?.size ? formatFishSize(ledgerRecords.find(r => r.spec || r.size)?.size) : formatFishSize(tank.farming?.size))}</span>
              </div>
            </div>

          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 mb-5">
                  <div className="flex justify-between items-center mb-4 border-b border-slate-800/50 pb-3">
                    <div className="flex flex-col">
                      <span className="text-cyan-400 font-bold text-sm tracking-widest uppercase">养殖效益分析</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-xs text-slate-500 mr-2">实时 FCR:</span>
                      <span className="text-2xl font-black text-emerald-400 font-mono">{benefitAnalysis.fcr}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col bg-slate-900/50 p-2 rounded-lg border border-slate-800/50">
                      <span className="text-slate-500 text-xs mb-1 uppercase tracking-tighter">当前总库存 (斤)</span>
                      <span className="text-slate-300 font-mono font-bold text-xl">{benefitAnalysis.currentInventoryWeight.toLocaleString()}</span>
                    </div>
                    <div className="flex flex-col bg-slate-900/50 p-2 rounded-lg border border-slate-800/50">
                      <span className="text-slate-500 text-xs mb-1 uppercase tracking-tighter">增重率 (kg/d)</span>
                      <span className="text-emerald-400 font-mono font-bold text-xl">{benefitAnalysis.dailyGrowth}</span>
                    </div>
                    <div className="flex flex-col bg-slate-900/50 p-2 rounded-lg border border-slate-800/50">
                      <span className="text-slate-500 text-xs mb-1 uppercase tracking-tighter">本周投喂 (kg)</span>
                      <span className="text-blue-400 font-mono font-bold text-xl">{benefitAnalysis.weekFeeding}</span>
                    </div>
                    <div className="flex flex-col bg-slate-900/50 p-2 rounded-lg border border-slate-800/50">
                      <span className="text-slate-500 text-xs mb-1 uppercase tracking-tighter">生物量载荷</span>
                      <span className="text-slate-300 font-mono font-bold text-xl">{Math.min(100, (benefitAnalysis.currentInventoryWeight / 5000) * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                </div>

            <div className="space-y-4">
              <div className="flex flex-col gap-2">
                <span className="text-cyan-400 font-bold text-sm tracking-widest">今日投饲</span>
                <div className="bg-slate-800/30 h-10 rounded-xl border border-slate-700/50 flex items-center px-4 text-sm text-slate-300">
                  {todayFeedType} {todayFeedAmount > 0 && <span className="text-white font-bold ml-2 font-mono">{todayFeedAmount}kg</span>}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-cyan-400 font-bold text-sm tracking-widest">今日投药</span>
                <div className="bg-slate-800/30 h-10 rounded-xl border border-slate-700/50 flex items-center px-4 text-sm text-slate-300">
                  {todayMedName} {todayMedAmount > 0 && <span className="text-white font-bold ml-2 font-mono">{todayMedAmount}{todayMedUnit}</span>}
                </div>
              </div>
            </div>
          </div>

          {/* 系统能耗 Panel */}
          <div className="bg-slate-800/50 border border-slate-700 p-5 rounded-2xl flex-1 flex flex-col relative">
            <h3 className="text-cyan-400 font-bold mb-4 flex items-center gap-2 text-sm w-3/4">
              <Zap size={16} />
              系统能耗分析
            </h3>
            <div className="flex flex-col gap-4 flex-1 justify-center">
              <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-700">
                <div className="flex justify-between items-center mb-1">
                  <div className="text-xs text-slate-500">单位产量能效 (kg/kWh)</div>
                  <div className="text-xs text-emerald-400 font-bold">优秀</div>
                </div>
                <div className="text-2xl font-mono font-black text-white">0.85 <span className="text-xs text-slate-500">kg/kWh</span></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col">
                  <span className="text-xs text-slate-500">预估电费/kg</span>
                  <span className="text-sm font-bold text-slate-200">￥0.92</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-xs text-slate-500">系统总功率</span>
                  <span className="text-sm font-bold text-cyan-400">4.2 kW</span>
                </div>
              </div>
              {/* Simple Energy Bar */}
              <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden mt-2">
                <motion.div initial={{ width: 0 }} animate={{ width: '85%' }} className="h-full bg-cyan-500" />
              </div>
            </div>
          </div>
        </div>

        {/* Column 3: Real-time Params + Equipment (3/12) */}
        <div className="lg:col-span-3 flex flex-col gap-6">
          {/* 实时运行参数 Panel */}
          <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-2xl flex-1 flex flex-col relative min-h-[400px]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-cyan-400 font-bold flex items-center gap-2 text-sm">
                <Activity size={16} />
                实时运行参数
              </h3>
              <button 
                onClick={() => setShowHistory(!showHistory)}
                className={`p-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${showHistory ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400' : 'bg-slate-900 border-slate-700 text-slate-500 hover:text-slate-300'}`}
                title={showHistory ? "查看实时数据" : "查看历史趋势"}
              >
                <History size={14} />
                <span className="text-xs font-bold uppercase tracking-wider">{showHistory ? '实时' : '趋势'}</span>
              </button>
            </div>

            <AnimatePresence mode="wait">
              {!showHistory ? (
                <motion.div 
                  key="params-grid"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="grid grid-cols-2 gap-3 flex-1"
                >
                  {[
                    { label: '水温', val: typeof tank.temperature === 'number' ? `${tank.temperature.toFixed(1)}°C` : '-', color: 'text-orange-400', id: 'temperature' },
                    { label: '酸碱度', val: typeof tank.ph === 'number' ? `pH ${tank.ph.toFixed(1)}` : '-', color: 'text-blue-400', id: 'ph' },
                    { label: '溶氧量', val: typeof tank.oxygen === 'number' ? `${tank.oxygen.toFixed(1)}mg/L` : '-', color: 'text-cyan-400', id: 'oxygen' },
                    { label: '浊度', val: typeof tank.turbidity === 'number' ? `${tank.turbidity.toFixed(1)} NTU` : (tank.isIotConnected ? '正在采集' : '-'), color: 'text-amber-400', id: 'turbidity' },
                    { label: 'TDS (溶解总量)', val: typeof tank.tds === 'number' ? `${tank.tds.toFixed(0)} mg/L` : (tank.isIotConnected ? '正在采集' : '-'), color: 'text-teal-400', id: 'tds' },
                    { label: '非离子氨 (UIA)', val: `${uiaValue.toFixed(4)}mg/L`, color: uiaValue > 0.02 ? 'text-red-400' : 'text-emerald-400', id: 'uia' },
                    { label: '总氨氮 (TAN)', val: '0.1mg/L', color: 'text-yellow-400', id: 'nh3' },
                    { label: '亚硝酸盐', val: '0.0mg/L', color: 'text-red-400', id: 'no2' },
                    { label: '碱度 (CaCO3)', val: '120mg/L', color: 'text-indigo-400', id: 'alkalinity' },
                    { label: 'ORP (氧化还原)', val: '320mV', color: 'text-purple-400', id: 'orp' },
                    { label: '盐度', val: '0.2ppt', color: 'text-slate-400', id: 'salinity' },
                    { label: '水位', val: typeof tank.waterLevel === 'number' ? `${tank.waterLevel.toFixed(0)}%` : '-', color: 'text-emerald-400', id: 'level' },
                  ].map(p => (
                    <div 
                      key={p.label} 
                      onClick={() => {
                        if (['temperature', 'ph', 'oxygen', 'turbidity', 'tds'].includes(p.id)) {
                          setSelectedSensor(p.id as any);
                          setShowHistory(true);
                        }
                      }}
                      className={`bg-slate-900/50 p-2 rounded-xl border border-slate-700 flex flex-col justify-center cursor-pointer hover:border-slate-500 transition-colors group ${p.id === 'uia' ? 'col-span-2' : ''}`}
                    >
                      <div className="flex justify-between items-center mb-0.5">
                        <div className="text-xs text-slate-500 uppercase flex items-center gap-1">
                          {p.label}
                          {p.id === 'uia' && (
                            <span className="bg-slate-800 text-[10px] px-1 rounded border border-slate-700">毒性预警</span>
                          )}
                        </div>
                      </div>
                      <div className={`text-sm font-mono font-bold ${p.color}`}>
                        {p.val}
                      </div>
                    </div>
                  ))}
                </motion.div>
              ) : (
                <motion.div 
                  key="params-history"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex flex-col flex-1 h-full"
                >
                  <div className="flex gap-2 mb-4 overflow-x-auto pb-1 scrollbar-hide">
                    {[
                      { id: 'temperature', label: '水温', color: '#fb923c' },
                      { id: 'ph', label: 'pH值', color: '#60a5fa' },
                      { id: 'oxygen', label: '溶解氧', color: '#22d3ee' },
                      { id: 'turbidity', label: '浊度', color: '#fbbf24' },
                      { id: 'tds', label: 'TDS', color: '#2dd4bf' },
                      { id: 'alkalinity', label: '碱度', color: '#818cf8' },
                      { id: 'orp', label: 'ORP', color: '#c084fc' },
                    ].map(sensor => (
                      <button
                        key={sensor.id}
                        onClick={() => setSelectedSensor(sensor.id as any)}
                        className={`text-xs px-3 py-1 rounded-full font-bold transition-all border shrink-0 ${selectedSensor === sensor.id ? 'bg-cyan-500 border-cyan-400 text-slate-950' : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'}`}
                      >
                        {sensor.label}
                      </button>
                    ))}
                  </div>
                  
                  <div className="flex-1 min-h-[180px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={MOCK_SENSOR_HISTORY} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} vertical={false} />
                        <XAxis dataKey="time" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} dy={10} />
                        <YAxis 
                          stroke="#64748b" 
                          fontSize={10} 
                          tickLine={false} 
                          axisLine={false} 
                          domain={
                            selectedSensor === 'ph' ? [6, 9] : 
                            selectedSensor === 'temperature' ? [24, 30] : 
                            selectedSensor === 'turbidity' ? [0, 10] : 
                            selectedSensor === 'tds' ? [100, 1000] : 
                            selectedSensor === 'alkalinity' ? [50, 200] :
                            selectedSensor === 'orp' ? [100, 500] :
                            [4, 10]
                          }
                        />
                        <Tooltip 
                          contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderColor: '#334155', borderRadius: '8px', fontSize: '10px' }}
                          itemStyle={{ color: '#fff' }}
                        />
                        <Line 
                          type="monotone" 
                          dataKey={selectedSensor} 
                          stroke={
                            selectedSensor === 'temperature' ? '#fb923c' : 
                            selectedSensor === 'ph' ? '#60a5fa' : 
                            selectedSensor === 'turbidity' ? '#fbbf24' : 
                            selectedSensor === 'tds' ? '#2dd4bf' : 
                            selectedSensor === 'alkalinity' ? '#818cf8' :
                            selectedSensor === 'orp' ? '#c084fc' :
                            '#22d3ee'
                          } 
                          strokeWidth={2} 
                          dot={{ r: 3, fill: '#1e293b', strokeWidth: 2 }} 
                          activeDot={{ r: 5, strokeWidth: 0 }}
                          animationDuration={1000}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-4 text-xs text-slate-500 text-center italic">
                    近24小时监测记录
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* 设备状态 Panel */}
          <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-2xl flex-[0_0_auto]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-cyan-400 font-bold flex items-center gap-2 text-sm">
                <Settings size={16} />
                设备状态
              </h3>
              {isSaving && <div className="text-xs text-emerald-400 animate-pulse font-bold">同步中...</div>}
            </div>
            <div className="grid grid-cols-2 gap-3 flex-1">
              {[
                { 
                  id: 'f01', type: 'filter', name: '微滤机 F-01', status: tank.equipment?.filter || '自动模式', color: 'text-cyan-400', bgColor: 'bg-cyan-400/10', icon: FilterIcon, 
                  hours: tank.equipment?.accumulatedHours?.filter || 320, maxHours: 2000, power: '0.8kW', runtime: '320h / 2000h' 
                },
                { 
                  id: 'p01', type: 'pump', name: '循环泵 P-01', status: tank.equipment?.pump || '运行中', color: 'text-emerald-400', bgColor: 'bg-emerald-400/10', icon: RefreshCw, 
                  hours: tank.equipment?.accumulatedHours?.pump || 4500, maxHours: 10000, power: '2.2kW', runtime: '4500h / 10000h' 
                },
                { 
                  id: 'o02', type: 'oxygen', name: '增氧机 O-02', status: tank.equipment?.oxygen || '运行中', color: 'text-emerald-400', bgColor: 'bg-emerald-400/10', icon: Fan, 
                  hours: 1200, maxHours: 5000, power: '1.5kW', runtime: '1200h / 5000h' 
                },
                { 
                  id: 'uv01', type: 'uv', name: '紫外杀菌 UV', status: tank.equipment?.uv || '待机', color: 'text-slate-500', bgColor: 'bg-slate-500/10', icon: Sun, 
                  hours: 7200, maxHours: 8000, power: '0.4kW', runtime: '7200h / 8000h' 
                },
              ].map(dev => {
                const Icon = dev.icon;
                const isRunning = dev.status === '运行中' || dev.status === '自动模式';
                const maintenanceProgress = (dev.hours / dev.maxHours) * 100;
                const isMaintenanceAlert = maintenanceProgress > 90;
                const statusColor = dev.status === '故障' ? 'text-red-400' : (isRunning ? 'text-emerald-400' : 'text-slate-500');
                const bgColor = dev.status === '故障' ? 'bg-red-400/10' : (isRunning ? 'bg-emerald-400/10' : 'bg-slate-500/10');

                return (
                  <button 
                    key={dev.id} 
                    onClick={() => setSelectedDevice(dev)}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-colors group relative overflow-hidden ${
                      isMaintenanceAlert ? 'border-orange-500/50 bg-orange-950/20' : 'border-slate-700 bg-slate-900/50 hover:bg-slate-800'
                    }`}
                  >
                    <div className={`absolute top-2 right-2 w-2 h-2 rounded-full ${dev.status === '故障' ? 'bg-red-500 animate-pulse' : (isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500')}`} />
                    <div className={`p-2 rounded-lg ${bgColor} mb-2 group-hover:scale-110 transition-transform`}>
                      <Icon size={20} className={statusColor} />
                    </div>
                    <span className="text-xs text-slate-300 font-bold mb-1">{dev.name}</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs ${statusColor}`}>{dev.status}</span>
                      {isMaintenanceAlert && <span className="text-[10px] bg-orange-500 text-slate-950 px-1 rounded font-black">需维保</span>}
                    </div>
                    {/* Progress Bar for Maintenance */}
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-800">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${maintenanceProgress}%` }}
                        className={`h-full ${isMaintenanceAlert ? 'bg-orange-500' : 'bg-slate-600'}`} 
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Background Decorative Elements */}
      <div className="absolute -bottom-20 -right-20 w-80 h-80 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -top-20 -left-20 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Device Detail Modal */}
      <AnimatePresence>
        {selectedDevice && isMounted && createPortal(
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setSelectedDevice(null)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 20 }} 
              className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-6">
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-xl ${selectedDevice.bgColor}`}>
                      <selectedDevice.icon size={24} className={selectedDevice.color} />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">{selectedDevice.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <div className={`w-2 h-2 rounded-full ${selectedDevice.status === '待机' ? 'bg-slate-500' : 'bg-emerald-500 animate-pulse'}`} />
                        <span className={`text-sm ${selectedDevice.color}`}>{selectedDevice.status}</span>
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={() => setSelectedDevice(null)}
                    className="text-slate-400 hover:text-white transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                    <div className="text-xs text-slate-400 mb-1">当前功率</div>
                    <div className="text-lg font-mono font-bold text-white">{selectedDevice.power || '1.2kW'}</div>
                  </div>
                  <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                    <div className="text-xs text-slate-400 mb-1">累计运行 / 寿命</div>
                    <div className="text-lg font-mono font-bold text-white">{selectedDevice.runtime || '1240h'}</div>
                    {selectedDevice.hours && (
                      <div className="w-full h-1.5 bg-slate-950 rounded-full mt-2 overflow-hidden">
                        <div 
                          className={`h-full ${(selectedDevice.hours / selectedDevice.maxHours) > 0.9 ? 'bg-orange-500' : 'bg-cyan-500'}`} 
                          style={{ width: `${(selectedDevice.hours / selectedDevice.maxHours) * 100}%` }} 
                        />
                      </div>
                    )}
                  </div>
                  <div 
                    className="col-span-2 bg-slate-800/50 p-4 rounded-xl border border-slate-700 cursor-pointer hover:bg-slate-700/50 transition-colors"
                    onClick={() => setEditingMaintenance(true)}
                  >
                    <div className="text-xs text-slate-400 mb-1">上次维保日期 (点击修改)</div>
                    {editingMaintenance ? (
                      <input 
                        type="date" 
                        value={maintenanceDate}
                        onChange={(e) => setMaintenanceDate(e.target.value)}
                        onBlur={() => handleMaintenanceUpdate(maintenanceDate)}
                        autoFocus
                        className="bg-slate-900 text-white border border-slate-600 rounded px-2 py-1 w-full font-mono outline-none focus:border-cyan-500"
                      />
                    ) : (
                      <div className="text-lg font-mono font-bold text-white">{maintenanceDate || selectedDevice.lastMaintenance}</div>
                    )}
                  </div>
                </div>

                {editingParams && (
                  <div className="mb-6 bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                    <div className="text-xs text-slate-400 mb-2">参数设置</div>
                    <textarea 
                      value={paramsText}
                      onChange={(e) => setParamsText(e.target.value)}
                      className="w-full bg-slate-900 text-white border border-slate-600 rounded p-2 text-sm outline-none focus:border-cyan-500 min-h-[80px]"
                      placeholder="输入参数配置..."
                    />
                  </div>
                )}

                <div className="flex gap-3">
                  <button 
                    onClick={() => handleEquipmentToggle(selectedDevice.type, selectedDevice.status)}
                    disabled={isSaving}
                    className={`flex-1 font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 ${
                      selectedDevice.status === '待机' || selectedDevice.status === '停止' 
                        ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950' 
                        : 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30'
                    }`}
                  >
                    {isSaving && <Loader2 size={16} className="animate-spin" />}
                    {selectedDevice.status === '待机' || selectedDevice.status === '停止' ? '启动设备' : '停止设备'}
                  </button>
                  <button 
                    onClick={() => setEditingParams(!editingParams)}
                    className={`flex-1 font-bold py-3 rounded-xl border transition-colors ${editingParams ? 'bg-slate-700 text-white border-slate-500' : 'bg-slate-800 hover:bg-slate-700 text-white border-slate-600'}`}
                  >
                    {editingParams ? '保存参数' : '参数设置'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>,
          document.body
        )}
      </AnimatePresence>
    </motion.div>
  );
}

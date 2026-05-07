/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import DashboardHeader from './components/DashboardHeader';
import Sidebar from './components/Sidebar';
import TankBlock from './components/TankBlock';
import SystemDetail from './components/SystemDetail';
import DataManagement from './components/DataManagement';
import EquipmentStatus from './components/EquipmentStatus';
import SopProcess from './components/SopProcess';
import WarehouseManagement from './components/WarehouseManagement';
import InventoryManagement from './components/InventoryManagement';
import FinancialReport from './components/FinancialReport';
import TraceabilityManagement from './components/TraceabilityManagement';
import Login from './components/Login';
import Settings from './components/Settings';
import MobileBottomNav from './components/MobileBottomNav';
import CompanyProfile from './components/CompanyProfile';
import DashboardOverview from './components/DashboardOverview';
import TankLedgerModal from './components/TankLedgerModal';
import { MOCK_DATA } from './constants';
import { motion, AnimatePresence } from 'motion/react';
import { useState, useMemo, useEffect } from 'react';
import { LayoutGrid, Filter, Search, X, LayoutDashboard, RefreshCw, Loader2 } from 'lucide-react';
import { TankData } from './types';
import { auth, db } from './firebase';
import { signInAnonymously } from 'firebase/auth';
import { doc, getDocFromServer } from 'firebase/firestore';

import PublicTraceability from './components/PublicTraceability';

export default function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTank, setSelectedTank] = useState<TankData | null>(null);
  const [showLedger, setShowLedger] = useState(false);
  const [ledgerTank, setLedgerTank] = useState<TankData | null>(null);
  const [ledgerRecords, setLedgerRecords] = useState<any[]>([]);
  const [activeBlockId, setActiveBlockId] = useState<string>('all');
  const [managementMode, setManagementMode] = useState<'none' | 'farming' | 'water' | 'equipment' | 'settings' | 'sop' | 'warehouse' | 'inventory' | 'finance' | 'traceability'>('none');
  const [tanksData, setTanksData] = useState<TankData[]>(() => MOCK_DATA.flatMap(block => block.tanks));
  const [dbStatus, setDbStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCompanyProfileOpen, setIsCompanyProfileOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [menuConfig, setMenuConfig] = useState<Record<string, string>>({});

  // Handle Public Traceability Route - Detect from multiple sources (query param, hash, or path)
  const traceId = useMemo(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const fromQuery = queryParams.get('trace');
    if (fromQuery) return fromQuery;

    const hashParams = new URLSearchParams(window.location.hash.slice(1).split('?')[1] || window.location.hash.slice(1));
    const fromHash = hashParams.get('trace');
    if (fromHash) return fromHash;

    const pathParts = window.location.pathname.split('/');
    const traceIdx = pathParts.indexOf('trace');
    if (traceIdx !== -1 && pathParts[traceIdx + 1]) {
      return pathParts[traceIdx + 1];
    }

    return null;
  }, []);

  useEffect(() => {
    // 0. Fetch menu configuration (Branding & Labels)
    const fetchMenuConfig = async () => {
      try {
        const res = await fetch('/api/menu-config');
        if (res.ok) {
          const data = await res.json();
          setMenuConfig(data);
        }
      } catch (err) {
        console.error('Failed to fetch menu config:', err);
      }
    };
    fetchMenuConfig();
    const menuInterval = setInterval(fetchMenuConfig, 20000); // Poll branding every 20s

    // 1. Firebase Auth & Connection Test
    signInAnonymously(auth).then(user => {
      console.log('Firebase connected as:', user.user.uid);
      // Test firestore read
      return getDocFromServer(doc(db, 'tanks', 'connection-test'));
    }).then(() => {
      console.log('Firestore connection OK');
    }).catch(err => {
      console.warn('Firebase initialization failed:', err);
    });

    // 2. Check auth token
    fetch('/api/auth/me', {
      credentials: 'include'
    })
      .then(res => res.json())
      .then(data => {
        if (data.user) {
          setUser(data.user);
          setIsAuthenticated(true);
        }
      })
      .catch(() => undefined)
      .finally(() => setIsAuthChecking(false));

    // Fetch from MySQL
    const fetchData = () => {
      fetch('/api/status')
        .then(res => res.ok ? res.json() : { connected: false })
        .then(status => {
          if (status.connected) {
            setDbStatus('connected');
            fetch('/api/tanks').then(res => res.ok ? res.json() : [])
              .then(data => {
                if (data && data.length > 0) {
                  setTanksData(data);
                } else {
                  // Seed database with MOCK_DATA if empty
                  const initialData = MOCK_DATA.flatMap(block => block.tanks);
                  const tanksObj = initialData.reduce((acc, tank) => ({ ...acc, [tank.id]: tank }), {});
                  fetch('/api/tanks', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(tanksObj)
                  }).then(() => setTanksData(initialData)).catch(() => setTanksData(initialData));
                }
            }).catch(() => {
              setTanksData(MOCK_DATA.flatMap(block => block.tanks));
            });
          } else {
            setDbStatus('disconnected');
          }
        })
        .catch(err => {
          console.error("Failed to fetch status:", err);
          setDbStatus('disconnected');
        });
    };
    
    fetchData(); // Initial fetch
    const interval = setInterval(fetchData, 3000); // Poll every 3s for real-time updates

    return () => {
      clearInterval(menuInterval);
      clearInterval(interval);
    };
  }, []);

  const handleLogin = (userData: any) => {
    // Ensure firebase auth
    signInAnonymously(auth).catch(console.error);
    setUser(userData);
    setIsAuthenticated(true);
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => undefined);
    setUser(null);
    setIsAuthenticated(false);
    setManagementMode('none');
  };

  // All tanks flattened for search
  const allTanks = useMemo(() => tanksData, [tanksData]);

  // Filtered tanks based on search query
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return allTanks.filter(tank => 
      (tank.id || '').toLowerCase().includes((searchQuery || '').toLowerCase())
    ); // Return all matching tanks in search results
  }, [searchQuery, allTanks]);

  // Main grid display data - limited to 24 tanks as requested
  const displayData = useMemo(() => {
    // Reconstruct blocks from tanksData
    const blocks = MOCK_DATA.map(block => {
      let prefix = '';
      if (block.id === 'block-a') prefix = 'A';
      else if (block.id === 'block-b') prefix = 'B';
      else if (block.id === 'block-c') prefix = 'C';
      else if (block.id === 'block-w') prefix = 'W';
      
      const normalizedPrefix = prefix.toUpperCase();
      return {
        ...block,
        tanks: tanksData.filter(t => (t.id || '').toUpperCase().startsWith(normalizedPrefix))
      };
    });
    
    const filtered = activeBlockId === 'all' 
      ? blocks 
      : blocks.filter(block => block.id === activeBlockId);
    
    // Return a copy with tanks for the Dashboard
    return filtered.map(block => ({
      ...block,
      tanks: block.tanks.slice(0, activeBlockId === 'all' ? 6 : 100) // Restricted to 6 per area in global overview as requested
    }));
  }, [activeBlockId, tanksData]);

  useEffect(() => {
    if (showLedger && ledgerTank) {
      const fetchRecords = async () => {
        try {
          const [feedmedRes, inoutRes, lossRes] = await Promise.all([
            fetch('/api/records/feedmed'),
            fetch('/api/records/inout'),
            fetch('/api/records/loss')
          ]);
          const feedmed = await feedmedRes.json();
          const inout = await inoutRes.json();
          const loss = await lossRes.json();
          
          const combined = [
            ...feedmed.filter((r: any) => r.tankId === ledgerTank.id).map((r: any) => ({
              id: r.id, date: r.date, type: 'feedmed',
              feeding: { type: r.feedType || '无', qty: Number(r.feedAmount || 0) },
              medication: { name: r.medicineName || '无', dose: r.medicineAmount || '0' },
              spec: r.spec || 0.85, lossCount: Number(r.deadCount || 0)
            })),
            ...loss.filter((r: any) => r.tankId === ledgerTank.id).map((r: any) => ({
              id: r.id, date: r.date, type: 'loss',
              feeding: { type: r.feedType || '无', qty: Number(r.feedAmount || 0) },
              medication: { name: r.medicineName || '无', dose: r.medicineAmount || '0' },
              spec: r.spec || 0.85, lossCount: Number(r.deadCount || 0)
            })),
            ...inout.filter((r: any) => r.tankId === ledgerTank.id).map((r: any) => ({
              id: r.id, date: r.date, type: 'inout', subType: r.type,
              species: r.species, size: r.size, count: Number(r.count), amount: Number(r.amount)
            }))
          ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          
          setLedgerRecords(combined);
        } catch (err) {
          console.error("Failed to fetch ledger:", err);
        }
      };
      fetchRecords();
    }
  }, [showLedger, ledgerTank]);

  const handleOpenLedger = (tank: TankData) => {
    setLedgerTank(tank);
    setShowLedger(true);
  };

  const handleUpdateLedgerRecords = (newRecords: any[]) => {
    setLedgerRecords(newRecords);
  };

  const handleTankSelect = (tank: TankData) => {
    setSelectedTank(tank);
    setSearchQuery('');
  };

  const handleModeChange = (mode: 'none' | 'farming' | 'water' | 'equipment' | 'settings' | 'sop' | 'warehouse' | 'inventory' | 'finance' | 'traceability') => {
    setManagementMode(mode);
    setSelectedTank(null);
  };

  useEffect(() => {
    const handleOpenSettings = () => {
      handleModeChange('settings');
    };
    window.addEventListener('openSettings', handleOpenSettings);
    return () => window.removeEventListener('openSettings', handleOpenSettings);
  }, []);

  const handleUpdateTanks = (updatedTanks: Record<string, any>) => {
    // 0. Pre-process linkage: Automatically update equipment status based on tank status
    const processedUpdates: Record<string, any> = { ...updatedTanks };
    for (const [id, update] of Object.entries(processedUpdates)) {
      if (update === null) continue;
      
      const currentTank = tanksData.find(t => t.id === id);
      if (update.status && (!currentTank || update.status !== currentTank.status)) {
        if (update.status === 'normal') {
          // "进苗" (larvae added) -> Automatically Turn ON equipment
          update.equipment = {
            ...(update.equipment || currentTank?.equipment || {}),
            filter: '自动模式',
            pump: '运行中',
            oxygen: '运行中',
            uv: '运行中'
          };
        } else if (update.status === 'empty') {
          // "空池" (empty pool) -> Automatically Turn OFF all equipment
          update.equipment = {
            ...(update.equipment || currentTank?.equipment || {}),
            filter: '停止',
            pump: '停止',
            oxygen: '停止',
            uv: '停止'
          };
        }
      }
    }

    setTanksData(prev => {
      let newTanks = [...prev];
      for (const [id, updatedTank] of Object.entries(processedUpdates)) {
        if (updatedTank === null) {
          // Deletion case
          newTanks = newTanks.filter(t => t.id !== id);
          continue;
        }
        
        const index = newTanks.findIndex(t => t.id === id);
        if (index >= 0) {
          // Merge top-level properties and nested properties securely
          newTanks[index] = { 
            ...newTanks[index], 
            ...updatedTank,
            farming: { ...(newTanks[index].farming || {} as any), ...(updatedTank.farming || {}) },
            equipment: { ...(newTanks[index].equipment || {} as any), ...(updatedTank.equipment || {}) }
          };
        } else {
          newTanks.push(updatedTank as TankData);
        }
      }
      return newTanks;
    });

    // Handle background API call
    const deletions = Object.entries(processedUpdates).filter(([_, v]) => v === null).map(([id]) => id);
    const updatesForApi = Object.fromEntries(Object.entries(processedUpdates).filter(([_, v]) => v !== null));

    if (deletions.length > 0) {
      Promise.all(deletions.map(id => fetch(`/api/tanks/${id}`, { method: 'DELETE' })))
        .catch(err => console.error('Delete sync failed:', err));
    }

    if (Object.keys(updatesForApi).length > 0) {
      fetch('/api/tanks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatesForApi)
      }).catch(err => console.error('Backend sync failed:', err));
    }
  };

  if (traceId) {
    return <PublicTraceability tankId={traceId} />;
  }

  if (isAuthChecking || dbStatus === 'checking') {
    return (
      <div className="min-h-screen bg-[#050b1a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
          <p className="text-slate-400 text-sm animate-pulse">正在初始化系统...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        {dbStatus === 'disconnected' && (
          <div className="bg-amber-500/10 border-b border-amber-500/30 text-amber-200 px-4 py-2 text-xs text-center flex justify-center items-center z-50 fixed top-0 left-0 right-0 gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            演示模式：未连接 MySQL 数据库。系统将使用模拟数据运行。
          </div>
        )}
        <Login onLogin={handleLogin} />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#050b1a] text-slate-200 font-sans selection:bg-cyan-500/30">
      <AnimatePresence>
        {showLedger && ledgerTank && (
          <TankLedgerModal 
            tank={ledgerTank} 
            onClose={() => setShowLedger(false)} 
            records={ledgerRecords}
            onRecordsChange={(updates) => {
              handleUpdateLedgerRecords(updates);
              fetch('/api/tanks').then(res => res.json()).then(data => {
                const refreshedTank = data.find((t: any) => t.id === ledgerTank.id);
                if (refreshedTank) {
                  setLedgerTank(refreshedTank);
                  handleUpdateTanks(data);
                }
              });
            }}
          />
        )}
      </AnimatePresence>
      {dbStatus === 'disconnected' && (
        <div className="bg-amber-500/10 border-b border-amber-500/30 text-amber-200 px-4 py-2 text-xs text-center flex justify-center items-center z-50 relative gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
          演示模式：正在使用本地模拟数据。
        </div>
      )}
      {/* Background Grid Pattern */}
      <div className="fixed inset-0 z-0 opacity-20 pointer-events-none" 
        style={{ 
          backgroundImage: `radial-gradient(circle at 2px 2px, #1e293b 1px, transparent 0)`,
          backgroundSize: '40px 40px' 
        }} 
      />
      
      <DashboardHeader 
        onMenuClick={() => setIsSidebarOpen(true)} 
        user={user} 
        systemName={menuConfig.system_name} 
      />
      
      <div className="flex relative z-10">
        <Sidebar 
          mode={managementMode} 
          onModeChange={handleModeChange} 
          user={user} 
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />
        <main className="flex-1 transition-all duration-500 overflow-x-hidden w-full ios-bottom">
          <div className="max-w-screen-2xl mx-auto p-3 md:p-6 lg:p-8">
            {!selectedTank && managementMode === 'none' && (
              <div className="flex items-center justify-between mb-6 px-1">
                <div>
                  <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                    <LayoutDashboard className="text-cyan-400" size={20} />
                    {menuConfig.none || '全局数字总控'}
                  </h1>
                </div>
              </div>
            )}
            {/* Summary Stats Bar */}
            {!selectedTank && managementMode === 'none' && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 flex flex-wrap items-center justify-between gap-4 bg-slate-900/40 border border-slate-800 p-4 md:px-8 rounded-2xl backdrop-blur-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="text-slate-400 text-base font-bold">运行养殖桶数</span>
                  <span className="text-3xl font-black text-cyan-400 font-mono tracking-tighter">
                    {tanksData.filter(t => t.status === 'normal' || t.status === 'alarm').length}
                  </span>
                </div>
                <div className="hidden md:block w-px h-8 bg-slate-800" />
                <div className="flex items-center gap-3">
                  <span className="text-slate-400 text-base font-bold">维护养殖桶数</span>
                  <span className="text-3xl font-black text-orange-400 font-mono tracking-tighter">
                    {tanksData.filter(t => t.status === 'maintenance').length}
                  </span>
                </div>
                <div className="hidden md:block w-px h-8 bg-slate-800" />
                <div className="flex items-center gap-3">
                  <span className="text-slate-400 text-base font-bold">空置养殖桶数</span>
                  <span className="text-3xl font-black text-slate-500 font-mono tracking-tighter">
                    {tanksData.filter(t => t.status === 'empty').length}
                  </span>
                </div>
                <div className="hidden md:block w-px h-8 bg-slate-800" />
                <div className="flex items-center gap-3">
                  <span className="text-slate-400 text-base font-bold">总库存量</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black text-blue-400 font-mono tracking-tighter">
                      {tanksData.reduce((sum, t) => sum + (Number(t.farming?.currentInventory) || Number(t.farming?.inventory) || 0), 0).toLocaleString()}
                    </span>
                    <span className="text-sm text-slate-500 font-bold">斤</span>
                  </div>
                </div>
                <div className="hidden md:block w-px h-8 bg-slate-800" />
                <div className="flex items-center gap-3">
                  <span className="text-slate-400 text-base font-bold">累计损耗</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black text-red-500 font-mono tracking-tighter">
                      {tanksData.reduce((sum, t) => sum + (Number(t.farming?.deadCount) || 0), 0)}
                    </span>
                    <span className="text-sm text-slate-500 font-bold">斤</span>
                  </div>
                </div>
              </motion.div>
            )}

          {/* Search and Filter Bar */}
          {!selectedTank && managementMode === 'none' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mb-8 flex flex-col md:flex-row items-center justify-between gap-6 bg-slate-900/40 border border-slate-800 p-4 rounded-2xl backdrop-blur-sm"
            >
              <div className="flex items-center gap-4 w-full md:w-auto">
                <div className="flex items-center gap-2 text-cyan-400 px-3 py-1 border-r border-slate-700 mr-2">
                  <Filter size={16} />
                  <span className="text-sm font-bold tracking-widest uppercase">区域</span>
                </div>
                <div className="flex gap-2 whitespace-nowrap overflow-x-auto pb-1 hide-scrollbar">
                  {['all', 'block-a', 'block-b', 'block-c', 'block-w'].map(id => (
                    <button 
                      key={id}
                      onClick={() => setActiveBlockId(id)}
                      className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all duration-300 border ${activeBlockId === id ? 'bg-cyan-500 text-slate-900 border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.4)]' : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-500'}`}
                    >
                      {id === 'all' ? '全部' : id === 'block-a' ? 'A区' : id === 'block-b' ? 'B区' : id === 'block-c' ? 'C区' : '车间'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Search Input */}
              <div className="relative w-full md:w-80">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                  <input 
                    type="text"
                    placeholder="搜索养殖桶 ID (如 A-050)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-950/50 border border-slate-700 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-cyan-500 transition-colors font-mono"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Search Results Dropdown */}
                <AnimatePresence>
                  {searchResults.length > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute top-full left-0 right-0 mt-2 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden max-h-80 overflow-y-auto custom-scrollbar"
                    >
                      {searchResults.map(tank => (
                        <button 
                          key={tank.id}
                          onClick={() => handleTankSelect(tank)}
                          className="w-full px-4 py-3 text-left hover:bg-slate-800 flex items-center justify-between border-b border-slate-800 last:border-0 transition-colors"
                        >
                          <span className="font-mono font-bold text-cyan-400">{tank.id}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full ${tank.status === 'normal' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                            {tank.status === 'normal' ? '正常' : '异常'}
                          </span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}

          <AnimatePresence mode="wait">
            {managementMode === 'settings' ? (
              <motion.div
                key="settings"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <Settings user={user} onLogout={handleLogout} />
              </motion.div>
            ) : managementMode === 'equipment' ? (
              <motion.div
                key="equipment"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <EquipmentStatus 
                  allTanks={allTanks} 
                  onBack={() => setManagementMode('none')} 
                  onUpdateTanks={handleUpdateTanks}
                />
              </motion.div>
            ) : managementMode === 'warehouse' ? (
              <motion.div
                key="warehouse"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <WarehouseManagement onBack={() => setManagementMode('none')} />
              </motion.div>
            ) : managementMode === 'inventory' ? (
              <motion.div
                key="inventory"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <InventoryManagement onBack={() => setManagementMode('none')} />
              </motion.div>
            ) : managementMode === 'finance' ? (
              <motion.div
                key="finance"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <FinancialReport allTanks={tanksData} onBack={() => setManagementMode('none')} />
              </motion.div>
            ) : managementMode === 'traceability' ? (
              <motion.div
                key="traceability"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <TraceabilityManagement allTanks={tanksData} onBack={() => setManagementMode('none')} />
              </motion.div>
            ) : managementMode === 'sop' ? (
              <motion.div
                key="sop"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <SopProcess onBack={() => setManagementMode('none')} />
              </motion.div>
            ) : managementMode !== 'none' ? (
              <motion.div
                key="management"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <DataManagement 
                  mode={managementMode as 'farming' | 'water'} 
                  allTanks={allTanks} 
                  onBack={() => setManagementMode('none')} 
                  onModeChange={setManagementMode as any}
                  onUpdateTanks={handleUpdateTanks}
                />
              </motion.div>
            ) : selectedTank ? (
              <SystemDetail 
                key="detail"
                tank={selectedTank} 
                allTanks={allTanks}
                onTankChange={handleTankSelect}
                onUpdateTanks={handleUpdateTanks}
                onOpenLedger={() => handleOpenLedger(selectedTank)}
                onBack={() => setSelectedTank(null)} 
              />
            ) : (
              <motion.div 
                key="grid"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="grid grid-cols-1 gap-8 md:gap-12"
              >
                <div className="flex items-center gap-2 text-slate-500 text-[10px] md:text-sm font-mono mb-2 px-1">
                  <LayoutGrid size={14} />
                  <span>监控大厅展示 ({displayData.reduce((sum, block) => sum + block.tanks.length, 0)}/{allTanks.length}) - 使用搜索查看更多</span>
                </div>
                
                <div className="space-y-8 md:space-y-12">
                  {displayData.map((block) => (
                    <TankBlock 
                      key={block.id} 
                      data={block} 
                      mode={managementMode}
                      onTankSelect={handleTankSelect}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Bottom Info Bar */}
          <footer className="mt-12 pt-8 border-t border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500 pb-20 md:pb-0">
            <div className="flex items-center gap-4 cursor-pointer hover:bg-slate-800/50 p-2 rounded-xl transition-colors group" onClick={() => setIsCompanyProfileOpen(true)}>
              <div className="w-10 h-10 bg-cyan-500 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.3)] group-hover:scale-110 transition-transform">
                <span className="font-black text-slate-900 text-xl">渔</span>
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-slate-200 group-hover:text-cyan-400 transition-colors">贵州黔方有渔水产科技有限公司</span>
                <span className="tracking-tighter opacity-60">GUIZHOU QIANFANG YOUYU AQUACULTURE TECHNOLOGY CO., LTD.</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex flex-col items-end">
                <span className="font-bold text-slate-400">黔西南州文旅集团</span>
                <span>QIANXINAN PREFECTURE CULTURE & TOURISM GROUP</span>
              </div>
              <div className="w-8 h-8 bg-slate-800 rounded flex items-center justify-center">
                <div className="w-4 h-4 bg-cyan-500/50 rounded-sm" />
              </div>
            </div>
          </footer>
          </div>
        </main>
      </div>

      <MobileBottomNav 
        mode={managementMode} 
        onModeChange={handleModeChange} 
        onMoreClick={() => setIsSidebarOpen(true)} 
      />

      <AnimatePresence>
        {isCompanyProfileOpen && (
          <CompanyProfile onClose={() => setIsCompanyProfileOpen(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}

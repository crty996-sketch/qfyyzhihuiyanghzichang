import { LayoutDashboard, Database, Droplets, Settings, ChevronRight, User, X, ClipboardList, Package, Calculator, Maximize2, Minimize2, Download, QrCode } from 'lucide-react';
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';

interface SidebarProps {
  mode: 'none' | 'farming' | 'water' | 'equipment' | 'settings' | 'sop' | 'warehouse' | 'inventory' | 'finance' | 'traceability' | 'supplier';
  onModeChange: (mode: 'none' | 'farming' | 'water' | 'equipment' | 'settings' | 'sop' | 'warehouse' | 'inventory' | 'finance' | 'traceability' | 'supplier') => void;
  user?: any;
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ mode, onModeChange, user, isOpen, onClose }: SidebarProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [menuConfig, setMenuConfig] = useState<Record<string, string>>({
    none: '全局数字总控',
    farming: '生产运行台账',
    water: '水质物联传感',
    equipment: '机电智控运维',
    warehouse: '仓储资产管理',
    inventory: '进销存管理',
    finance: '经营成本核算',
    traceability: '数字化产品溯源',
    sop: '标准作业(SOP)'
  });

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User response to install prompt: ${outcome}`);
      setDeferredPrompt(null);
    }
  };

  useEffect(() => {
    const fetchMenuConfig = async () => {
      try {
        const res = await fetch('/api/menu-config');
        if (res.ok) {
          const data = await res.json();
          setMenuConfig(prev => ({ ...prev, ...data }));
        }
      } catch (err) {
        console.error('Failed to fetch menu config:', err);
      }
    };
    fetchMenuConfig();
    // Poll for changes occasionally if needed or just fetch once
    const interval = setInterval(fetchMenuConfig, 10000); 
    return () => clearInterval(interval);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        setIsFullscreen(false);
      }
    }
  };

  // Sync state if fullscreen changed via ESC
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const menuItems = [
    { id: 'none', label: menuConfig.none, icon: <LayoutDashboard size={18} /> },
    { id: 'farming', label: menuConfig.farming, icon: <Database size={18} /> },
    { id: 'water', label: menuConfig.water, icon: <Droplets size={18} /> },
    { id: 'equipment', label: menuConfig.equipment, icon: <Settings size={18} /> },
    { id: 'warehouse', label: menuConfig.warehouse, icon: <Package size={18} /> },
    { id: 'inventory', label: menuConfig.inventory, icon: <ClipboardList size={18} /> },
    { id: 'finance', label: menuConfig.finance, icon: <Calculator size={18} /> },
    { id: 'traceability', label: menuConfig.traceability, icon: <QrCode size={18} /> },
    { id: 'sop', label: menuConfig.sop, icon: <Settings size={18} /> },
  ];

  const visibleMenuItems = menuItems.filter(item => {
    if (item.id === 'none') return true;
    if (user?.role === 'admin') return true;
    return user?.permissions?.includes(item.id);
  });

  // Close sidebar on mode change on mobile
  const handleModeChange = (newMode: any) => {
    onModeChange(newMode);
    if (window.innerWidth < 768) {
      onClose();
    }
  };

  // Close when clicking outside on mobile
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768 && isOpen) {
        onClose(); // Reset state when moving to desktop
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isOpen, onClose]);

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed md:sticky top-0 md:top-[60px] left-0 z-50 md:z-auto
        w-48 bg-[#0a1124] border-r border-slate-800 flex flex-col text-slate-300 
        h-screen md:h-[calc(100vh-60px)] shrink-0
        transition-all duration-300 ease-in-out shadow-2xl md:shadow-none
        ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="p-4 py-4 flex items-center justify-between md:flex border-b md:border-none border-slate-800/50">
          <div className="flex items-center gap-2">
            <div className="text-sm font-black text-slate-500 tracking-[0.2em] uppercase opacity-60">
              功能导航
            </div>
            <button 
              onClick={toggleFullscreen}
              className="flex p-1.5 text-slate-500 hover:text-cyan-400 hover:bg-slate-800/50 rounded-lg transition-all"
              title={isFullscreen ? "退出全屏" : "全屏显示"}
            >
              {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          </div>
          <button 
            onClick={onClose}
            className="md:hidden p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"
          >
            <X size={18} />
          </button>
        </div>
        
        <nav className="flex-1 flex flex-col gap-1 px-2.5 overflow-y-auto mt-2">
          {visibleMenuItems.map((item) => {
            const isActive = mode === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleModeChange(item.id)}
                className={`flex items-center justify-between px-3 py-2 rounded-xl transition-all duration-200 group relative ${
                  isActive 
                    ? 'bg-cyan-500/10 text-cyan-400 font-bold' 
                    : 'hover:bg-white/5 hover:text-slate-100'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`transition-all duration-200 ${isActive ? 'text-cyan-400 scale-110' : 'text-slate-500 group-hover:text-cyan-400/70'}`}>
                    {item.icon}
                  </div>
                  <span className={`text-[17px] tracking-tight truncate transition-all ${isActive ? 'translate-x-0.5' : ''}`}>
                    {item.label}
                  </span>
                </div>
                {isActive && (
                  <motion.div 
                    layoutId="activeTab"
                    className="absolute left-0 w-1 h-4 bg-cyan-500 rounded-r-full shadow-[0_0_8px_rgba(6,182,212,0.8)]"
                  />
                )}
              </button>
            );
          })}

          {deferredPrompt && (
            <button
              onClick={handleInstall}
              className="mt-4 flex items-center gap-3 px-3 py-2 rounded-xl bg-gradient-to-r from-cyan-600/20 to-blue-600/20 border border-cyan-500/30 text-cyan-400 hover:from-cyan-600/30 hover:to-blue-600/30 transition-all font-medium"
            >
              <Download size={18} />
              <span>下载/安装 App</span>
            </button>
          )}
        </nav>

        {/* User Info Slim Section (Optional placeholder) */}
        <div className="p-4 border-t border-slate-800/50 mt-auto md:hidden">
           <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-cyan-500 flex items-center justify-center text-xs font-bold text-slate-950">
                {user?.name?.charAt(0) || '管'}
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-200">{user?.name || '管理员'}</span>
                <span className="text-[10px] text-slate-500">{user?.role === 'admin' ? '系统管理员' : '作业员'}</span>
              </div>
           </div>
        </div>
      </aside>
    </>
  );
}

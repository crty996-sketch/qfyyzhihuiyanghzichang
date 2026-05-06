import { LayoutDashboard, Settings, Database, MoreHorizontal } from 'lucide-react';
import { motion } from 'motion/react';

interface MobileBottomNavProps {
  mode: string;
  onModeChange: (mode: any) => void;
  onMoreClick: () => void;
}

export default function MobileBottomNav({ mode, onModeChange, onMoreClick }: MobileBottomNavProps) {
  const tabs = [
    { id: 'none', label: '首页', icon: <LayoutDashboard size={20} /> },
    { id: 'farming', label: '生产', icon: <Database size={20} /> },
    { id: 'equipment', label: '智控', icon: <Settings size={20} /> },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-slate-900/90 backdrop-blur-lg border-t border-slate-800 px-2 py-1 flex items-center justify-around z-[100] md:hidden h-16 safe-padding-bottom">
      {tabs.map((tab) => {
        const isActive = mode === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onModeChange(tab.id as any)}
            className={`flex flex-col items-center justify-center gap-1 w-16 h-full transition-all duration-200 ${
              isActive ? 'text-cyan-400' : 'text-slate-500'
            }`}
          >
            <div className={`transition-transform duration-300 ${isActive ? 'scale-110 -translate-y-0.5' : ''}`}>
              {tab.icon}
            </div>
            <span className="text-[10px] font-bold tracking-tighter">{tab.label}</span>
            {isActive && (
              <motion.div 
                layoutId="bottomNavDot"
                className="w-1 h-1 bg-cyan-400 rounded-full mt-0.5"
              />
            )}
          </button>
        );
      })}
      <button
        onClick={onMoreClick}
        className="flex flex-col items-center justify-center gap-1 w-16 h-full text-slate-500"
      >
        <MoreHorizontal size={20} />
        <span className="text-[10px] font-bold tracking-tighter">更多</span>
      </button>
    </nav>
  );
}

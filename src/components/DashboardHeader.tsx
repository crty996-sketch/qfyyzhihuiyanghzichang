import { Cloud, Thermometer, User, Bell, Settings, Menu } from 'lucide-react';

interface DashboardHeaderProps {
  onMenuClick: () => void;
  user?: any;
  systemName?: string;
}

export default function DashboardHeader({ onMenuClick, user, systemName }: DashboardHeaderProps) {
  const now = new Date();
  const dateString = now.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const timeString = now.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  return (
    <header className="flex items-center justify-between px-4 md:px-6 py-3 bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-50 shadow-sm">
      {/* Left: Logo & Title */}
      <div className="flex items-center gap-3 md:gap-4">
        <button 
          onClick={onMenuClick}
          className="md:hidden p-1.5 -ml-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
        >
          <Menu size={24} />
        </button>
        <div className="w-8 h-8 bg-cyan-500 rounded-lg flex items-center justify-center shadow-[0_0_10px_rgba(6,182,212,0.5)] shrink-0">
          <span className="font-black text-slate-900 text-lg">渔</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-widest text-slate-100 truncate">
          {systemName || '智慧渔业'}<span className="hidden sm:inline">{!systemName && '管理系统'}</span>
          <span className="hidden md:inline-block text-xs text-cyan-500 ml-2 font-mono border border-cyan-500/30 px-2 py-0.5 rounded-full bg-cyan-500/10 align-middle">T+ ERP 模式</span>
        </h1>
      </div>

      {/* Right: Weather, Time, User */}
      <div className="flex items-center gap-2 md:gap-6">
        <div className="hidden lg:flex items-center gap-4 text-xs text-slate-400 font-mono bg-slate-800/50 px-4 py-1.5 rounded-full border border-slate-700/50">
          <div className="flex items-center gap-1.5">
            <Thermometer size={14} className="text-orange-400" />
            <span>27°C</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Cloud size={14} className="text-blue-400" />
            <span>阴 | 郑屯镇</span>
          </div>
          <div className="w-px h-3 bg-slate-600 mx-1" />
          <span className="text-cyan-400 font-bold">{timeString}</span>
          <span>{dateString}</span>
        </div>

        <div className="flex items-center gap-1 md:gap-3">
          <button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-800 text-slate-400 hover:text-cyan-400 transition-colors relative">
            <Bell size={18} />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-slate-900"></span>
          </button>
          <div className="hidden sm:block w-px h-4 bg-slate-700 mx-1" />
          <button 
            onClick={() => {
              // Note: We need to pass handleModeChange from App to DashboardHeader to make this work perfectly, 
              // but for now we'll rely on the parent component triggering the settings mode when clicking the user profile
              const event = new CustomEvent('openSettings');
              window.dispatchEvent(event);
            }}
            className="flex items-center gap-2 hover:bg-slate-800 px-2 md:px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-slate-700"
          >
            <div className="w-7 h-7 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full flex items-center justify-center text-white shrink-0 overflow-hidden shadow-sm">
              {user?.name ? (
                <span className="text-xs font-bold">{user.name.charAt(0)}</span>
              ) : (
                <User size={14} />
              )}
            </div>
            <div className="hidden sm:flex flex-col items-start truncate max-w-[150px]">
              <span className="text-sm font-bold text-slate-200">
                {user?.name || '管理员'}
              </span>
              {user?.role && (
                <span className="text-[10px] text-cyan-500 font-medium leading-none">
                  {user.role === 'admin' ? '系统管理员' : '普通用户'}
                </span>
              )}
            </div>
          </button>
          <button 
            onClick={() => {
              const event = new CustomEvent('openSettings');
              window.dispatchEvent(event);
            }}
            className="hidden sm:flex w-8 h-8 items-center justify-center rounded-full hover:bg-slate-800 text-slate-400 hover:text-cyan-400 transition-colors"
          >
            <Settings size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}

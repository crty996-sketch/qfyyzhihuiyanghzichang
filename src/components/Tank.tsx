import { motion } from 'motion/react';
import { TankData } from '../types';
import { AlertTriangle, CheckCircle2, Droplets, Thermometer, Activity, Fish, Wifi } from 'lucide-react';
import React from 'react';

interface TankProps {
  data: TankData;
  onClick?: () => void;
  mode?: 'none' | 'farming' | 'water';
  key?: string;
}

export default function Tank({ data, onClick, mode = 'none' }: TankProps) {
  const handleTankClick = (e: React.MouseEvent) => {
    if (onClick) onClick();
  };

  const getStatusColors = (status: string) => {
    switch (status) {
      case 'normal': return {
        top: 'from-blue-400 to-blue-600',
        body: 'from-blue-600 via-blue-700 to-blue-900',
        border: 'border-blue-400/30',
        text: 'text-blue-100'
      };
      case 'alarm': return {
        top: 'from-red-400 to-red-600',
        body: 'from-red-600 via-red-700 to-red-900',
        border: 'border-red-400/30',
        text: 'text-red-100'
      };
      case 'maintenance': return {
        top: 'from-orange-400 to-orange-600',
        body: 'from-orange-600 via-orange-700 to-orange-900',
        border: 'border-orange-400/30',
        text: 'text-orange-100'
      };
      default: return {
        top: 'from-slate-400 to-slate-600',
        body: 'from-slate-600 via-slate-700 to-slate-900',
        border: 'border-slate-400/30',
        text: 'text-slate-100'
      };
    }
  };

  const colors = getStatusColors(data.status);

  return (
    <motion.div 
      whileHover={{ scale: 1.05, y: -5 }}
      onClick={handleTankClick}
      className="relative w-28 sm:w-32 md:w-36 h-40 sm:h-44 md:h-48 group cursor-pointer flex flex-col items-center justify-center"
    >
      {/* 3D Cylinder Top (Water Surface) */}
      <div className={`relative w-full h-10 sm:h-12 md:h-14 rounded-[50%] bg-gradient-to-br ${colors.top} border-2 ${colors.border} z-20 shadow-[inset_0_-4px_8px_rgba(0,0,0,0.2)] overflow-hidden`}>
        {/* Subtle Water Reflection */}
        <div className="absolute inset-0 bg-white/20 opacity-60" style={{ clipPath: 'ellipse(45% 35% at 30% 30%)' }} />
        <div className="absolute inset-0 bg-black/10 opacity-30" style={{ clipPath: 'ellipse(40% 20% at 70% 70%)' }} />
      </div>

      {/* 3D Cylinder Body */}
      <div className={`-mt-5 sm:-mt-6 md:-mt-7 w-full h-28 sm:h-30 md:h-32 bg-gradient-to-r ${colors.body} border-x-2 border-b-2 ${colors.border} rounded-b-[20px] md:rounded-b-[24px] z-10 shadow-[0_15px_25px_-5px_rgba(0,0,0,0.5),inset_0_-10px_20px_rgba(0,0,0,0.3)] relative flex flex-col items-center justify-center gap-1 md:gap-2 pt-2 md:pt-4`}>
        {/* Fish Icon */}
        {mode === 'farming' && (
          <Fish size={20} className={`${colors.text} opacity-80 drop-shadow-md md:w-6 md:h-6`} />
        )}
        
        {/* Tank ID and Specs */}
        <div className="flex flex-col items-center relative">
          {Boolean(data.isIotConnected) && (
            <div className="absolute -top-4 right-[-14px] text-emerald-400 bg-slate-900/50 rounded-full p-0.5 border border-emerald-500/30">
              <Wifi size={10} className="animate-pulse" />
            </div>
          )}
          <span className={`text-lg md:text-xl font-black font-mono tracking-tighter drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] ${colors.text}`}>
            {data.id}
          </span>
          {Boolean(data.specs) && (
            <span className="text-[8px] md:text-[9px] font-bold text-white/70 bg-black/30 px-1.5 py-0.5 rounded mt-1 truncate max-w-[90%] pointer-events-none">
              {data.specs}
            </span>
          )}
        </div>
        
        {/* Vertical Highlight for 3D effect */}
        <div className="absolute inset-y-0 left-[15%] w-2 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <div className="absolute inset-y-0 right-[15%] w-4 bg-gradient-to-r from-transparent via-black/20 to-transparent" />
        
        {/* Horizontal banding for tech feel */}
        <div className="absolute top-1/3 w-full h-px bg-white/5" />
        <div className="absolute top-2/3 w-full h-px bg-black/10" />
      </div>

      {/* Base Shadow */}
      <div className="absolute -bottom-3 w-28 h-6 bg-black/60 rounded-[50%] blur-xl -z-10" />
    </motion.div>
  );
}

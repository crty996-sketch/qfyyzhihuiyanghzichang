import { TankBlockData, TankData } from '../types';
import Tank from './Tank';

interface TankBlockProps {
  data: TankBlockData;
  onTankSelect?: (tank: TankData) => void;
  mode?: 'none' | 'farming' | 'water';
  key?: string;
}

export default function TankBlock({ data, onTankSelect, mode = 'none' }: TankBlockProps) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 p-4 sm:p-6 md:p-8 rounded-3xl shadow-2xl relative overflow-hidden group">
      {/* Decorative Corner Accents */}
      <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-cyan-500/30 rounded-tl-lg" />
      <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-cyan-500/30 rounded-tr-lg" />
      <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-cyan-500/30 rounded-bl-lg" />
      <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-cyan-500/30 rounded-br-lg" />

      <div className="flex items-center justify-between mb-6 md:mb-8 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2 md:gap-3">
          <div className="w-1 h-5 md:h-6 bg-cyan-500 rounded-full" />
          <h2 className="text-lg md:text-xl font-black text-slate-100 font-mono tracking-[0.2em]">{data.name}</h2>
        </div>
        <div className="flex items-center gap-2 md:gap-4">
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest hidden sm:block">Status</span>
            <span className="text-[10px] md:text-xs text-emerald-400 font-bold">ONLINE</span>
          </div>
          <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-slate-800 flex items-center justify-center border border-slate-700">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_#10b981]" />
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-4 sm:gap-x-8 md:gap-x-12 gap-y-12 sm:gap-y-16 md:gap-y-20 justify-items-center">
        {data.tanks.map((tank) => (
          <Tank 
            key={tank.id} 
            data={tank} 
            mode={mode}
            onClick={() => onTankSelect?.(tank)}
          />
        ))}
      </div>
    </div>
  );
}

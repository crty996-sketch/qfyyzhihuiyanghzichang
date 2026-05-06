import { motion } from 'motion/react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Database, TrendingUp, TrendingDown, AlertTriangle, Activity, Thermometer, Droplets, Wind, Waves } from 'lucide-react';
import { useEffect, useState } from 'react';

interface DashboardStats {
  totalInventory: number;
  monthlyIn: number;
  monthlyOut: number;
  totalLoss: number;
  avgTemperature: number;
  avgPh: number;
  avgOxygen: number;
  avgTurbidity: number;
  baseChart: any[];
  aChart: any[];
  bChart: any[];
  cChart: any[];
  wChart: any[];
}

interface DashboardOverviewProps {
  refreshTrigger?: any;
}

export default function DashboardOverview({ refreshTrigger }: DashboardOverviewProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/stats/summary');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [refreshTrigger]);

  useEffect(() => {
    // Poll every 3 seconds for real-time updates
    const interval = setInterval(fetchStats, 3000);
    return () => clearInterval(interval);
  }, []);

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <Activity className="text-cyan-500 animate-spin mr-2" />
        <span className="text-slate-400">正在获取实时数据...</span>
      </div>
    );
  }

  const inventoryCards = [
    { title: '总库存储量', value: stats.totalInventory, unit: '斤', color: 'text-cyan-400', icon: Database, bg: 'bg-cyan-500/10' },
    { title: '本月总入库', value: stats.monthlyIn, unit: '斤', color: 'text-emerald-400', icon: TrendingUp, bg: 'bg-emerald-500/10' },
    { title: '本月总出库', value: stats.monthlyOut, unit: '斤', color: 'text-orange-400', icon: TrendingDown, bg: 'bg-orange-500/10' },
    { title: '累计损耗', value: stats.totalLoss, unit: '斤', color: 'text-red-400', icon: AlertTriangle, bg: 'bg-red-500/10' },
  ];

  const envCards = [
    { title: '全区平均水温', value: stats.avgTemperature, unit: '°C', color: 'text-amber-400', icon: Thermometer, bg: 'bg-amber-500/10' },
    { title: '全区平均 pH', value: stats.avgPh, unit: '', color: 'text-violet-400', icon: Droplets, bg: 'bg-violet-500/10' },
    { title: '全区平均溶氧', value: stats.avgOxygen, unit: 'mg/L', color: 'text-blue-400', icon: Wind, bg: 'bg-blue-500/10' },
    { title: '全区平均浊度', value: stats.avgTurbidity, unit: 'NTU', color: 'text-indigo-400', icon: Waves, bg: 'bg-indigo-500/10' },
  ];

  const renderCard = (card: any, i: number) => (
    <motion.div
      key={card.title}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.1 }}
      className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 relative overflow-hidden group hover:border-slate-700 transition-all shadow-xl backdrop-blur-md"
    >
      <div className={`absolute top-0 right-0 w-24 h-24 ${card.bg} rounded-bl-[100px] -mr-8 -mt-8 opacity-20 group-hover:opacity-40 transition-opacity`} />
      <div className="flex flex-col gap-4 relative z-10">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-400 font-bold tracking-wider">{card.title}</span>
          <card.icon className={card.color} size={20} />
        </div>
        <div className="flex items-baseline gap-2">
          <span className={`text-3xl md:text-4xl font-black font-mono tracking-tighter ${card.color}`}>
            {card.value.toLocaleString()}
          </span>
          {card.unit && <span className="text-xs text-slate-500 font-bold uppercase">{card.unit}</span>}
        </div>
      </div>
    </motion.div>
  );

  return (
    <div className="space-y-8 mb-12">
      {/* Real-time Environmental Parameters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {envCards.map(renderCard)}
      </div>

      {/* Inventory Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {inventoryCards.map(renderCard)}
      </div>

      {/* 3 Charts - Updated to show more areas if they have data */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        <ChartCard title="全基地养殖概况" data={stats.baseChart} colors={['#06b6d4', '#ef4444']} className="xl:col-span-1" />
        <ChartCard title="A区养殖概况" data={stats.aChart} colors={['#06b6d4', '#ef4444']} />
        <ChartCard title="B区养殖概况" data={stats.bChart} colors={['#06b6d4', '#ef4444']} />
        {stats.cChart && stats.cChart.length > 0 && (
          <ChartCard title="C区养殖概况" data={stats.cChart} colors={['#06b6d4', '#ef4444']} />
        )}
        {stats.wChart && stats.wChart.length > 0 && (
          <ChartCard title="车间养殖概况" data={stats.wChart} colors={['#06b6d4', '#ef4444']} />
        )}
      </div>
    </div>
  );
}

function ChartCard({ title, data, colors, className = '' }: { title: string, data: any[], colors: string[], className?: string }) {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`bg-slate-900/60 border border-slate-800 rounded-3xl p-6 shadow-2xl backdrop-blur-md ${className}`}
    >
      <div className="flex items-center gap-3 mb-6">
        <Activity className="text-cyan-500" size={18} />
        <h3 className="text-lg font-black text-slate-100 tracking-wider">{title}</h3>
      </div>

      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis 
              dataKey="name" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }}
              dy={10}
            />
            <YAxis 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: '#64748b', fontSize: 10 }}
            />
            <Tooltip 
              contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', fontSize: '12px' }}
              itemStyle={{ fontWeight: 'bold' }}
            />
            <Legend verticalAlign="bottom" height={36} iconType="circle" />
            <Bar name="库存量(斤)" dataKey="inventory" fill={colors[0]} radius={[6, 6, 0, 0]} barSize={24} />
            <Bar name="本月损耗(斤)" dataKey="loss" fill={colors[1]} radius={[6, 6, 0, 0]} barSize={24} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}

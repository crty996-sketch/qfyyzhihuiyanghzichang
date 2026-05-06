import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Calculator, Download, Search, PieChart as PieChartIcon, TrendingUp, Zap, Wind, AlertTriangle, Users, Hammer, ListChecks, Filter as FilterIcon, Info, DollarSign, ChevronDown } from 'lucide-react';
import { TankData } from '../types';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line } from 'recharts';
import * as XLSX from 'xlsx';

interface FinancialReportProps {
  allTanks: TankData[];
  onBack: () => void;
}

const MARKET_PRICES: Record<string, number> = {
  '加州鲈鱼': 18.5,
  '桂鱼': 35.0,
  '生鱼': 11.0,
  '鳗鱼': 42.0,
  'default': 15.0
};

const SPECIES_COST_MULTIPLIER: Record<string, { seed: number, feed: number, med: number, energyMod: number }> = {
  '加州鲈鱼': { seed: 1.5, feed: 6.5, med: 0.5, energyMod: 1.0 },
  '桂鱼': { seed: 3.5, feed: 15.0, med: 1.5, energyMod: 1.2 },
  '鳗鱼': { seed: 5.5, feed: 21.0, med: 3.0, energyMod: 1.5 }, // 目标总单位成本 ~30-32
  '生鱼': { seed: 0.8, feed: 4.5, med: 0.3, energyMod: 0.8 },
  'default': { seed: 1.5, feed: 4.5, med: 0.5, energyMod: 1.0 }
};

export default function FinancialReport({ allTanks, onBack }: FinancialReportProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [speciesFilter, setSpeciesFilter] = useState('all');
  const [timeRange, setTimeRange] = useState<'all' | 'month' | 'today'>('month');
  const [activeTab, setActiveTab] = useState<'table' | 'charts'>('table');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>({ key: 'id', direction: 'asc' });

  // Multiplier simulates time range filtering for mock data
  const timeMultiplier = timeRange === 'all' ? 1 : timeRange === 'month' ? 0.3 : 0.03;

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Generating deterministic mock financial data based on tank inventories and IDs
  const financialData = useMemo(() => {
    // ... same as before
    const rawData = allTanks.map(tank => {
        // ...
      const seedStr = parseInt(tank.id.replace(/[^0-9]/g, '')) || 1;
      
      const inventory = (tank.farming?.currentInventory || 0) * timeMultiplier;
      const species = tank.farming?.species || '-';
      const mPrice = MARKET_PRICES[species] || MARKET_PRICES['default'];
      const costFactors = SPECIES_COST_MULTIPLIER[species] || SPECIES_COST_MULTIPLIER['default'];
      
      // Is the tank actively operating?
      const isOperating = tank.status !== 'empty' && inventory > 0;

      // Cost calculations
      const seedCost = isOperating ? inventory * costFactors.seed + (seedStr * 10 * timeMultiplier) : 0;
      const feedCost = isOperating ? inventory * costFactors.feed + (seedStr * 20 * timeMultiplier) : 0;
      const medCost = isOperating ? inventory * costFactors.med + seedStr * timeMultiplier : 0;
      
      // Electricity: Base kWh + variance
      const kwh = isOperating ? ((1500 + (seedStr * 15) % 1500) * timeMultiplier * costFactors.energyMod) : 0;
      const electricityCost = kwh * 0.42; 
      
      // Oxygen
      const oxygenVol = isOperating ? ((1.5 + ((seedStr * 3) % 4)) * timeMultiplier * costFactors.energyMod) : 0;
      const oxygenCost = oxygenVol * 620; 

      // New: Labor & Depreciation
      const laborCost = isOperating ? (300 * timeMultiplier + (inventory * 0.1)) * costFactors.energyMod : 0;
      // Fixed depreciation could apply to empty tanks, but to avoid user confusion, we zero it out for empty tanks in this view.
      const depCost = isOperating ? (500 * timeMultiplier + (inventory * 0.15)) * costFactors.energyMod : 0;

      const totalCost = seedCost + feedCost + medCost + electricityCost + oxygenCost + laborCost + depCost;
      
      // KPI metrics calculation
      const revenue = inventory * mPrice;
      const profit = revenue - totalCost;
      const unitCost = inventory > 0 ? totalCost / inventory : 0;
      // FCR mock mapping: 1.0 to 1.8
      const fcr = inventory > 0 ? 1.0 + (seedStr % 8) * 0.1 : 0; 

      return {
        id: tank.id,
        species,
        inventory,
        mPrice,
        seedCost,
        feedCost,
        medCost,
        kwh,
        electricityCost,
        oxygenVol,
        oxygenCost,
        laborCost,
        depCost,
        totalCost,
        revenue,
        profit,
        unitCost,
        fcr
      };
    });

    // Anomaly Detection
    const totalInv = rawData.reduce((acc, curr) => acc + curr.inventory, 0);
    const totalKwh = rawData.reduce((acc, curr) => acc + curr.kwh, 0);
    const avgKwhPerKg = totalInv > 0 ? totalKwh / totalInv : 0;

    return rawData.map(item => {
      const kwhPerKg = item.inventory > 0 ? item.kwh / item.inventory : 0;
      const isElecAnomaly = kwhPerKg > avgKwhPerKg * 1.5 && item.inventory > 0;
      const isMedAnomaly = item.medCost > item.totalCost * 0.15 && item.inventory > 0;

      return {
        ...item,
        isElecAnomaly,
        isMedAnomaly
      };
    });
  }, [allTanks, timeMultiplier]);

  const uniqueSpecies = useMemo(() => Array.from(new Set(allTanks.map(t => t.farming?.species).filter(Boolean))), [allTanks]);

  const filteredData = useMemo(() => {
    let data = financialData.filter(item => {
      const matchSearch = (item.id || '').toLowerCase().includes((searchQuery || '').toLowerCase());
      const matchSpecies = speciesFilter === 'all' || item.species === speciesFilter;
      return matchSearch && matchSpecies;
    });

    if (sortConfig) {
      data.sort((a, b) => {
        const aVal = a[sortConfig.key as keyof typeof a];
        const bVal = b[sortConfig.key as keyof typeof b];
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return data;
  }, [financialData, searchQuery, speciesFilter, sortConfig]);

  // Aggregated totals
  const totals = useMemo(() => {
    return filteredData.reduce((acc, curr) => ({
      inventory: acc.inventory + curr.inventory,
      total: acc.total + curr.totalCost,
      revenue: acc.revenue + curr.revenue,
      profit: acc.profit + curr.profit,
      seed: acc.seed + curr.seedCost,
      feed: acc.feed + curr.feedCost,
      med: acc.med + curr.medCost,
      electricity: acc.electricity + curr.electricityCost,
      oxygen: acc.oxygen + curr.oxygenCost,
      labor: acc.labor + curr.laborCost,
      dep: acc.dep + curr.depCost,
    }), { inventory: 0, total: 0, revenue: 0, profit: 0, seed: 0, feed: 0, med: 0, electricity: 0, oxygen: 0, labor: 0, dep: 0 });
  }, [filteredData]);

  const avgUnitCost = totals.inventory > 0 ? totals.total / totals.inventory : 0;
  const avgProfitMargin = totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0;

  const costBreakdownData = [
    { name: '饲料 (Feed)', value: totals.feed, color: '#10b981' }, 
    { name: '苗种 (Seed)', value: totals.seed, color: '#3b82f6' },  
    { name: '动保 (Med)', value: totals.med, color: '#f59e0b' },   
    { name: '能耗 (Energy)', value: totals.electricity + totals.oxygen, color: '#eab308' }, 
    { name: '人工 (Labor)', value: totals.labor, color: '#8b5cf6' },
    { name: '折旧 (Depreciation)', value: totals.dep, color: '#64748b' }   
  ];

  const breakEvenData = [
    { week: '第2周', cost: 10000 * timeMultiplier, value: 0 },
    { week: '第6周', cost: 18000 * timeMultiplier, value: 5000 * timeMultiplier },
    { week: '第10周', cost: 28000 * timeMultiplier, value: 15000 * timeMultiplier },
    { week: '第14周', cost: 40000 * timeMultiplier, value: 35000 * timeMultiplier },
    { week: '第18周', cost: 55000 * timeMultiplier, value: 65000 * timeMultiplier },
    { week: '第22周', cost: 70000 * timeMultiplier, value: 105000 * timeMultiplier },
  ];

  const CustomPieTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-900/95 border border-slate-700 p-4 rounded-xl shadow-2xl backdrop-blur-md">
          <p className="text-slate-100 font-bold mb-1">{payload[0].name}</p>
          <p className="text-cyan-400 font-mono text-lg">¥{payload[0].value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
          <p className="text-slate-400 text-xs mt-1">占比: {((payload[0].value / totals.total) * 100).toFixed(1)}%</p>
        </div>
      );
    }
    return null;
  };

  const handleExport = () => {
    const exportData = filteredData.map(d => ({
      '池号': d.id,
      '品种': d.species,
      '预计出鱼量(斤)': d.inventory,
      '单斤成本(元/斤)': d.unitCost,
      '生鱼FCR': d.fcr,
      '苗种费(元)': d.seedCost,
      '饲料费(元)': d.feedCost,
      '动保费(元)': d.medCost,
      '电费(元)': d.electricityCost,
      '液氧费(元)': d.oxygenCost,
      '人工均摊(元)': d.laborCost,
      '折旧均摊(元)': d.depCost,
      '总成本(元)': d.totalCost,
      '预计收入(元)': d.revenue,
      '预计净利润(元)': d.profit
    }));
    
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "财务报表");
    XLSX.writeFile(wb, `养殖财务核算表_${timeRange}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const formatCurrency = (val: number) => `¥${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] md:h-[calc(100vh-6rem)] bg-slate-950/20 rounded-3xl overflow-hidden border border-slate-800">
      <div className="bg-slate-900/60 border-b border-slate-800 p-3 md:p-6 backdrop-blur-md pb-0 shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4 md:mb-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-rose-500/20 rounded-lg flex items-center justify-center text-rose-400 shrink-0">
              <Calculator size={18} />
            </div>
            <div>
              <h2 className="text-lg md:text-xl font-bold text-slate-100 tracking-wider">财务核算系统</h2>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex bg-slate-900/80 border border-slate-700/80 rounded-lg p-0.5">
              {[
                { id: 'today', label: '今日' },
                { id: 'month', label: '本月' },
                { id: 'all', label: '历史' }
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setTimeRange(t.id as any)}
                  className={`px-3 py-1.5 text-[11px] font-bold rounded-md transition-all ${
                    timeRange === t.id ? 'bg-rose-500/20 text-rose-400' : 'text-slate-400'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-600/90 text-white shadow-sm border border-emerald-500">
              <Download size={14} />
              <span className="hidden sm:inline">导出</span>
            </button>
          </div>
        </div>
        
        <div className="flex overflow-x-auto scrollbar-hide gap-2 border-b border-slate-800">
          <button
            onClick={() => setActiveTab('table')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition-all whitespace-nowrap border-b-2 ${
              activeTab === 'table'
                ? 'text-white border-rose-400'
                : 'text-slate-500 border-transparent'
            }`}
          >
            明细表
          </button>
          <button
            onClick={() => setActiveTab('charts')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition-all whitespace-nowrap border-b-2 ${
              activeTab === 'charts'
                ? 'text-white border-rose-400'
                : 'text-slate-500 border-transparent'
            }`}
          >
            模型图
          </button>
        </div>
      </div>

      <div className="flex-1 p-2 md:p-6 overflow-y-auto bg-slate-900/10 custom-scrollbar flex flex-col gap-4">
        
        {/* Top Summaries - Grid adjusted for smaller screens */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4 shrink-0">
          <div className="bg-slate-900/70 border border-slate-700/80 p-3 rounded-xl flex flex-col justify-center">
            <span className="text-slate-400 text-[10px] font-bold mb-0.5">总核算成本</span>
            <span className="text-sm font-mono font-black text-rose-400">{formatCurrency(totals.total)}</span>
          </div>
          <div className="bg-emerald-900/20 border border-emerald-500/30 p-3 rounded-xl flex flex-col justify-center">
            <span className="text-emerald-500 text-[10px] font-bold mb-0.5">预计收益</span>
            <span className="text-sm font-mono font-bold text-emerald-400">{formatCurrency(totals.revenue)}</span>
          </div>
          <div className="bg-indigo-900/20 border border-indigo-500/30 p-3 rounded-xl flex flex-col justify-center">
            <span className="text-indigo-400 text-[10px] font-bold mb-0.5">预计浮盈</span>
            <span className="text-sm font-mono font-bold text-indigo-300">{formatCurrency(totals.profit)}</span>
            <span className="text-[9px] text-indigo-400/80">{avgProfitMargin.toFixed(0)}%</span>
          </div>
          <div className="bg-slate-900/50 border border-slate-800 p-3 rounded-xl flex flex-col justify-center">
            <span className="text-slate-400 text-[10px] font-bold mb-0.5">单位成本</span>
            <span className="text-sm font-mono font-bold text-blue-400">{avgUnitCost.toFixed(1)} <span className="text-[9px] text-slate-500">元/斤</span></span>
          </div>
        </div>

        {activeTab === 'table' && (
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden flex-1 flex flex-col shadow-xl min-h-[500px]">
            {/* Filters Toolbar */}
            <div className="p-4 border-b border-slate-800 bg-slate-800/20 backdrop-blur-sm flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="relative min-w-[240px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                  <input
                    type="text"
                    placeholder="精准搜索池号..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-950/50 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-rose-500/50 focus:ring-1 focus:ring-rose-500/20 transition-all"
                  />
                </div>
                <div className="relative group">
                  <FilterIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none group-focus-within:text-rose-400 transition-colors" size={14} />
                  <select 
                    value={speciesFilter}
                    onChange={(e) => setSpeciesFilter(e.target.value)}
                    className="bg-slate-950/50 border border-slate-800 rounded-xl pl-10 pr-10 py-2 text-sm text-slate-300 focus:outline-none focus:border-rose-500/50 focus:ring-1 focus:ring-rose-500/20 appearance-none cursor-pointer hover:bg-slate-900 transition-all"
                  >
                    <option value="all">所有品种</option>
                    {uniqueSpecies.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                    <ChevronDown size={14} />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 bg-slate-950/50 px-4 py-2 rounded-xl border border-slate-800">
                 <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded bg-rose-500/80 shadow-[0_0_8px_rgba(244,63,94,0.4)] flex items-center justify-center text-[7px] text-white font-black">!</div> 异常成本预警</span>
                 <div className="w-1 h-3 bg-slate-800 rounded-full" />
                 <span className="text-slate-400">总计: {filteredData.length} 池</span>
              </div>
            </div>

            {/* Main Data Table */}
            <div className="overflow-x-auto flex-1 custom-scrollbar">
              <table className="w-full border-collapse text-[13px] min-w-max text-left">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-900/95 backdrop-blur-md text-slate-400 border-b border-slate-800 text-[11px] uppercase tracking-wider">
                    <th className="py-4 px-6 font-bold bg-slate-900 sticky left-0 z-20 cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('id')}>
                      池号/品种 {sortConfig?.key === 'id' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="py-4 px-6 font-bold text-center cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('inventory')}>
                      出量(斤) {sortConfig?.key === 'inventory' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="py-4 px-6 font-bold text-center cursor-pointer text-cyan-400 hover:text-cyan-300 transition-colors" onClick={() => handleSort('unitCost')}>
                      单位产成本(元/斤) {sortConfig?.key === 'unitCost' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="py-4 px-6 font-bold text-center cursor-pointer text-emerald-400 hover:text-emerald-300 transition-colors" onClick={() => handleSort('fcr')}>
                      FCR系数 {sortConfig?.key === 'fcr' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="py-4 px-6 font-bold text-center cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('feedCost')}>
                      苗/料/药(元) {sortConfig?.key === 'feedCost' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="py-4 px-6 font-bold text-center cursor-pointer text-yellow-500 hover:text-yellow-400 transition-colors" onClick={() => handleSort('electricityCost')}>
                      能耗(元) {sortConfig?.key === 'electricityCost' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="py-4 px-6 font-bold text-center cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('laborCost')}>
                      人均摊(元) {sortConfig?.key === 'laborCost' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="py-4 px-6 font-bold text-center cursor-pointer text-rose-400 hover:text-rose-300 transition-colors" onClick={() => handleSort('totalCost')}>
                      池总成本(元) {sortConfig?.key === 'totalCost' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="py-4 px-6 font-bold text-center cursor-pointer text-indigo-400 hover:text-indigo-300 transition-colors" onClick={() => handleSort('profit')}>
                      预计亏盈(元) {sortConfig?.key === 'profit' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="py-4 px-6 font-bold text-center">状态管控</th>
                  </tr>
                </thead>
                <tbody className="font-medium divide-y divide-slate-800/50">
                  {filteredData.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-800/40 transition-all group border-b border-slate-800/30">
                      <td className="py-3 px-6 font-bold bg-slate-900/40 sticky left-0 z-10 group-hover:bg-slate-800/80 transition-colors border-r border-slate-800/50">
                        <div className="flex flex-col">
                          <span className="text-white text-base font-mono">{item.id}</span>
                          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">{item.species}</span>
                        </div>
                      </td>
                      <td className="py-3 px-6 text-center text-slate-300 font-mono">
                        {item.inventory > 0 ? item.inventory.toLocaleString(undefined, {maximumFractionDigits:0}) : '-'}
                      </td>
                      <td className="py-3 px-6 text-center">
                        <span className="inline-block px-2.5 py-1 rounded-lg bg-cyan-500/5 text-cyan-400 font-bold font-mono">
                          {item.unitCost > 0 ? item.unitCost.toFixed(2) : '-'}
                        </span>
                      </td>
                      <td className={`py-3 px-6 text-center font-bold font-mono ${item.fcr > 1.6 ? 'text-red-400' : 'text-emerald-400'}`}>
                        {item.fcr > 0 ? item.fcr.toFixed(2) : '-'}
                      </td>
                      <td className="py-3 px-6 text-slate-400 text-xs">
                        <div className="flex justify-between gap-4 max-w-[140px] mx-auto border-b border-slate-800/50 pb-1 mb-1">
                          <span className="text-slate-600">苗/料</span>
                          <span className="text-slate-300 font-mono">{(item.seedCost + item.feedCost).toLocaleString(undefined, {maximumFractionDigits:0})}</span>
                        </div>
                        <div className={`flex justify-between gap-4 max-w-[140px] mx-auto ${item.isMedAnomaly ? 'text-red-400 font-bold' : ''}`}>
                          <span className="text-slate-600">动保</span> 
                          <span className="flex items-center gap-1 font-mono">
                            {item.isMedAnomaly && <AlertTriangle size={10} />}
                            {item.medCost.toLocaleString(undefined, {maximumFractionDigits:0})}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-6 text-slate-400 text-xs">
                        <div className={`flex justify-between gap-4 max-w-[120px] mx-auto border-b border-slate-800/50 pb-1 mb-1 ${item.isElecAnomaly ? 'text-red-400 font-bold border-red-500/30' : ''}`}>
                           <span className="text-slate-600">电</span> 
                           <span className="flex items-center gap-1 font-mono">
                             {item.isElecAnomaly && <AlertTriangle size={10} />}
                             {item.electricityCost.toLocaleString(undefined, {maximumFractionDigits:0})}
                           </span>
                        </div>
                        <div className="flex justify-between gap-4 max-w-[120px] mx-auto">
                          <span className="text-slate-600">氧</span>
                          <span className="text-slate-300 font-mono">{item.oxygenCost.toLocaleString(undefined, {maximumFractionDigits:0})}</span>
                        </div>
                      </td>
                      <td className="py-3 px-6 text-slate-500 font-mono text-center">
                        {(item.laborCost + item.depCost).toLocaleString(undefined, {maximumFractionDigits:0})}
                      </td>
                      <td className="py-3 px-6 text-center">
                        <div className="inline-block px-3 py-1.5 rounded-xl bg-rose-500/10 text-rose-400 font-black font-mono text-base border border-rose-500/20">
                          {item.totalCost.toLocaleString(undefined, {maximumFractionDigits:0})}
                        </div>
                      </td>
                      <td className="py-3 px-6 text-center">
                        <div className={`inline-block px-3 py-1.5 rounded-xl font-black font-mono text-base border ${item.profit < 0 ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'}`}>
                          {item.profit > 0 ? '+' : ''}{item.profit.toLocaleString(undefined, {maximumFractionDigits:0})}
                        </div>
                      </td>
                      <td className="py-3 px-6 text-center">
                        {item.isMedAnomaly ? (
                          <button onClick={() => alert(`将为您跳转到 ${item.id} 的病害爆发处置SOP流程与用药记录卡`)} className="text-[10px] flex items-center justify-center gap-1.5 px-3 py-1.5 bg-red-500/15 text-red-300 rounded-lg border border-red-500/20 hover:bg-red-500/25 transition-all mx-auto whitespace-nowrap font-bold">
                            <ListChecks size={14}/>分析记录
                          </button>
                        ) : item.isElecAnomaly ? (
                          <button onClick={() => alert(`将为您下发 ${item.id} 设备的电机检测工单`)} className="text-[10px] flex items-center justify-center gap-1.5 px-3 py-1.5 bg-yellow-500/15 text-yellow-300 rounded-lg border border-yellow-500/20 hover:bg-yellow-500/25 transition-all mx-auto whitespace-nowrap font-bold">
                            <Hammer size={14}/>维护异常
                          </button>
                        ) : (
                          <div className="flex items-center justify-center gap-1.5 text-emerald-500/80 text-[11px] font-bold">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            正常
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredData.length === 0 && (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-500 font-sans">
                          未能检索到符合条件的财务数据
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'charts' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full min-h-[400px]">
             {/* Break-Even Curve Chart */}
             <div className="lg:col-span-2 bg-slate-900/50 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col min-h-[350px]">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-300 flex items-center gap-2 relative z-10">
                  <TrendingUp size={16} className="text-emerald-400" />
                  动态盈亏平衡分析图 (成本投入 vs 鱼货增值曲线)
                </h3>
                <span className="text-[10px] text-slate-500 border border-slate-700 px-2 py-1 rounded bg-slate-950">辅助判断最佳存塘或打捞时机</span>
              </div>
              <div className="flex-1 relative">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={breakEvenData} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.5} />
                    <XAxis dataKey="week" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} dy={10} />
                    <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} dx={-10} tickFormatter={(val) => `¥${val / 10000}万`} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', borderColor: '#334155', borderRadius: '8px' }}
                      itemStyle={{ fontSize: '12px', paddingBottom: '4px' }}
                      formatter={(value: number) => [`¥${value.toLocaleString()}`, '金额']}
                    />
                    <Legend wrapperStyle={{ paddingTop: '20px' }} />
                    <Line type="monotone" name="累计投入成本(含设备折旧)" dataKey="cost" stroke="#ef4444" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    <Line type="monotone" name="预计鱼货市值" dataKey="value" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Pie Chart */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col">
              <h3 className="font-bold text-slate-300 mb-6 flex items-center gap-2 relative z-10">
                <PieChartIcon size={16} className="text-rose-400" />
                全局结构降本分析 (单击扇区可下钻查看批次)*
              </h3>
              <div className="flex-1 relative -mt-6 min-h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart onClick={() => alert('即将加载该科目的下钻层级数据与OCR自动入账单据溯源')}>
                    <Pie
                      data={costBreakdownData}
                      cx="50%"
                      cy="50%"
                      innerRadius={80}
                      outerRadius={120}
                      paddingAngle={5}
                      dataKey="value"
                      stroke="none"
                      className="cursor-pointer hover:opacity-80 transition-opacity"
                    >
                      {costBreakdownData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomPieTooltip />} />
                    <Legend 
                      verticalAlign="bottom" 
                      height={36}
                      formatter={(value, entry: any) => <span style={{ color: entry.color, paddingLeft: 4 }}>{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Top 10 Tanks Bar Chart */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col">
              <h3 className="font-bold text-slate-300 mb-6 flex items-center gap-2">
                <TrendingUp size={16} className="text-rose-400" />
                高成本单元 Top 10 红榜
              </h3>
              <div className="flex-1 min-h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={[...financialData].sort((a,b) => b.totalCost - a.totalCost).slice(0, 10).reverse()}
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#334155" opacity={0.5} />
                    <XAxis type="number" fontSize={10} stroke="#94a3b8" tickFormatter={(val) => val.toLocaleString()} />
                    <YAxis dataKey="id" type="category" fontSize={12} stroke="#94a3b8" axisLine={false} tickLine={false} />
                    <Tooltip 
                      cursor={{fill: '#1e293b'}} 
                      contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', borderColor: '#334155', borderRadius: '8px' }}
                      formatter={(value: number) => [`¥${value.toLocaleString(undefined, {maximumFractionDigits: 2})}`, '总成本']} 
                    />
                    <Bar dataKey="totalCost" fill="#f43f5e" radius={[0, 4, 4, 0]} barSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

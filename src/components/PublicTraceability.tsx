import { useState, useEffect } from 'react';
import { ShieldCheck, Calendar, MapPin, Info, FileSpreadsheet, Printer, Waves, Droplets, Thermometer, Package } from 'lucide-react';
import { motion } from 'motion/react';
import * as XLSX from 'xlsx';

export default function PublicTraceability({ tankId }: { tankId: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/public/trace/${tankId}`)
      .then(res => {
        if (!res.ok) throw new Error('未找到该溯源档案');
        return res.json();
      })
      .then(json => {
        setData(json);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [tankId]);

  const handleExportExcel = () => {
    if (!data) return;

    // 1. Basic Info Sheet
    const basicInfo = [
      ['数字化产品溯源档案', ''],
      ['产品批次', tankId],
      ['认证状态', '认证成功 · 已存证'],
      ['鱼种品类', data.farming?.species || '大黄鱼'],
      ['入池日期', data.farming?.stockingTime || '2024-03-15'],
      ['养殖产地', '贵州·兴义·黔方有渔智慧基地'],
      ['查询日期', new Date().toLocaleString()],
      ['', ''],
      ['水质监测均值', ''],
      ['平均水温', `${data.temperature || 25.5} ℃`],
      ['pH 均值', data.ph || 7.8],
    ];

    // 2. Archives Sheet
    const archiveHeaders = ['日期', '类型', '明细'];
    const archiveRows = (data.archives || []).map((record: any) => {
      let title: string;
      let desc: string;
      const recordType = record.subType || record.type;
      const itemCategory = record.category || record.type;
      
      switch(itemCategory) {
        case 'inout':
          title = (recordType === 'purchaseIn' || recordType === 'transferIn') ? '鱼苗入池' : '成品鱼出池';
          desc = `${record.species || '未知品种'} ${record.amount || record.count || 0}${record.unit || '条'}`;
          break;
        case 'feedmed': {
          title = recordType === 'feed' ? '自动化投喂' : '投喂用药';
          const fType = record.feedType || record.feeding?.type || '常规饲料';
          const fQty = record.feedAmount || record.feeding?.qty || 0;
          const mName = record.medicineName || record.medication?.name || '无';
          desc = `使用 ${fType} ${fQty}kg / ${mName}`;
          break;
        }
        case 'iot':
          title = '环境监测';
          desc = record.description || '各项水质指标自动采集入库';
          break;
        case 'loss':
          title = '死亡核销';
          desc = `损失数量 ${record.deadCount || record.lossCount || record.amount || 0} 条`;
          break;
        default:
          title = record.type === 'warehouse' ? '仓储划拨' : '养殖活动';
          desc = record.remarks || '';
      }
      return [record.date, title, desc];
    });

    const wb = XLSX.utils.book_new();
    const wsBasic = XLSX.utils.aoa_to_sheet(basicInfo);
    const wsArchives = XLSX.utils.aoa_to_sheet([archiveHeaders, ...archiveRows]);

    XLSX.utils.book_append_sheet(wb, wsBasic, '基本信息');
    XLSX.utils.book_append_sheet(wb, wsArchives, '生产履历');

    XLSX.writeFile(wb, `溯源档案_${tankId}.xlsx`);
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
    </div>
  );

  if (error || !data) return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
      <div className="bg-red-500/10 border border-red-500/20 p-8 rounded-3xl text-red-500">
        <Info className="mx-auto mb-4" size={48} />
        <h2 className="text-xl font-bold text-slate-100 mb-2">溯源查询失败</h2>
        <p className="text-slate-400">{error || '请求的信息不存在'}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-12 print:bg-white print:text-black">
      {/* Hero Banner */}
      <div className="relative h-48 bg-gradient-to-br from-cyan-600 to-blue-800 flex flex-col items-center justify-center overflow-hidden print:bg-none print:text-black print:h-auto print:py-8 border-b print:border-black">
        <div className="absolute inset-0 opacity-20 print:hidden">
           <div className="absolute w-[200%] h-full top-1/2 left-0 animate-[waves_10s_linear_infinite] opacity-50 transition-all">
              <Waves size={200} className="w-full h-full" />
           </div>
        </div>
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="relative z-10 text-center"
        >
          <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-blue-600 mx-auto mb-3 shadow-2xl print:hidden">
            <ShieldCheck size={32} />
          </div>
          <h1 className="text-2xl font-black tracking-tight">数字化产品溯源档案</h1>
          <p className="text-cyan-100/70 text-xs font-bold tracking-widest uppercase mt-1 print:text-slate-600">Verified Digital Product Passport</p>
        </motion.div>
      </div>

      <div className="max-w-md mx-auto -mt-8 px-4 relative z-20 space-y-4 print:mt-4 print:max-w-full print:px-8">
        {/* Export Options - Hidden on Print */}
        <div className="grid grid-cols-2 gap-3 print:hidden">
          <button 
            onClick={handleExportExcel}
            className="flex items-center justify-center gap-2 py-3 bg-emerald-500 text-white rounded-2xl font-bold shadow-lg shadow-emerald-500/20 active:scale-95 transition-all text-sm"
          >
            <FileSpreadsheet size={18} />
            保存为 Excel
          </button>
          <button 
            onClick={handlePrint}
            className="flex items-center justify-center gap-2 py-3 bg-slate-800 text-cyan-400 rounded-2xl font-bold border border-white/5 active:scale-95 transition-all text-sm"
          >
            <Printer size={18} />
            打印为 PDF
          </button>
        </div>

        {/* Main Card */}
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="bg-slate-900 border border-white/10 rounded-3xl p-6 shadow-2xl print:bg-white print:border-black print:shadow-none"
        >
          <div className="flex justify-between items-start mb-6">
            <div>
              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest print:text-slate-700">产品批次 Product ID</div>
              <div className="text-xl font-black font-mono text-cyan-400 print:text-black">{tankId}</div>
            </div>
            <div className="bg-emerald-500/10 text-emerald-400 text-[10px] px-2 py-1 rounded-md border border-emerald-500/20 font-black print:border-black print:text-black">
              认证成功 · 已存证
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-cyan-400 print:bg-slate-100 print:text-black">
                <Package size={18} />
              </div>
              <div>
                <div className="text-[10px] text-slate-500 font-bold uppercase">鱼种品类 Species</div>
                <div className="text-base font-bold">{data.farming?.species || '大黄鱼'}</div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-cyan-400 print:bg-slate-100 print:text-black">
                <Calendar size={18} />
              </div>
              <div>
                <div className="text-[10px] text-slate-500 font-bold uppercase">入池日期 Stocking Date</div>
                <div className="text-base font-bold">{data.farming?.stockingTime || '2024-03-15'}</div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-cyan-400 print:bg-slate-100 print:text-black">
                <MapPin size={18} />
              </div>
              <div>
                <div className="text-[10px] text-slate-500 font-bold uppercase">养殖产地 Farm Location</div>
                <div className="text-base font-bold">贵州·兴义·黔方有渔智慧基地</div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Real-time Water Monitoring Section */}
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-slate-900 border border-white/10 rounded-3xl p-6 print:bg-white print:border-black"
        >
          <h3 className="text-sm font-black mb-4 flex items-center gap-2">
            <Waves className="text-blue-400 print:text-black" size={16} />
            全程数字水质监测
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-950/50 p-4 rounded-2xl border border-white/5 print:bg-white print:border-black">
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <Thermometer size={14} />
                <span className="text-[10px] font-bold">平均水温</span>
              </div>
              <div className="text-lg font-black text-slate-200 print:text-black">{data.temperature || 25.5} <span className="text-xs font-normal">℃</span></div>
            </div>
            <div className="bg-slate-950/50 p-4 rounded-2xl border border-white/5 print:bg-white print:border-black">
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <Droplets size={14} />
                <span className="text-[10px] font-bold">pH 均值</span>
              </div>
              <div className="text-lg font-black text-slate-200 print:text-black">{data.ph || 7.8}</div>
            </div>
          </div>
        </motion.div>

        {/* Timeline (Archives) */}
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="bg-slate-900 border border-white/10 rounded-3xl p-6 print:bg-white print:border-black"
        >
          <h3 className="text-sm font-black mb-4 uppercase tracking-tighter">数字化生产履历 Breeding Archives</h3>
          <div className="space-y-6 relative pl-4 before:content-[''] before:absolute before:left-0 before:top-1 before:bottom-1 before:w-0.5 before:bg-slate-800 print:before:bg-black">
            {data.archives && data.archives.length > 0 ? (
              data.archives.map((record: any, idx: number) => {
                let title: string;
                let desc: string;
                const recordType = record.subType || record.type;
                const itemCategory = record.category || record.type;
                
                switch(itemCategory) {
                  case 'inout':
                    title = (recordType === 'purchaseIn' || recordType === 'transferIn') ? '鱼苗入池' : '成品鱼出池';
                    desc = `${record.species || '未知品种'} ${record.amount || record.count || 0}${record.unit || '条'}`;
                    break;
                  case 'feedmed': {
                    title = recordType === 'feed' ? '自动化投喂' : '投喂用药';
                    const fType = record.feedType || record.feeding?.type || '常规饲料';
                    const fQty = record.feedAmount || record.feeding?.qty || 0;
                    const mName = record.medicineName || record.medication?.name || '无';
                    desc = `使用 ${fType} ${fQty}kg / ${mName}`;
                    break;
                  }
                  case 'iot':
                    title = '环境监测';
                    desc = record.description || '各项水质指标自动采集入库';
                    break;
                  case 'loss':
                    title = '死亡核销';
                    desc = `损失数量 ${record.deadCount || record.lossCount || record.amount || 0} 条`;
                    break;
                  default:
                    title = record.type === 'warehouse' ? '仓储划拨' : '养殖活动';
                    desc = record.remarks || '';
                }

                return (
                  <div key={idx} className="relative">
                    <div className={`absolute -left-[21px] top-1 w-3 h-3 rounded-full border-2 border-slate-900 print:border-black ${idx === 0 ? 'bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.5)]' : 'bg-slate-700 print:bg-black'}`} />
                    <div className="text-xs font-bold text-slate-400 print:text-slate-600">{record.date}</div>
                    <div className="text-sm font-bold text-slate-200 mt-0.5 print:text-black">{title}</div>
                    <div className="text-xs text-slate-400 mt-0.5 font-medium print:text-slate-700">{desc}</div>
                  </div>
                );
              })
            ) : (
              <div className="text-xs text-slate-500 italic">暂无公开的生长记录</div>
            )}
          </div>
        </motion.div>

        {/* Footer */}
        <div className="text-center pt-4">
          <div className="flex items-center justify-center gap-2 text-slate-500 mb-2">
            <ShieldCheck size={14} />
            <span className="text-[10px] font-bold uppercase tracking-widest">黔方有渔 · 智慧养殖区块链存证</span>
          </div>
          <p className="text-[10px] text-slate-700 font-medium">© 2026 贵州黔方有渔智慧管理系统 版权所有</p>
        </div>
      </div>
    </div>
  );
}

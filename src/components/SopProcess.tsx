import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ClipboardList, AlertTriangle, Droplet, Fish, Settings, CheckCircle2, ChevronRight, FileSliders, PlusCircle, Check, Loader2, X } from 'lucide-react';
import { createPortal } from 'react-dom';

interface SopProcessProps {
  onBack: () => void;
}

export default function SopProcess({ onBack }: SopProcessProps) {
  const [activeTab, setActiveTab] = useState('daily');
  const [loggingStep, setLoggingStep] = useState<any>(null);
  const [tanks, setTanks] = useState<any[]>([]);
  const [selectedTank, setSelectedTank] = useState('');
  const [feedAmount, setFeedAmount] = useState('50.0');
  const [feedType, setFeedType] = useState('高效配合饲料');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [warehouseFeeds, setWarehouseFeeds] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/tanks').then(res => res.json()).then(data => {
      const list = Array.isArray(data) ? data : Object.values(data);
      setTanks(list);
      if (list.length > 0) setSelectedTank(list[0].id);
    });
    
    fetch('/api/warehouse?category=feed').then(res => res.json()).then(data => {
      setWarehouseFeeds(data);
      if (data.length > 0) setFeedType(data[0].name);
    });
  }, []);

  const handleLogFeeding = async () => {
    if (!selectedTank || !feedAmount) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/records/feedmed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tankId: selectedTank,
          date: new Date().toISOString().split('T')[0],
          feedType,
          feedAmount: parseFloat(feedAmount),
          medicineName: '无',
          medicineAmount: '0',
          spec: 0.85,
          deadCount: 0
        })
      });
      if (res.ok) {
        setLoggingStep(null);
        alert(`已成功登记 ${selectedTank} 的投喂记录并扣减库存`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const sops = {
    daily: {
      id: 'daily',
      title: '日常养殖管理规范',
      icon: <Fish className="text-cyan-400" />,
      steps: [
        { title: '晨间巡护', desc: '检查鱼群活动度、水面有无异常泡沫或死鱼。', time: '06:00 - 08:00' },
        { title: '测量水参数', desc: '记录温度、pH、溶氧。', time: '08:00 - 08:30' },
        { title: '第一餐投喂', desc: '按标准量投喂，观察摄食情况，30分钟后清理残饵。', time: '08:30 - 09:30' },
        { title: '午间巡查', desc: '检查水循环流速及溶氧指标是否正常。', time: '13:00 - 14:00' },
        { title: '第二餐投喂', desc: '根据气温及晨间摄食情况调整投喂量。', time: '17:00 - 18:00' }
      ]
    },
    water: {
      id: 'water',
      title: '水质异常应急处理 SOP',
      icon: <Droplet className="text-emerald-400" />,
      steps: [
        { title: '第一步：确认报警类型', desc: '确定是溶氧过低、氨氮超标还是pH异常。' },
        { title: '溶氧过低 (<4.0)', desc: '立即开启备用增氧机，加大水流循环。若持续不升，使用化学制氧剂。' },
        { title: '氨氮超标', desc: '停止当餐投喂，开启水处理排污阀门排底，随后补充 EM 菌或其他水质改良剂。' },
        { title: 'pH异常跌落', desc: '分次泼洒生石灰或小苏打，每次调节幅度不超过 0.5。' },
        { title: '复测与反馈', desc: '处理后 1 小时必须重新测量指标并录入系统。' }
      ]
    },
    disease: {
      id: 'disease',
      title: '病害爆发处置流程',
      icon: <AlertTriangle className="text-red-400" />,
      steps: [
        { title: '隔离死鱼/病鱼', desc: '发现死鱼 or 明显病态游动鱼只，立即捞出并送实验室检测，禁止随意丢弃。', isCritical: true },
        { title: '停止投喂与循环', desc: '发病池停止投水投料，断开与其他健康池的共用水循环，切断传染源。', isCritical: true },
        { title: '诊断与用药', desc: '联系技术员确诊疾病类型，按照药典和专家建议配制药浴或药饵。' },
        { title: '高频监测', desc: '用药期间每 4 小时记录一次水质及死亡数量，直至情况稳定。' },
        { title: '消毒清池', desc: '若无法控制决定清池，必须使用高锰酸钾或强氯精彻底刷洗管道及池壁。' }
      ]
    },
    equipment: {
      id: 'equipment',
      title: '设备维护与保养 SOP',
      icon: <Settings className="text-orange-400" />,
      steps: [
        { title: '微滤机反冲洗', desc: '每天至少全量反冲洗一次，检查滤网有无破损，水喷头是否堵塞。' },
        { title: '生物滤池检查', desc: '每周观察滤料（如生化球）表面挂膜状态，避免死水区产生。不要用自来水直接冲洗。' },
        { title: '水泵轮换', desc: '系统内主备水泵每半个月切换运行一次，记录电流及震动情况。' },
        { title: 'UV杀菌灯管更换', desc: '记录运行时间，累计达 8000 小时必须更换灯管，清理石英套管水垢。' }
      ]
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] md:h-[calc(100vh-6rem)] bg-slate-950/20 rounded-3xl overflow-hidden border border-slate-800">
      <div className="bg-slate-900/60 border-b border-slate-800 p-3 md:p-6 backdrop-blur-md pb-0 shrink-0">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-7 h-7 bg-indigo-500/20 rounded-lg flex items-center justify-center text-indigo-400">
            <ClipboardList size={16} />
          </div>
          <h2 className="text-xl font-semibold text-slate-100 tracking-wide">标准作业程序 (SOP)</h2>
        </div>
        
        {/* Tab Navigation */}
        <div className="flex overflow-x-auto scrollbar-hide gap-1 border-b border-slate-800 flex-nowrap" style={{ WebkitOverflowScrolling: 'touch' }}>
          {Object.entries(sops).map(([key, data]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key as any)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-all whitespace-nowrap border-b-2 ${
                activeTab === key
                  ? 'text-white border-indigo-400'
                  : 'text-slate-500 border-transparent hover:text-slate-300'
              }`}
            >
              {React.cloneElement(data.icon as React.ReactElement, { size: 14 })}
              {data.title.replace(' SOP', '')}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 p-3 md:p-8 overflow-y-auto bg-slate-900/10 custom-scrollbar">
        <div className="max-w-4xl mx-auto h-full">
          {/* Action Modals */}
          <AnimatePresence>
            {loggingStep && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                <motion.div 
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
                  onClick={() => setLoggingStep(null)}
                />
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 20 }}
                  className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl"
                >
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                       <Fish size={18} className="text-cyan-400" />
                       执行投喂登记
                    </h3>
                    <button onClick={() => setLoggingStep(null)} className="text-slate-500 hover:text-white transition-colors">
                      <X size={20} />
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest block mb-1.5">选择养殖池</label>
                      <select 
                        value={selectedTank}
                        onChange={(e) => setSelectedTank(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white font-medium focus:outline-none focus:border-cyan-500/50"
                      >
                        {tanks.map(t => (
                          <option key={t.id} value={t.id}>{t.id} 系统</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest block mb-1.5">选择饲料类型</label>
                      <select 
                        value={feedType}
                        onChange={(e) => setFeedType(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white font-medium focus:outline-none focus:border-cyan-500/50"
                      >
                        {warehouseFeeds.length > 0 ? (
                           warehouseFeeds.map(f => (
                             <option key={f.id} value={f.name}>{f.name} ({f.location})</option>
                           ))
                        ) : (
                          <option value="高效配合饲料">高效配合饲料</option>
                        )}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest block mb-1.5">投喂量 (KG)</label>
                      <div className="relative">
                        <input 
                          type="number"
                          step="0.1"
                          value={feedAmount}
                          onChange={(e) => setFeedAmount(e.target.value)}
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-lg text-white font-mono font-medium focus:outline-none focus:border-cyan-500/50"
                        />
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 font-medium">KG</div>
                      </div>
                    </div>

                    <button 
                      onClick={handleLogFeeding}
                      disabled={isSubmitting}
                      className="w-full py-4 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl font-bold uppercase tracking-wider text-sm transition-all shadow-[0_0_20px_rgba(6,182,212,0.3)] flex items-center justify-center gap-2"
                    >
                      {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}
                      确认并同步仓储扣减
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 md:p-8 shadow-xl">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xl md:text-2xl font-semibold text-white flex items-center gap-3">
                    {React.cloneElement(sops[activeTab as keyof typeof sops].icon as React.ReactElement, { size: 20 })}
                    {sops[activeTab as keyof typeof sops].title}
                  </h3>
                </div>
                <p className="text-slate-400 text-sm mb-8 font-medium">请严格遵守该流程，遇到无法处理的情况立即上报主管人员。</p>
                
                <div className="relative border-l-2 border-slate-700/50 ml-2 md:ml-4 space-y-4 md:space-y-8">
                  {sops[activeTab as keyof typeof sops].steps.map((step, index) => (
                    <div key={index} className="relative pl-4 md:pl-8">
                      {/* Timeline node */}
                      <div className={`absolute -left-[9px] top-3 w-4 h-4 rounded-full flex items-center justify-center ${step.isCritical ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'bg-slate-800 border-2 border-indigo-500'}`}>
                        {step.isCritical ? <AlertTriangle size={8} className="text-white" /> : <div className="w-1 h-1 bg-indigo-400 rounded-full"></div>}
                      </div>
                      
                      <div className={`p-3 md:p-6 rounded-xl border ${step.isCritical ? 'bg-red-500/10 border-red-500/20' : 'bg-slate-800/30 border-slate-700/50'} hover:bg-slate-800/80 transition-colors group relative`}>
                        <div className="flex flex-col md:flex-row md:items-center justify-between mb-2 gap-1">
                           <h4 className={`text-base md:text-lg font-semibold flex items-center gap-3 ${step.isCritical ? 'text-red-400' : 'text-slate-200'}`}>
                              <span className="text-slate-500 font-mono text-sm pt-0.5">{(index + 1).toString().padStart(2, '0')}</span>
                              {step.title}
                           </h4>
                           <div className="flex items-center gap-3">
                             {step.time && <span className="text-[11px] font-mono px-2 py-0.5 bg-slate-950/50 rounded text-cyan-400 self-start md:self-auto border border-slate-800 whitespace-nowrap font-medium">{step.time}</span>}
                             {activeTab === 'daily' && step.title.includes('投喂') && (
                               <button 
                                 onClick={() => setLoggingStep({ ...step, index })}
                                 className="px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-lg text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-lg active:scale-95"
                               >
                                 <PlusCircle size={12} />
                                 登记作业
                               </button>
                             )}
                           </div>
                        </div>
                        <p className="text-slate-400 leading-relaxed text-sm md:text-base font-medium mt-1">
                          {step.desc}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="p-5 bg-indigo-500/10 rounded-2xl border border-indigo-500/20 flex flex-col sm:flex-row items-start gap-4">
                 <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center shrink-0">
                   <FileSliders className="text-indigo-400" size={20} />
                 </div>
                 <div>
                    <h5 className="text-indigo-300 font-bold mb-2 text-sm uppercase tracking-wider">执行记录通用要求</h5>
                    <p className="text-sm text-slate-400 leading-relaxed">完成任何 SOP 流程后，各班组需确切地在此系统中录入对应的行动数据。对于标有“登记作业”的步骤，请点击按钮进行实时库存扣减登记。</p>
                 </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

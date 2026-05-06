import { useState, useMemo, useEffect, useRef } from 'react';
import { ArrowLeft, Search, QrCode, Printer, ShieldCheck, Calendar, Info, MapPin } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeCanvas } from 'qrcode.react';
import { TankData } from '../types';

interface TraceabilityManagementProps {
  allTanks: TankData[];
  onBack: () => void;
}

export default function TraceabilityManagement({ allTanks, onBack }: TraceabilityManagementProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTank, setSelectedTank] = useState<TankData | null>(null);
  const [qrImageSrc, setQrImageSrc] = useState<string>('');

  useEffect(() => {
    if (selectedTank) {
      const timer = setTimeout(() => {
        const canvasWrapper = document.getElementById('qr-canvas-wrapper');
        const canvas = canvasWrapper?.querySelector('canvas');
        if (canvas) {
          setQrImageSrc(canvas.toDataURL('image/png'));
        }
      }, 100);
      return () => clearTimeout(timer);
    } else {
      setQrImageSrc('');
    }
  }, [selectedTank]);

  const filteredTanks = useMemo(() => {
    return allTanks.filter(t => 
      t.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.farming?.species.toLowerCase().includes(searchQuery.toLowerCase())
    ).filter(t => t.status !== 'empty'); // Only show tanks with fish
  }, [allTanks, searchQuery]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Header Area */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/40 border border-slate-800 p-4 rounded-2xl backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl transition-all text-slate-400 hover:text-white"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-xl font-black text-slate-100 flex items-center gap-2">
              <QrCode className="text-cyan-400" size={24} />
              溯源管理系统
            </h2>
            <p className="text-xs text-slate-500 font-bold tracking-wider uppercase opacity-60">Traceability & Digital Certificate</p>
          </div>
        </div>

        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
          <input 
            type="text"
            placeholder="搜索批次/养殖池..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950/50 border border-slate-800 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-cyan-500 transition-all"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tank List */}
        <div className="lg:col-span-1 space-y-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
          {filteredTanks.length === 0 ? (
            <div className="bg-slate-900/20 border border-slate-800/50 rounded-2xl p-8 text-center">
              <Info className="mx-auto text-slate-700 mb-2" size={32} />
              <p className="text-slate-500 text-sm">暂无符合条件的溯源信息</p>
            </div>
          ) : (
            filteredTanks.map(tank => (
              <button
                key={tank.id}
                onClick={() => setSelectedTank(tank)}
                className={`w-full p-4 rounded-2xl border transition-all flex items-center justify-between group ${
                  selectedTank?.id === tank.id 
                    ? 'bg-cyan-500/10 border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.1)]' 
                    : 'bg-slate-900/40 border-slate-800 hover:border-slate-700 hover:bg-slate-900/60'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                    selectedTank?.id === tank.id ? 'bg-cyan-500 text-slate-950' : 'bg-slate-800 text-slate-400 group-hover:text-cyan-400'
                  }`}>
                    <QrCode size={20} />
                  </div>
                  <div className="text-left">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-200">{tank.id}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-800 text-slate-500 border border-slate-700 uppercase">
                        {tank.farming?.species || '未知品种'}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 font-bold mt-1">
                      入池日期: {tank.farming?.stockingTime || '未设置'}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                   <div className="text-xs font-black text-cyan-400/80">{tank.farming?.currentInventory || 0} <span className="text-[10px] opacity-60">斤</span></div>
                   <div className="text-[10px] text-slate-500 uppercase">当前存栏</div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Certificate Display */}
        <div className="lg:col-span-2">
          <AnimatePresence mode="wait">
            {selectedTank ? (
              <motion.div
                key={selectedTank.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 min-h-[500px] flex flex-col relative overflow-hidden print:p-0 print:border-0 print:bg-white print:text-black"
              >
                {/* Certificate Background Elements (Not visible in print) */}
                <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none print:hidden text-cyan-400 rotate-12">
                   <ShieldCheck size={200} />
                </div>

                <div id="traceability-certificate" className="relative flex-1 flex flex-col gap-8 print:w-full print:max-w-2xl print:mx-auto">
                    {/* Header */}
                    <div className="flex justify-between items-start border-b border-slate-800/50 pb-6 print:border-black/10">
                        <div>
                            <h3 className="text-2xl font-black text-slate-100 print:text-black tracking-tighter">
                                数字化产品溯源证书
                            </h3>
                            <p className="text-sm font-bold text-cyan-500 print:text-blue-600 tracking-widest uppercase">Digital Traceability Certificate</p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                             <div className="text-[10px] text-slate-500 font-mono tracking-widest">CERTIFICATE NO.</div>
                             <div className="text-sm font-mono font-bold text-slate-300 print:text-black uppercase">QFYY-{selectedTank.id}-{Date.now().toString().slice(-6)}</div>
                        </div>
                    </div>

                    {/* Main Content */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                         <div className="space-y-6">
                            <div className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                                        <Info size={16} />
                                    </div>
                                    <div>
                                        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">产品信息 Product Info</div>
                                        <div className="text-lg font-black text-slate-100 print:text-black">{selectedTank.farming?.species}</div>
                                    </div>
                                </div>
                                
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                                        <Calendar size={16} />
                                    </div>
                                    <div>
                                        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">投苗批次 Batch Date</div>
                                        <div className="text-base font-bold text-slate-200 print:text-black">{selectedTank.farming?.stockingTime || '2024-03-15'}</div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                                        <MapPin size={16} />
                                    </div>
                                    <div>
                                        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">产地 Origin</div>
                                        <div className="text-base font-bold text-slate-200 print:text-black">贵州·兴义·黔方有渔智慧养殖基地</div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                                        <ShieldCheck size={16} />
                                    </div>
                                    <div>
                                        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">认证标准 Certification</div>
                                        <div className="text-base font-bold text-emerald-400 print:text-emerald-600">生态智慧养殖标准 · 无抗生素</div>
                                    </div>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-slate-800/50 print:border-black/10">
                                <div className="text-[10px] text-slate-500 font-bold mb-3 uppercase">溯源全流程 Traceability Link</div>
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.6)]" />
                                        <span className="text-xs text-slate-300 print:text-black">2024-03-15 投苗入池 (规格: {selectedTank.farming?.size})</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-cyan-500/50" />
                                        <span className="text-xs text-slate-400 print:text-black/60">全程水质自动实时监测 (水温: {selectedTank.temperature}℃, pH: {selectedTank.ph})</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-cyan-500/50" />
                                        <span className="text-xs text-slate-400 print:text-black/60">饲料投喂溯源：优选高蛋白膨化颗粒料</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-cyan-500/50" />
                                        <span className="text-xs text-slate-400 print:text-black/60">出池日期：预计 {new Date(new Date(selectedTank.farming?.stockingTime || Date.now()).getTime() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}</span>
                                    </div>
                                </div>
                            </div>
                         </div>

                        <div className="flex flex-col items-center justify-center gap-4 bg-white/5 border border-white/10 rounded-3xl p-8 print:bg-white print:border-black">
                            <div className="bg-white p-4 rounded-2xl shadow-2xl relative">
                                <div id="qr-canvas-wrapper" style={{ display: qrImageSrc ? 'none' : 'block' }}>
                                    <QRCodeCanvas 
                                        value={`${window.location.origin}/api/public/trace/${selectedTank.id}/export`}
                                        size={160}
                                        level="H"
                                        includeMargin={false}
                                    />
                                </div>
                                {qrImageSrc && (
                                    <img 
                                        src={qrImageSrc} 
                                        alt="Product Traceability QR Code" 
                                        style={{ width: 160, height: 160, display: 'block' }}
                                    />
                                )}
                            </div>
                            <div className="text-center">
                                <p className="text-sm font-black text-slate-100 print:text-black">扫码查看数字化档案</p>
                                <p className="text-[10px] text-slate-500 print:text-black/60 mt-1 uppercase tracking-widest leading-relaxed">
                                    Scan to verify digital lifecycle<br/>
                                    and water quality reports
                                </p>
                            </div>
                         </div>
                    </div>

                    {/* Footer Info */}
                    <div className="mt-auto pt-8 border-t border-slate-800/50 flex justify-between items-end print:border-black/20">
                        <div className="flex items-center gap-3">
                             <div className="w-12 h-12 bg-cyan-500 rounded-xl flex items-center justify-center text-slate-950 font-black text-2xl shadow-lg">鱼</div>
                             <div className="flex flex-col">
                                <span className="text-xs font-bold text-slate-200 print:text-black">黔方有渔智慧管理平台</span>
                                <span className="text-[10px] text-slate-500 print:text-black/60">区块链存证 · 数据不可篡改</span>
                             </div>
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                            VERIFIED BY QFYY SYSTEM<br/>
                            {new Date().toLocaleString()}
                        </div>
                    </div>
                </div>

                {/* Print Button (Hidden in print) */}
                <button 
                  onClick={handlePrint}
                  className="absolute bottom-6 right-6 p-4 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-2xl shadow-xl shadow-cyan-500/20 transition-all flex items-center gap-2 font-black print:hidden"
                >
                  <Printer size={20} />
                  打印证书
                </button>
              </motion.div>
            ) : (
              <div className="h-full bg-slate-900/20 border border-slate-800 border-dashed rounded-3xl flex flex-col items-center justify-center p-12 text-center opacity-50">
                <QrCode className="text-slate-700 mb-4" size={64} />
                <h3 className="text-xl font-bold text-slate-400">请选择一个养殖池</h3>
                <p className="text-sm text-slate-500 max-w-xs mt-2">点击左侧列表中的养殖池来生成并查看数字溯源证书</p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>

       <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * {
            visibility: hidden;
          }
          #traceability-certificate, #traceability-certificate * {
            visibility: visible;
          }
          #traceability-certificate {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}} />
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, Building2, TrendingUp, MapPin, Info, ChevronRight, Edit3, Save, RotateCcw } from 'lucide-react';

interface CompanyProfileData {
  introduction: string;
  performance: string;
  projects: string;
  cooperation: string;
}

interface CompanyProfileProps {
  onClose: () => void;
}

export default function CompanyProfile({ onClose }: CompanyProfileProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<CompanyProfileData>({
    introduction: '',
    performance: '',
    projects: '',
    cooperation: ''
  });

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/company-profile');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Failed to fetch profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/company-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(data)
      });
      if (res.ok) {
        setIsEditing(false);
      } else {
        const errJson = await res.json();
        alert(errJson.error || '保存失败');
      }
    } catch (err) {
      console.error('Save failed:', err);
      alert('保存失败，请检查网络');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-[110] bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[110] bg-slate-950 flex flex-col overflow-hidden text-slate-200">
      {/* Background Image */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center opacity-40 transition-all duration-1000" 
        style={{ 
          backgroundImage: 'url("https://images.unsplash.com/photo-1544333346-64799de3564c?auto=format&fit=crop&q=80&w=2070")',
          backgroundBlendMode: 'overlay'
        }} 
      />
      {/* Overlay to ensure readability */}
      <div className="absolute inset-0 z-[1] bg-slate-950/50" />

      {/* Top Navigation Bar */}
      <header className="h-16 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md px-6 flex items-center justify-between flex-shrink-0 relative z-10">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-cyan-600 rounded-lg flex items-center justify-center shadow-lg">
            <span className="text-white font-black text-xl italic">渔</span>
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">基本情况介绍</h2>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isEditing ? (
            <>
              <button 
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 text-slate-400 hover:text-white transition-colors text-sm font-bold flex items-center gap-2"
              >
                <RotateCcw size={16} />
                取消
              </button>
              <button 
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 rounded-lg font-bold text-sm transition-all flex items-center gap-2 shadow-lg shadow-cyan-500/20"
              >
                {saving ? <div className="animate-spin h-4 w-4 border-2 border-slate-950 border-t-transparent rounded-full" /> : <Save size={16} />}
                保存更改
              </button>
            </>
          ) : (
            <button 
              onClick={() => setIsEditing(true)}
              className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold text-sm transition-all flex items-center gap-2"
            >
              <Edit3 size={16} />
              编辑内容
            </button>
          )}
          <div className="w-px h-6 bg-slate-800 mx-2" />
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>
      </header>

      {/* Main Content Body */}
      <main className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-12 relative z-10">
        <div className="max-w-4xl mx-auto space-y-16 pb-20">
          
          {/* Section 1: Introduction */}
          <section className="space-y-6">
            <h3 className="text-cyan-400 font-bold flex items-center gap-3 text-xl border-l-4 border-cyan-500 pl-4 py-1">
              <Building2 size={24} />
              <span>一、公司简介</span>
            </h3>
            {isEditing ? (
              <textarea 
                value={data.introduction}
                onChange={(e) => setData({ ...data, introduction: e.target.value })}
                className="w-full h-64 bg-slate-900 border border-slate-700 rounded-xl p-6 text-slate-200 focus:border-cyan-500 outline-none transition-colors leading-relaxed"
                placeholder="请输入公司简介内容..."
              />
            ) : (
              <div className="text-slate-300 leading-relaxed text-lg whitespace-pre-wrap pl-5">
                {data.introduction}
              </div>
            )}
          </section>

          {/* Section 2: Business & Performance */}
          <section className="space-y-6">
            <h3 className="text-cyan-400 font-bold flex items-center gap-3 text-xl border-l-4 border-cyan-500 pl-4 py-1">
              <TrendingUp size={24} />
              <span>二、主要业务与经营情况</span>
            </h3>
            {isEditing ? (
              <textarea 
                value={data.performance}
                onChange={(e) => setData({ ...data, performance: e.target.value })}
                className="w-full h-64 bg-slate-900 border border-slate-700 rounded-xl p-6 text-slate-200 focus:border-cyan-500 outline-none transition-colors leading-relaxed"
                placeholder="请输入业务及营收情况内容..."
              />
            ) : (
              <div className="text-slate-300 leading-relaxed text-lg whitespace-pre-wrap pl-5">
                {data.performance}
              </div>
            )}
          </section>

          {/* Section 3: Engineering Projects */}
          <section className="space-y-6">
            <h3 className="text-cyan-400 font-bold flex items-center gap-3 text-xl border-l-4 border-cyan-500 pl-4 py-1">
              <MapPin size={24} />
              <span>三、基地工程建设</span>
            </h3>
            {isEditing ? (
              <textarea 
                value={data.projects}
                onChange={(e) => setData({ ...data, projects: e.target.value })}
                className="w-full h-48 bg-slate-900 border border-slate-700 rounded-xl p-6 text-slate-200 focus:border-cyan-500 outline-none transition-colors leading-relaxed"
                placeholder="请输入基地建设情况内容..."
              />
            ) : (
              <div className="text-slate-300 leading-relaxed text-lg whitespace-pre-wrap pl-5">
                {data.projects}
              </div>
            )}
          </section>

          {/* Section 4: Science & Cooperation */}
          <section className="space-y-6">
            <h3 className="text-cyan-400 font-bold flex items-center gap-3 text-xl border-l-4 border-cyan-500 pl-4 py-1">
              <Info size={24} />
              <span>四、产学研合作与愿景</span>
            </h3>
            {isEditing ? (
              <textarea 
                value={data.cooperation}
                onChange={(e) => setData({ ...data, cooperation: e.target.value })}
                className="w-full h-48 bg-slate-900 border border-slate-700 rounded-xl p-6 text-slate-200 focus:border-cyan-500 outline-none transition-colors leading-relaxed"
                placeholder="请输入合作及愿景内容..."
              />
            ) : (
              <div className="text-slate-300 leading-relaxed text-lg whitespace-pre-wrap pl-5">
                {data.cooperation}
              </div>
            )}
          </section>

        </div>
      </main>

      {/* Footer Branding */}
      <footer className="h-10 border-t border-slate-800 bg-slate-900/50 backdrop-blur-md flex items-center justify-center flex-shrink-0 relative z-10">
        <p className="text-[10px] text-slate-600 font-bold tracking-[0.4em] uppercase">
          Guizhou Qianfang Youyu Aquaculture Technology Co., Ltd. // Information Management System
        </p>
      </footer>
    </div>
  );
}

import { motion } from 'motion/react';
import { User, Settings as SettingsIcon, Shield, Bell, LogOut, Save, Users, Loader2, Check, LayoutTemplate } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import UserManagement from './UserManagement';

interface SettingsProps {
  user: any;
  onLogout: () => void;
}

export default function Settings({ user, onLogout }: SettingsProps) {
  const [activeTab, setActiveTab] = useState<'profile' | 'system' | 'company' | 'users' | 'menu'>('profile');
  const [companyData, setCompanyData] = useState<any>(null);
  const [menuConfig, setMenuConfig] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [profileData, setProfileData] = useState({
    name: user?.name || '',
    username: user?.username || '',
    password: '',
    phone: '',
    email: ''
  });

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    const fetchFullUser = async () => {
      try {
        const res = await fetch('/api/auth/me', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        if (res.ok) {
          const { user: fullUser } = await res.json();
          setProfileData({
            name: fullUser.name || '',
            username: fullUser.username || '',
            password: '',
            phone: fullUser.phone || '',
            email: fullUser.email || ''
          });
        }
      } catch (err) {
        console.error('Failed to fetch full user profile:', err);
      }
    };
    
    const fetchMenuConfig = async () => {
      try {
        const res = await fetch('/api/menu-config');
        if (res.ok) {
          const data = await res.json();
          setMenuConfig(data);
        }
      } catch (err) {
        console.error('Failed to fetch menu config:', err);
      }
    };
    
    if (user) {
      fetchFullUser();
    }
    fetchCompanyProfile();
    fetchMenuConfig();
  }, [user]);

  const handleSaveMenuConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/menu-config', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(menuConfig)
      });
      
      if (res.ok) {
        showToast('菜单显示名称已更新');
      } else {
        const err = await res.json().catch(() => ({ error: '保存失败' }));
        showToast(err.error || '保存失败');
      }
    } catch (err) {
      showToast('网络连接异常');
    } finally {
      setLoading(false);
    }
  };

  const fetchCompanyProfile = async () => {
    try {
      const res = await fetch('/api/company-profile');
      if (res.ok) {
        setCompanyData(await res.json());
      }
    } catch (err) {
      console.error('Failed to fetch company profile:', err);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (!user?.id) {
        showToast('用户信息加载中，请稍后...');
        setLoading(false);
        return;
      }
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(profileData)
      });
      
      if (res.ok) {
        showToast('个人资料保存成功！');
        // Refresh full user data to sync UI
        const refreshRes = await fetch('/api/auth/me', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        if (refreshRes.ok) {
          const { user: updatedUser } = await refreshRes.json();
          setProfileData({
            name: updatedUser.name || '',
            username: updatedUser.username || '',
            password: '',
            phone: updatedUser.phone || '',
            email: updatedUser.email || ''
          });
        }
      } else {
        const err = await res.json().catch(() => ({ error: '保存失败 (服务器响应异常)' }));
        showToast(err.error || '保存失败');
      }
    } catch (err) {
      showToast('保存失败，请检查网络连接');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const form = e.target as HTMLFormElement;
      const formData = new FormData(form);
      const data = Object.fromEntries(formData.entries());
      
      const res = await fetch('/api/company-profile', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(data)
      });
      
      if (res.ok) {
        showToast('公司信息保存成功！');
        setCompanyData(data);
      } else {
        const err = await res.json().catch(() => ({ error: '保存失败' }));
        showToast(err.error || '保存失败');
      }
    } catch (err) {
      showToast('保存失败，请检查网络连接');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-slate-900/60 border border-slate-800/80 p-6 rounded-3xl backdrop-blur-md shadow-lg shadow-black/20">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center text-white text-2xl font-bold shadow-[0_0_15px_rgba(34,211,238,0.4)]">
            {user?.name?.charAt(0) || 'U'}
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-100">{user?.name || '未知用户'}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-400 text-xs rounded-md border border-cyan-500/30">
                {user?.role === 'admin' ? '系统管理员' : '普通用户'}
              </span>
              <span className="text-sm text-slate-400">@{user?.username}</span>
            </div>
          </div>
        </div>

        <div className="flex gap-4 border-b border-slate-800 mb-6">
          <button
            onClick={() => setActiveTab('profile')}
            className={`pb-3 px-2 text-sm font-medium transition-colors relative ${activeTab === 'profile' ? 'text-cyan-400' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <div className="flex items-center gap-2">
              <User size={16} />
              个人资料
            </div>
            {activeTab === 'profile' && (
              <motion.div layoutId="settingsTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400 rounded-t-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('system')}
            className={`pb-3 px-2 text-sm font-medium transition-colors relative ${activeTab === 'system' ? 'text-cyan-400' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <div className="flex items-center gap-2">
              <SettingsIcon size={16} />
              系统设置
            </div>
            {activeTab === 'system' && (
              <motion.div layoutId="settingsTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400 rounded-t-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('company')}
            className={`pb-3 px-2 text-sm font-medium transition-colors relative ${activeTab === 'company' ? 'text-cyan-400' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <div className="flex items-center gap-2">
              <Shield size={16} />
              企业档案
            </div>
            {activeTab === 'company' && (
              <motion.div layoutId="settingsTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400 rounded-t-full" />
            )}
          </button>
          {user?.role === 'admin' && (
            <>
              <button
                onClick={() => setActiveTab('menu')}
                className={`pb-3 px-2 text-sm font-medium transition-colors relative ${activeTab === 'menu' ? 'text-cyan-400' : 'text-slate-400 hover:text-slate-200'}`}
              >
                <div className="flex items-center gap-2">
                  <LayoutTemplate size={16} />
                  菜单显示设置
                </div>
                {activeTab === 'menu' && (
                  <motion.div layoutId="settingsTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400 rounded-t-full" />
                )}
              </button>
              <button
                onClick={() => setActiveTab('users')}
                className={`pb-3 px-2 text-sm font-medium transition-colors relative ${activeTab === 'users' ? 'text-cyan-400' : 'text-slate-400 hover:text-slate-200'}`}
              >
                <div className="flex items-center gap-2">
                  <Users size={16} />
                  人员与权限管理
                </div>
                {activeTab === 'users' && (
                  <motion.div layoutId="settingsTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400 rounded-t-full" />
                )}
              </button>
            </>
          )}
        </div>

        <div className="min-h-[400px]">
          {activeTab === 'profile' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 max-w-2xl">
              <form onSubmit={handleSaveProfile} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs text-slate-400 font-medium">姓名</label>
                    <input 
                      type="text" 
                      value={profileData.name} 
                      onChange={e => setProfileData({...profileData, name: e.target.value})}
                      className="w-full bg-slate-950/50 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors" 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-slate-400 font-medium">用户名</label>
                    <input 
                      type="text" 
                      value={profileData.username} 
                      onChange={e => setProfileData({...profileData, username: e.target.value})}
                      className="w-full bg-slate-950/50 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors" 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-slate-400 font-medium">联系电话</label>
                    <input 
                      type="text" 
                      value={profileData.phone}
                      onChange={e => setProfileData({...profileData, phone: e.target.value})}
                      placeholder="未设置" 
                      className="w-full bg-slate-950/50 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors" 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-slate-400 font-medium">邮箱</label>
                    <input 
                      type="email" 
                      value={profileData.email}
                      onChange={e => setProfileData({...profileData, email: e.target.value})}
                      placeholder="未设置" 
                      className="w-full bg-slate-950/50 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors" 
                    />
                  </div>
                  <div className="col-span-1 md:col-span-2 space-y-2">
                    <label className="text-xs text-slate-400 font-medium">修改密码 (不修改请留空)</label>
                    <input 
                      type="password" 
                      value={profileData.password}
                      onChange={e => setProfileData({...profileData, password: e.target.value})}
                      placeholder="••••••••" 
                      className="w-full bg-slate-950/50 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors" 
                    />
                  </div>
                </div>
                
                <div className="pt-4 border-t border-slate-800 flex justify-between items-center">
                  <button type="submit" disabled={loading} className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-6 py-2.5 rounded-xl transition-colors text-sm font-medium disabled:opacity-50">
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    保存修改
                  </button>
                  <button type="button" onClick={onLogout} className="flex items-center gap-2 text-red-400 hover:text-red-300 hover:bg-red-400/10 px-4 py-2.5 rounded-xl transition-colors text-sm font-medium">
                    <LogOut size={16} />
                    退出登录
                  </button>
                </div>
              </form>
            </motion.div>
          )}

          {activeTab === 'system' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 max-w-2xl">
              <div className="bg-slate-950/30 border border-slate-800 rounded-2xl p-5 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center text-blue-400">
                    <Bell size={20} />
                  </div>
                  <div>
                    <h4 className="text-slate-200 font-medium">系统通知</h4>
                    <p className="text-xs text-slate-500 mt-1">接收设备异常和水质报警通知</p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" defaultChecked />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
                </label>
              </div>

              <div className="bg-slate-950/30 border border-slate-800 rounded-2xl p-5 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-purple-500/20 rounded-full flex items-center justify-center text-purple-400">
                    <Shield size={20} />
                  </div>
                  <div>
                    <h4 className="text-slate-200 font-medium">数据自动备份</h4>
                    <p className="text-xs text-slate-500 mt-1">每天凌晨自动备份养殖和设备数据</p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" defaultChecked />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
                </label>
              </div>
            </motion.div>
          )}

          {activeTab === 'company' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 max-w-4xl">
              <form onSubmit={handleSaveCompany} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs text-slate-400 font-medium">企业名称</label>
                    <input type="text" name="name" defaultValue={companyData?.name} className="w-full bg-slate-950/50 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-slate-400 font-medium">法定代表人</label>
                    <input type="text" name="legalPerson" defaultValue={companyData?.legalPerson} className="w-full bg-slate-950/50 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-slate-400 font-medium">统一社会信用代码</label>
                    <input type="text" name="id" defaultValue={companyData?.id} className="w-full bg-slate-950/50 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-slate-400 font-medium">联系电话</label>
                    <input type="text" name="phone" defaultValue={companyData?.phone} className="w-full bg-slate-950/50 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors" />
                  </div>
                  <div className="col-span-1 md:col-span-2 space-y-2">
                    <label className="text-xs text-slate-400 font-medium">企业地址</label>
                    <input type="text" name="address" defaultValue={companyData?.address} className="w-full bg-slate-950/50 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors" />
                  </div>
                  <div className="col-span-1 md:col-span-2 space-y-2">
                    <label className="text-xs text-slate-400 font-medium">企业简介</label>
                    <textarea name="description" rows={4} defaultValue={companyData?.description} className="w-full bg-slate-950/50 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors resize-none" />
                  </div>
                </div>
                
                <div className="pt-4 border-t border-slate-800">
                  <button 
                    type="submit" 
                    disabled={loading}
                    className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-8 py-2.5 rounded-xl transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-cyan-500/20"
                  >
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    更新企业档案
                  </button>
                </div>
              </form>
            </motion.div>
          )}

          {activeTab === 'users' && user?.role === 'admin' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <UserManagement />
            </motion.div>
          )}

          {activeTab === 'menu' && user?.role === 'admin' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 max-w-2xl">
              <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl flex items-start gap-3 mb-6">
                <div className="p-2 bg-amber-500/20 rounded-lg text-amber-500">
                  < Bell size={18} />
                </div>
                <div>
                  <h4 className="text-amber-500 font-bold text-sm">操作提示</h4>
                  <p className="text-xs text-amber-500/80 mt-1">
                    您可以在此处修改侧边栏导航条的显示文字。修改后全员生效。
                  </p>
                </div>
              </div>

              <form onSubmit={handleSaveMenuConfig} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { key: 'system_name', icon: '品牌', original: '系统主标题' },
                    { key: 'none', icon: '总控', original: '全局数字总控' },
                    { key: 'farming', icon: '台账', original: '生产运行台账' },
                    { key: 'water', icon: '水质', original: '水质物联传感' },
                    { key: 'equipment', icon: '机电', original: '机电智控运维' },
                    { key: 'warehouse', icon: '仓储', original: '仓储与进销存' },
                    { key: 'finance', icon: '成本', original: '经营成本统计' },
                    { key: 'sop', icon: 'SOP', original: '标准作业(SOP)' }
                  ].map(item => (
                    <div key={item.key} className="space-y-1.5 p-3 bg-slate-950/20 border border-slate-800 rounded-xl">
                      <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{item.original}(原名)</label>
                      <input 
                        type="text" 
                        value={menuConfig[item.key] || ''} 
                        onChange={e => setMenuConfig({...menuConfig, [item.key]: e.target.value})}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-cyan-500 outline-none"
                        placeholder="输入新的显示名称"
                      />
                    </div>
                  ))}
                </div>

                <div className="pt-6 border-t border-slate-800">
                  <button 
                    type="submit" 
                    disabled={loading}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-2.5 rounded-xl transition-all text-sm font-medium shadow-lg shadow-indigo-500/20"
                  >
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    提交修改
                  </button>
                </div>
              </form>
            </motion.div>
          )}
        </div>
      </div>
      
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 50, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} exit={{ opacity: 0, y: 20, x: '-50%' }}
          className="fixed bottom-10 left-1/2 bg-slate-800 text-emerald-50 px-6 py-3 rounded-full shadow-2xl border border-slate-700 z-[1000] text-sm font-bold flex items-center gap-2"
        >
          <Check size={16} className="text-emerald-400" />
          {toast}
        </motion.div>
      )}
    </div>
  );
}

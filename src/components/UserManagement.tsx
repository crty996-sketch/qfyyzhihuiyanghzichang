import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { createPortal } from 'react-dom';
import { Shield, Plus, Edit2, Trash2, X, Check } from 'lucide-react';

const MODULES = [
  { id: 'farming', label: '生产运行台账' },
  { id: 'water', label: '水质物联传感' },
  { id: 'equipment', label: '机电智控运维' },
  { id: 'warehouse', label: '仓储资产管理' },
  { id: 'inventory', label: '进销存管理' },
  { id: 'finance', label: '经营成本核算' },
  { id: 'sop', label: '标准作业(SOP)' },
  { id: 'traceability', label: '数字化产品溯源' }
];

export default function UserManagement() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [formData, setFormData] = useState({ username: '', password: '', name: '', permissions: [] as string[] });
  const [toast, setToast] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [clickCount, setClickCount] = useState(0);

  const debugClick = () => setClickCount(c => c + 1);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      } else {
        const err = await res.json();
        showToast(err.error || '获取用户列表失败');
      }
    } catch (err: any) {
      showToast('网络连接失败');
    } finally {
      setLoading(false);
    }
  };

  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    fetchUsers();
  }, []);

  const handleSave = async () => {
    if (!formData.username || (!editingUser && !formData.password)) {
      showToast('请填写必填项');
      return;
    }
    
    try {
      const method = editingUser ? 'PUT' : 'POST';
      const url = editingUser ? `/api/users/${editingUser.id}` : '/api/users';
      
      const res = await fetch(url, {
        method,
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          ...formData,
          permissions: formData.permissions // Ensure it's explicitly sent
        })
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '保存失败');
      }

      showToast(editingUser ? '权限已成功更新' : '账号创建成功');
      await fetchUsers();
      setIsModalOpen(false);
      setEditingUser(null);
    } catch (err: any) {
      showToast(err.message);
    }
  };

  const requestDelete = (id: number) => {
    debugClick();
    showToast('准备删除用户: ' + id);
    setConfirmDeleteId(id);
  };

  const executeDelete = async () => {
    debugClick();
    if (confirmDeleteId === null) return;
    const id = confirmDeleteId;
    setConfirmDeleteId(null);
    try {
      showToast('正在向服务器发送删除请求...');
      const res = await fetch(`/api/users/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '删除失败');
      }
      showToast('账号已成功删除');
      await fetchUsers();
    } catch (err: any) {
      showToast(err.message);
    }
  };

  const togglePermission = (moduleId: string) => {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.includes(moduleId)
        ? prev.permissions.filter(p => p !== moduleId)
        : [...prev.permissions, moduleId]
    }));
  };

  const openNewUserModal = () => {
    if (users.length >= 11) {
      showToast('最多只能创建 10 个子账号');
      return;
    }
    setEditingUser(null);
    setFormData({ username: '', password: '', name: '', permissions: [] });
    setIsModalOpen(true);
  };

  const openEditModal = (user: any) => {
    debugClick();
    showToast('正在打开编辑窗口...');
    setEditingUser(user);
    setFormData({ username: user.username, password: '', name: user.name, permissions: user.permissions || [] });
    setIsModalOpen(true);
  };

  if (loading) return <div className="text-slate-500 py-10 text-center">加载中...</div>;

  return (
    <div className="space-y-6 relative">
      <div className="fixed top-24 right-4 flex flex-col gap-2 z-[9999]">
        <div className="bg-slate-800 p-2 rounded-lg text-[10px] text-cyan-400 border border-cyan-500/30">
          调试计数: {clickCount}
        </div>
        <button 
          onClick={() => { debugClick(); showToast('全局测试按钮被点击'); }}
          className="bg-cyan-600 text-white text-[10px] p-2 rounded shadow-lg"
        >
          全屏点击测试
        </button>
      </div>
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-400">已创建子账号: <span className="text-cyan-400 font-mono font-bold">{users.length - 1} / 10</span></div>
        <button onClick={openNewUserModal} className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 px-4 py-2 rounded-lg text-sm text-white font-bold transition-colors">
          <Plus size={16} /> 新增账号
        </button>
      </div>

      <div className="overflow-x-auto bg-slate-900 shadow-xl rounded-xl border border-slate-700">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-950/80 border-b border-slate-700">
            <tr>
              <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase">用户</th>
              <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase">角色</th>
              <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase">操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${user.role === 'admin' ? 'bg-amber-500/20 text-amber-400' : 'bg-cyan-500/20 text-cyan-400'}`}>
                      {user.name?.charAt(0) || '?'}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-200">{user.name}</div>
                      <div className="text-[10px] text-slate-500">@{user.username}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs">
                  <span className={`px-2 py-0.5 rounded ${user.role === 'admin' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/30' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}>
                    {user.role === 'admin' ? '超级管理员' : '普通子账号'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {user.role !== 'admin' && (
                    <div className="flex gap-2">
                      <button 
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); openEditModal(user); }} 
                        className="text-xs bg-cyan-600/20 text-cyan-400 border border-cyan-500/30 px-3 py-1 rounded hover:bg-cyan-500 hover:text-white transition-all cursor-pointer"
                      >
                        编辑
                      </button>
                      <button 
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); requestDelete(user.id); }} 
                        className="text-xs bg-red-600/20 text-red-400 border border-red-500/30 px-3 py-1 rounded hover:bg-red-500 hover:text-white transition-all cursor-pointer"
                      >
                        删除
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
          <div onClick={() => setIsModalOpen(false)} className="absolute inset-0 bg-black/80 backdrop-blur-md" />
          <div className="relative bg-slate-900 border-2 border-cyan-500/50 w-full max-w-lg rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <Shield className="text-cyan-400" size={20} />
                {editingUser ? '编辑子账号' : '新增子账号'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-500 hover:text-white p-2"><X size={24} /></button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 font-bold">登录名 <span className="text-red-400">*</span></label>
                  <input type="text" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} className="w-full bg-slate-950/50 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 focus:border-cyan-500" placeholder="如: zhangsan" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 font-bold">姓名</label>
                  <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-slate-950/50 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 focus:border-cyan-500" placeholder="如: 张三" />
                </div>
              </div>
              
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-bold">密码 {editingUser && <span className="text-slate-600 font-normal">(不修改请留空)</span>} {!editingUser && <span className="text-red-400">*</span>}</label>
                <input type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full bg-slate-950/50 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 focus:border-cyan-500" placeholder="••••••••" />
              </div>

              <div className="space-y-2 pt-2">
                <label className="text-xs text-slate-400 font-bold">模块功能权限分配 (勾选即授权)</label>
                <div className="grid grid-cols-2 gap-2 h-48 overflow-y-auto pr-1 custom-scrollbar">
                  {MODULES.map(module => {
                    const isSelected = formData.permissions.includes(module.id);
                    return (
                      <button
                        key={module.id}
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          togglePermission(module.id);
                        }}
                        className={`flex items-center justify-between px-3 py-2.5 border rounded-xl text-sm text-left transition-all ${isSelected ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400 font-bold shadow-[0_0_10px_rgba(6,182,212,0.1)]' : 'border-slate-800 bg-slate-950/30 text-slate-500 hover:border-slate-700 hover:text-slate-300'}`}
                      >
                        {module.label}
                        {isSelected ? <Check size={14} className="text-cyan-400" /> : <div className="w-3.5 h-3.5 rounded border border-slate-700" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-slate-800">
              <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-bold text-slate-400 hover:text-white">取消</button>
              <button onClick={handleSave} className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 font-bold text-sm text-white rounded-lg transition-colors">确认保存</button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteId !== null && (
        <div className="fixed inset-0 z-[2010] flex items-center justify-center p-4">
          <div onClick={() => setConfirmDeleteId(null)} className="absolute inset-0 bg-black/80 backdrop-blur-md" />
          <div className="relative bg-slate-900 border-2 border-red-500/50 w-full max-w-sm rounded-xl p-6 shadow-2xl text-center">
            <div className="w-12 h-12 rounded-full bg-red-500/20 text-red-500 mx-auto mb-4 flex items-center justify-center">
              <Trash2 size={24} />
            </div>
            <h3 className="text-lg font-bold text-slate-100 mb-2">确认删除该账号？</h3>
            <p className="text-sm text-slate-400 mb-6">此操作将永久删除该人员的账号及登录权限，无法撤销。</p>
            <div className="flex justify-center gap-3">
              <button onClick={() => setConfirmDeleteId(null)} className="px-4 py-2 text-sm font-bold text-slate-400 hover:text-white bg-slate-800 rounded-lg">取消</button>
              <button onClick={executeDelete} className="px-6 py-2 bg-red-500 hover:bg-red-400 font-bold text-sm text-white rounded-lg transition-colors">确认删除</button>
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} exit={{ opacity: 0, y: 20, x: '-50%' }}
            className="fixed bottom-10 left-1/2 bg-slate-800 text-cyan-50 px-6 py-3 rounded-full shadow-2xl border border-slate-700 z-[1000] text-sm font-bold flex items-center gap-2"
          >
            <Shield size={16} className="text-cyan-400" />
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

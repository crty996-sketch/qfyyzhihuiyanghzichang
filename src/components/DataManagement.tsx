import { TankData, InOutRecord, FeedMedRecord, LossRecord } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Save, Search, Filter, Droplets, Fish, Activity, Calendar, FileText, Download, Loader2, BrainCircuit, X, Database } from 'lucide-react';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import * as XLSX from 'xlsx';

type FarmingSubMode = 'overview' | 'inout' | 'feedmed' | 'loss';

interface DataManagementProps {
  mode: 'farming' | 'water';
  allTanks: TankData[];
  onBack: () => void;
  onModeChange: (mode: 'farming' | 'water') => void;
  onUpdateTanks?: (updatedTanks: Record<string, any>) => void;
}

// Helper to convert "20条/斤" to "0.05斤/条" for display
const formatFishSize = (size: any): string => {
  if (!size || size === '-') return '-';
  const str = String(size);
  const match = str.match(/^(\d+(\.\d+)?)条\/斤$/);
  if (match) {
    const val = parseFloat(match[1]);
    if (val > 0) {
      const result = (1 / val).toFixed(3).replace(/\.?0+$/, '');
      return `${result}斤/条`;
    }
  }
  return str;
};

// Helper to parse size value for weight calculations
const parseFishSize = (size: any): number => {
  if (!size || size === '-') return NaN;
  const str = String(size);
  const match = str.match(/^(\d+(\.\d+)?)条\/斤$/);
  if (match) {
    const val = parseFloat(match[1]);
    return val > 0 ? 1 / val : 0;
  }
  const parsed = parseFloat(str);
  return isNaN(parsed) ? NaN : parsed;
};

export default function DataManagement({ mode, allTanks, onBack, onModeChange, onUpdateTanks }: DataManagementProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [editingData, setEditingData] = useState<Record<string, any>>({});
  const [isAddingRecord, setIsAddingRecord] = useState(false);
  const [newRecord, setNewRecord] = useState<Record<string, any>>({});
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [farmingSubMode, setFarmingSubMode] = useState<FarmingSubMode>('overview');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [downloadSelection, setDownloadSelection] = useState({
    overview: true,
    inout: false,
    feedmed: false,
    loss: false
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const itemsPerPage = 20;
  
  const [inOutRecords, setInOutRecords] = useState<InOutRecord[]>([]);
  const [feedMedRecords, setFeedMedRecords] = useState<FeedMedRecord[]>([]);
  const [lossRecords, setLossRecords] = useState<LossRecord[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const [deleteTarget, setDeleteTarget] = useState<{id: string, type: FarmingSubMode} | null>(null);

  useEffect(() => {
    const fetchRecords = async () => {
      try {
        const [inoutRes, feedmedRes, lossRes] = await Promise.all([
          fetch('/api/records/inout'),
          fetch('/api/records/feedmed'),
          fetch('/api/records/loss')
        ]);
        if (inoutRes.ok) setInOutRecords(await inoutRes.json());
        if (feedmedRes.ok) setFeedMedRecords(await feedmedRes.json());
        if (lossRes.ok) setLossRecords(await lossRes.json());
      } catch (err) {
        console.error("Failed to fetch records", err);
      }
    };
    fetchRecords();
  }, []);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortData = (data: any[]) => {
    if (!sortConfig) return data;
    return [...data].sort((a, b) => {
      let aVal, bVal;
      
      if (sortConfig.key === 'inventory') {
        aVal = a.farming?.currentInventory || 0;
        bVal = b.farming?.currentInventory || 0;
      } else if (sortConfig.key === 'dead') {
        aVal = a.farming?.deadCount || 0;
        bVal = b.farming?.deadCount || 0;
      } else if (sortConfig.key === 'amount') {
          aVal = a.amount || 0;
          bVal = b.amount || 0;
      } else if (sortConfig.key === 'feedAmount') {
          aVal = a.feedAmount || 0;
          bVal = b.feedAmount || 0;
      } else if (sortConfig.key === 'deadCount') {
          aVal = a.deadCount || 0;
          bVal = b.deadCount || 0;
      } else if (sortConfig.key === 'species') {
          aVal = a.farming?.species || '';
          bVal = b.farming?.species || '';
      } else {
        aVal = a[sortConfig.key];
        bVal = b[sortConfig.key];
      }

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  };

  // Refined calculation logic to ensure synchronicity between dashboard and records
  const calculatedTanks = useMemo(() => {
    return allTanks.map(tank => {
      const tankId = tank.id;
      // Get all records for this tank
      const tankInout = inOutRecords.filter(r => (editingData[r.id]?.tankId ?? r.tankId) === tankId);
      const tankLoss = lossRecords.filter(r => (editingData[r.id]?.tankId ?? r.tankId) === tankId);
      
      // Use editing data for records if available
      const processedInout = tankInout.map(r => ({
        ...r,
        type: editingData[r.id]?.type ?? r.type,
        count: editingData[r.id]?.count ?? r.count,
        amount: editingData[r.id]?.amount ?? r.amount,
        species: editingData[r.id]?.species ?? r.species,
        size: editingData[r.id]?.size ?? r.size,
        date: editingData[r.id]?.date ?? r.date
      }));

      const processedLoss = tankLoss.map(r => ({
        ...r,
        deadCount: editingData[r.id]?.deadCount ?? r.deadCount,
        date: editingData[r.id]?.date ?? r.date
      }));

      const ins = processedInout.filter(r => r.type === 'purchaseIn' || r.type === 'transferIn');
      const outs = processedInout.filter(r => r.type === 'salesOut' || r.type === 'transferOut');

      // Find the first purchase or entry record to determine initial species and stocking info
      const purchaseInRecord = [...ins].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
      
      const species = purchaseInRecord?.species || tank.farming?.species || '未设定';
      const stockingTime = purchaseInRecord?.date || tank.farming?.stockingTime || '-';
      const initialSize = purchaseInRecord?.size || tank.farming?.size || '-';
      
      const initialCount = ins.reduce((sum, r) => sum + (Number(r.count) || 0), 0);
      
      // User formula: 入池重量（斤）=入池规格 * 入池总量
      const parsedInitialSize = parseFishSize(initialSize);
      const initialWeight = !isNaN(parsedInitialSize) ? initialCount * parsedInitialSize : ins.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
      
      const totalOutCount = outs.reduce((sum, r) => sum + (Number(r.count) || 0), 0);
      const totalOutWeight = outs.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
      
      const totalDeadCount = processedLoss.reduce((sum, r) => sum + (Number(r.deadCount) || 0), 0);
      
      const currentCount = Math.max(0, initialCount - totalDeadCount - totalOutCount);
      const currentSize = editingData[tankId]?.farming?.currentSize ?? tank.farming?.currentSize ?? initialSize ?? '-';
      
      // User formula: 现有库存（斤）=入池重量（斤） - 损耗条数 * 当前规格 - 出库重量
      const parsedCurrentSize = parseFishSize(currentSize);
      const currentInventory = Math.max(0, initialWeight - (totalDeadCount * (isNaN(parsedCurrentSize) ? 0 : parsedCurrentSize)) - totalOutWeight);

      return {
        ...tank,
        status: editingData[tankId]?.status ?? tank.status,
        farming: {
          ...tank.farming,
          species,
          currentCount,
          currentInventory,
          deadCount: totalDeadCount,
          size: initialSize,
          stockingTime,
          initialCount,
          initialWeight,
          currentSize
        }
      };
    });
  }, [allTanks, inOutRecords, lossRecords, editingData]);

  const filteredTanks = useMemo(() => {
    const filtered = calculatedTanks.filter(tank => 
      (tank.id || '').toLowerCase().includes((debouncedSearchQuery || '').toLowerCase()) &&
      (columnFilters.status ? tank.status === columnFilters.status : true) &&
      (columnFilters.species ? tank.farming?.species?.toLowerCase().includes(columnFilters.species.toLowerCase()) : true)
    );
    return sortData(filtered);
  }, [calculatedTanks, debouncedSearchQuery, columnFilters, sortConfig]);

  const filteredInOut = useMemo(() => {
    const filtered = inOutRecords.filter(r => 
      (r.tankId || '').toLowerCase().includes((debouncedSearchQuery || '').toLowerCase()) && 
      r.date.startsWith(selectedMonth) &&
      (columnFilters.date ? r.date === columnFilters.date : true) &&
      (columnFilters.tankId ? r.tankId.includes(columnFilters.tankId) : true) &&
      (columnFilters.type ? r.type === columnFilters.type : true)
    );
    return sortData(filtered);
  }, [inOutRecords, debouncedSearchQuery, selectedMonth, columnFilters, sortConfig]);
  
  const filteredFeedMed = useMemo(() => {
    const filtered = feedMedRecords.filter(r => 
      (r.tankId || '').toLowerCase().includes((debouncedSearchQuery || '').toLowerCase()) && 
      r.date.startsWith(selectedMonth) &&
      (columnFilters.date ? r.date === columnFilters.date : true) &&
      (columnFilters.tankId ? r.tankId.includes(columnFilters.tankId) : true)
    );
    return sortData(filtered);
  }, [feedMedRecords, debouncedSearchQuery, selectedMonth, columnFilters, sortConfig]);
  
  const filteredLoss = useMemo(() => {
    const filtered = lossRecords.filter(r => 
      (r.tankId || '').toLowerCase().includes((debouncedSearchQuery || '').toLowerCase()) && 
      r.date.startsWith(selectedMonth) &&
      (columnFilters.date ? r.date === columnFilters.date : true) &&
      (columnFilters.tankId ? r.tankId.includes(columnFilters.tankId) : true)
    );
    return sortData(filtered);
  }, [lossRecords, debouncedSearchQuery, selectedMonth, columnFilters, sortConfig]);

  const validateRecord = (record: any, mode: FarmingSubMode) => {
    if (!record.tankId || record.tankId.trim() === '') throw new Error('池号不能为空');
    if (mode === 'inout' && (!record.amount || record.amount <= 0)) throw new Error('数量必须大于0');
    if (mode === 'loss' && (!record.deadCount || record.deadCount < 0)) throw new Error('死亡数量不能为负');
    return true;
  };

  const handleAddRecord = async () => {
    try {
      setError(null);
      validateRecord(newRecord, farmingSubMode);
      setIsLoading(true);
      
      if (farmingSubMode === 'overview') {
        if (!newRecord.tankId) throw new Error("池号不能为空");
        if (allTanks.find(t => t.id === newRecord.tankId)) throw new Error("该池号已存在");

        const isNormal = newRecord.status === 'normal' || !newRecord.status;
        const newTank: TankData = {
          id: newRecord.tankId,
          status: newRecord.status || 'normal',
          temperature: isNormal ? 26.5 : '',
          ph: isNormal ? 7.0 : '',
          oxygen: isNormal ? 6.0 : '',
          waterLevel: isNormal ? 80 : '',
          farming: {
            species: newRecord.species || '',
            size: newRecord.size || '',
            stockingTime: newRecord.date || '',
            prevBalance: 0,
            purchaseIn: 0,
            transferIn: 0,
            salesOut: 0,
            transferOut: 0,
            deadCount: 0,
            currentInventory: newRecord.inventory || 0,
            remarks: ''
          },
          equipment: {
            filter: isNormal ? '自动模式' : '停止',
            pump: isNormal ? '运行中' : '停止',
            oxygen: isNormal ? '运行中' : '停止',
            uv: isNormal ? '运行中' : '停止',
            lastMaintenance: new Date().toISOString().split('T')[0],
            parameters: '标准参数'
          }
        };

        if (onUpdateTanks) {
          const updatedState = { [newTank.id]: newTank };
          
          await fetch('/api/tanks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedState)
          });
          
          onUpdateTanks(updatedState);
          setNewRecord({});
          setIsAddingRecord(false);
          setIsLoading(false);
          return;
        }
      }

      const collectionName = farmingSubMode === 'inout' ? 'inout' : farmingSubMode === 'feedmed' ? 'feedmed' : 'loss';
      
      const res = await fetch(`/api/records/${collectionName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRecord)
      });
      
      if (!res.ok) throw new Error('Failed to save record');
      const savedRecord = await res.json();

      // Update local state
      if (collectionName === 'inout') setInOutRecords(prev => [...prev, savedRecord]);
      else if (collectionName === 'feedmed') setFeedMedRecords(prev => [...prev, savedRecord]);
      else if (collectionName === 'loss') setLossRecords(prev => [...prev, savedRecord]);
      
      setNewRecord({});
      setIsAddingRecord(false);
      
      // If records were inout or loss, the backend updated tank inventory, fetch it
      if (farmingSubMode === 'inout' || farmingSubMode === 'loss') {
        await refreshTanks();
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsLoading(true);
    setError(null);
    setAiLoading(true);

    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
      });
      reader.readAsDataURL(file);
      const base64 = await base64Promise;

      const res = await fetch('/api/ai/ocr', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ image: base64, mode: mode === 'farming' ? farmingSubMode : 'water' })
      });
      
      if (!res.ok) {
         const errJson = await res.json().catch(() => ({}));
         throw new Error(errJson.error || await res.text());
      }
      const data = await res.json();
      
      if (data.records && Array.isArray(data.records) && data.records.length > 0) {
        if (mode === 'water' || farmingSubMode === 'overview') {
            alert(`识别到 ${data.records.length} 条数据，但自动导入目前仅支持出入库、投喂用药和损耗记录。`);
        } else {
            const collectionName = farmingSubMode === 'inout' ? 'inout' : farmingSubMode === 'feedmed' ? 'feedmed' : 'loss';
            let successCount = 0;
            
            for (const rec of data.records) {
                try {
                    const saveRes = await fetch(`/api/records/${collectionName}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(rec)
                    });
                    if (saveRes.ok) {
                        const savedRecord = await saveRes.json();
                        if (collectionName === 'inout') setInOutRecords(prev => [...prev, savedRecord]);
                        else if (collectionName === 'feedmed') setFeedMedRecords(prev => [...prev, savedRecord]);
                        else if (collectionName === 'loss') setLossRecords(prev => [...prev, savedRecord]);
                        successCount++;
                    }
                } catch (e) {
                    console.error("Failed to save recognized record:", rec, e);
                }
            }
            alert(`成功识别并导入了 ${successCount} 条记录！`);
            if (farmingSubMode === 'inout' || farmingSubMode === 'loss') {
                await refreshTanks();
            }
        }
      } else {
        alert('未识别到有效记录，请检查图片是否清晰且格式符合当前表格。');
      }

    } catch (err: any) {
      setError(`识别失败: ${err.message}`);
    } finally {
      setIsLoading(false);
      setAiLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const totalItems = useMemo(() => {
    if (mode === 'water' || farmingSubMode === 'overview') return filteredTanks.length;
    if (farmingSubMode === 'inout') return filteredInOut.length;
    if (farmingSubMode === 'feedmed') return filteredFeedMed.length;
    if (farmingSubMode === 'loss') return filteredLoss.length;
    return 0;
  }, [mode, farmingSubMode, filteredTanks, filteredInOut, filteredFeedMed, filteredLoss]);

  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  
  const paginatedTanks = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredTanks.slice(start, start + itemsPerPage);
  }, [filteredTanks, currentPage]);

  const handleInputChange = (tankId: string, field: string, value: string) => {
    setEditingData(prev => {
      const newData = { ...prev };
      if (!newData[tankId]) newData[tankId] = {};
      
      if (field === 'status') {
        newData[tankId].status = value;
        const existingTank = allTanks.find(t => t.id === tankId);
        
        if (value === 'empty') {
          newData[tankId] = {
            ...newData[tankId],
            temperature: '',
            ph: '',
            oxygen: '',
            nh3: '',
            no2: '',
            equipment: {
              ...(existingTank?.equipment || {}),
              filter: '停止',
              pump: '停止',
              oxygen: '停止',
              uv: '停止'
            }
          };
        } else if (value === 'maintenance') {
          // If status changed to maintenance, set pump to fault as an example of linkage
          newData[tankId].equipment = {
            ...(existingTank?.equipment || {
              filter: '自动模式',
              pump: '运行中',
              oxygen: '运行中',
              uv: '待机',
              lastMaintenance: '2023-11-15',
              parameters: '标准参数'
            }),
            pump: '故障'
          };
        } else if (value === 'normal') {
          // If status changed to normal (进苗), automatically open equipment
          newData[tankId].equipment = {
            ...(existingTank?.equipment || {
              filter: '自动模式',
              pump: '运行中',
              oxygen: '运行中',
              uv: '运行中',
              lastMaintenance: new Date().toISOString().split('T')[0],
              parameters: '标准参数'
            }),
            filter: '自动模式',
            pump: '运行中',
            oxygen: '运行中',
            uv: '运行中',
          };
        }
      } else if (['species', 'size', 'stockingTime', 'currentInventory', 'deadCount', 'initialCount', 'currentCount', 'currentSize'].includes(field)) {
        // Handle farming data fields
        if (!newData[tankId].farming) {
          const existingTank = allTanks.find(t => t.id === tankId);
          newData[tankId].farming = { ...existingTank?.farming };
        }
        if (['currentInventory', 'deadCount', 'initialCount', 'currentCount'].includes(field)) {
          newData[tankId].farming[field] = value === '' ? 0 : Number(value);
        } else {
          newData[tankId].farming[field] = value;
        }
      } else {
        // Convert to number if it's a numeric field and not empty
        const numericFields = ['temperature', 'ph', 'oxygen', 'nh3', 'no2'];
        if (numericFields.includes(field) && value !== '') {
          newData[tankId][field] = Number(value);
        } else {
          newData[tankId][field] = value;
        }
      }
      return newData;
    });
  };

  const handleStatusChange = (tank: TankData, newStatus: string) => {
    // Only update the local editing state. The user must click the "Save Changes" button.
    handleInputChange(tank.id, 'status', newStatus);
  };

  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<{type: string, text: string, title: string} | null>(null);

  const refreshTanks = async () => {
    try {
      const res = await fetch('/api/tanks');
      if (res.ok) {
        const freshTanks = await res.json();
        const updatesMap = freshTanks.reduce((acc: any, t: any) => ({ ...acc, [t.id]: t }), {});
        if (onUpdateTanks) onUpdateTanks(updatesMap);
      }
    } catch (err) {
      console.error('Failed to refresh tanks:', err);
    }
  };

  const handleAiAnalyze = async (tank: TankData, type: 'feeding') => {
    const title = '智能投喂量预测';
    setAiLoading(true);
    setAiResult({ type, text: '正在进行AI分析，请稍候...', title });
    
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const todayRecords = feedMedRecords.filter(r => r.tankId === tank.id && r.date === todayStr);
      const todayFeedAmount = todayRecords.reduce((sum, r) => sum + (Number(r.feedAmount) || 0), 0);

      const data = { 
        species: tank.farming?.species, 
        currentInventory: tank.farming?.currentInventory, 
        temperature: tank.temperature, 
        oxygen: tank.oxygen, 
        nh3: tank.nh3 || 0.1, 
        lastFeedAmount: todayFeedAmount 
      };

      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tankId: tank.id, type, data })
      });
      
      if (res.ok) {
        const json = await res.json();
        setAiResult({ type, text: json.analysis, title });
      } else {
        const errJson = await res.json().catch(() => ({}));
        setAiResult({ type, text: `分析失败：${errJson.error || '服务器无响应'}，请检查环境配置。`, title });
      }
    } catch (err: any) {
      setAiResult({ type, text: `分析失败：${err.message}。请检查网络。`, title });
    } finally {
      setAiLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setError(null);
      setIsLoading(true);
      
      const tankUpdates: Record<string, any> = {};
      const inoutUpdates: Record<string, any> = {};
      const feedmedUpdates: Record<string, any> = {};
      const lossUpdates: Record<string, any> = {};

      for (const [id, data] of Object.entries(editingData)) {
        const existingTank = allTanks.find(t => t.id === id);
        if (existingTank) {
           // Merge changes into the complete existing object before sending
           tankUpdates[id] = { ...existingTank, ...(data as any) };
           // Ensure deeply nested objects like farming and equipment are merged, not overwritten
           if ((data as any).farming) {
             tankUpdates[id].farming = { ...existingTank.farming, ...(data as any).farming };
           }
           if ((data as any).equipment) {
             tankUpdates[id].equipment = { ...existingTank.equipment, ...(data as any).equipment };
           }
        } else if (inOutRecords.find(r => String(r.id) === String(id))) {
           inoutUpdates[id] = data;
        } else if (feedMedRecords.find(r => String(r.id) === String(id))) {
           feedmedUpdates[id] = data;
        } else if (lossRecords.find(r => String(r.id) === String(id))) {
           lossUpdates[id] = data;
        }
      }

      // 1. Tank Updates
      if (Object.keys(tankUpdates).length > 0) {
          const res = await fetch('/api/tanks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(tankUpdates)
          });
          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || '无法保存池子状态');
          }
      }

      // 2. Records Updates Helper
      const updateRecords = async (updates: Record<string, any>, type: string, records: any[], setter: (v: any) => void) => {
        for (const [id, data] of Object.entries(updates)) {
          const original = records.find(r => r.id === id);
          if (!original) continue;
          
          const updatedRecord = { ...original, ...data };
          const res = await fetch(`/api/records/${type}/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedRecord)
          });
          if (!res.ok) {
             const err = await res.json();
             throw new Error(err.error || '无法保存记录');
          }
          
          setter((prev: any[]) => prev.map(r => String(r.id) === String(id) ? updatedRecord : r));
        }
      };

      await Promise.all([
        updateRecords(inoutUpdates, 'inout', inOutRecords, setInOutRecords),
        updateRecords(feedmedUpdates, 'feedmed', feedMedRecords, setFeedMedRecords),
        updateRecords(lossUpdates, 'loss', lossRecords, setLossRecords)
      ]);

      setEditingData({});
      alert('保存成功！');
      
      // Sync tanks after saving records
      if (mode === 'farming') {
        await refreshTanks();
      }
    } catch (err: any) {
      setError('保存失败: ' + err.message);
      alert('保存失败: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const executeDeleteRecord = async (id: string, type: string) => {
    try {
      setIsLoading(true);

      if (type === 'overview') {
        const existingTank = allTanks.find(t => t.id === id);
        if (existingTank) {
          const resetTank = {
            ...existingTank,
            status: 'empty',
            farming: {
               species: '', size: '', initialCount: 0,
               currentCount: 0, currentInventory: 0, currentSize: '',
               stockingTime: '', deadCount: 0
            },
            equipment: {
               ...(existingTank.equipment || {}),
               filter: '停止',
               pump: '停止',
               oxygen: '停止',
               uv: '停止'
            }
          };
          if (onUpdateTanks) onUpdateTanks({[id]: resetTank});
          await fetch('/api/tanks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({[id]: resetTank})
          });
          setEditingData(prev => {
            const next = {...prev};
            delete next[id];
            return next;
          });
          alert('清空成功');
        }
      } else if (type === 'deleteTank') {
        const res = await fetch(`/api/tanks/${id}`, {
          method: 'DELETE'
        });
        if (!res.ok) throw new Error('Delete tank failed');
        if (onUpdateTanks) {
          onUpdateTanks({[id]: null}); // Set to null to trigger deletion in App.tsx handleUpdateTanks
        }
        alert('删除池号成功');
      } else {
        const res = await fetch(`/api/records/${type}/${id}`, {
          method: 'DELETE'
        });
        
        if (!res.ok) throw new Error('Delete failed');
        
        if (type === 'inout') setInOutRecords(prev => prev.filter(r => String(r.id) !== String(id)));
        else if (type === 'feedmed') setFeedMedRecords(prev => prev.filter(r => String(r.id) !== String(id)));
        else if (type === 'loss') setLossRecords(prev => prev.filter(r => String(r.id) !== String(id)));
        
        if (type === 'inout' || type === 'loss') {
          await refreshTanks();
        }

        alert('删除成功');
      }
    } catch (err: any) {
      alert('操作失败: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadExcel = (downloadMode: string) => {
    if (downloadMode === 'water') {
      const ws = XLSX.utils.json_to_sheet(filteredTanks.map(t => ({
        '池号': t.id,
        '状态': t.status,
        '水温(°C)': t.temperature,
        'pH值': t.ph,
        '溶氧(mg/L)': t.oxygen,
        '氨氮(mg/L)': 0.1,
        '亚硝酸盐(mg/L)': 0.05
      })));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "水质指标");
      XLSX.writeFile(wb, `水质指标导出_${new Date().toISOString().split('T')[0]}.xlsx`);
      return;
    }

    const wb = XLSX.utils.book_new();
    
    if (downloadSelection.overview) {
      const ws = XLSX.utils.json_to_sheet(filteredTanks.map(t => {
        const purchaseInRecord = inOutRecords.find(r => r.tankId === t.id && r.type === 'purchaseIn');
        const species = purchaseInRecord?.species || t.farming?.species || '';
        const stockingTime = purchaseInRecord?.date || t.farming?.stockingTime || '';
        const initialSize = purchaseInRecord?.size || t.farming?.size || '';
        const initialCount = purchaseInRecord?.count || t.farming?.initialCount || 0;
        return {
          '更新日期': new Date().toISOString().split('T')[0],
          '池号': t.id,
          '状态': t.status === 'normal' ? '养殖中' : t.status === 'empty' ? '空池中' : t.status === 'alarm' ? '水质报警' : t.status === 'disease' ? '病害报警' : '设备异常',
          '品种': species,
          '入池时间': stockingTime,
          '入池规格(斤/条)': formatFishSize(initialSize),
          '入池总量(条)': initialCount,
          '现有库存(条)': t.farming?.currentCount || 0,
          '现存规格(斤/条)': formatFishSize(t.farming?.currentSize || ''),
          '现有库存(斤)': t.farming?.currentInventory || 0,
          '损耗(条)': t.farming?.deadCount || 0,
        };
      }));
      XLSX.utils.book_append_sheet(wb, ws, "养殖概况");
    }
    
    if (downloadSelection.inout) {
      const ws = XLSX.utils.json_to_sheet(filteredInOut.map(r => {
        const isOut = r.type === 'salesOut' || r.type === 'transferOut';
        const species = isOut 
          ? (calculatedTanks.find(t => t.id === r.tankId)?.farming?.species || r.species || '')
          : (r.species || '');
        
        return {
          '日期': r.date,
          '池号': r.tankId,
          '类型': r.type === 'purchaseIn' ? '采购入库' : r.type === 'transferIn' ? '转池入库' : r.type === 'salesOut' ? '销售出库' : '转池出库',
          '品种': species,
          '规格(斤/条)': formatFishSize(r.size || ''),
          '数量(条)': r.count || 0,
          '数量(斤)': r.amount,
          '备注': r.remarks
        };
      }));
      XLSX.utils.book_append_sheet(wb, ws, "出入库及销售");
    }
    
    if (downloadSelection.feedmed) {
      const ws = XLSX.utils.json_to_sheet(filteredFeedMed.map(r => ({
        '日期': r.date,
        '池号': r.tankId,
        '饲料种类': r.feedType,
        '投喂量(kg)': r.feedAmount,
        '药品名称': r.medicineName,
        '用药量': r.medicineAmount,
        '备注': r.remarks
      })));
      XLSX.utils.book_append_sheet(wb, ws, "投喂与用药");
    }
    
    if (downloadSelection.loss) {
      const ws = XLSX.utils.json_to_sheet(filteredLoss.map(r => ({
        '日期': r.date,
        '池号': r.tankId,
        '死亡数量(斤)': r.deadCount,
        '原因': r.reason
      })));
      XLSX.utils.book_append_sheet(wb, ws, "损耗记录");
    }
    
    if (!downloadSelection.overview && !downloadSelection.inout && !downloadSelection.feedmed && !downloadSelection.loss) {
      alert('请选择至少一项数据进行下载');
      return;
    }

    XLSX.writeFile(wb, `养殖数据导出_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const totalInventory = useMemo(() => {
    return calculatedTanks.reduce((sum, tank) => sum + (tank.farming?.currentInventory || 0), 0);
  }, [calculatedTanks]);

  const totalDead = useMemo(() => {
    return calculatedTanks.reduce((sum, tank) => sum + (tank.farming?.deadCount || 0), 0);
  }, [calculatedTanks]);

  const totalIn = useMemo(() => {
    // We can use calculatedInout records that match selectedMonth
    return inOutRecords
      .filter(r => {
        const type = editingData[r.id]?.type ?? r.type;
        const date = editingData[r.id]?.date ?? r.date;
        return (type === 'purchaseIn' || type === 'transferIn') && date.startsWith(selectedMonth);
      })
      .reduce((sum, r) => {
        const amount = editingData[r.id]?.amount ?? r.amount;
        return sum + Number(amount || 0);
      }, 0);
  }, [inOutRecords, selectedMonth, editingData]);

  const totalOut = useMemo(() => {
    return inOutRecords
      .filter(r => {
        const type = editingData[r.id]?.type ?? r.type;
        const date = editingData[r.id]?.date ?? r.date;
        return (type === 'salesOut' || type === 'transferOut') && date.startsWith(selectedMonth);
      })
      .reduce((sum, r) => {
        const amount = editingData[r.id]?.amount ?? r.amount;
        return sum + Number(amount || 0);
      }, 0);
  }, [inOutRecords, selectedMonth, editingData]);

  const farmingStats = [
    { label: '总库存量', value: totalInventory.toLocaleString(), unit: '斤', color: 'text-cyan-400' },
    { label: '本月总入库', value: totalIn.toLocaleString(), unit: '斤', color: 'text-emerald-400' },
    { label: '本月总出库', value: totalOut.toLocaleString(), unit: '斤', color: 'text-orange-400' },
    { label: '累计损耗', value: totalDead.toLocaleString(), unit: '斤', color: 'text-red-400' },
  ];

  const waterStats = [
    { label: '平均水温', value: '26.8', unit: '°C', color: 'text-orange-400' },
    { label: '平均pH值', value: '7.2', unit: '', color: 'text-blue-400' },
    { label: '平均溶氧', value: '8.2', unit: 'mg/L', color: 'text-cyan-400' },
    { label: '异常报警', value: '12', unit: '处', color: 'text-red-400' },
  ];

  const currentStats = mode === 'farming' ? farmingStats : waterStats;

  const aggregateData = (tanks: any[]) => {
    const speciesMap = new Map<string, { inventory: number, dead: number, sizes: Set<string> }>();
    
    tanks.forEach(tank => {
      const farmingData = tank.farming;
      if (!farmingData) return;
      const { species, currentInventory, size } = farmingData;
      const speciesName = species || '未设定';
      if (!speciesMap.has(speciesName)) {
        speciesMap.set(speciesName, { inventory: 0, dead: 0, sizes: new Set() });
      }
      const data = speciesMap.get(speciesName)!;
      data.inventory += Number(currentInventory) || 0;
      if (size && size !== '-') data.sizes.add(size);
    });

    // Calculate dead from records specifically for the chart's current month context if desired
    // Or just use the aggregated deadCount from the calculated tanks
    tanks.forEach(tank => {
        const speciesName = tank.farming?.species || '未设定';
        // We have deadCount already in the calculated tank
        // But the chart spec might want "monthly dead"
        // Let's filter loss records for this tank & month to be precise for "本月损耗"
        const tankLoss = lossRecords.filter(r => {
            const tankId = editingData[r.id]?.tankId ?? r.tankId;
            const date = editingData[r.id]?.date ?? r.date;
            return tankId === tank.id && date.startsWith(selectedMonth);
        });
        const monthlyDead = tankLoss.reduce((sum, r) => sum + (Number(editingData[r.id]?.deadCount ?? r.deadCount) || 0), 0);
        
        if (speciesMap.has(speciesName)) {
            speciesMap.get(speciesName)!.dead += monthlyDead;
        }
    });

    return Array.from(speciesMap.entries()).map(([species, data]) => ({
      name: species,
      inventory: data.inventory,
      dead: data.dead,
      size: data.sizes.size > 0 ? Array.from(data.sizes).join(', ') : '-'
    }));
  };

  const globalChartData = useMemo(() => aggregateData(calculatedTanks), [calculatedTanks, selectedMonth]);
  const areaAChartData = useMemo(() => aggregateData(calculatedTanks.filter(t => t.id.startsWith('A'))), [calculatedTanks, selectedMonth]);
  const areaBChartData = useMemo(() => aggregateData(calculatedTanks.filter(t => t.id.startsWith('B'))), [calculatedTanks, selectedMonth]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-900 border border-slate-700 p-3 rounded-lg shadow-xl backdrop-blur-md">
          <p className="text-cyan-400 font-bold mb-2 text-xs">{label}</p>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between gap-4 text-slate-400">
              <span>规格:</span>
              <span className="text-slate-200">{data.size || '-'}</span>
            </div>
            <div className="flex justify-between gap-4 text-blue-400">
              <span>库存:</span>
              <span className="font-mono">{Number(payload[0].value || 0).toLocaleString()} 斤</span>
            </div>
            {payload[1] && (
              <div className="flex justify-between gap-4 text-rose-400">
                <span>损耗:</span>
                <span className="font-mono">{Number(payload[1].value || 0).toLocaleString()} 斤</span>
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  const ChartCard = ({ title, data }: { title: string, data: any[] }) => (
    <div className="bg-slate-900/60 border border-slate-800/80 p-5 rounded-2xl backdrop-blur-md flex flex-col h-72 shadow-lg shadow-black/20">
      <h3 className="text-slate-200 font-bold mb-4 text-xs flex items-center gap-2">
        <Activity size={14} className="text-cyan-400" />
        {title}
      </h3>
      <div className="flex-1 w-full min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} opacity={0.3} />
            <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} dy={10} />
            <YAxis 
              yAxisId="left" 
              stroke="#94a3b8" 
              fontSize={10} 
              tickLine={false} 
              axisLine={false} 
              tickFormatter={(val) => val >= 1000 ? `${(val/1000).toFixed(1)}k` : val} 
            />
            <YAxis yAxisId="right" orientation="right" stroke="#f87171" fontSize={10} tickLine={false} axisLine={false} hide />
            <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: '#ffffff', opacity: 0.05 }} />
            <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '15px' }} iconType="circle" />
            <Bar yAxisId="left" dataKey="inventory" name="库存量(斤)" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={25} />
            <Bar yAxisId="right" dataKey="dead" name="本月损耗(斤)" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={25} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );

  const getPageNumbers = () => {
    let pages = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (currentPage <= 3) {
        pages = [1, 2, 3, 4, 5];
      } else if (currentPage >= totalPages - 2) {
        pages = [totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
      } else {
        pages = [currentPage - 2, currentPage - 1, currentPage, currentPage + 1, currentPage + 2];
      }
    }
    return pages;
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header Info */}
      <div className="flex items-center justify-between bg-slate-900/50 p-4 rounded-2xl border border-slate-800 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-cyan-500/10 rounded-xl flex items-center justify-center text-cyan-400">
            {mode === 'water' ? <Droplets size={20} /> : <Database size={20} />}
          </div>
          <div className="flex flex-col">
            <h2 className="text-xl font-black text-white tracking-tight uppercase">
              {mode === 'water' ? '水质物联传感' : '生产运行台账'}
            </h2>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-bold uppercase tracking-widest mt-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
              {mode === 'water' ? '多参数自动在线监测' : '数据实时同步自各池“养殖全周期档案”'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
           <button 
             onClick={onBack}
             className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-bold border border-slate-700 transition-colors"
           >
             返回仪表盘
           </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        {currentStats.map((stat, idx) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="bg-slate-900/80 border border-slate-700/50 p-6 rounded-2xl backdrop-blur-md flex flex-col items-center justify-center text-center shadow-lg shadow-black/20"
          >
            <div className="text-sm text-slate-400 font-medium mb-3">{stat.label}</div>
            <div className="flex items-baseline gap-1">
              <span className={`text-4xl font-black tracking-tight ${stat.color}`}>{stat.value}</span>
              <span className="text-sm text-slate-500 font-medium ml-1">{stat.unit}</span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Farming Charts */}
      {mode === 'farming' && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 lg:grid-cols-3 gap-6"
        >
          <ChartCard title="全基地养殖概况" data={globalChartData} />
          <ChartCard title="A区养殖概况" data={areaAChartData} />
          <ChartCard title="B区养殖概况" data={areaBChartData} />
        </motion.div>
      )}

      <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-4 md:p-8 backdrop-blur-md">
        <div className="flex flex-col mb-4 md:mb-8 gap-4">
          {/* Top Row: Title and ERP Toolbar */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between w-full gap-4 border-b border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-cyan-500/20 rounded-lg flex items-center justify-center text-cyan-400">
                {mode === 'farming' ? <Fish size={18} /> : <Droplets size={18} />}
              </div>
              <h2 className="text-lg md:text-xl font-bold text-slate-100 tracking-wider">
                {mode === 'farming' ? '养殖数据管理' : '水质指标监测'}
              </h2>
            </div>

            <div className="flex flex-col md:flex-row flex-wrap items-center gap-2 w-full md:w-auto">
              {mode === 'farming' && farmingSubMode !== 'overview' && (
                <div className="flex items-center bg-slate-950/50 border border-slate-700 rounded-lg overflow-hidden w-full md:w-auto">
                  <div className="px-3 py-1.5 bg-slate-800 border-r border-slate-700 text-slate-400 text-xs uppercase font-bold">
                    期间
                  </div>
                  <input 
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => {
                      setSelectedMonth(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="bg-transparent py-1.5 px-3 text-sm focus:outline-none text-slate-300 flex-1 md:w-36"
                  />
                </div>
              )}
              
              <div className="flex items-center bg-slate-950/50 border border-slate-700 rounded-lg overflow-hidden w-full md:w-auto">
                <div className="px-3 py-1.5 bg-slate-800 border-r border-slate-700 text-slate-400">
                  <Search size={14} />
                </div>
                <input 
                  type="text"
                  placeholder="快速检索池号..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="bg-transparent py-1.5 px-3 text-sm focus:outline-none text-slate-300 flex-1 md:w-48"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 w-full md:flex md:w-auto">
                {mode === 'farming' && (
                  <>
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      ref={fileInputRef} 
                      onChange={handleFileUpload} 
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={aiLoading}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 md:py-1.5 rounded-lg text-xs md:text-sm font-bold transition-all bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm"
                    >
                      {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <BrainCircuit size={14} />}
                      AI 录入
                    </button>
                    <button
                      onClick={() => setIsAddingRecord(!isAddingRecord)}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 md:py-1.5 rounded-lg text-xs md:text-sm font-bold transition-all bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 col-span-2 md:flex-none"
                    >
                      {isAddingRecord ? '取消新增' : '新增单据'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {isAddingRecord && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-slate-900/40 backdrop-blur-md border border-slate-700/50 p-6 rounded-2xl mb-8 shadow-2xl relative overflow-hidden group"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500/50 to-transparent opacity-30" />
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-cyan-500/10 rounded-lg flex items-center justify-center text-cyan-400">
                    <FileText size={18} />
                  </div>
                  <h3 className="text-white font-bold">新增{farmingSubMode === 'overview' ? '养殖记录' : farmingSubMode === 'inout' ? '进出库单' : farmingSubMode === 'feedmed' ? '投喂用药记录' : '损耗平衡单'}</h3>
                </div>
                <button onClick={() => setIsAddingRecord(false)} className="text-slate-500 hover:text-white transition-colors">
                  <X size={20} />
                </button>
              </div>
              
              {error && <div className="text-red-400 mb-6 bg-red-400/5 p-4 rounded-xl border border-red-400/20 text-sm flex items-center gap-2">
                <div className="w-1 h-4 bg-red-500 rounded-full" />
                {error}
              </div>}
              
              {farmingSubMode === 'overview' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs uppercase tracking-wider font-bold text-slate-500 ml-1">业务日期</label>
                    <input type="date" onChange={(e) => setNewRecord(prev => ({...prev, date: e.target.value}))} className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl p-3 text-sm text-slate-300 focus:border-cyan-500 focus:outline-none transition-all" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs uppercase tracking-wider font-bold text-slate-500 ml-1">池号标识</label>
                    <input type="text" placeholder="例: A-01" onChange={(e) => setNewRecord(prev => ({...prev, tankId: e.target.value}))} className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl p-3 text-sm text-slate-300 focus:border-cyan-500 focus:outline-none transition-all" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs uppercase tracking-wider font-bold text-slate-500 ml-1">当前状态</label>
                    <select onChange={(e) => setNewRecord(prev => ({...prev, status: e.target.value}))} className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl p-3 text-sm text-slate-300 focus:border-cyan-500 focus:outline-none transition-all appearance-none cursor-pointer">
                      <option value="">-- 选择状态 --</option>
                      <option value="normal">养殖中</option>
                      <option value="alarm">异常警示</option>
                      <option value="empty">空池</option>
                      <option value="maintenance">维护中</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs uppercase tracking-wider font-bold text-slate-500 ml-1">养殖品种</label>
                    <input type="text" placeholder="鱼苗名称" onChange={(e) => setNewRecord(prev => ({...prev, species: e.target.value}))} className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl p-3 text-sm text-slate-300 focus:border-cyan-500 focus:outline-none transition-all" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs uppercase tracking-wider font-bold text-slate-500 ml-1">投放规格</label>
                    <input type="text" placeholder="如: 0.05 (斤/条)" onChange={(e) => setNewRecord(prev => ({...prev, size: e.target.value}))} className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl p-3 text-sm text-slate-300 focus:border-cyan-500 focus:outline-none transition-all" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs uppercase tracking-wider font-bold text-slate-500 ml-1">初始量(斤)</label>
                    <input type="number" placeholder="0" onChange={(e) => setNewRecord(prev => ({...prev, inventory: Number(e.target.value)}))} className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl p-3 text-sm text-slate-300 focus:border-cyan-500 focus:outline-none transition-all" />
                  </div>
                </div>
              )}
              {farmingSubMode === 'inout' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs uppercase tracking-wider font-bold text-slate-500 ml-1">操作日期</label>
                    <input type="date" onChange={(e) => setNewRecord(prev => ({...prev, date: e.target.value}))} className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl p-3 text-sm text-slate-300 focus:border-cyan-500 focus:outline-none transition-all" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs uppercase tracking-wider font-bold text-slate-500 ml-1">目标池号</label>
                    <input type="text" placeholder="池号" onChange={(e) => setNewRecord(prev => ({...prev, tankId: e.target.value}))} className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl p-3 text-sm text-slate-300 focus:border-cyan-500 focus:outline-none transition-all" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs uppercase tracking-wider font-bold text-slate-500 ml-1">业务类型</label>
                    <select onChange={(e) => setNewRecord(prev => ({...prev, type: e.target.value}))} className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl p-3 text-sm text-slate-300 focus:border-cyan-500 focus:outline-none transition-all appearance-none cursor-pointer">
                      <option value="purchaseIn">采购入库</option>
                      <option value="transferIn">转池入库</option>
                      <option value="salesOut" className="text-orange-400">销售出库</option>
                      <option value="transferOut" className="text-orange-400">转池出库</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs uppercase tracking-wider font-bold text-slate-500 ml-1">品种</label>
                    <input type="text" placeholder="品种" onChange={(e) => setNewRecord(prev => ({...prev, species: e.target.value}))} className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl p-3 text-sm text-slate-300 focus:border-cyan-500 focus:outline-none transition-all" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs uppercase tracking-wider font-bold text-slate-500 ml-1">规格(斤/条)</label>
                    <input type="text" placeholder="如: 0.05" onChange={(e) => setNewRecord(prev => ({...prev, size: e.target.value}))} className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl p-3 text-sm text-slate-300 focus:border-cyan-500 focus:outline-none transition-all" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs uppercase tracking-wider font-bold text-slate-500 ml-1">数量(条)</label>
                    <input type="number" placeholder="尾数" onChange={(e) => setNewRecord(prev => ({...prev, count: Number(e.target.value)}))} className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl p-3 text-sm text-slate-300 focus:border-cyan-500 focus:outline-none transition-all" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs uppercase tracking-wider font-bold text-slate-500 ml-1">总重量(斤)</label>
                    <input type="number" placeholder="数量" onChange={(e) => setNewRecord(prev => ({...prev, amount: Number(e.target.value)}))} className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl p-3 text-sm text-slate-300 focus:border-cyan-500 focus:outline-none transition-all" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs uppercase tracking-wider font-bold text-slate-500 ml-1">详情备注</label>
                    <input type="text" placeholder="备注信息" onChange={(e) => setNewRecord(prev => ({...prev, remarks: e.target.value}))} className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl p-3 text-sm text-slate-300 focus:border-cyan-500 focus:outline-none transition-all" />
                  </div>
                </div>
              )}
              {farmingSubMode === 'feedmed' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs uppercase tracking-wider font-bold text-slate-500 ml-1">投喂日期</label>
                    <input type="date" onChange={(e) => setNewRecord(prev => ({...prev, date: e.target.value}))} className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl p-3 text-sm text-slate-300 focus:border-cyan-500 focus:outline-none transition-all" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs uppercase tracking-wider font-bold text-slate-500 ml-1">池号</label>
                    <input type="text" placeholder="池号" onChange={(e) => setNewRecord(prev => ({...prev, tankId: e.target.value}))} className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl p-3 text-sm text-slate-300 focus:border-cyan-500 focus:outline-none transition-all" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs uppercase tracking-wider font-bold text-slate-500 ml-1">饲料品类</label>
                    <input type="text" placeholder="饲料种类" onChange={(e) => setNewRecord(prev => ({...prev, feedType: e.target.value}))} className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl p-3 text-sm text-slate-300 focus:border-cyan-500 focus:outline-none transition-all" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs uppercase tracking-wider font-bold text-slate-500 ml-1">投喂量(kg)</label>
                    <input type="number" placeholder="投喂量" onChange={(e) => setNewRecord(prev => ({...prev, feedAmount: Number(e.target.value)}))} className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl p-3 text-sm text-slate-300 focus:border-cyan-500 focus:outline-none transition-all" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs uppercase tracking-wider font-bold text-slate-500 ml-1">药品名称</label>
                    <input type="text" placeholder="药品名称" onChange={(e) => setNewRecord(prev => ({...prev, medicineName: e.target.value}))} className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl p-3 text-sm text-slate-300 focus:border-cyan-500 focus:outline-none transition-all" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs uppercase tracking-wider font-bold text-slate-500 ml-1">使用剂量</label>
                    <input type="number" placeholder="用药量" onChange={(e) => setNewRecord(prev => ({...prev, medicineAmount: Number(e.target.value)}))} className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl p-3 text-sm text-slate-300 focus:border-cyan-500 focus:outline-none transition-all" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs uppercase tracking-wider font-bold text-slate-500 ml-1">备注说明</label>
                    <input type="text" placeholder="备注" onChange={(e) => setNewRecord(prev => ({...prev, remarks: e.target.value}))} className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl p-3 text-sm text-slate-300 focus:border-cyan-500 focus:outline-none transition-all" />
                  </div>
                </div>
              )}
              {farmingSubMode === 'loss' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs uppercase tracking-wider font-bold text-slate-500 ml-1">记录日期</label>
                    <input type="date" onChange={(e) => setNewRecord(prev => ({...prev, date: e.target.value}))} className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl p-3 text-sm text-slate-300 focus:border-cyan-500 focus:outline-none transition-all" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs uppercase tracking-wider font-bold text-slate-500 ml-1">损耗池号</label>
                    <input type="text" placeholder="池号" onChange={(e) => setNewRecord(prev => ({...prev, tankId: e.target.value}))} className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl p-3 text-sm text-slate-300 focus:border-cyan-500 focus:outline-none transition-all" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs uppercase tracking-wider font-bold text-slate-500 ml-1">损耗数量(条)</label>
                    <input type="number" placeholder="只数" onChange={(e) => setNewRecord(prev => ({...prev, deadCount: Number(e.target.value)}))} className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl p-3 text-sm text-slate-300 focus:border-cyan-500 focus:outline-none transition-all" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs uppercase tracking-wider font-bold text-slate-500 ml-1">平均规格(斤/条)</label>
                    <input type="text" placeholder="如: 0.8" onChange={(e) => setNewRecord(prev => ({...prev, size: e.target.value}))} className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl p-3 text-sm text-slate-300 focus:border-cyan-500 focus:outline-none transition-all" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs uppercase tracking-wider font-bold text-slate-500 ml-1">损耗重量(斤)</label>
                    <input type="number" placeholder="重量 (可选，不填按规格计算)" onChange={(e) => setNewRecord(prev => ({...prev, amount: Number(e.target.value)}))} className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl p-3 text-sm text-slate-300 focus:border-cyan-500 focus:outline-none transition-all" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs uppercase tracking-wider font-bold text-slate-500 ml-1">原因分析</label>
                    <input type="text" placeholder="输入记录原因" onChange={(e) => setNewRecord(prev => ({...prev, reason: e.target.value}))} className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl p-3 text-sm text-slate-300 focus:border-cyan-500 focus:outline-none transition-all" />
                  </div>
                </div>
              )}
              <div className="mt-8 flex items-center justify-end gap-3">
                <button onClick={() => setIsAddingRecord(false)} className="px-6 py-2 rounded-xl text-slate-400 hover:text-white transition-colors text-sm font-bold">
                  取消
                </button>
                <button 
                  onClick={handleAddRecord} 
                  className="bg-gradient-to-r from-cyan-600 to-cyan-500 text-slate-900 px-8 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-cyan-500/20 hover:scale-105 transition-all"
                >
                  提交记录
                </button>
              </div>
            </motion.div>
          )}

          {/* Bottom Row: Sub-navigation */}
          {mode === 'farming' && (
            <div className="relative mt-4 flex items-center border-b border-slate-800 justify-between">
              <div className="relative group/tabs flex-1 min-w-0 pr-4">
                <div className="flex items-center gap-1 w-full overflow-x-auto custom-scrollbar-horizontal scroll-smooth pb-[1px]">
                  {[
                    { id: 'overview', label: '养殖概览', icon: <Activity size={14} /> },
                    { id: 'inout', label: '出入库及销售', icon: <Fish size={14} /> },
                    { id: 'feedmed', label: '投喂与用药', icon: <FileText size={14} /> },
                    { id: 'loss', label: '损耗记录', icon: <Activity size={14} /> }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setFarmingSubMode(tab.id as FarmingSubMode)}
                      className={`flex items-center gap-2 px-4 md:px-6 py-3 md:py-2.5 text-xs md:text-sm font-bold transition-all border-b-2 -mb-[2px] whitespace-nowrap ${
                        farmingSubMode === tab.id 
                          ? 'border-cyan-500 text-cyan-400 bg-cyan-500/10' 
                          : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
                      }`}
                    >
                      {tab.icon}
                      {tab.label}
                    </button>
                  ))}
                </div>
                {/* Mobile scroll hint shadow */}
                <div className="absolute right-0 top-0 bottom-1 w-8 bg-gradient-to-l from-[#0b1222] via-[#0b1222]/80 to-transparent pointer-events-none md:hidden z-10" />
              </div>
              
              {/* Save Button next to tabs */}
              <div className="shrink-0 mb-1 ml-2 mr-2">
                <button 
                  onClick={handleSave}
                  disabled={isLoading || Object.keys(editingData).length === 0}
                  className={`flex items-center justify-center gap-1.5 px-3 py-2 md:py-1.5 rounded-lg text-xs md:text-sm font-bold transition-all shadow-sm ${
                    Object.keys(editingData).length > 0 
                      ? 'bg-cyan-600 hover:bg-cyan-500 text-white' 
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  <span className="hidden sm:inline">保存更改</span>
                  <span className="inline sm:hidden">保存</span>
                  {Object.keys(editingData).length > 0 && (
                    <span className="hidden sm:inline-flex ml-1 bg-white/20 px-1.5 rounded-full text-[10px] items-center justify-center">{Object.keys(editingData).length}</span>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/50 backdrop-blur-md shadow-2xl">
        <table className="w-full border-collapse text-sm text-left whitespace-nowrap">
          <thead className="sticky top-0 z-20">
            {/* Filter Row */}
            {mode === 'farming' && (
              <tr className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800">
                {farmingSubMode === 'overview' && (
                  <>
                    <th className="p-1 min-w-[70px]"><input type="date" onChange={(e) => setColumnFilters(p => ({...p, date: e.target.value}))} className="w-full bg-slate-950/50 border border-slate-800 rounded px-1 py-1 text-[11px] text-slate-400 focus:border-cyan-500 focus:outline-none transition-colors" /></th>
                    <th className="p-1 min-w-[50px]"><input type="text" placeholder="池号" onChange={(e) => setColumnFilters(p => ({...p, tankId: e.target.value}))} className="w-full bg-slate-950/50 border border-slate-800 rounded px-1 py-1 text-[11px] text-slate-400 focus:border-cyan-500 focus:outline-none text-center" /></th>
                    <th className="p-1 min-w-[60px]"><input type="text" placeholder="状态" onChange={(e) => setColumnFilters(p => ({...p, status: e.target.value}))} className="w-full bg-slate-950/50 border border-slate-800 rounded px-1 py-1 text-[11px] text-slate-400 focus:border-cyan-500 focus:outline-none text-center" /></th>
                    <th className="p-1 min-w-[60px]"><input type="text" placeholder="品种" onChange={(e) => setColumnFilters(p => ({...p, species: e.target.value}))} className="w-full bg-slate-950/50 border border-slate-800 rounded px-1 py-1 text-[11px] text-slate-400 focus:border-cyan-500 focus:outline-none text-center" /></th>
                    <th colSpan={7} className="p-1"></th>
                  </>
                )}
                {farmingSubMode === 'inout' && (
                  <>
                    <th className="p-2 text-center"><input type="date" onChange={(e) => setColumnFilters(p => ({...p, date: e.target.value}))} className="w-32 bg-slate-950/50 border border-slate-800 rounded px-2 py-1 text-xs text-slate-400 focus:border-cyan-500 focus:outline-none" /></th>
                    <th className="p-2 text-center"><input type="text" placeholder="池号" onChange={(e) => setColumnFilters(p => ({...p, tankId: e.target.value}))} className="w-24 bg-slate-950/50 border border-slate-800 rounded px-2 py-1 text-xs text-slate-400 focus:border-cyan-500 focus:outline-none text-center" /></th>
                    <th className="p-2 text-center"><input type="text" placeholder="类型" onChange={(e) => setColumnFilters(p => ({...p, type: e.target.value}))} className="w-24 bg-slate-950/50 border border-slate-800 rounded px-2 py-1 text-xs text-slate-400 focus:border-cyan-500 focus:outline-none text-center" /></th>
                    <th colSpan={6} className="p-2"></th>
                  </>
                )}
                {farmingSubMode === 'feedmed' && (
                  <>
                    <th className="p-2 text-center"><input type="date" onChange={(e) => setColumnFilters(p => ({...p, date: e.target.value}))} className="w-32 bg-slate-950/50 border border-slate-800 rounded px-2 py-1 text-xs text-slate-400 focus:border-cyan-500 focus:outline-none" /></th>
                    <th className="p-2 text-center"><input type="text" placeholder="池号" onChange={(e) => setColumnFilters(p => ({...p, tankId: e.target.value}))} className="w-24 bg-slate-950/50 border border-slate-800 rounded px-2 py-1 text-xs text-slate-400 focus:border-cyan-500 focus:outline-none text-center" /></th>
                    <th colSpan={6} className="p-2"></th>
                  </>
                )}
                {farmingSubMode === 'loss' && (
                  <>
                    <th className="p-2 text-center"><input type="date" onChange={(e) => setColumnFilters(p => ({...p, date: e.target.value}))} className="w-32 bg-slate-950/50 border border-slate-800 rounded px-2 py-1 text-xs text-slate-400 focus:border-cyan-500 focus:outline-none" /></th>
                    <th className="p-2 text-center"><input type="text" placeholder="池号" onChange={(e) => setColumnFilters(p => ({...p, tankId: e.target.value}))} className="w-24 bg-slate-950/50 border border-slate-800 rounded px-2 py-1 text-xs text-slate-400 focus:border-cyan-500 focus:outline-none text-center" /></th>
                    <th colSpan={3} className="p-2"></th>
                  </>
                )}
              </tr>
            )}

            {/* Header Row */}
            <tr className="bg-slate-800/80 text-slate-300 font-bold border-b border-slate-700 uppercase tracking-wider text-[11px]">
              {mode === 'water' && (
                <>
                  <th className="py-3 px-4 text-center cursor-pointer hover:bg-slate-700 transition-colors" onClick={() => handleSort('id')}>池号</th>
                  <th className="py-3 px-4 text-center cursor-pointer hover:bg-slate-700 transition-colors" onClick={() => handleSort('status')}>时间</th>
                  <th className="py-3 px-4 text-center cursor-pointer hover:bg-slate-700 transition-colors" onClick={() => handleSort('temperature')}>水温 (°C)</th>
                  <th className="py-3 px-4 text-center cursor-pointer hover:bg-slate-700 transition-colors" onClick={() => handleSort('ph')}>pH 值</th>
                  <th className="py-3 px-4 text-center cursor-pointer hover:bg-slate-700 transition-colors" onClick={() => handleSort('oxygen')}>溶氧 (mg/L)</th>
                  <th className="py-3 px-4 text-center">氨氮 TAN</th>
                  <th className="py-3 px-4 text-center">亚硝 NO2</th>
                  <th className="py-3 px-4 text-center">碱度 (mg/L)</th>
                  <th className="py-3 px-4 text-center">ORP (mV)</th>
                </>
              )}
              {mode === 'farming' && farmingSubMode === 'overview' && (
                <>
                  <th className="py-2 px-1 text-center whitespace-nowrap text-xs min-w-[90px]">更新日期</th>
                  <th className="py-2 px-1 text-center cursor-pointer hover:bg-slate-700 transition-colors whitespace-nowrap text-xs min-w-[60px]" onClick={() => handleSort('id')}>池号</th>
                  <th className="py-2 px-1 text-center cursor-pointer hover:bg-slate-700 transition-colors whitespace-nowrap text-xs min-w-[70px]" onClick={() => handleSort('status')}>状态</th>
                  <th className="py-2 px-1 text-center cursor-pointer hover:bg-slate-700 transition-colors whitespace-nowrap text-xs min-w-[70px]" onClick={() => handleSort('species')}>品种</th>
                  <th className="py-2 px-1 text-center whitespace-nowrap text-xs min-w-[80px]">入池时间</th>
                  <th className="py-2 px-1 text-center whitespace-nowrap text-xs min-w-[60px]">入池规格(斤/条)</th>
                  <th className="py-2 px-1 text-center whitespace-nowrap text-xs min-w-[60px]">入池总量(条)</th>
                  <th className="py-2 px-1 text-center whitespace-nowrap text-xs min-w-[60px]">入池重量(斤)</th>
                  <th className="py-2 px-1 text-center whitespace-nowrap text-xs min-w-[60px]">现有库存(条)</th>
                  <th className="py-2 px-1 text-center whitespace-nowrap text-xs min-w-[60px]">现存规格(斤/条)</th>
                  <th className="py-2 px-1 text-center cursor-pointer hover:bg-slate-700 transition-colors whitespace-nowrap text-xs min-w-[60px]" onClick={() => handleSort('inventory')}>现有库存(斤)</th>
                  <th className="py-2 px-1 text-center cursor-pointer hover:bg-slate-700 transition-colors whitespace-nowrap text-xs min-w-[50px]" onClick={() => handleSort('dead')}>损耗(条)</th>
                  <th className="py-2 px-1 text-center whitespace-nowrap text-xs w-16">操作</th>
                </>
              )}
              {mode === 'farming' && farmingSubMode === 'inout' && (
                <>
                  <th className="py-3 px-4 text-center">日期</th>
                  <th className="py-3 px-4 text-center">池号</th>
                  <th className="py-3 px-4 text-center">类型</th>
                  <th className="py-3 px-4 text-center">品种</th>
                  <th className="py-3 px-4 text-center">规格(斤/条)</th>
                  <th className="py-3 px-4 text-center">数量(条)</th>
                  <th className="py-3 px-4 text-center">数量(斤)</th>
                  <th className="py-3 px-4">备注</th>
                  <th className="py-3 px-4 text-center w-20">操作</th>
                </>
              )}
              {mode === 'farming' && farmingSubMode === 'feedmed' && (
                <>
                  <th className="py-3 px-4 text-center">日期</th>
                  <th className="py-3 px-4 text-center">池号</th>
                  <th className="py-3 px-4 text-center">饲料种类</th>
                  <th className="py-3 px-4 text-center">投喂量(kg)</th>
                  <th className="py-3 px-4 text-center">药品名称</th>
                  <th className="py-3 px-4 text-center">用药量</th>
                  <th className="py-3 px-4">备注</th>
                  <th className="py-3 px-4 text-center w-20">操作</th>
                </>
              )}
              {mode === 'farming' && farmingSubMode === 'loss' && (
                <>
                  <th className="py-3 px-4 text-center">日期</th>
                  <th className="py-3 px-4 text-center">池号</th>
                  <th className="py-3 px-4 text-center">死亡数量(斤)</th>
                  <th className="py-3 px-4">原因</th>
                  <th className="py-3 px-4 text-center w-20">操作</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="text-[14px] font-medium bg-slate-900/30 divide-y divide-slate-800">
            {mode === 'water' && paginatedTanks.map((tank) => (
              <tr key={tank.id} className="hover:bg-slate-800/40 transition-all group border-b border-slate-800/50">
                <td className="p-3 text-center">
                  <div className="w-full h-full flex items-center justify-center text-cyan-400 font-bold font-mono">{tank.id}</div>
                </td>
                <td className="p-3">
                  <select 
                    value={editingData[tank.id]?.status ?? tank.status}
                    onChange={(e) => handleStatusChange(tank, e.target.value)}
                    className="w-full bg-slate-950/30 border border-slate-800/50 rounded px-2 py-1 text-center focus:border-cyan-500 focus:outline-none transition-colors appearance-none cursor-pointer"
                  >
                    <option value="normal" className="bg-slate-800 text-emerald-400">养殖中</option>
                    <option value="empty" className="bg-slate-800 text-slate-500">空池中</option>
                    <option value="alarm" className="bg-slate-800 text-red-400">水质报警</option>
                    <option value="maintenance" className="bg-slate-800 text-orange-400">设备异常</option>
                    <option value="disease" className="bg-slate-800 text-red-500">病害报警</option>
                  </select>
                </td>
                <td className="p-3">
                  <input 
                    type="number" 
                    step="0.1"
                    value={editingData[tank.id]?.temperature ?? (typeof tank.temperature === 'number' ? tank.temperature.toFixed(1) : '')}
                    onChange={(e) => handleInputChange(tank.id, 'temperature', e.target.value)}
                    className="w-full bg-slate-950/30 border border-slate-800/50 rounded px-2 py-1 text-center text-orange-400 font-mono focus:border-orange-500 focus:outline-none transition-colors"
                  />
                </td>
                <td className="p-3">
                  <input 
                    type="number" 
                    step="0.1"
                    value={editingData[tank.id]?.ph ?? (typeof tank.ph === 'number' ? tank.ph.toFixed(1) : '')}
                    onChange={(e) => handleInputChange(tank.id, 'ph', e.target.value)}
                    className="w-full bg-slate-950/30 border border-slate-800/50 rounded px-2 py-1 text-center text-emerald-400 font-mono focus:border-emerald-500 focus:outline-none transition-colors"
                  />
                </td>
                <td className="p-3">
                  <input 
                    type="number" 
                    step="0.1"
                    value={editingData[tank.id]?.oxygen ?? (typeof tank.oxygen === 'number' ? tank.oxygen.toFixed(1) : '')}
                    onChange={(e) => handleInputChange(tank.id, 'oxygen', e.target.value)}
                    className="w-full bg-slate-950/30 border border-slate-800/50 rounded px-2 py-1 text-center text-cyan-400 font-mono focus:border-cyan-500 focus:outline-none transition-colors"
                  />
                </td>
                <td className="p-3">
                  <input 
                    type="number" 
                    step="0.1"
                    value={editingData[tank.id]?.nh3 ?? (typeof (tank as any).nh3 === 'number' ? (tank as any).nh3.toFixed(1) : (tank as any).nh3 === '' ? '' : '0.1')}
                    onChange={(e) => handleInputChange(tank.id, 'nh3', e.target.value)}
                    className="w-full bg-slate-950/30 border border-slate-800/50 rounded px-2 py-1 text-center focus:border-cyan-500 focus:outline-none transition-colors text-slate-400 font-mono"
                  />
                </td>
                <td className="p-3">
                  <input 
                    type="number" 
                    step="0.01"
                    value={editingData[tank.id]?.no2 ?? (typeof (tank as any).no2 === 'number' ? (tank as any).no2.toFixed(2) : (tank as any).no2 === '' ? '' : '0.05')}
                    onChange={(e) => handleInputChange(tank.id, 'no2', e.target.value)}
                    className="w-full bg-slate-950/30 border border-slate-800/50 rounded px-2 py-1 text-center focus:border-cyan-500 focus:outline-none transition-colors text-slate-400 font-mono"
                  />
                </td>
                <td className="p-3">
                  <input 
                    type="number" 
                    step="1"
                    placeholder="120"
                    value={editingData[tank.id]?.alkalinity ?? (tank.alkalinity || '')}
                    onChange={(e) => handleInputChange(tank.id, 'alkalinity', e.target.value)}
                    className="w-full bg-slate-950/30 border border-slate-800/50 rounded px-2 py-1 text-center focus:border-cyan-500 focus:outline-none transition-colors text-slate-400 font-mono"
                  />
                </td>
                <td className="p-3">
                  <input 
                    type="number" 
                    step="1"
                    placeholder="250"
                    value={editingData[tank.id]?.orp ?? (tank.orp || '')}
                    onChange={(e) => handleInputChange(tank.id, 'orp', e.target.value)}
                    className="w-full bg-slate-950/30 border border-slate-800/50 rounded px-2 py-1 text-center focus:border-cyan-500 focus:outline-none transition-colors text-slate-400 font-mono"
                  />
                </td>
              </tr>
            ))}

            {mode === 'farming' && farmingSubMode === 'overview' && paginatedTanks.map((tank) => {
              const { species, stockingTime, size: initialSize, initialCount, initialWeight, currentCount, currentSize, currentInventory, deadCount: totalDeadCount } = tank.farming || {};
              
              return (
              <tr key={tank.id} className="hover:bg-slate-800/40 transition-all group border-b border-slate-800/50">
                <td className="p-1 px-1 text-center">
                  <div className="w-full text-slate-500 text-xs">{new Date().toISOString().split('T')[0]}</div>
                </td>
                <td className="p-1 px-1 text-center">
                  <div className="flex items-center justify-center text-cyan-400 font-bold font-mono text-xs">{tank.id}</div>
                </td>
                <td className="p-1 px-1">
                  <select 
                    value={tank.status}
                    onChange={(e) => handleStatusChange(tank, e.target.value)}
                    className="w-full bg-slate-950/30 border border-slate-800/50 rounded px-0 py-1 text-center focus:border-cyan-500 focus:outline-none transition-colors appearance-none cursor-pointer text-xs"
                  >
                    <option value="normal" className="bg-slate-800 text-emerald-400">养殖中</option>
                    <option value="empty" className="bg-slate-800 text-slate-500">空池中</option>
                    <option value="alarm" className="bg-slate-800 text-red-400">水质报警</option>
                    <option value="maintenance" className="bg-slate-800 text-orange-400">设备异常</option>
                    <option value="disease" className="bg-slate-800 text-red-500">病害报警</option>
                  </select>
                </td>
                <td className="p-1 px-1 relative w-[100px]">
                  <div className="flex items-center justify-center gap-1 group/species">
                    <div className="w-14 sm:w-16 text-center text-cyan-400 font-bold text-xs truncate" title={species}>
                      {species}
                    </div>
                    <button 
                      onClick={() => handleAiAnalyze(tank, 'feeding')}
                      title="AI预测投喂量"
                      disabled={aiLoading}
                      className="text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/20 p-1 rounded transition-all shrink-0"
                    >
                      {aiLoading ? <Loader2 size={12} className="animate-spin" /> : <BrainCircuit size={14} />}
                    </button>
                  </div>
                </td>
                <td className="p-1 px-1 text-center">
                  <div className="w-full text-slate-400 text-[10px]">{stockingTime}</div>
                </td>
                <td className="p-1 px-1 text-center">
                  <div className="w-full text-slate-400 text-xs">{formatFishSize(initialSize)}</div>
                </td>
                <td className="p-1 px-1 text-center">
                  <div className="w-full text-slate-400 text-xs">{initialCount}</div>
                </td>
                <td className="p-1 px-1 text-center">
                  <div className="w-full text-slate-400 text-xs">{Number(initialWeight || 0).toFixed(0)}</div>
                </td>
                <td className="p-1 px-1 text-center">
                  <div className="w-full text-cyan-400 font-bold font-mono text-xs">{currentCount}</div>
                </td>
                <td className="p-1 px-1 text-center">
                  <div className="w-full text-emerald-400 text-xs">{formatFishSize(currentSize)}</div>
                </td>
                <td className="p-1 px-1 text-center">
                  <div className="w-full text-blue-400 font-bold font-mono text-xs">{currentInventory}</div>
                </td>
                <td className="p-1 px-1 text-center">
                  <div className="w-full text-red-500 font-bold font-mono text-xs">{totalDeadCount}</div>
                </td>
                <td className="p-1 px-1 text-center">
                  <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    <button 
                      onClick={() => setDeleteTarget({id: tank.id, type: 'overview'})} 
                      className="p-1.5 rounded-lg bg-orange-500/10 text-orange-500 hover:bg-orange-500 hover:text-white transition-all"
                      title="一键清空数据"
                    >
                      <Database size={14} />
                    </button>
                    <button 
                      onClick={() => setDeleteTarget({id: tank.id, type: 'deleteTank' as any})} 
                      className="p-1.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all"
                      title="彻底删除池号"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </td>
              </tr>
              );
            })}

            {mode === 'farming' && farmingSubMode === 'inout' && filteredInOut.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((record) => (
              <tr key={record.id} className="hover:bg-slate-800/40 transition-all group border-b border-slate-800/50">
                <td className="p-3">
                  <input 
                    type="date" 
                    defaultValue={record.date} 
                    onChange={(e) => handleInputChange(record.id, 'date', e.target.value)} 
                    className="w-full bg-slate-950/30 border border-slate-800/50 rounded px-2 py-1 text-center text-slate-400 focus:border-cyan-500 focus:outline-none transition-colors" 
                  />
                </td>
                <td className="p-3">
                  <input 
                    type="text" 
                    defaultValue={record.tankId} 
                    onChange={(e) => handleInputChange(record.id, 'tankId', e.target.value)} 
                    className="w-full bg-slate-950/30 border border-slate-800/50 rounded px-2 py-1 text-center text-cyan-400 font-bold focus:border-cyan-500 focus:outline-none transition-colors" 
                  />
                </td>
                <td className="p-3">
                  <div className="relative">
                    <select 
                      defaultValue={record.type} 
                      onChange={(e) => handleInputChange(record.id, 'type', e.target.value)} 
                      className={`w-full bg-slate-950/30 border border-slate-800/50 rounded px-2 py-1 text-center appearance-none cursor-pointer focus:border-cyan-500 focus:outline-none transition-colors font-bold ${
                        record.type.includes('In') ? 'text-emerald-400' : 'text-orange-400'
                      }`}
                    >
                      <option value="purchaseIn" className="bg-slate-900">采购入库</option>
                      <option value="transferIn" className="bg-slate-900">转池入库</option>
                      <option value="salesOut" className="bg-slate-900">销售出库</option>
                      <option value="transferOut" className="bg-slate-900">转池出库</option>
                    </select>
                  </div>
                </td>
                <td className="p-3">
                  <input 
                    type="text" 
                    value={
                      (record.type === 'salesOut' || record.type === 'transferOut') 
                        ? (calculatedTanks.find(t => t.id === record.tankId)?.farming?.species || editingData[record.id]?.species || record.species || '')
                        : (editingData[record.id]?.species ?? record.species ?? '')
                    } 
                    onChange={(e) => handleInputChange(record.id, 'species', e.target.value)} 
                    readOnly={record.type === 'salesOut' || record.type === 'transferOut'}
                    className={`w-full border border-slate-800/50 rounded px-2 py-1 text-center focus:border-cyan-500 focus:outline-none transition-colors ${
                      (record.type === 'salesOut' || record.type === 'transferOut') 
                        ? 'bg-slate-900/50 text-cyan-400 font-bold' 
                        : 'bg-slate-950/30 text-white'
                    }`} 
                    placeholder="如: 鲈鱼"
                  />
                </td>
                <td className="p-3">
                  <input 
                    type="text" 
                    defaultValue={formatFishSize(record.size || '')} 
                    onChange={(e) => handleInputChange(record.id, 'size', e.target.value)} 
                    className="w-full bg-slate-950/30 border border-slate-800/50 rounded px-2 py-1 text-center focus:border-cyan-500 focus:outline-none transition-colors text-slate-300" 
                    placeholder="如: 0.05"
                  />
                </td>
                <td className="p-3">
                  <input 
                    type="number" 
                    defaultValue={record.count || 0} 
                    onChange={(e) => handleInputChange(record.id, 'count', e.target.value)} 
                    className="w-full bg-slate-950/30 border border-slate-800/50 rounded px-2 py-1 text-center focus:border-cyan-500 focus:outline-none transition-colors font-mono font-bold text-indigo-400" 
                  />
                </td>
                <td className="p-3">
                  <div className="flex items-center justify-center gap-1">
                    <input 
                      type="number" 
                      defaultValue={record.amount} 
                      onChange={(e) => handleInputChange(record.id, 'amount', e.target.value)} 
                      className="w-24 bg-slate-950/30 border border-slate-800/50 rounded px-2 py-1 text-center focus:border-cyan-500 focus:outline-none transition-colors font-mono font-bold text-white text-lg" 
                    />
                    <span className="text-slate-500 text-xs">斤</span>
                  </div>
                </td>
                <td className="p-3">
                  <input 
                    type="text" 
                    defaultValue={record.remarks} 
                    onChange={(e) => handleInputChange(record.id, 'remarks', e.target.value)} 
                    className="w-full bg-slate-950/30 border border-slate-800/50 rounded px-2 py-1 text-left text-slate-400 focus:border-cyan-500 focus:outline-none transition-colors italic" 
                    placeholder="添加备注..."
                  />
                </td>
                <td className="p-3 text-center">
                  <button 
                    onClick={() => setDeleteTarget({id: record.id, type: 'inout'})} 
                    className="text-slate-600 hover:text-red-400 p-2 rounded-lg hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100" 
                    title="删除记录"
                  >
                    <X size={16} />
                  </button>
                </td>
              </tr>
            ))}

            {mode === 'farming' && farmingSubMode === 'feedmed' && filteredFeedMed.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((record) => (
              <tr key={record.id} className="hover:bg-slate-800/40 transition-all group border-b border-slate-800/50 text-[13px]">
                <td className="p-3">
                  <input 
                    type="date" 
                    defaultValue={record.date} 
                    onChange={(e) => handleInputChange(record.id, 'date', e.target.value)} 
                    className="w-full bg-slate-950/30 border border-slate-800/50 rounded px-2 py-1 text-center text-slate-400 focus:border-cyan-500 focus:outline-none transition-colors" 
                  />
                </td>
                <td className="p-3">
                  <input 
                    type="text" 
                    defaultValue={record.tankId} 
                    onChange={(e) => handleInputChange(record.id, 'tankId', e.target.value)} 
                    className="w-full bg-slate-950/30 border border-slate-800/50 rounded px-2 py-1 text-center text-cyan-400 font-bold focus:border-cyan-500 focus:outline-none transition-colors" 
                  />
                </td>
                <td className="p-3">
                  <input 
                    type="text" 
                    defaultValue={record.feedType} 
                    onChange={(e) => handleInputChange(record.id, 'feedType', e.target.value)} 
                    className="w-full bg-slate-950/30 border border-slate-800/50 rounded px-2 py-1 text-center text-white focus:border-cyan-500 focus:outline-none transition-colors" 
                    placeholder="饲料类型"
                  />
                </td>
                <td className="p-3">
                  <div className="flex items-center justify-center gap-1">
                    <input 
                      type="number" 
                      defaultValue={record.feedAmount} 
                      onChange={(e) => handleInputChange(record.id, 'feedAmount', e.target.value)} 
                      className="w-20 bg-slate-950/30 border border-slate-800/50 rounded px-2 py-1 text-center focus:border-cyan-500 focus:outline-none transition-colors font-mono font-bold text-emerald-400" 
                    />
                    <span className="text-slate-600">kg</span>
                  </div>
                </td>
                <td className="p-3 text-center">
                  <input 
                    type="text" 
                    defaultValue={record.medicineName} 
                    onChange={(e) => handleInputChange(record.id, 'medicineName', e.target.value)} 
                    className="w-full bg-slate-950/30 border border-slate-800/50 rounded px-2 py-1 text-center text-indigo-300 focus:border-indigo-500 focus:outline-none transition-colors" 
                    placeholder="药品名称"
                  />
                </td>
                <td className="p-3 text-center">
                  <input 
                    type="text" 
                    defaultValue={record.medicineAmount} 
                    onChange={(e) => handleInputChange(record.id, 'medicineAmount', e.target.value)} 
                    className="w-full bg-slate-950/30 border border-slate-800/50 rounded px-2 py-1 text-center text-indigo-300 focus:border-indigo-500 focus:outline-none transition-colors font-mono" 
                    placeholder="剂量"
                  />
                </td>
                <td className="p-3">
                  <input 
                    type="text" 
                    defaultValue={record.remarks} 
                    onChange={(e) => handleInputChange(record.id, 'remarks', e.target.value)} 
                    className="w-full bg-slate-950/30 border border-slate-800/50 rounded px-2 py-1 text-left text-slate-500 focus:border-cyan-500 focus:outline-none transition-colors italic" 
                  />
                </td>
                <td className="p-3 text-center">
                  <button 
                    onClick={() => setDeleteTarget({id: record.id, type: 'feedmed'})} 
                    className="text-slate-600 hover:text-red-400 p-2 rounded-lg hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100" 
                    title="删除记录"
                  >
                    <X size={16} />
                  </button>
                </td>
              </tr>
            ))}

            {mode === 'farming' && farmingSubMode === 'loss' && filteredLoss.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((record) => (
              <tr key={record.id} className="hover:bg-slate-800/40 transition-all group border-b border-slate-800/50">
                <td className="p-3">
                  <input 
                    type="date" 
                    defaultValue={record.date} 
                    onChange={(e) => handleInputChange(record.id, 'date', e.target.value)} 
                    className="w-full bg-slate-950/30 border border-slate-800/50 rounded px-2 py-1 text-center text-slate-400 focus:border-cyan-500 focus:outline-none transition-colors" 
                  />
                </td>
                <td className="p-3 text-center">
                  <input 
                    type="text" 
                    defaultValue={record.tankId} 
                    onChange={(e) => handleInputChange(record.id, 'tankId', e.target.value)} 
                    className="w-32 mx-auto bg-slate-950/30 border border-slate-800/50 rounded px-2 py-1 text-center text-cyan-400 font-bold focus:border-cyan-500 focus:outline-none transition-colors" 
                  />
                </td>
                <td className="p-3 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <input 
                      type="number" 
                      defaultValue={record.deadCount} 
                      onChange={(e) => handleInputChange(record.id, 'deadCount', e.target.value)} 
                      className="w-24 bg-red-500/10 border border-red-500/20 rounded px-2 py-1 text-center text-red-400 font-bold focus:border-red-500 focus:outline-none transition-all font-mono text-lg" 
                    />
                    <span className="text-red-400/50 text-xs">斤</span>
                  </div>
                </td>
                <td className="p-3">
                  <input 
                    type="text" 
                    defaultValue={record.reason} 
                    onChange={(e) => handleInputChange(record.id, 'reason', e.target.value)} 
                    className="w-full bg-slate-950/30 border border-slate-800/50 rounded px-2 py-1 text-left text-slate-400 focus:border-red-500/50 focus:outline-none transition-colors" 
                    placeholder="输入造成损耗的原因..."
                  />
                </td>
                <td className="p-3 text-center">
                  <button 
                    onClick={() => setDeleteTarget({id: record.id, type: 'loss'})} 
                    className="text-slate-600 hover:text-red-400 p-2 rounded-lg hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100" 
                    title="删除记录"
                  >
                    <X size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <div className="mt-6 p-4 rounded-2xl bg-slate-900/40 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-6 overflow-hidden relative">
        <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 blur-3xl rounded-full" />
        <div className="flex items-center gap-6 text-[11px] uppercase tracking-wider font-bold">
          <div className="flex items-center gap-2 text-slate-400">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
            显示条目: <span className="text-white bg-slate-950 px-2 py-0.5 rounded border border-slate-800">{totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, totalItems)}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-700" />
            总计: <span className="text-white">{totalItems}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-700" />
            页码: <span className="text-white">{currentPage} / {totalPages}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all border ${
              currentPage === 1 
                ? 'bg-slate-950/30 border-slate-800/50 text-slate-700 cursor-not-allowed' 
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white hover:border-cyan-500/50 hover:shadow-[0_0_15px_rgba(6,182,212,0.1)]'
            }`}
          >
            <ArrowLeft size={16} />
          </button>
          
          <div className="flex gap-1 px-2">
            {currentPage > 3 && totalPages > 5 && <span className="flex items-center px-1 text-slate-700">...</span>}
            {getPageNumbers().map((pageNum) => (
              <button
                key={pageNum}
                onClick={() => setCurrentPage(pageNum)}
                className={`w-10 h-10 rounded-xl text-xs font-bold transition-all border ${
                  currentPage === pageNum
                    ? 'bg-cyan-500 border-cyan-400 text-slate-900 shadow-[0_0_15px_rgba(6,182,212,0.3)]'
                    : 'bg-slate-900/50 border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-300'
                }`}
              >
                {pageNum}
              </button>
            ))}
            {currentPage < totalPages - 2 && totalPages > 5 && <span className="flex items-center px-1 text-slate-700">...</span>}
          </div>

          <button 
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
            className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all border px-4 w-auto gap-2 text-xs font-bold ${
              currentPage === totalPages 
                ? 'bg-slate-950/30 border-slate-800/50 text-slate-700 cursor-not-allowed' 
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white hover:border-cyan-500/50'
            }`}
          >
            下一页
            <motion.div animate={{ x: [0, 3, 0] }} transition={{ repeat: Infinity, duration: 1.5 }}>
              <ArrowLeft size={14} className="rotate-180" />
            </motion.div>
          </button>
        </div>
      </div>

      {/* Download Section */}
      <div className="mt-8 pt-6 border-t border-slate-800/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        {mode === 'farming' ? (
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-sm font-bold text-slate-400">选择下载数据:</span>
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer hover:text-cyan-400 transition-colors">
              <input 
                type="checkbox" 
                checked={downloadSelection.overview}
                onChange={(e) => setDownloadSelection(prev => ({ ...prev, overview: e.target.checked }))}
                className="accent-cyan-500 w-4 h-4 rounded border-slate-700 bg-slate-950"
              />
              养殖概况
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer hover:text-cyan-400 transition-colors">
              <input 
                type="checkbox" 
                checked={downloadSelection.inout}
                onChange={(e) => setDownloadSelection(prev => ({ ...prev, inout: e.target.checked }))}
                className="accent-cyan-500 w-4 h-4 rounded border-slate-700 bg-slate-950"
              />
              出入库及销售
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer hover:text-cyan-400 transition-colors">
              <input 
                type="checkbox" 
                checked={downloadSelection.feedmed}
                onChange={(e) => setDownloadSelection(prev => ({ ...prev, feedmed: e.target.checked }))}
                className="accent-cyan-500 w-4 h-4 rounded border-slate-700 bg-slate-950"
              />
              投喂与用药
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer hover:text-cyan-400 transition-colors">
              <input 
                type="checkbox" 
                checked={downloadSelection.loss}
                onChange={(e) => setDownloadSelection(prev => ({ ...prev, loss: e.target.checked }))}
                className="accent-cyan-500 w-4 h-4 rounded border-slate-700 bg-slate-950"
              />
              损耗记录
            </label>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-400">导出选项:</span>
            <span className="px-3 py-1 bg-cyan-500/10 text-cyan-400 text-xs font-bold rounded-full border border-cyan-500/20">
              水质指标监控数据
            </span>
          </div>
        )}
        <button 
          onClick={() => handleDownloadExcel(mode === 'farming' ? farmingSubMode : 'water')}
          className="flex items-center gap-2 bg-slate-800 text-cyan-400 px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-cyan-500 hover:text-slate-900 transition-all shadow-lg border border-slate-700 hover:border-cyan-500 group"
        >
          <Download size={16} className="group-hover:scale-110 transition-transform" />
          下载选中数据 (Excel)
        </button>
      </div>
      </div>
      {/* AI Analysis Modal */}
      <AnimatePresence>
        {aiResult && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-slate-900 border border-slate-700/80 rounded-2xl p-6 shadow-2xl w-full max-w-lg relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 to-blue-500" />
              
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-cyan-500/20 rounded-xl flex items-center justify-center text-cyan-400">
                    <BrainCircuit size={20} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">{aiResult.title}</h3>
                    <p className="text-xs text-cyan-400">AI 智能分析报告</p>
                  </div>
                </div>
                <button 
                  onClick={() => setAiResult(null)}
                  className="text-slate-400 hover:text-white transition-colors p-2"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="bg-slate-950/50 rounded-xl p-5 border border-slate-800/80 min-h-[120px]">
                {aiLoading ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3 py-6 text-cyan-400">
                    <Loader2 size={24} className="animate-spin" />
                    <span className="text-sm">AI正在深入分析数据，请稍候...</span>
                  </div>
                ) : (
                  <div className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
                    {aiResult.text}
                  </div>
                )}
              </div>

              <div className="mt-6 flex justify-end">
                <button 
                  onClick={() => setAiResult(null)}
                  className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg transition-colors border border-slate-600"
                >
                  关闭
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {deleteTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
           <div className="bg-slate-900 border border-slate-700/50 p-6 rounded-2xl shadow-2xl max-w-sm w-full mx-4">
               <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                 <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center text-red-500">
                   <X size={16} />
                 </div>
                 {deleteTarget.type === 'overview' ? '确认清空此池' : (deleteTarget.type as any) === 'deleteTank' ? '确认删除池号' : '确认删除记录'}
               </h3>
               <p className="text-slate-400 text-sm mb-6 mt-4">
                 {deleteTarget.type === 'overview' 
                    ? '确定要清空该池的养殖数据吗？清空后此池状态将变为空池，此操作不可撤销。' 
                    : (deleteTarget.type as any) === 'deleteTank'
                    ? `确定要永久删除池号 ${deleteTarget.id} 吗？与之关联的所有实时监测数据也将被移除。`
                    : '确定要删除这条记录吗？此操作将不可撤销。'}
               </p>
               <div className="flex items-center justify-end gap-3">
                   <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 font-bold text-sm text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-all">取消</button>
                   <button onClick={() => { executeDeleteRecord(deleteTarget.id, deleteTarget.type); setDeleteTarget(null); }} className="px-4 py-2 font-bold text-sm text-white bg-red-500 hover:bg-red-600 rounded-xl transition-all shadow-lg shadow-red-500/20">
                     {deleteTarget.type === 'overview' ? '确认清空' : '确认删除'}
                   </button>
               </div>
           </div>
        </div>
      )}
    </div>
  );
}

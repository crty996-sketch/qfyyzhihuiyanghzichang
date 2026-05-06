export type TankStatus = 'normal' | 'alarm' | 'empty' | 'maintenance';

export interface InOutRecord {
  id: string;
  date: string;
  tankId: string;
  type: 'purchaseIn' | 'transferIn' | 'salesOut' | 'transferOut';
  amount: number;
  species?: string;
  size?: string;
  count?: number;
  remarks: string;
}

export interface FeedMedRecord {
  id: string;
  date: string;
  tankId: string;
  feedType: string;
  feedAmount: number;
  medicineName: string;
  medicineAmount: number;
  remarks: string;
}

export interface LossRecord {
  id: string;
  date: string;
  tankId: string;
  deadCount: number;
  reason: string;
}

export interface FarmingData {
  species: string;
  size: string; // 入池规格
  currentSize?: string; // 现存规格
  stockingTime: string;
  prevBalance: number;
  initialCount?: number; // 入池总量(条)
  currentCount?: number; // 现有库存(条)
  purchaseIn: number;
  transferIn: number;
  salesOut: number;
  transferOut: number;
  deadCount: number; // 损耗(条)
  inventory?: number; // 初始库存(斤)
  currentInventory: number; // 现有库存(斤)
  feedTotal?: number;
  estimatedFcr?: number;
  dailyGrowth?: number;
  remarks: string;
}

export interface EquipmentData {
  filter: '自动模式' | '手动模式' | '停止' | '故障';
  pump: '运行中' | '停止' | '故障';
  oxygen: '运行中' | '停止' | '故障';
  uv: '运行中' | '待机' | '故障' | '停止';
  lastMaintenance?: string;
  parameters?: string;
  powerFilter?: number;
  powerPump?: number;
  powerOxygen?: number;
  accumulatedHours?: {
    pump: number;
    uv: number;
    filter: number;
  };
}

export interface TankData {
  id: string;
  status: TankStatus;
  temperature: number | '';
  ph: number | '';
  oxygen: number | '';
  waterLevel: number | '';
  nh3?: number | ''; // 总氨氮 (TAN)
  no2?: number | ''; // 亚硝酸盐
  uia?: number;      // 非离子氨 (计算出的毒性指标)
  alkalinity?: number | ''; // 碱度 (mg/L CaCO3)
  orp?: number | '';        // 氧化还原电位 (mV)
  salinity?: number | '';   // 盐度 (ppt)
  turbidity?: number | '';  // 浊度 (NTU)
  tds?: number | '';        // TDS (mg/L)
  isIotConnected?: boolean;  // IoT设备连接状态
  specs?: string;           // 规格描述 (e.g. "高位池 1.2亩", "直径2m")
  farming?: FarmingData;
  equipment?: EquipmentData;
}

export interface TankBlockData {
  id: string;
  name: string;
  tanks: TankData[];
}

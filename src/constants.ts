import { TankBlockData, TankData, InOutRecord, FeedMedRecord, LossRecord } from './types';

export const MOCK_IN_OUT_RECORDS: InOutRecord[] = [];

export const MOCK_FEED_MED_RECORDS: FeedMedRecord[] = [];

export const MOCK_LOSS_RECORDS: LossRecord[] = [];

const generateTanks = (prefix: string, count: number): TankData[] => {
  return Array.from({ length: count }, (_, i) => {
    const id = `${prefix}-${(i + 1).toString().padStart(3, '0')}`;
    let status: TankData['status'] = 'empty';
    
    let species = '未设定';
    let size = '';
    let currentInventory = 0;
    let deadCount = 0;

    return {
      id,
      status,
      temperature: status === 'empty' ? '' : 26 + Math.random() * 2,
      ph: status === 'empty' ? '' : 7 + Math.random() * 0.5,
      oxygen: status === 'empty' ? '' : 6 + Math.random() * 1,
      waterLevel: status === 'empty' ? 0 : 70 + Math.random() * 25,
      farming: {
        species,
        size,
        entryDate: '',
        stockingTime: '',
        prevBalance: 0,
        purchaseIn: 0,
        transferIn: 0,
        salesOut: 0,
        transferOut: 0,
        deadCount,
        inventory: currentInventory,
        currentInventory,
        remarks: ''
      },
      equipment: {
        filter: status === 'empty' ? '停止' : '自动模式',
        pump: status === 'empty' ? '停止' : '运行中',
        oxygen: status === 'empty' ? '停止' : '运行中',
        uv: status === 'empty' ? '停止' : '待机',
        lastMaintenance: '2026-01-15',
        parameters: '标准参数',
        powerFilter: status === 'empty' ? 0 : parseFloat((1.5 + (i * 0.01)).toFixed(1)),
        powerPump: status === 'empty' ? 0 : parseFloat((2.0 + (i * 0.02)).toFixed(1)),
        powerOxygen: status === 'empty' ? 0 : parseFloat((3.0 + (i * 0.015)).toFixed(1)),
      }
    };
  });
};


export const MOCK_DATA: TankBlockData[] = [
  {
    id: 'block-a',
    name: 'A区',
    tanks: generateTanks('A', 6),
  },
  {
    id: 'block-b',
    name: 'B区',
    tanks: generateTanks('B', 6),
  },
  {
    id: 'block-c',
    name: 'C区',
    tanks: generateTanks('C', 6).map(t => ({...t, specs: '高位池 1.2亩 2m水深'})),
  },
  {
    id: 'block-w',
    name: '车间',
    tanks: [
      ...generateTanks('W-FH', 2).map(t => ({...t, species: '孵化中', specs: '孵化池'})),
      ...generateTanks('W-B1', 2).map(t => ({...t, species: '鱼苗', specs: '一级标粗 2m直径圆桶'})),
      ...generateTanks('W-B2', 2).map(t => ({...t, species: '鱼苗', specs: '二级标粗 8m直径 1.8m水深'})),
    ],
  },
];

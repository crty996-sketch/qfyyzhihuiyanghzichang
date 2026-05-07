import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
if (process.env.NODE_ENV !== "production") {
  dotenv.config({ path: path.resolve(__dirname, '.env') });
}

import express from 'express';
import { createServer as createViteServer } from 'vite';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { GoogleGenAI } from '@google/genai';
import * as XLSX from 'xlsx';

const MOCK_IN_OUT_RECORDS: any[] = [];
const MOCK_FEED_MED_RECORDS: any[] = [];
const MOCK_LOSS_RECORDS: any[] = [];

const app = express();
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('JWT_SECRET is required and must be at least 32 characters.');
  process.exit(1);
}

let pool: mysql.Pool | null = null;

async function syncFryWarehouse(connection: any) {
  try {
    // 1. Get all non-empty tanks to ensure basic records exist for initial inventory
    const [tanksRows] = await connection.query('SELECT id, farming FROM tanks');
    const tanks = tanksRows as any[];
    
    const [inOutRows] = await connection.query('SELECT tankId, data, date FROM records WHERE type = "inout"');
    const inoutRecords = (inOutRows as any[]).map(r => ({ ...JSON.parse(typeof r.data === "string" ? r.data : JSON.stringify(r.data)), tankId: r.tankId, date: r.date }));
    
    const existingInoutTanks = new Set(inoutRecords.filter(r => r.type === "purchaseIn").map(r => r.tankId));
    
    // Backfill logic: If tank has species but no purchaseIn record, create one
    let backfilledCount = 0;
    for (const row of tanks) {
      const farming = typeof row.farming === 'string' ? JSON.parse(row.farming) : row.farming;
      if (farming && farming.species && farming.species !== '未设定' && !existingInoutTanks.has(row.id)) {
        const newRecord = ['inout', row.id, farming.stockingTime || '2026-01-01', JSON.stringify({ 
          type: 'purchaseIn', 
          amount: farming.inventory || farming.currentInventory || 0,
          species: farming.species,
          size: farming.size || '成鱼苗',
          count: farming.initialCount || 0,
          remarks: '系统自动补齐初始入库数据' 
        })];
        await connection.query('INSERT INTO records (type, tankId, date, data) VALUES (?, ?, ?, ?)', newRecord);
        backfilledCount++;
      }
    }
    if (backfilledCount > 0) console.log(`Sync Warehouse: Backfilled ${backfilledCount} purchaseIn records.`);

    // 2. Calculate true balance for each species: TotalIn - TotalOut - TotalLoss
    // First, map tanks to species for loss records (which don't have species field)
    const tankToSpecies = new Map();
    tanks.forEach(t => {
      const farming = typeof t.farming === 'string' ? JSON.parse(t.farming) : t.farming;
      if (farming?.species && farming.species !== '未设定') {
        tankToSpecies.set(t.id, farming.species);
      }
    });

    const [allInoutRows] = await connection.query('SELECT data FROM records WHERE type = "inout"');
    const [allLossRows] = await connection.query('SELECT tankId, data FROM records WHERE type = "loss"');
    const [allWarehouseRows] = await connection.query('SELECT data FROM records WHERE type = "warehouse"');
    
    const speciesMap = new Map();

    // Process In/Out Records
    for (const row of (allInoutRows as any[])) {
      const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      const species = data.species;
      if (!species || species === '未设定') continue;
      
      const amount = Number(data.amount || data.count || 0);
      if (!speciesMap.has(species)) {
        speciesMap.set(species, { stock: 0, spec: data.size || '统一规格', unit: data.unit || '斤' });
      }
      const entry = speciesMap.get(species);
      
      if (data.type === 'purchaseIn') {
        entry.stock += amount;
      } else if (['salesOut', 'transferIn'].includes(data.type)) {
        // transferIn to a tank is an OUT from the seedling warehouse
        entry.stock -= amount;
      }
      if (data.unit) entry.unit = data.unit;
    }

    // Process Warehouse Management Records (Transfers, Adjustments)
    for (const row of (allWarehouseRows as any[])) {
      const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      const species = data.itemName;
      if (!species) continue;

      const amount = Number(data.amount || data.count || data.stock || 0);
      if (!speciesMap.has(species)) {
        speciesMap.set(species, { stock: 0, spec: '统一规格', unit: data.unit || '斤' });
      }
      const entry = speciesMap.get(species);
      if (data.unit) entry.unit = data.unit;

      if (data.type === 'transfer') {
        if (data.sourceLocation === '一级主仓') {
          entry.stock -= amount;
        }
        if (data.targetLocation === '一级主仓') {
          entry.stock += amount;
        }
      } else if (data.type === 'adjustment' || data.type === 'initial') {
        if (data.location === '一级主仓') {
          // Adjustments are additive in this logic, so if we just want to set the absolute stock we should be careful.
          // But usually we set adjustment amount.
          entry.stock += amount;
        }
      }
    }

    // Process Loss Records
    for (const row of (allLossRows as any[])) {
      const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      const tankId = row.tankId;
      const amount = Number(data.amount || data.deadCount || 0);
      
      // Look up species for this tank
      let species = tankToSpecies.get(tankId);
      if (!species) {
         // Fallback: look for species in this tank's inout records
         const tankRecs = inoutRecords.filter(r => r.tankId === tankId && r.species);
         if (tankRecs.length > 0) {
            species = tankRecs[0].species;
         }
      }

      if (species && species !== '未设定') {
        if (!speciesMap.has(species)) {
          speciesMap.set(species, { stock: 0, spec: '统一规格' });
        }
        speciesMap.get(species).stock -= amount;
      }
    }

    // 3. Update warehouse table
    for (const [species, data] of speciesMap.entries()) {
      // Check if exists
      const [exists] = await connection.query('SELECT id FROM warehouse WHERE name = ? AND category = "fry" AND location = "一级主仓"', [species]);
      if ((exists as any[]).length > 0) {
        await connection.query('UPDATE warehouse SET stock = ?, spec = ?, unit = ? WHERE name = ? AND category = "fry" AND location = "一级主仓"', [data.stock, data.spec, data.unit || '斤', species]);
      } else {
        // Create new
        const [countRes] = await connection.query('SELECT COUNT(*) as count FROM warehouse WHERE category = "fry"');
        const nextId = `FRY-${String((countRes as any)[0].count + 1).padStart(3, '0')}`;
        await connection.query('INSERT INTO warehouse (id, category, name, spec, stock, unit, minStock, location) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
          nextId, 'fry', species, data.spec, data.stock, data.unit || '斤', 100, '一级主仓'
        ]);
      }
    }
  } catch (err) {
    console.error("Error syncing fry warehouse:", err);
  }
}

async function initDB() {
  if (!process.env.MYSQL_URL) {
    console.warn("MYSQL_URL is not set. Please configure it to connect to MySQL.");
    return;
  }
  try {
    pool = mysql.createPool(process.env.MYSQL_URL);
    const connection = await pool.getConnection();
    console.log("Connected to MySQL database.");
    
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'user',
        name VARCHAR(50),
        phone VARCHAR(20),
        email VARCHAR(100),
        permissions JSON,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    try {
      await connection.query(`
        CREATE TABLE IF NOT EXISTS menu_config (
          id INT PRIMARY KEY AUTO_INCREMENT,
          menu_key VARCHAR(50) UNIQUE NOT NULL,
          label VARCHAR(100) NOT NULL
        )
      `);

      // Initialize default labels if empty
      const [rows] = await connection.query('SELECT COUNT(*) as count FROM menu_config');
      if ((rows as any)[0].count === 0) {
        const defaults = [
          ['system_name', '智慧渔业管理系统'],
          ['none', '全局数字总控'],
          ['farming', '生产运行台账'],
          ['water', '水质物联传感'],
          ['equipment', '机电智控运维'],
          ['warehouse', '仓储资产管理'],
          ['inventory', '进销存管理'],
          ['finance', '经营成本统计'],
          ['sop', '标准作业(SOP)']
        ];
        await connection.query('INSERT INTO menu_config (menu_key, label) VALUES ?', [defaults]);
      } else {
        // Correct errors in previously initialized labels
        await connection.query('UPDATE menu_config SET label = "水质物联传感" WHERE menu_key = "water"');
        await connection.query('UPDATE menu_config SET label = "仓储资产管理" WHERE menu_key = "warehouse"');
        await connection.query('INSERT IGNORE INTO menu_config (menu_key, label) VALUES ("inventory", "进销存管理")');
      }
    } catch(e) { console.error('Menu config init error:', e); }

    try {
      await connection.query('ALTER TABLE users ADD COLUMN phone VARCHAR(20)');
    } catch(e) { /* column might exist */ }
    try {
      await connection.query('ALTER TABLE users ADD COLUMN email VARCHAR(100)');
    } catch(e) { /* column might exist */ }
    try {
      await connection.query('ALTER TABLE users ADD COLUMN permissions JSON');
    } catch(e) { /* column might exist */ }

    // Create default admin if no users exist
    const [users] = await connection.query('SELECT COUNT(*) as count FROM users');
    if ((users as any)[0].count === 0) {
      const bootstrapAdminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD || 'admin123';
      const hashedPassword = await bcrypt.hash(bootstrapAdminPassword, 10);
      await connection.query(
        'INSERT INTO users (username, password, role, name, permissions) VALUES (?, ?, ?, ?, ?)',
        ['admin', hashedPassword, 'admin', '系统管理员', JSON.stringify(['farming', 'water', 'equipment', 'warehouse', 'inventory', 'finance', 'sop', 'settings', 'users'])]
      );
      if (process.env.BOOTSTRAP_ADMIN_PASSWORD) {
        console.log('Default admin user created with BOOTSTRAP_ADMIN_PASSWORD.');
      } else {
        console.warn('Default admin user created with fallback password; set BOOTSTRAP_ADMIN_PASSWORD in production.');
      }
    }
    
    await connection.query(`
      CREATE TABLE IF NOT EXISTS tanks (
        id VARCHAR(50) PRIMARY KEY,
        status VARCHAR(50),
        temperature FLOAT,
        ph FLOAT,
        oxygen FLOAT,
        waterLevel FLOAT,
        nh3 FLOAT,
        no2 FLOAT,
        alkalinity FLOAT,
        orp FLOAT,
        salinity FLOAT,
        turbidity FLOAT,
        tds FLOAT,
        isIotConnected BOOLEAN DEFAULT FALSE,
        farming JSON,
        equipment JSON
      )
    `);

    try {
      await connection.query('ALTER TABLE tanks ADD COLUMN alkalinity FLOAT');
      await connection.query('ALTER TABLE tanks ADD COLUMN orp FLOAT');
      await connection.query('ALTER TABLE tanks ADD COLUMN salinity FLOAT');
      await connection.query('ALTER TABLE tanks ADD COLUMN turbidity FLOAT');
      await connection.query('ALTER TABLE tanks ADD COLUMN tds FLOAT');
      await connection.query('ALTER TABLE tanks ADD COLUMN isIotConnected BOOLEAN DEFAULT FALSE');
    } catch(e) { /* columns might exist */ }

    // Seed tanks if empty
    const [tanksCount] = await connection.query('SELECT COUNT(*) as count FROM tanks');
    if ((tanksCount as any)[0].count === 0) {
      console.log("Seeding initial tanks in backend...");
      const seedTanks = [
        { id: 'A-001', status: 'normal', species: '鲫鱼', inventory: 5000, stockingTime: '2026-04-01' },
        { id: 'A-010', status: 'normal', species: '生鱼', inventory: 8000, stockingTime: '2026-04-02' },
        { id: 'B-001', status: 'normal', species: '鳗鱼', inventory: 6000, stockingTime: '2026-04-01' },
        { id: 'B-015', status: 'alarm', species: '草鱼', inventory: 7500, stockingTime: '2026-03-25' },
      ];
      for (const st of seedTanks) {
        await connection.query(
          'INSERT INTO tanks (id, status, temperature, ph, oxygen, waterLevel, farming) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [st.id, st.status, 26.5, 7.5, 6.8, 85, JSON.stringify({ 
            species: st.species, 
            inventory: st.inventory, 
            size: '鱼苗', 
            stockingTime: st.stockingTime,
            entryDate: st.stockingTime,
            initialCount: st.inventory
          })]
        );
      }
    }

    await connection.query(`
      CREATE TABLE IF NOT EXISTS records (
        id INT AUTO_INCREMENT PRIMARY KEY,
        type VARCHAR(50),
        tankId VARCHAR(50),
        date VARCHAR(50),
        data JSON
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS warehouse (
        id VARCHAR(50) PRIMARY KEY,
        category VARCHAR(50),
        name VARCHAR(100),
        spec VARCHAR(50),
        stock FLOAT,
        unit VARCHAR(20),
        minStock FLOAT,
        location VARCHAR(50) DEFAULT '一级主仓',
        tank_id VARCHAR(50)
      )
    `);

    try {
      await connection.query("ALTER TABLE warehouse ADD COLUMN tank_id VARCHAR(50)");
    } catch(e) { /* column might exist */ }

    try {
      await connection.query("ALTER TABLE warehouse ADD COLUMN location VARCHAR(50) DEFAULT '一级主仓'");
    } catch(e) { /* column might exist */ }

    try {
      await connection.query("ALTER TABLE warehouse ADD COLUMN unit_price FLOAT DEFAULT 0");
    } catch(e) { /* column might exist */ }

    try {
      await connection.query("ALTER TABLE warehouse ADD COLUMN batch_no VARCHAR(100)");
    } catch(e) { /* column might exist */ }

    try {
      await connection.query("ALTER TABLE warehouse ADD COLUMN expiry_date VARCHAR(50)");
    } catch(e) { /* column might exist */ }

    try {
      await connection.query(`
        CREATE TABLE IF NOT EXISTS suppliers (
          id VARCHAR(50) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          contact_person VARCHAR(100),
          phone VARCHAR(50),
          category VARCHAR(100),
          address TEXT,
          bank_account VARCHAR(255),
          reliability_score INT DEFAULT 100,
          remarks TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } catch(e) { console.error('Error creating suppliers table:', e); }

    try {
      await connection.query(`
        CREATE TABLE IF NOT EXISTS supplier_offerings (
          id INT AUTO_INCREMENT PRIMARY KEY,
          supplier_id VARCHAR(50) NOT NULL,
          product_name VARCHAR(255) NOT NULL,
          category VARCHAR(50),
          particle_size VARCHAR(50),
          specification VARCHAR(100),
          unit_price DECIMAL(10, 2),
          discount_policy TEXT,
          purchase_date DATE,
          purchase_quantity INT DEFAULT 0,
          protein_content VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE
        )
      `);
    } catch(e) { console.error('Error creating supplier_offerings table:', e); }

    const safeAddColumn = async (table: string, column: string, definition: string) => {
      try {
        await connection.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      } catch (e: any) {
        // ER_DUP_FIELDNAME error code is 1060
        if (e.errno !== 1060 && e.code !== 'ER_DUP_FIELDNAME') {
          console.warn(`Error adding column ${column} to ${table}:`, e);
        }
      }
    };

    await safeAddColumn('supplier_offerings', 'purchase_date', 'DATE');
    await safeAddColumn('supplier_offerings', 'purchase_quantity', 'INT DEFAULT 0');
    await safeAddColumn('supplier_offerings', 'protein_content', 'VARCHAR(50)');

    try {
      await connection.query("ALTER TABLE inventory_transactions ADD COLUMN supplier_id VARCHAR(50)");
    } catch(e) { /* column might exist */ }

    // Seed records if empty
    const [recordsCount] = await connection.query('SELECT COUNT(*) as count FROM records');
    if ((recordsCount as any)[0].count === 0) {
      const initialRecords = [
        ...MOCK_IN_OUT_RECORDS.map(r => ['inout', r.tankId, r.date, JSON.stringify({ type: r.type, amount: r.amount, species: r.species, size: r.size, count: r.count, remarks: r.remarks })]),
        ...MOCK_FEED_MED_RECORDS.map(r => ['feedmed', r.tankId, r.date, JSON.stringify({ feedType: r.feedType, feedAmount: r.feedAmount, medicineName: r.medicineName, medicineAmount: r.medicineAmount, remarks: r.remarks })]),
        ...MOCK_LOSS_RECORDS.map(r => ['loss', r.tankId, r.date, JSON.stringify({ deadCount: r.deadCount, reason: r.reason })]),
      ];
      for (const record of initialRecords) {
        await connection.query('INSERT INTO records (type, tankId, date, data) VALUES (?, ?, ?, ?)', record);
      }
    }

    // Seed warehouse if empty
    const [warehouseCount] = await connection.query('SELECT COUNT(*) as count FROM warehouse');
    if ((warehouseCount as any)[0].count === 0) {
      const initialWarehouse = [
        ['F001', 'feed', '加州鲈开口料', '20kg/包', 150, '包', 50, '一级主仓'],
        ['F002', 'feed', '加州鲈成鱼料(膨化)', '40kg/包', 320, '包', 100, '一级主仓'],
        ['M001', 'med', 'EM菌种(水质改良)', '1L/瓶', 80, '瓶', 20, '一级主仓'],
        ['M002', 'med', '复合维生素C', '500g/袋', 15, '袋', 30, '一级主仓'],
      ];
      for (const item of initialWarehouse) {
        await connection.query('INSERT INTO warehouse (id, category, name, spec, stock, unit, minStock, location, tank_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)', item);
      }
    }

    // Seed/Ensure secondary warehouses exist
    const secondaryWarehouses = [
      ['SEC-A', 'prod', 'A区生产仓', '区域仓库', 0, '项', 0, 'A区生产仓', null],
      ['SEC-B', 'prod', 'B区生产仓', '区域仓库', 0, '项', 0, 'B区生产仓', null],
      ['SEC-C', 'prod', 'C区生产仓', '区域仓库', 0, '项', 0, 'C区生产仓', null],
      ['SEC-W', 'prod', '车间生产仓', '区域仓库', 0, '项', 0, '车间生产仓', null],
    ];
    for (const sec of secondaryWarehouses) {
      await connection.query(
        'INSERT IGNORE INTO warehouse (id, category, name, spec, stock, unit, minStock, location, tank_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        sec
      );
    }
    await connection.query(`
      CREATE TABLE IF NOT EXISTS company_profile (
        id INT PRIMARY KEY DEFAULT 1,
        content JSON
      )
    `);

    // await syncFryWarehouse(connection); // Disabled auto-sync on boot to prevent recreating deleted warehouse records

    // Seed default if empty
    const [profileCount] = await connection.query('SELECT COUNT(*) as count FROM company_profile');
    if ((profileCount as any)[0].count === 0) {
      const defaultContent = {
        introduction: "贵州黔方有渔水产科技有限公司是黔西南州文化旅游产业投资开发（集团）有限公司旗下一级股份制公司。公司立足于黔西南州陆基养殖的基础和比较优势，积极抢抓“长江十年禁渔”“万峰湖退渔还湖”历史性机遇，于 2020 年 9 月挂牌成立，注册资本 5000 万元。\n\n经营范围：水产养殖、苗种生产、批发零售；饲料销售；技术服务、开发、咨询；渔业机械制造与销售；农产品初加工等。",
        performance: "目前公司主营陆基循环水养殖系统（RAS）的建设与运营，是州内及全省陆基设施渔业领头羊。\n\n2021年度营收：2000万元\n2022年度营收：7000万元\n2023年度营收：9462万元\n2024年度营收：10759万元\n\n主导制定《陆基生态循环水养殖系统建设规范》地方标准。",
        projects: "【郑屯镇民族村基地】\n投资 1.27 亿元，占地 218.2 亩。包含 5 万立方米养殖总水体，2000 平方米孵化育苗车间，设计年产量 5000 吨。",
        cooperation: "合作单位：中国水产科学研究院珠江水产研究所、广西水产科学院等。公司致力于攻克现代循环水养殖技术难题，推动高效、绿色渔业发展。"
      };
      await connection.query('INSERT INTO company_profile (id, content) VALUES (1, ?)', [JSON.stringify(defaultContent)]);
    }

    // Ensure all base tanks exist in the DB (inserting them as 'empty' if they do not exist)
    const generateEmptyTanks = (prefix: string, count: number) => {
      return Array.from({ length: count }, (_, i) => {
        const id = `${prefix}-${(i + 1).toString().padStart(3, '0')}`;
        return {
          id,
          status: 'empty',
          temperature: null, ph: null, oxygen: null, waterLevel: 0,
          farming: { species: '未设定', size: '', entryDate: '', stockingTime: '', deadCount: 0, inventory: 0, currentInventory: 0, remarks: '' },
          equipment: {}
        };
      });
    };
    const tanksList = [
      ...generateEmptyTanks('A', 6),
      ...generateEmptyTanks('B', 6),
      ...generateEmptyTanks('C', 6),
      ...generateEmptyTanks('W', 6)
    ];

    const tankValues = tanksList.map(t => [t.id, t.status, t.temperature, t.ph, t.oxygen, t.waterLevel, JSON.stringify(t.farming), JSON.stringify(t.equipment)]);
    for (let i = 0; i < tankValues.length; i += 100) {
      const chunk = tankValues.slice(i, i + 100);
      const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      await connection.query(
        `INSERT IGNORE INTO tanks (id, status, temperature, ph, oxygen, waterLevel, farming, equipment) VALUES ${placeholders}`,
        chunk.flat()
      );
    }

    connection.release();
  } catch (err) {
    console.error("MySQL connection failed:", err);
    pool = null;
  }
}

// Auth Middleware
// Public Traceability Route (No authentication required)
app.get('/api/public/trace/:tankId', async (req, res) => {
  const { tankId } = req.params;
  
  // Use mock data if pool is not active
  if (!pool) {
    const MOCK_DATA = [
      {
        id: 'A',
        name: 'A区 - 循环水养殖系统',
        tanks: [
          { id: 'A-001', temperature: 25.7, ph: 7.7, oxygen: 6.8, updated: '2026-05-01 10:00:00', status: 'normal', farming: { species: '大黄鱼', currentInventory: 1950, stockingTime: '2026-04-01', size: '10cm' }, equipment: { drumFilter: 'running' } },
        ]
      }
    ];
    const allTanks = MOCK_DATA.flatMap(block => block.tanks);
    const tank = allTanks.find(t => t.id === tankId);
    if (!tank) return res.status(404).json({ error: '未找到该批次信息' });
    return res.json(tank);
  }

  try {
    const [rows]: any = await pool.query('SELECT * FROM tanks WHERE id = ?', [tankId]);
    if (rows.length === 0) return res.status(404).json({ error: '未找到该批次信息' });
    
    const tank = rows[0];
    
    // Fetch recent records for this tank
    const [recordsRows] = await pool.query(
      'SELECT type, date, data FROM records WHERE tankId = ? ORDER BY date DESC LIMIT 20',
      [tankId]
    );
    
    const records = (recordsRows as any[]).map(r => {
      const parsedData = typeof r.data === 'string' ? JSON.parse(r.data) : (r.data || {});
      return {
        id: (r.id || '').toString(),
        category: r.type, // preserve original type as category
        date: r.date,
        ...parsedData,
        subType: parsedData.type || r.type // ensure we have a subType for internal logic
      };
    });

    const formattedTank = {
      ...tank,
      farming: typeof tank.farming === 'string' ? JSON.parse(tank.farming) : (tank.farming || {}),
      equipment: typeof tank.equipment === 'string' ? JSON.parse(tank.equipment) : (tank.equipment || {}),
      archives: records // Include records as archives
    };
    res.json(formattedTank);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/public/trace/:tankId/export', async (req, res) => {
  const { tankId } = req.params;
  
  let tank: any = null;
  let records: any[] = [];

  // Re-use logic for fetching data to make sure Excel has same data
  if (!pool) {
    const MOCK_DATA = [
      {
        id: 'A',
        name: 'A区 - 循环水养殖系统',
        tanks: [
          { id: 'A-001', temperature: 25.7, ph: 7.7, oxygen: 6.8, updated: '2026-05-01 10:00:00', status: 'normal', farming: { species: '大黄鱼', currentInventory: 1950, stockingTime: '2026-04-01', size: '10cm' }, equipment: { drumFilter: 'running' } },
        ]
      }
    ];
    const allTanks = MOCK_DATA.flatMap(block => block.tanks);
    tank = allTanks.find(t => t.id === tankId);
  } else {
    try {
      const [rows]: any = await pool.query('SELECT * FROM tanks WHERE id = ?', [tankId]);
      if (rows.length > 0) {
        tank = {
          ...rows[0],
          farming: typeof rows[0].farming === 'string' ? JSON.parse(rows[0].farming) : (rows[0].farming || {}),
          equipment: typeof rows[0].equipment === 'string' ? JSON.parse(rows[0].equipment) : (rows[0].equipment || {})
        };
      }
      
      const [recordsRows] = await pool.query(
        'SELECT type, date, data FROM records WHERE tankId = ? ORDER BY date DESC LIMIT 20',
        [tankId]
      );
      
      records = (recordsRows as any[]).map(r => {
        const parsedData = typeof r.data === 'string' ? JSON.parse(r.data) : (r.data || {});
        return {
          id: (r.id || '').toString(),
          category: r.type,
          date: r.date,
          ...parsedData,
          subType: parsedData.type || r.type
        };
      });
    } catch(e) {
      console.error(e);
    }
  }

  if (!tank) {
    return res.status(404).send('未找到该批次信息');
  }

  try {
    // 1. Basic Info
    const basicInfo = [
      ['数字化产品溯源档案', ''],
      ['产品批次', tankId],
      ['认证状态', '认证成功 · 已存证'],
      ['鱼种品类', tank.farming?.species || '大黄鱼'],
      ['入池日期', tank.farming?.stockingTime || '2024-03-15'],
      ['养殖产地', '贵州·兴义·黔方有渔智慧基地'],
      ['查询日期', new Date().toLocaleString()],
      ['', ''],
      ['水质监测均值', ''],
      ['平均水温', `${tank.temperature || 25.5} ℃`],
      ['pH 均值', `${tank.ph || 7.8}`],
    ];

    // 2. Archives Sheet
    const archiveHeaders = ['日期', '类型', '明细'];
    const archiveRows = records.map((record: any) => {
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

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    
    // Set headers to trigger file download
    res.setHeader('Content-Disposition', `attachment; filename="trace_${tankId}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const getTokenFromRequest = (req: any) => {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) return authHeader.split(' ')[1];
  const cookieHeader = req.headers['cookie'] || '';
  const match = cookieHeader.match(/(?:^|;\s*)access_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
};

const authenticateToken = (req: any, res: any, next: any) => {
  const token = getTokenFromRequest(req);
  if (token == null) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Auth Routes
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!pool) {
      return res.status(503).json({ error: '数据库未连接，登录不可用' });
    }

    const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
    const users = rows as any[];
    
    if (users.length === 0) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    
    const user = users[0];
    const validPassword = await bcrypt.compare(password, user.password);
    
    if (!validPassword) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    
    const permissions = typeof user.permissions === 'string' ? JSON.parse(user.permissions) : (user.permissions || []);
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role, name: user.name, permissions }, JWT_SECRET, { expiresIn: '24h' });
    const cookieParts = [
      `access_token=${encodeURIComponent(token)}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      'Max-Age=86400'
    ];
    if (process.env.NODE_ENV === 'production') cookieParts.push('Secure');
    res.setHeader('Set-Cookie', cookieParts.join('; '));
    res.json({ user: { id: user.id, username: user.username, role: user.role, name: user.name, permissions } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  const cookieParts = [
    'access_token=',
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0'
  ];
  if (process.env.NODE_ENV === 'production') cookieParts.push('Secure');
  res.setHeader('Set-Cookie', cookieParts.join('; '));
  res.json({ success: true });
});

app.get('/api/auth/me', authenticateToken, async (req: any, res: any) => {
  if (!pool) return res.json({ user: req.user });
  
  try {
    const [rows] = await pool.query('SELECT id, username, role, name, phone, email, permissions FROM users WHERE id = ?', [req.user.id]);
    const users = rows as any[];
    if (users.length === 0) return res.status(404).json({ error: '用户不存在' });
    
    const user = users[0];
    const permissions = typeof user.permissions === 'string' ? JSON.parse(user.permissions) : user.permissions;
    res.json({ user: { ...user, permissions } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Menu Config Routes
app.get('/api/menu-config', async (req, res) => {
  if (!pool) {
    return res.json({
      farming: '生产运行台账',
      water: '水质物联传感',
      equipment: '机电智控运维',
      warehouse: '仓储资产管理',
      inventory: '进销存管理',
      finance: '经营成本核算',
      sop: '标准作业(SOP)',
      traceability: '数字化产品溯源'
    });
  }
  try {
    const [rows] = await pool.query('SELECT menu_key, label FROM menu_config');
    const config = (rows as any[]).reduce((acc, curr) => {
      acc[curr.menu_key] = curr.label;
      return acc;
    }, {});
    res.json(config);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/menu-config', authenticateToken, async (req: any, res: any) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: '权限不足' });
  if (!pool) return res.status(503).json({ error: "MySQL not configured" });
  
  const config = req.body; // Expecting { key: label, ... }
  try {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      for (const [key, label] of Object.entries(config)) {
        await connection.query('UPDATE menu_config SET label = ? WHERE menu_key = ?', [label, key]);
      }
      await connection.commit();
      res.json({ success: true });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// User Management Routes
app.get('/api/users', authenticateToken, async (req: any, res: any) => {
  console.log(`GET /api/users - Requested by ${req.user.username}`);
  if (req.user.role !== 'admin') return res.status(403).json({ error: '权限不足' });
  
  if (!pool) {
    const safeUsers = mockUsersList.map(u => ({ id: u.id, username: u.username, role: u.role, name: u.name, permissions: u.permissions }));
    return res.json(safeUsers);
  }

  try {
    const [rows] = await pool.query('SELECT id, username, role, name, permissions, createdAt FROM users');
    const users = (rows as any[]).map(r => ({
      ...r,
      permissions: typeof r.permissions === 'string' ? JSON.parse(r.permissions) : r.permissions
    }));
    res.json(users);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', authenticateToken, async (req: any, res: any) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: '权限不足' });
  const { username, password, name, permissions } = req.body;

  if (!pool) {
    if (mockUsersList.length >= 11) return res.status(400).json({ error: '最多只能创建 10 个子账号' });
    if (mockUsersList.find(u => u.username === username)) return res.status(400).json({ error: '用户名已存在' });
    
    const newUser = {
      id: Date.now(),
      username,
      password, // In real app, hash this
      role: 'user',
      name: name || username,
      permissions: permissions || []
    };
    mockUsersList.push(newUser);
    return res.json({ id: newUser.id, username: newUser.username, name: newUser.name, permissions: newUser.permissions });
  }

  try {
    const [countRes] = await pool.query('SELECT COUNT(*) as count FROM users');
    if ((countRes as any)[0].count >= 11) return res.status(400).json({ error: '最多只能创建 10 个子账号' });
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (username, password, role, name, permissions) VALUES (?, ?, ?, ?, ?)',
      [username, hashedPassword, 'user', name || username, JSON.stringify(permissions || [])]
    );
    res.json({ id: (result as any).insertId, username, role: 'user', name: name || username, permissions });
  } catch (err: any) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: '用户名已存在' });
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/users/:id', authenticateToken, async (req: any, res: any) => {
  const userId = parseInt(req.params.id);
  console.log(`PUT /api/users/${userId} - Requested by ${req.user.username}`);
  if (isNaN(userId)) return res.status(400).json({ error: '无效的用户ID' });

  // Use loose equality to handle potential string/number mismatches from JWT/DB
  const isSelf = req.user.id == userId;
  const isAdmin = req.user.role === 'admin';

  if (!isAdmin && !isSelf) {
    return res.status(403).json({ error: '权限不足' });
  }

  const { permissions, name, password, username, phone, email } = req.body;

  if (!pool) {
    const userIndex = mockUsersList.findIndex(u => u.id == userId);
    if (userIndex === -1) return res.status(404).json({ error: '用户不存在' });
    
    const updatedUser = { ...mockUsersList[userIndex] };
    if (name) updatedUser.name = name;
    if (username) updatedUser.username = username;
    if (password) updatedUser.password = password;
    if (phone !== undefined) updatedUser.phone = phone;
    if (email !== undefined) updatedUser.email = email;
    
    // Only admin can change permissions, and only for non-primary-admin
    if (isAdmin && userId != 1) {
      if (Array.isArray(permissions)) {
        updatedUser.permissions = permissions;
      } else if (typeof permissions === 'string') {
        try {
          updatedUser.permissions = JSON.parse(permissions);
        } catch(e) {
          updatedUser.permissions = [];
        }
      }
    }

    mockUsersList[userIndex] = updatedUser;
    return res.json({ success: true });
  }

  try {
    const updates: string[] = [];
    const params: any[] = [];

    if (name) {
      updates.push('name = ?');
      params.push(name);
    }
    if (username) {
      updates.push('username = ?');
      params.push(username);
    }
    if (password) {
      updates.push('password = ?');
      params.push(await bcrypt.hash(password, 10));
    }
    if (phone !== undefined) {
      updates.push('phone = ?');
      params.push(phone);
    }
    if (email !== undefined) {
      updates.push('email = ?');
      params.push(email);
    }
    
    // Admin can update permissions of any user except the primary admin (ID 1)
    if (isAdmin && userId != 1 && permissions !== undefined) {
      updates.push('permissions = ?');
      // If the column is JSON, we can pass it as a stringified version or as an object/array directly
      // mysql2 often handles objects automatically for JSON columns if configured, but string is safest.
      const permsToStore = Array.isArray(permissions) ? JSON.stringify(permissions) : (typeof permissions === 'string' ? permissions : '[]');
      params.push(permsToStore);
    }

    if (updates.length === 0) {
      return res.json({ success: true, message: '无变更内容' });
    }

    params.push(userId);
    const [result]: any = await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '更新失败，用户不存在' });
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error('Update user error:', err);
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: '用户名已存在' });
    res.status(500).json({ error: '服务器内部错误' });
  }
});

app.delete('/api/users/:id', authenticateToken, async (req: any, res: any) => {
  const userId = parseInt(req.params.id);
  console.log(`DELETE /api/users/${userId} - Requested by ${req.user.username}`);
  if (req.user.role !== 'admin') return res.status(403).json({ error: '权限不足' });
  if (isNaN(userId)) return res.status(400).json({ error: '无效的用户ID' });
  
  if (userId == 1) return res.status(400).json({ error: '不能删除初始超级管理员' });

  if (!pool) {
    const originalLength = mockUsersList.length;
    mockUsersList = mockUsersList.filter(u => u.id != userId);
    if (mockUsersList.length === originalLength) return res.status(404).json({ error: '用户不存在' });
    return res.json({ success: true });
  }

  try {
    const [result]: any = await pool.query('DELETE FROM users WHERE id = ?', [userId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '删除失败，用户不存在' });
    }
    res.json({ success: true });
  } catch (err: any) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// API Routes
app.get('/api/status', (req, res) => {
  res.json({ connected: !!pool });
});

// Stats Summary Route
app.post('/api/tanks/recalculate', async (req, res) => {
  if (!pool) return res.status(503).json({ error: "MySQL not configured" });
  try {
    const connection = await pool.getConnection();
    try {
      const [tankRows] = await connection.query('SELECT id FROM tanks');
      const tanks = tankRows as any[];
      
      for (const tank of tanks) {
        await syncTankInventory(connection, tank.id);
      }
      
      res.json({ success: true, message: `Recalculated inventory for ${tanks.length} tanks` });
    } finally {
      connection.release();
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stats/summary', async (req, res) => {
  if (!pool) return res.status(503).json({ error: "MySQL not configured" });
  try {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    const [tanksRows] = await pool.query('SELECT farming, id, temperature, ph, oxygen, turbidity FROM tanks');
    const [inoutRows] = await pool.query('SELECT date, data FROM records WHERE type = "inout"');
    const [lossRows] = await pool.query('SELECT data FROM records WHERE type = "loss"');
    
    let totalInventory = 0;
    let monthlyIn = 0;
    let monthlyOut = 0;
    let totalLoss = 0;

    let sumTemp = 0, sumPh = 0, sumOxygen = 0, sumTurbidity = 0;
    let countTemp = 0, countPh = 0, countOxygen = 0, countTurbidity = 0;
    
    const tanks = (tanksRows as any[]).map(row => {
      const farming = typeof row.farming === 'string' ? JSON.parse(row.farming) : row.farming;
      const inv = Number(farming?.currentInventory || farming?.inventory || 0);
      totalInventory += inv;

      if (row.temperature != null && !isNaN(row.temperature)) { sumTemp += Number(row.temperature); countTemp++; }
      if (row.ph != null && !isNaN(row.ph)) { sumPh += Number(row.ph); countPh++; }
      if (row.oxygen != null && !isNaN(row.oxygen)) { sumOxygen += Number(row.oxygen); countOxygen++; }
      if (row.turbidity != null && !isNaN(row.turbidity)) { sumTurbidity += Number(row.turbidity); countTurbidity++; }

      return { id: row.id, farming, inventory: inv };
    });

    
    (inoutRows as any[]).forEach(row => {
      const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      const amount = Number(data.amount || 0);
      if (row.date.startsWith(currentMonth)) {
        if (data.type === 'purchaseIn' || data.type === 'transferIn') {
          monthlyIn += amount;
        } else if (data.type === 'salesOut' || data.type === 'transferOut') {
          monthlyOut += amount;
        }
      }
    });
    
    (lossRows as any[]).forEach(row => {
      const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      totalLoss += Number(data.deadCount || 0);
    });
    
    // Group chart data by species for the whole base
    const speciesStats: Record<string, { inventory: number, loss: number }> = {};
    tanks.forEach(tank => {
        const species = tank.farming?.species || '未知';
        if (!speciesStats[species]) speciesStats[species] = { inventory: 0, loss: 0 };
        speciesStats[species].inventory += tank.inventory;
        speciesStats[species].loss += Number(tank.farming?.deadCount || 0);
    });
    
    const baseChart = Object.entries(speciesStats).map(([name, stats]) => ({ name, inventory: stats.inventory, loss: stats.loss }));
    
    // Areas
    const aStats: Record<string, { inventory: number, loss: number }> = {};
    const bStats: Record<string, { inventory: number, loss: number }> = {};
    const cStats: Record<string, { inventory: number, loss: number }> = {};
    const wStats: Record<string, { inventory: number, loss: number }> = {};
    
    tanks.forEach(tank => {
        const species = tank.farming?.species || '未知';
        const id = (tank.id || '').toUpperCase();
        if (id.startsWith('A')) {
            if (!aStats[species]) aStats[species] = { inventory: 0, loss: 0 };
            aStats[species].inventory += tank.inventory;
            aStats[species].loss += Number(tank.farming?.deadCount || 0);
        } else if (id.startsWith('B')) {
            if (!bStats[species]) bStats[species] = { inventory: 0, loss: 0 };
            bStats[species].inventory += tank.inventory;
            bStats[species].loss += Number(tank.farming?.deadCount || 0);
        } else if (id.startsWith('C')) {
            if (!cStats[species]) cStats[species] = { inventory: 0, loss: 0 };
            cStats[species].inventory += tank.inventory;
            cStats[species].loss += Number(tank.farming?.deadCount || 0);
        } else if (id.startsWith('W')) {
            if (!wStats[species]) wStats[species] = { inventory: 0, loss: 0 };
            wStats[species].inventory += tank.inventory;
            wStats[species].loss += Number(tank.farming?.deadCount || 0);
        }
    });

    const aChart = Object.entries(aStats).map(([name, stats]) => ({ name, inventory: stats.inventory, loss: stats.loss }));
    const bChart = Object.entries(bStats).map(([name, stats]) => ({ name, inventory: stats.inventory, loss: stats.loss }));
    const cChart = Object.entries(cStats).map(([name, stats]) => ({ name, inventory: stats.inventory, loss: stats.loss }));
    const wChart = Object.entries(wStats).map(([name, stats]) => ({ name, inventory: stats.inventory, loss: stats.loss }));

    res.json({
      totalInventory,
      monthlyIn,
      monthlyOut,
      totalLoss,
      avgTemperature: countTemp > 0 ? Number((sumTemp / countTemp).toFixed(1)) : 25.5,
      avgPh: countPh > 0 ? Number((sumPh / countPh).toFixed(1)) : 7.8,
      avgOxygen: countOxygen > 0 ? Number((sumOxygen / countOxygen).toFixed(1)) : 6.5,
      avgTurbidity: countTurbidity > 0 ? Number((sumTurbidity / countTurbidity).toFixed(1)) : 2.0,
      baseChart,
      aChart,
      bChart,
      cChart,
      wChart
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reset-db', async (req: any, res: any) => {
  if (!pool) return res.status(503).json({ error: 'MySQL not configured' });
  try {
    const connection = await pool.getConnection();
    await connection.query('DELETE FROM warehouse WHERE category = "fry"');
    
    // Clear all records
    await connection.query("DELETE FROM records");
    // Clear all tanks
    await connection.query("DELETE FROM tanks");
    
    // Seed all 24 empty tanks as requested
    const generateEmptyTanks = (prefix: string, count: number) => {
      return Array.from({ length: count }, (_, i) => {
        const id = `${prefix}-${(i + 1).toString().padStart(3, '0')}`;
        return {
          id,
          status: 'empty',
          temperature: null, ph: null, oxygen: null, waterLevel: 0,
          farming: { species: '未设定', size: '', entryDate: '', stockingTime: '', deadCount: 0, inventory: 0, currentInventory: 0, remarks: '' },
          equipment: {}
        };
      });
    };
    const tanksList = [
      ...generateEmptyTanks('A', 6),
      ...generateEmptyTanks('B', 6),
      ...generateEmptyTanks('C', 6),
      ...generateEmptyTanks('W', 6)
    ];

    const tankValues = tanksList.map(t => [t.id, t.status, t.temperature, t.ph, t.oxygen, t.waterLevel, JSON.stringify(t.farming), JSON.stringify(t.equipment)]);
    for (let i = 0; i < tankValues.length; i += 100) {
      const chunk = tankValues.slice(i, i + 100);
      const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      await connection.query(
        `INSERT IGNORE INTO tanks (id, status, temperature, ph, oxygen, waterLevel, farming, equipment) VALUES ${placeholders}`,
        chunk.flat()
      );
    }

    connection.release();
    res.json({ success: true, message: 'Database reset successfully. Tanks and records cleared. Please refresh the page.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/tanks', async (req, res) => {
  if (!pool) return res.status(503).json({ error: "MySQL not configured" });
  try {
    const connection = await pool.getConnection();
    try {
      // Auto-sync any tanks that have records but no entry in tanks table
      const [distinctTankIdsRows] = await connection.query('SELECT DISTINCT tankId FROM records');
      const distinctTankIds = (distinctTankIdsRows as any[]).map(r => r.tankId);
      
      const [existingTanksRows] = await connection.query('SELECT id FROM tanks');
      const existingTanks = (existingTanksRows as any[]).map(r => r.id);
      
      const missingTanks = distinctTankIds.filter(id => id && !existingTanks.includes(id));
      
      if (missingTanks.length > 0) {
        for (const tankId of missingTanks) {
          await syncTankInventory(connection, tankId);
        }
      }
      
      const [rows] = await connection.query('SELECT * FROM tanks ORDER BY id ASC');
      const tanks = (rows as any[]).map(row => {
        // 水质指标监测用模型（模拟）数据
        const temperature = row.temperature ?? Number((24 + Math.random() * 4).toFixed(1));
        const ph = row.ph ?? Number((7.0 + Math.random() * 0.8).toFixed(1));
        const oxygen = row.oxygen ?? Number((5.5 + Math.random() * 2.5).toFixed(1));
        const waterLevel = row.waterLevel || 80;
        const nh3 = row.nh3 ?? Number((0.1 + Math.random() * 0.4).toFixed(2));
        const no2 = row.no2 ?? Number((0.05 + Math.random() * 0.1).toFixed(2));
        const alkalinity = row.alkalinity ?? Math.floor(100 + Math.random() * 40);
        const orp = row.orp ?? Math.floor(280 + Math.random() * 80);
        const salinity = row.salinity ?? Number((0.1 + Math.random() * 0.2).toFixed(2));
        const turbidity = row.turbidity ?? Number((1.0 + Math.random() * 2.0).toFixed(1));
        const tds = row.tds ?? Math.floor(400 + Math.random() * 100);

        return {
          ...row,
          temperature, ph, oxygen, waterLevel, nh3, no2, alkalinity, orp, salinity, turbidity, tds,
          farming: row.farming ? (typeof row.farming === 'string' ? JSON.parse(row.farming) : row.farming) : undefined,
          equipment: row.equipment ? (typeof row.equipment === 'string' ? JSON.parse(row.equipment) : row.equipment) : undefined
        };
      });
      res.json(tanks);
    } finally {
      connection.release();
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tanks', async (req, res) => {
  if (!pool) return res.status(503).json({ error: "MySQL not configured" });
  try {
    const tanks = req.body; // Record<string, TankData>
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    
    try {
      for (const [id, data] of Object.entries(tanks)) {
        const tank = data as any;
        await connection.query(
          `INSERT INTO tanks (id, status, temperature, ph, oxygen, waterLevel, nh3, no2, alkalinity, orp, salinity, turbidity, tds, isIotConnected, farming, equipment) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE 
           status=VALUES(status), temperature=VALUES(temperature), ph=VALUES(ph), oxygen=VALUES(oxygen), 
           waterLevel=VALUES(waterLevel), nh3=VALUES(nh3), no2=VALUES(no2), 
           alkalinity=VALUES(alkalinity), orp=VALUES(orp), salinity=VALUES(salinity),
           turbidity=VALUES(turbidity), tds=VALUES(tds), isIotConnected=VALUES(isIotConnected),
           farming=VALUES(farming), equipment=VALUES(equipment)`,
          [
            id, 
            tank.status, 
            tank.temperature === '' ? null : tank.temperature, 
            tank.ph === '' ? null : tank.ph, 
            tank.oxygen === '' ? null : tank.oxygen, 
            tank.waterLevel === '' ? null : tank.waterLevel, 
            tank.nh3 === '' ? null : tank.nh3, 
            tank.no2 === '' ? null : tank.no2, 
            tank.alkalinity === '' ? null : tank.alkalinity,
            tank.orp === '' ? null : tank.orp,
            tank.salinity === '' ? null : tank.salinity,
            tank.turbidity === '' ? null : tank.turbidity,
            tank.tds === '' ? null : tank.tds,
            tank.isIotConnected || false,
            tank.farming ? JSON.stringify(tank.farming) : null, 
            tank.equipment ? JSON.stringify(tank.equipment) : null
          ]
        );
      }
      await connection.commit();
      res.json({ success: true });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/tanks/:id', async (req, res) => {
  if (!pool) return res.status(503).json({ error: "MySQL not configured" });
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM tanks WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Helper to sync tank farming data from records
// Helper to parse size value for weight calculations (synced with DataManagement.tsx logic)
const parseFishSize = (size: any): number => {
  if (!size || size === '-') return NaN;
  const str = String(size);
  // Match "20条/斤" format
  const match = str.match(/^(\d+(\.\d+)?)条\/斤$/);
  if (match) {
    const val = parseFloat(match[1]);
    return val > 0 ? 1 / val : 0;
  }
  const parsed = parseFloat(str);
  return isNaN(parsed) ? NaN : parsed;
};

async function syncTankInventory(connection: any, tankId: string) {
  if (!tankId) return;
  const normalizedId = tankId.trim();
  console.log(`Syncing tank: "${normalizedId}"`);

  // Use case-insensitive search for tankId
  const [inoutRows] = await connection.query('SELECT type, date, data FROM records WHERE LOWER(TRIM(tankId)) = LOWER(?) AND type = "inout"', [normalizedId]);
  const [lossRows] = await connection.query('SELECT data FROM records WHERE LOWER(TRIM(tankId)) = LOWER(?) AND type = "loss"', [normalizedId]);

  let totalCount = 0;
  let totalInventory = 0;
  let totalLossCount = 0;
  let species = '';
  let stockingTime = '';
  let initialSize = '';
  let initialCount = 0;
  let initialInventory = 0;

  const inoutRecords = (inoutRows as any[]).map(row => {
    const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
    return { ...data, type: data.type, date: row.date };
  });

  const lossRecords = (lossRows as any[]).map(row => {
    const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
    return data;
  });

  // Calculate aggregates with robust sorting
  inoutRecords.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Determine initial stocking info from first purchase/entry
  const stockingRecord = inoutRecords.find(r => r.type === 'purchaseIn' || r.type === 'transferIn');
  if (stockingRecord) {
      species = stockingRecord.species || '';
      stockingTime = stockingRecord.date || '';
      initialSize = stockingRecord.size || '';
      
      const stockingIns = inoutRecords.filter(r => r.type === 'purchaseIn' || r.type === 'transferIn');
      initialCount = stockingIns.reduce((sum, r) => sum + Number(r.count || 0), 0);
      
      // Calculate initial inventory: for each record, if amount is missing, calculate from count
      initialInventory = stockingIns.reduce((sum, r) => {
          const rAmount = Number(r.amount || 0);
          if (rAmount > 0) return sum + rAmount;
          
          const rCount = Number(r.count || 0);
          const rSize = r.size || initialSize;
          const parsedSize = parseFishSize(rSize);
          if (!isNaN(parsedSize) && rCount > 0) {
              return sum + (rCount * parsedSize);
          }
          return sum;
      }, 0);
  }

  console.log(`  Tank ${normalizedId}: Records=${inoutRows.length}/${lossRows.length}, Initial=${initialCount}/${initialInventory}`);

  // Calculate current totals
  let currentCount = initialCount;
  let currentInventory = initialInventory;

  inoutRecords.forEach(r => {
    const rCount = Number(r.count || 0);
    const rAmount = Number(r.amount || 0);
    
    if (r.type === 'salesOut' || r.type === 'transferOut') {
        currentCount -= rCount;
        currentInventory -= rAmount;
    }
  });

  lossRecords.forEach(r => {
    const rDeadCount = Number(r.deadCount || 0);
    const rAmount = Number(r.amount || 0);
    
    totalLossCount += rDeadCount;
    currentCount -= rDeadCount;
    
    if (rAmount > 0) {
        currentInventory -= rAmount;
    } else {
        // If amount missing in loss, calculate based on current fish size if possible
        // For simplicity we use the stocking size if currentSize isn't tracked here yet
        const parsedSize = parseFishSize(initialSize);
        if (!isNaN(parsedSize)) {
            currentInventory -= rDeadCount * parsedSize;
        }
    }
  });

  console.log(`  Tank ${normalizedId}: Final Count=${currentCount}, Inventory=${currentInventory}`);

  const [tankRows] = await connection.query('SELECT farming, equipment, status FROM tanks WHERE id = ?', [normalizedId]);
  
  const currentFarming = (tankRows as any[]).length > 0 && tankRows[0].farming 
    ? (typeof tankRows[0].farming === 'string' ? JSON.parse(tankRows[0].farming) : tankRows[0].farming) 
    : { species: '', size: '', stockingTime: '', initialCount: 0, inventory: 0, currentCount: 0, currentInventory: 0, deadCount: 0 };
  
  const newFarming = {
    ...currentFarming,
    species: species || currentFarming.species,
    stockingTime: stockingTime || currentFarming.stockingTime,
    size: initialSize || currentFarming.size,
    initialCount: initialCount || currentFarming.initialCount,
    inventory: initialInventory || currentFarming.inventory,
    currentCount: Math.max(0, currentCount),
    currentInventory: Math.max(0, currentInventory),
    deadCount: totalLossCount
  };

  const status = (tankRows as any[]).length > 0 ? tankRows[0].status : (totalCount > 0 ? 'normal' : 'empty');
  const equipment = (tankRows as any[]).length > 0 ? tankRows[0].equipment : JSON.stringify({
    filter: '自动模式', pump: '运行中', oxygen: '运行中', uv: '待机',
    lastMaintenance: new Date().toISOString().split('T')[0], parameters: '标准参数'
  });

  if ((tankRows as any[]).length > 0) {
    await connection.query('UPDATE tanks SET farming = ?, status = ? WHERE id = ?', [JSON.stringify(newFarming), status, normalizedId]);
  } else {
    // Auto-create tank from records
    await connection.query(
      `INSERT INTO tanks (id, status, temperature, ph, oxygen, waterLevel, farming, equipment) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [normalizedId, status, 26.5, 7.2, 8.0, 80, JSON.stringify(newFarming), equipment]
    );
  }
}

app.get('/api/records', async (req, res) => {
  if (!pool) return res.status(503).json({ error: "MySQL not configured" });
  try {
    const [rows] = await pool.query('SELECT * FROM records');
    const records = (rows as any[]).map(row => {
      let data = {};
      try {
        data = typeof row.data === 'string' ? JSON.parse(row.data) : (row.data || {});
      } catch (e) {
        console.error('Failed to parse record data:', row.data);
      }
      return {
        id: row.id.toString(),
        type: row.type,
        tankId: row.tankId,
        date: row.date,
        data: data // Keep data clean
      };
    });
    res.json(records);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/records/:type', async (req, res) => {
  if (!pool) return res.status(503).json({ error: "MySQL not configured" });
  try {
    const { tankId } = req.query;
    let query = 'SELECT * FROM records WHERE type = ?';
    let params: any[] = [req.params.type];

    if (tankId) {
      query += ' AND tankId = ?';
      params.push(tankId);
    }

    const [rows] = await pool.query(query, params);
    const records = (rows as any[]).map(row => {
      const parsedData = typeof row.data === 'string' ? JSON.parse(row.data) : (row.data || {});
      return {
        id: row.id.toString(),
        category: row.type, // 'inout', 'loss', etc.
        tankId: row.tankId,
        date: row.date,
        ...parsedData,
        subType: parsedData.type || row.type // use internal type as subType
      };
    });
    res.json(records);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Helper to derive location from tankId
const deriveLocationFromTankId = (tankId: string) => {
  if (!tankId) return '一级主仓';
  const prefix = tankId.trim().charAt(0).toUpperCase();
  if (prefix === 'A') return 'A区生产仓';
  if (prefix === 'B') return 'B区生产仓';
  if (prefix === 'C') return 'C区生产仓';
  if (tankId.includes('车间')) return '车间生产仓';
  return '一级主仓';
};

app.post('/api/records/:type', async (req, res) => {
  if (!pool) return res.status(503).json({ error: "MySQL not configured" });
  try {
    const { tankId, date, ...data } = req.body;
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    
    try {
      const [result] = await connection.query(
        'INSERT INTO records (type, tankId, date, data) VALUES (?, ?, ?, ?)',
        [req.params.type, tankId, date, JSON.stringify(data)]
      );
      const recordId = (result as any).insertId;

      // Automatically update warehouse if it's a feeding or medication record
      if (req.params.type === 'feedmed') {
        const { feedType, feedAmount, medicineName, medicineAmount } = data;
        const location = deriveLocationFromTankId(tankId);
        
        if (feedType && feedAmount) {
          // Try to deduct from local warehouse first
          const [localItem] = await connection.query(
            'SELECT id FROM warehouse WHERE (name = ? OR id = ?) AND location = ?',
            [feedType, feedType, location]
          );
          
          if ((localItem as any[]).length > 0) {
            await connection.query(
              'UPDATE warehouse SET stock = stock - ? WHERE id = ?',
              [feedAmount, (localItem as any[])[0].id]
            );
          } else {
            // Fallback to global match (original behavior)
            await connection.query(
              'UPDATE warehouse SET stock = stock - ? WHERE name = ? OR id = ?',
              [feedAmount, feedType, feedType]
            );
          }
        }
        
        if (medicineName && medicineAmount) {
          const doseVal = parseFloat(medicineAmount) || 0;
          if (doseVal > 0) {
            const [localMed] = await connection.query(
              'SELECT id FROM warehouse WHERE (name = ? OR id = ?) AND location = ?',
              [medicineName, medicineName, location]
            );
            if ((localMed as any[]).length > 0) {
              await connection.query('UPDATE warehouse SET stock = stock - ? WHERE id = ?', [doseVal, (localMed as any[])[0].id]);
            } else {
              await connection.query('UPDATE warehouse SET stock = stock - ? WHERE name = ? OR id = ?', [doseVal, medicineName, medicineName]);
            }
          }
        }
      }

      // If it's a purchaseIn, transferIn, salesOut or transferOut record, update warehouse
      if (req.params.type === 'inout') {
        const { type: subType, species, amount, size } = data;
        const addTypes = ['purchaseIn', 'transferIn'];
        const subTypes = ['salesOut', 'transferOut'];
        
        if (species && (addTypes.includes(subType) || subTypes.includes(subType))) {
          const isAdd = addTypes.includes(subType);
          const [exists] = await connection.query('SELECT id FROM warehouse WHERE name = ? AND category = "fry" AND location = "一级主仓"', [species]);
          if ((exists as any[]).length > 0) {
            await connection.query('UPDATE warehouse SET stock = stock + ? WHERE name = ? AND category = "fry" AND location = "一级主仓"', [isAdd ? amount : -amount, species]);
          } else if (subType === 'purchaseIn') {
            // Create new fry record in warehouse if it's purchaseIn and not exists
            const [fryCountRows] = await connection.query('SELECT COUNT(*) as count FROM warehouse WHERE category = "fry"');
            const fryCount = (fryCountRows as any)[0].count + 1;
            const newId = `FRY-${String(fryCount).padStart(3, '0')}`;
            await connection.query(
              'INSERT INTO warehouse (id, category, name, spec, stock, unit, minStock, location) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
              [newId, 'fry', species, size || '鱼苗', amount, '斤', 100, '一级主仓']
            );
          } else if (isAdd) {
            // transferIn but not in warehouse - we should probably add it too for consistency if we are tracking it
            const [fryCountRows] = await connection.query('SELECT COUNT(*) as count FROM warehouse WHERE category = "fry"');
            const fryCount = (fryCountRows as any)[0].count + 1;
            const newId = `FRY-${String(fryCount).padStart(3, '0')}`;
            await connection.query(
              'INSERT INTO warehouse (id, category, name, spec, stock, unit, minStock, location) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
              [newId, 'fry', species, size || '鱼苗', amount, '斤', 100, '一级主仓']
            );
          }
        }
      }
      
      // Sync tank inventory if it's inout or loss
      if (req.params.type === 'inout' || req.params.type === 'loss') {
        await syncTankInventory(connection, tankId);
      }
      
      await connection.commit();
      res.json({ id: recordId.toString(), tankId, date, ...data });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/records/:type/:id', async (req, res) => {
  if (!pool) return res.status(503).json({ error: "MySQL not configured" });
  try {
    const { tankId, date, ...data } = req.body;
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // 1. Get old record to revert stock
      const [oldRows] = await connection.query('SELECT data FROM records WHERE id = ? AND type = ?', [req.params.id, req.params.type]);
      if ((oldRows as any[]).length > 0) {
        const oldData = typeof (oldRows as any[])[0].data === 'string' ? JSON.parse((oldRows as any[])[0].data) : (oldRows as any[])[0].data;
        const oldActualType = oldData.subType || oldData.type;
        
        if (req.params.type === 'feedmed') {
          if (oldData.feedType && oldData.feedAmount) {
            await connection.query('UPDATE warehouse SET stock = stock + ? WHERE name = ? OR id = ?', [oldData.feedAmount, oldData.feedType, oldData.feedType]);
          }
          if (oldData.medicineName && oldData.medicineAmount) {
            await connection.query('UPDATE warehouse SET stock = stock + ? WHERE name = ? OR id = ?', [oldData.medicineAmount, oldData.medicineName, oldData.medicineName]);
          }
        }

        if (req.params.type === 'inout' && ['purchaseIn', 'transferIn', 'salesOut', 'transferOut'].includes(oldActualType)) {
           if (oldData.species && oldData.amount) {
              const weightChange = ['purchaseIn', 'transferIn'].includes(oldActualType) ? -oldData.amount : oldData.amount;
              await connection.query('UPDATE warehouse SET stock = stock + ? WHERE name = ? AND category = "fry"', [weightChange, oldData.species]);
           }
        }
      }

      // 2. Update record
      await connection.query(
        'UPDATE records SET tankId = ?, date = ?, data = ? WHERE id = ? AND type = ?',
        [tankId, date, JSON.stringify(data), req.params.id, req.params.type]
      );

      // 3. Apply new stock changes
      if (req.params.type === 'feedmed') {
        const { feedType, feedAmount, medicineName, medicineAmount } = data;
        const location = deriveLocationFromTankId(tankId);

        if (feedType && feedAmount) {
          const [localItem] = await connection.query(
            'SELECT id FROM warehouse WHERE (name = ? OR id = ?) AND location = ?',
            [feedType, feedType, location]
          );
          if ((localItem as any[]).length > 0) {
             await connection.query('UPDATE warehouse SET stock = stock - ? WHERE id = ?', [feedAmount, (localItem as any[])[0].id]);
          } else {
             await connection.query('UPDATE warehouse SET stock = stock - ? WHERE name = ? OR id = ?', [feedAmount, feedType, feedType]);
          }
        }
        if (medicineName && medicineAmount) {
          const doseVal = parseFloat(medicineAmount) || 0;
          if (doseVal > 0) {
            const [localMed] = await connection.query(
              'SELECT id FROM warehouse WHERE (name = ? OR id = ?) AND location = ?',
              [medicineName, medicineName, location]
            );
            if ((localMed as any[]).length > 0) {
              await connection.query('UPDATE warehouse SET stock = stock - ? WHERE id = ?', [doseVal, (localMed as any[])[0].id]);
            } else {
              await connection.query('UPDATE warehouse SET stock = stock - ? WHERE name = ? OR id = ?', [doseVal, medicineName, medicineName]);
            }
          }
        }
      }

      if (req.params.type === 'inout' && ['purchaseIn', 'transferIn', 'salesOut', 'transferOut'].includes(data.type)) {
         if (data.species && data.amount) {
            const isAddType = ['purchaseIn', 'transferIn'].includes(data.type);
            const weightChange = isAddType ? data.amount : -data.amount;
            
            // Check if exists first for PUT as well (though it should exist if we are updating, but just in case)
            const [exists] = await connection.query('SELECT id FROM warehouse WHERE name = ? AND category = "fry"', [data.species]);
            if ((exists as any[]).length > 0) {
              await connection.query('UPDATE warehouse SET stock = stock + ? WHERE name = ? AND category = "fry"', [weightChange, data.species]);
            } else if (isAddType) {
              const [fryCountRows] = await connection.query('SELECT COUNT(*) as count FROM warehouse WHERE category = "fry"');
              const fryCount = (fryCountRows as any)[0].count + 1;
              const newId = `FRY-${String(fryCount).padStart(3, '0')}`;
              await connection.query(
                'INSERT INTO warehouse (id, category, name, spec, stock, unit, minStock) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [newId, 'fry', data.species, data.size || '鱼苗', data.amount, '斤', 100]
              );
            }
         }
      }

      // Sync tank inventory if it's inout or loss
      if (req.params.type === 'inout' || req.params.type === 'loss') {
        const [oldRecordRows] = await connection.query('SELECT tankId FROM records WHERE id = ?', [req.params.id]);
        const oldTankId = oldRecordRows[0]?.tankId;
        
        await syncTankInventory(connection, tankId);
  
        // If tankId changed, sync the old one too
        if (oldTankId && oldTankId !== tankId) {
           await syncTankInventory(connection, oldTankId);
        }
      }

      await connection.commit();
      res.json({ success: true });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/records/:type/:id', async (req, res) => {
  if (!pool) return res.status(503).json({ error: "MySQL not configured" });
  try {
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      const [oldRows] = await connection.query('SELECT data FROM records WHERE id = ? AND type = ?', [req.params.id, req.params.type]);
      if ((oldRows as any[]).length > 0) {
        const oldData = typeof (oldRows as any[])[0].data === 'string' ? JSON.parse((oldRows as any[])[0].data) : (oldRows as any[])[0].data;
        const oldActualType = oldData.subType || oldData.type;
        
        if (req.params.type === 'feedmed') {
          if (oldData.feedType && oldData.feedAmount) {
            await connection.query('UPDATE warehouse SET stock = stock + ? WHERE name = ? OR id = ?', [oldData.feedAmount, oldData.feedType, oldData.feedType]);
          }
          if (oldData.medicineName && oldData.medicineAmount) {
            await connection.query('UPDATE warehouse SET stock = stock + ? WHERE name = ? OR id = ?', [oldData.medicineAmount, oldData.medicineName, oldData.medicineName]);
          }
        }

        if (req.params.type === 'inout' && ['purchaseIn', 'transferIn', 'salesOut', 'transferOut'].includes(oldActualType)) {
           if (oldData.species && oldData.amount) {
              const weightChange = ['purchaseIn', 'transferIn'].includes(oldActualType) ? -oldData.amount : oldData.amount;
              await connection.query('UPDATE warehouse SET stock = stock + ? WHERE name = ? AND category = "fry"', [weightChange, oldData.species]);
           }
        }
      }

      const [recordRows] = await connection.query('SELECT tankId FROM records WHERE id = ?', [req.params.id]);
      const tankId = (recordRows as any[]).length > 0 ? (recordRows as any[])[0].tankId : null;

      await connection.query('DELETE FROM records WHERE id = ? AND type = ?', [req.params.id, req.params.type]);

      if (tankId && (req.params.type === 'inout' || req.params.type === 'loss')) {
        await syncTankInventory(connection, tankId);
      }

      await connection.commit();
      res.json({ success: true });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// IoT Ingest Route for External STM32 Systems
app.post('/api/iot/ingest', async (req, res) => {
  const { tankId, apiKey, temperature, ph, turbidity, tds } = req.body;
  
  // Real apps should use a secure API Key validation
  const EXPECTED_API_KEY = process.env.IOT_API_KEY || 'aquaculture-iot-key-2026';
  if (apiKey !== EXPECTED_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized IoT device' });
  }

  if (!tankId) return res.status(400).json({ error: 'tankId is required' });
  if (!pool) return res.status(503).json({ error: 'Database not available' });

  try {
    const [result] = await pool.query(
      `UPDATE tanks SET 
       temperature = COALESCE(?, temperature), 
       ph = COALESCE(?, ph), 
       turbidity = COALESCE(?, turbidity), 
       tds = COALESCE(?, tds),
       isIotConnected = TRUE,
       status = CASE 
         WHEN ? < 15 OR ? > 35 OR ? < 5 OR ? > 9 THEN 'alarm'
         ELSE status 
       END
       WHERE id = ?`,
      [temperature, ph, turbidity, tds, temperature, temperature, ph, ph, tankId]
    );

    if ((result as any).affectedRows === 0) {
      return res.status(404).json({ error: `Tank ${tankId} not found` });
    }

    res.json({ success: true, timestamp: new Date().toISOString() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Warehouse Routes
// Suppliers API
app.get('/api/suppliers', async (req, res) => {
  if (!pool) return res.status(503).json({ error: "MySQL not configured" });
  try {
    const [rows] = await pool.query('SELECT * FROM suppliers ORDER BY created_at DESC');
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/suppliers', async (req, res) => {
  if (!pool) return res.status(503).json({ error: "MySQL not configured" });
  try {
    const { id, name, contact_person, phone, category, address, bank_account, reliability_score, remarks } = req.body;
    await pool.query(
      'INSERT INTO suppliers (id, name, contact_person, phone, category, address, bank_account, reliability_score, remarks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, name, contact_person, phone, category, address, bank_account, reliability_score || 100, remarks]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/suppliers/:id', async (req, res) => {
  if (!pool) return res.status(503).json({ error: "MySQL not configured" });
  try {
    const { name, contact_person, phone, category, address, bank_account, reliability_score, remarks } = req.body;
    await pool.query(
      'UPDATE suppliers SET name=?, contact_person=?, phone=?, category=?, address=?, bank_account=?, reliability_score=?, remarks=? WHERE id=?',
      [name, contact_person, phone, category, address, bank_account, reliability_score, remarks, req.params.id]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/suppliers/:id', async (req, res) => {
  if (!pool) return res.status(503).json({ error: "MySQL not configured" });
  try {
    await pool.query('DELETE FROM suppliers WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Supplier Offerings API
app.get('/api/suppliers/:id/offerings', async (req, res) => {
  if (!pool) return res.status(503).json({ error: "MySQL not configured" });
  try {
    const [rows] = await pool.query('SELECT * FROM supplier_offerings WHERE supplier_id = ? ORDER BY purchase_date DESC, created_at DESC', [req.params.id]);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/suppliers/:id/offerings', async (req, res) => {
  if (!pool) return res.status(503).json({ error: "MySQL not configured" });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { product_name, category, particle_size, specification, unit_price, discount_policy, purchase_date, purchase_quantity, protein_content } = req.body;
    const supplier_id = req.params.id;

    // 1. Insert into offerings table
    const [result] = await connection.query(
      'INSERT INTO supplier_offerings (supplier_id, product_name, category, particle_size, specification, unit_price, discount_policy, purchase_date, purchase_quantity, protein_content) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [supplier_id, product_name, category, particle_size, specification, unit_price, discount_policy, purchase_date, purchase_quantity || 0, protein_content]
    );

    // 2. Sync to primary warehouse (Auto-inbound)
    if (purchase_quantity > 0) {
      // Find supplier name for logging
      const [suppliers]: any = await connection.query('SELECT name FROM suppliers WHERE id = ?', [supplier_id]);
      const supplierName = suppliers[0]?.name || '未知供应商';

      // Update or Insert inventory in warehouse
      const [existing]: any = await connection.query('SELECT * FROM warehouse WHERE name = ? AND warehouse_name = ?', [product_name, '一级仓库']);
      if (existing.length > 0) {
        await connection.query('UPDATE warehouse SET quantity = quantity + ? WHERE id = ?', [purchase_quantity, existing[0].id]);
      } else {
        await connection.query(
          'INSERT INTO warehouse (id, warehouse_name, name, category, specification, unit, quantity) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [`WH-${Date.now()}`, '一级仓库', product_name, category, specification, '包', purchase_quantity]
        );
      }

      // Record transaction
      await connection.query(
        'INSERT INTO inventory_transactions (id, type, itemId, amount, date, price, remarks, supplier_id, supplier_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [`TR-${Date.now()}`, 'IN', product_name, purchase_quantity, purchase_date || new Date(), unit_price || 0, `供应商采购同步: ${product_name}`, supplier_id, supplierName]
      );
    }

    await connection.commit();
    res.json({ success: true });
  } catch (err: any) {
    await connection.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
});

app.delete('/api/supplier-offerings/:id', async (req, res) => {
  if (!pool) return res.status(503).json({ error: "MySQL not configured" });
  try {
    await pool.query('DELETE FROM supplier_offerings WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/warehouse/transfer', async (req, res) => {
  if (!pool) return res.status(503).json({ error: "MySQL not configured" });
  try {
    const { sourceId, targetLocation, targetTankId, amount, date, remarks } = req.body;
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    
    try {
      // 1. Get source item
      const [sourceItems] = await connection.query('SELECT * FROM warehouse WHERE id = ?', [sourceId]);
      const sourceItem = (sourceItems as any[])[0];
      if (!sourceItem || sourceItem.stock < amount) {
        throw new Error('源仓库库存不足');
      }

      // 2. Decrement source
      await connection.query('UPDATE warehouse SET stock = stock - ? WHERE id = ?', [amount, sourceId]);

      // 3. Find or create target item
      // In production zones, each tank is a sub-warehouse, so we match on tank_id too
      let query = 'SELECT id FROM warehouse WHERE name = ? AND spec = ? AND category = ? AND location = ?';
      let params = [sourceItem.name, sourceItem.spec, sourceItem.category, targetLocation];
      
      if (targetTankId) {
        query += ' AND tank_id = ?';
        params.push(targetTankId);
      } else {
        query += ' AND tank_id IS NULL';
      }

      const [targetItems] = await connection.query(query, params);
      
      let targetId;
      if ((targetItems as any[]).length > 0) {
        targetId = (targetItems as any[])[0].id;
        await connection.query('UPDATE warehouse SET stock = stock + ?, unit_price = ? WHERE id = ?', [amount, sourceItem.unit_price || 0, targetId]);
      } else {
        targetId = `${sourceItem.category.toUpperCase()}-SEC-${Date.now()}`;
        await connection.query(
          'INSERT INTO warehouse (id, category, name, spec, stock, unit, minStock, location, tank_id, unit_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [targetId, sourceItem.category, sourceItem.name, sourceItem.spec, amount, sourceItem.unit, 0, targetLocation, targetTankId || null, sourceItem.unit_price || 0]
        );
      }

      // 4. Record transaction
      const logData = {
        type: 'transfer',
        sourceId,
        sourceLocation: sourceItem.location,
        targetId,
        targetLocation,
        amount,
        itemName: sourceItem.name,
        price: sourceItem.unit_price || 0,
        remarks: remarks || '调拨出库'
      };
      
      await connection.query('INSERT INTO records (type, tankId, date, data) VALUES (?, ?, ?, ?)', [
        'warehouse',
        sourceId,
        date,
        JSON.stringify(logData)
      ]);

      if (targetTankId) {
        let farmingRecordType = '';
        let farmingData: any = { remarks: `仓储划拨自动生成: ${remarks || ''}`, price: sourceItem.unit_price || 0 };

        if (sourceItem.category === 'feed') {
          farmingRecordType = 'feedmed';
          farmingData.feedType = sourceItem.name;
          farmingData.feedAmount = amount;
        } else if (sourceItem.category === 'med') {
          farmingRecordType = 'feedmed';
          farmingData.medicineName = sourceItem.name;
          farmingData.medicineAmount = amount;
        } else if (sourceItem.category === 'fry') {
          farmingRecordType = 'inout';
          farmingData.type = 'transferIn';
          farmingData.species = sourceItem.name;
          farmingData.size = sourceItem.spec;
          farmingData.count = amount;
        } else {
          farmingRecordType = 'feedmed';
          farmingData.remarks = `物资发放: ${sourceItem.name} ${amount}${sourceItem.unit}. ${remarks || ''}`;
        }

        if (farmingRecordType) {
          await connection.query('INSERT INTO records (type, tankId, date, data) VALUES (?, ?, ?, ?)', [
            farmingRecordType,
            targetTankId,
            date,
            JSON.stringify(farmingData)
          ]);
        }
      }

      await connection.commit();
      res.json({ success: true });
    } catch (err: any) {
      await connection.rollback();
      res.status(400).json({ error: err.message });
    } finally {
      connection.release();
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/warehouse', async (req, res) => {
  if (!pool) return res.status(503).json({ error: "MySQL not configured" });
  try {
    const [rows] = await pool.query('SELECT * FROM warehouse');
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/warehouse', async (req, res) => {
  if (!pool) return res.status(503).json({ error: "MySQL not configured" });
  try {
    const { id, category, name, spec, stock, unit, minStock, location, unit_price, batch_no, expiry_date } = req.body;
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    try {
      await connection.query(
        'INSERT INTO warehouse (id, category, name, spec, stock, unit, minStock, location, unit_price, batch_no, expiry_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE category=VALUES(category), name=VALUES(name), spec=VALUES(spec), stock=VALUES(stock), unit=VALUES(unit), minStock=VALUES(minStock), location=VALUES(location), unit_price=VALUES(unit_price), batch_no=VALUES(batch_no), expiry_date=VALUES(expiry_date)',
        [id, category, name, spec, stock, unit, minStock, location || '一级主仓', unit_price || 0, batch_no || null, expiry_date || null]
      );

      if (stock > 0) {
        await connection.query('INSERT INTO records (type, tankId, date, data) VALUES (?, ?, ?, ?)', [
          'warehouse',
          id,
          new Date().toISOString().split('T')[0],
          JSON.stringify({ type: 'initial', itemName: name, amount: stock, location: location || '一级主仓', remarks: '手工初始化库存' })
        ]);
      }

      await connection.commit();
      res.json({ success: true });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/warehouse/:id', async (req, res) => {
  if (!pool) return res.status(503).json({ error: "MySQL not configured" });
  try {
    const { category, name, spec, stock, unit, minStock, location, unit_price, batch_no, expiry_date, transaction } = req.body;
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      const [oldRows] = await connection.query('SELECT stock, name, location FROM warehouse WHERE id = ?', [req.params.id]);
      const oldItem = (oldRows as any)[0];

      let updateQuery = 'UPDATE warehouse SET ';
      const updateParams = [];
      const fields = [];

      if (category !== undefined) { fields.push('category = ?'); updateParams.push(category); }
      if (name !== undefined) { fields.push('name = ?'); updateParams.push(name); }
      if (spec !== undefined) { fields.push('spec = ?'); updateParams.push(spec); }
      if (stock !== undefined) { fields.push('stock = ?'); updateParams.push(stock); }
      if (unit !== undefined) { fields.push('unit = ?'); updateParams.push(unit); }
      if (minStock !== undefined) { fields.push('minStock = ?'); updateParams.push(minStock); }
      if (location !== undefined) { fields.push('location = ?'); updateParams.push(location); }
      if (unit_price !== undefined) { fields.push('unit_price = ?'); updateParams.push(unit_price); }
      if (batch_no !== undefined) { fields.push('batch_no = ?'); updateParams.push(batch_no); }
      if (expiry_date !== undefined) { fields.push('expiry_date = ?'); updateParams.push(expiry_date); }

      if (fields.length > 0) {
        updateQuery += fields.join(', ') + ' WHERE id = ?';
        updateParams.push(req.params.id);
        await connection.query(updateQuery, updateParams);
      }
      
      if (transaction) {
        // If it's an inbound transaction, update unit_price if provided
        if (transaction.type === 'inbound' && transaction.price) {
            await connection.query('UPDATE warehouse SET unit_price = ? WHERE id = ?', [transaction.price, req.params.id]);
        }
        await connection.query('INSERT INTO records (type, tankId, date, data) VALUES (?, ?, ?, ?)', [
          'warehouse',
          req.params.id,
          transaction.date,
          JSON.stringify(transaction)
        ]);
      } else if (oldItem && stock !== oldItem.stock) {
        await connection.query('INSERT INTO records (type, tankId, date, data) VALUES (?, ?, ?, ?)', [
          'warehouse',
          req.params.id,
          new Date().toISOString().split('T')[0],
          JSON.stringify({ type: 'adjustment', itemName: name || oldItem.name, amount: stock - oldItem.stock, location: location || oldItem.location, remarks: '手工调整库存' })
        ]);
      }

      await connection.commit();
      res.json({ success: true });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/warehouse/:id', async (req, res) => {
  if (!pool) return res.status(503).json({ error: "MySQL not configured" });
  try {
    await pool.query('DELETE FROM warehouse WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Company Profile Routes
app.get('/api/company-profile', async (req, res) => {
  if (!pool) {
    // Return mock if no DB
    return res.json({
      introduction: "贵州黔方有渔水产科技有限公司是黔西南州文化旅游产业投资开发（集团）有限公司旗下一级股份制公司。公司立足于黔西南州陆基养殖的基础和比较优势，积极抢抓“长江十年禁渔”“万峰湖退渔还湖”历史性机遇，于 2020 年 9 月挂牌成立，注册资本 5000 万元。\n\n经营范围：水产养殖、苗种生产、批发零售；饲料销售；技术服务、开发、咨询；渔业机械制造与销售；农产品初加工等。",
      performance: "目前公司主营陆基循环水养殖系统（RAS）的建设与运营，是州内及全省陆基设施渔业领头羊。\n\n2021年度营收：2000万元\n2022年度营收：7000万元\n2023年度营收：9462万元\n2024年度营收：10759万元\n\n主导制定《陆基生态循环水养殖系统建设规范》地方标准。",
      projects: "【郑屯镇民族村基地】\n投资 1.27 亿元，占地 218.2 亩。包含 5 万立方米养殖总水体，2000 平方米孵化育苗车间，设计年产量 5000 吨。",
      cooperation: "合作单位：中国水产科学研究院珠江水产研究所、广西水产科学院等。公司致力于攻克现代循环水养殖技术难题，推动高效、绿色渔业发展。"
    });
  }
  try {
    const [rows] = await pool.query('SELECT content FROM company_profile WHERE id = 1');
    const profile = rows as any[];
    if (profile.length > 0) {
      res.json(typeof profile[0].content === 'string' ? JSON.parse(profile[0].content) : profile[0].content);
    } else {
      res.status(404).json({ error: "Profile not found" });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/company-profile', authenticateToken, async (req: any, res: any) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: '权限不足' });
  if (!pool) return res.status(503).json({ error: "MySQL not configured" });
  try {
    const content = req.body;
    await pool.query('INSERT INTO company_profile (id, content) VALUES (1, ?) ON DUPLICATE KEY UPDATE content = VALUES(content)', [JSON.stringify(content)]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/company-profile', authenticateToken, async (req: any, res: any) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: '权限不足' });
  if (!pool) return res.status(503).json({ error: "MySQL not configured" });
  try {
    const content = req.body;
    await pool.query('INSERT INTO company_profile (id, content) VALUES (1, ?) ON DUPLICATE KEY UPDATE content = VALUES(content)', [JSON.stringify(content)]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ai/ocr', async (req, res) => {
  try {
    const { image, mode } = req.body;
    if (!process.env.GEMINI_API_KEY) {
      return res.status(400).json({ error: 'AI服务未配置 (GEMINI_API_KEY缺失)' });
    }
    
    const match = image?.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) {
        return res.status(400).json({ error: '无效的图片格式' });
    }
    const mimeType = match[1];
    const base64Data = match[2];

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    let schemaJsonStr = "";
    if (mode === "inout") {
       schemaJsonStr = `[{"date": "YYYY-MM-DD", "tankId": "池号例A-001", "type": "purchaseIn/transferIn/salesOut/transferOut", "amount": 100, "remarks": "备注"}...]`;
    } else if (mode === "feedmed") {
       schemaJsonStr = `[{"date": "YYYY-MM-DD", "tankId": "池号例A-001", "feedType": "饲料类型", "feedAmount": 10, "medicineName": "药品", "medicineAmount": 1, "remarks": "备注"}...]`;
    } else if (mode === "loss") {
       schemaJsonStr = `[{"date": "YYYY-MM-DD", "tankId": "池号例A-001", "deadCount": 10, "reason": "死因"}...]`;
    } else {
       schemaJsonStr = `[{"tankId": "池号", "status": "normal/empty/alarm", "species": "品种", "size": "规格", "inventory": 100}...]`;
    }

    const prompt = `你是一个水产养殖数据识别助手。请从上面的图片中提取表格数据。
并以严格的JSON数组格式返回，不要包含其他任何文本和Markdown标记格式(如 \`\`\`json)。
请将提取到的列映射为如下格式的JSON数组：
${schemaJsonStr}
注意数字字段请直接返回数字，日期请统一为 YYYY-MM-DD 格式，遇到无法识别的可以留空或填默认值。如果只能识别个别字段，也请尽力提取为对应的JSON。`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [
        {
           role: 'user',
           parts: [
               { inlineData: { mimeType: mimeType, data: base64Data } },
               { text: prompt }
           ]
        }
      ]
    });
    
    let text = response.text || "[]";
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();
    
    let parsed = [];
    try {
       parsed = JSON.parse(text);
       if (!Array.isArray(parsed)) {
           parsed = [parsed];
       }
    } catch(e) {
       console.error("JSON parse failed", text);
       parsed = [];
    }
    
    res.json({ records: parsed });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      const indexPath = path.join(distPath, 'index.html');
      if (!fs.existsSync(indexPath)) {
        return res.status(500).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <title>系统启动异常</title>
            <style>
              body { font-family: sans-serif; padding: 40px; line-height: 1.6; background: #f87171; color: white; }
              .container { max-width: 800px; margin: 0 auto; background: rgba(0,0,0,0.2); padding: 30px; border-radius: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <h2>系统前端页面缺失 (dist/index.html 未找到)</h2>
              <p>这通常是因为在内存较小（如2GB）的服务器上运行 <code>npm run build</code> 时，进程因为内存不足（OOM）被系统强制杀死了，导致前端文件没有成功编译出来。</p>
              <h3>解决方案：</h3>
              <ol>
                <li><strong>本地编译后上传：</strong> 在您的个人电脑上运行该项目并执行 <code>npm run build</code>，然后将生成的 <code>dist</code> 文件夹完整打包上传到服务器覆盖。直接运行 <code>npm start</code> 即可。</li>
                <li><strong>取消宝塔面板的自动 Build：</strong> 确保启动命令中去掉了 <code>npm run build</code>，只需保留 <code>cross-env NODE_ENV=production tsx server.ts</code> 即可！</li>
                <li><strong>检查服务器日志：</strong> 在宝塔面板查看项目日志，如果出现 "Killed" 或 "杀死"，说明确实是内存被撑爆了。1G的虚拟内存可能仍然不够 Vite 在生产环境构建。</li>
              </ol>
            </div>
          </body>
          </html>
        `);
      }
      res.sendFile(indexPath);
    });
  }

  // Start listening immediately for Cloud Run health checks
  const server = app.listen(PORT as number, "0.0.0.0", () => {
    console.log('--------------------------------------------------');
    console.log(`[启动成功] 服务器运行在: http://0.0.0.0:${PORT}`);
    console.log(`[启动环境] NODE_ENV: ${process.env.NODE_ENV}`);
    console.log(`[运行模式] ${process.env.NODE_ENV === "production" ? "🚀 生产模式 (静态资源服务)" : "🛠️ 开发模式 (Vite HMR 中间件)"}`);
    
    if (process.env.NODE_ENV === "production") {
      const distPath = path.join(process.cwd(), 'dist');
      const indexPath = path.join(distPath, 'index.html');
      if (!fs.existsSync(distPath)) {
        console.error(`[致命错误] 找不到编译后的 dist 文件夹: ${distPath}`);
        console.error(`请在本地确认是否执行了 'npm run build'，或检查服务器内存是否足够完成构建。`);
      } else if (!fs.existsSync(indexPath)) {
        console.error(`[致命错误] dist 文件夹存在，但找不到 index.html`);
      } else {
        console.log(`[资源确认] 静态页面路径: ${indexPath}`);
      }
    }
    console.log('--------------------------------------------------');
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[致命错误] 端口 ${PORT} 已被占用！请检查是否有其他 Node 进程正在运行。`);
    } else {
      console.error('[致命错误] 服务器启动失败:', err);
    }
  });

  // Initialize DB asynchronously to not block startup
  initDB().catch(err => {
    console.error("Database initialization failed:", err);
  });
}

startServer();

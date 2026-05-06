import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const generateTanks = (prefix, count) => {
  return Array.from({ length: count }, (_, i) => {
    const id = `${prefix}-${(i + 1).toString().padStart(3, '0')}`;
    let status = 'empty';
    return {
      id,
      status,
      temperature: null,
      ph: null,
      oxygen: null,
      waterLevel: 0,
      farming: {
        species: '未设定',
        size: '',
        entryDate: '',
        stockingTime: '',
        prevBalance: 0,
        purchaseIn: 0,
        transferIn: 0,
        salesOut: 0,
        transferOut: 0,
        deadCount: 0,
        inventory: 0,
        currentInventory: 0,
        remarks: ''
      },
      equipment: {}
    };
  });
};

const tanksList = [
  ...generateTanks('A', 102),
  ...generateTanks('B', 262),
  ...generateTanks('C', 6),
  ...generateTanks('W', 29)
];

async function run() {
  if (!process.env.MYSQL_URL) {
    console.log("No MySQL URL");
    return;
  }
  const connection = await mysql.createConnection(process.env.MYSQL_URL);
  
  // Clear all except records matching C-001 (or maybe clear all records?)
  // The user said "将该记录覆盖进去，原来有的养殖数据全部清零". Let's clear records that are NOT C-001
  await connection.query("DELETE FROM records WHERE tankId != 'C-001'");
  
  const queries = [];
  for (const t of tanksList) {
    queries.push(
      connection.query("SELECT COUNT(*) as c FROM records WHERE tankId = ?", [t.id]).then(([rows]) => {
        if (rows[0].c === 0) {
          return connection.query(
            "INSERT INTO tanks (id, status, temperature, ph, oxygen, waterLevel, farming, equipment) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE status=?, farming=?, equipment=?",
            [t.id, t.status, t.temperature, t.ph, t.oxygen, t.waterLevel, JSON.stringify(t.farming), JSON.stringify(t.equipment),
             t.status, JSON.stringify(t.farming), JSON.stringify(t.equipment)]
          );
        }
      })
    );
  }
  await Promise.all(queries);

  console.log("Database reset with 399 empty tanks, retaining records for tanks with existing data.");
  connection.end();
}

run();

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const START_DATE = '2025-02-18';
const END_DATE = '2026-04-24'; // Current date
const TANKS_COUNT = 10;
const INITIAL_FISH_PER_TANK = 40000;

async function run() {
  if (!process.env.MYSQL_URL) {
    console.log("No MySQL URL");
    return;
  }
  const connection = await mysql.createConnection(process.env.MYSQL_URL);
  
  // Clear possible old simulation data for A-001 to A-010
  const tankIds = Array.from({ length: TANKS_COUNT }, (_, i) => `A-${(i+1).toString().padStart(3, '0')}`);
  await connection.query('DELETE FROM records WHERE tankId IN (?)', [tankIds]);
  
  const startDate = new Date(START_DATE);
  const endDate = new Date(END_DATE);
  const totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

  const records = [];
  const tanksData = {};
  
  // Initialize tanks
  for (const tid of tankIds) {
    tanksData[tid] = {
      count: INITIAL_FISH_PER_TANK,
      deadTotal: 0,
      inventory: INITIAL_FISH_PER_TANK * 0.02 // starting ~10g (0.02 jin)
    };
    // Insert Initial InOut Record
    records.push([
      'inout', 
      tid, 
      START_DATE, 
      JSON.stringify({ 
        type: 'purchaseIn', 
        amount: INITIAL_FISH_PER_TANK * 0.02, 
        species: '加州鲈', 
        size: '10g苗', 
        count: INITIAL_FISH_PER_TANK, 
        remarks: '模拟分批放苗 (40万尾总计)'
      })
    ]);
  }

  for (let day = 0; day <= totalDays; day++) {
    const curDate = new Date(startDate.getTime() + day * 24 * 3600 * 1000);
    const dateStr = curDate.toISOString().split('T')[0];
    
    // Weight per fish in grams: 10g -> 750g (1.5 jin)
    const weightGrams = 10 + 740 * Math.pow(day / totalDays, 1.8);
    const weightJin = weightGrams / 500;
    
    // Feed logic
    const feedRate = 0.04 - 0.025 * (day / totalDays); // 4% down to 1.5%
    const feedType = day < 60 ? '加州鲈开口料' : '加州鲈成鱼料(膨化)';
    
    for (const tid of tankIds) {
      const tank = tanksData[tid];
      if (tank.count <= 0) continue;
      
      // Mortality Logic
      let deadCount = 0;
      if (day < 30) {
        deadCount = Math.floor(Math.random() * 8); // higher in first month
      } else {
        if (Math.random() > 0.3) deadCount = Math.floor(Math.random() * 3); // steady small loss
      }
      
      if (deadCount > 0) {
        tank.count -= deadCount;
        tank.deadTotal += deadCount;
        records.push([
          'loss', 
          tid, 
          dateStr, 
          JSON.stringify({ 
            deadCount, 
            reason: day < 30 ? '苗期应激死亡' : '自然损耗/优胜劣汰',
            amount: deadCount * weightJin
          })
        ]);
      }
      
      const currentBiomass = tank.count * weightJin;
      const feedAmount = currentBiomass * feedRate;
      
      records.push([
        'feedmed', 
        tid, 
        dateStr, 
        JSON.stringify({ 
          feedType, 
          feedAmount: Math.round(feedAmount * 10) / 10, 
          medicineName: Math.random() > 0.95 ? '复合维C' : '', 
          medicineAmount: Math.random() > 0.95 ? 1 : 0, 
          remarks: '' 
        })
      ]);
    }
  }

  // Insert records in batches
  console.log(`Prepared ${records.length} records. Inserting...`);
  const batchSize = 2500;
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    await connection.query('INSERT INTO records (type, tankId, date, data) VALUES ?', [batch]);
    console.log(`Inserted ${(i/batchSize)+1} batches...`);
  }
  
  // Final tank weight
  const finalWeightGrams = 10 + 740;
  const finalWeightJin = finalWeightGrams / 500;

  // Update Tank Status
  for (const tid of tankIds) {
    const tank = tanksData[tid];
    const farming = {
      species: '加州鲈',
      size: '成鱼(约1.5斤)',
      entryDate: START_DATE,
      stockingTime: START_DATE,
      initialCount: INITIAL_FISH_PER_TANK,
      inventory: INITIAL_FISH_PER_TANK * 0.02,
      currentInventory: Math.round(tank.count * finalWeightJin),
      currentCount: tank.count,
      deadCount: tank.deadTotal,
      prevBalance: 0, purchaseIn: 0, transferIn: 0, salesOut: 0, transferOut: 0,
      remarks: '2025年2月18放苗 - 模拟数据'
    };
    
    // We already seeded empty tanks before, so we just update them
    await connection.query(
      "UPDATE tanks SET status='normal', farming=? WHERE id=?",
      [JSON.stringify(farming), tid]
    );
  }

  console.log("Successfully generated simulation data for 40万尾 加州鲈 (A-001 ~ A-010)!");
  await connection.end();
}

run();

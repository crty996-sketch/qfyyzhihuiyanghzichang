
import mysql from 'mysql2/promise';

async function check() {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'recirculating_aqua',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  try {
    const [rows]: any = await pool.query('SHOW COLUMNS FROM warehouse');
    console.log('--- Warehouse Columns ---');
    rows.forEach((row: any) => console.log(`${row.Field}: ${row.Type}`));

    const [wRows]: any = await pool.query('SELECT * FROM warehouse LIMIT 5');
    console.log('--- Warehouse Samples ---');
    wRows.forEach((row: any) => console.log(JSON.stringify(row)));

    const [recRows]: any = await pool.query('SELECT type, tankId, data FROM records WHERE type = "warehouse" LIMIT 10');
    console.log('--- Warehouse Records ---');
    recRows.forEach((row: any) => {
        console.log(`TankId: ${row.tankId}, Data: ${row.data}`);
    });

  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

check();

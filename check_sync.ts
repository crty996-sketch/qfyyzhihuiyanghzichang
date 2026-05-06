
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
    const [rows]: any = await pool.query('SELECT id, farming FROM tanks');
    console.log('--- Tanks ---');
    rows.forEach((row: any) => {
        console.log(`ID: "${row.id}", Farming: ${row.farming}`);
    });

    const [recRows]: any = await pool.query('SELECT type, tankId, date, data FROM records LIMIT 10');
    console.log('--- Records (first 10) ---');
    recRows.forEach((row: any) => {
        console.log(`Type: ${row.type}, Tank: "${row.tankId}", Date: ${row.date}, Data: ${row.data}`);
    });

  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

check();

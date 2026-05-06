import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
async function check() {
  const connection = await mysql.createConnection(process.env.MYSQL_URL);
  const [res] = await connection.query("SELECT count(*) as c FROM records");
  console.log("Records total:", res[0].c);
  // Get sum of feeding
  const [feed] = await connection.query("SELECT COUNT(*) as c FROM records WHERE type='feedmed'");
  console.log("Feed records:", feed[0].c);
  // Get sum of loss
  const [loss] = await connection.query("SELECT COUNT(*) as c FROM records WHERE type='loss'");
  console.log("Loss records:", loss[0].c);
  connection.end();
}
check();

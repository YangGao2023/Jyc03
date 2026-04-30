import mysql from 'mysql2/promise';
const conn = await mysql.createConnection({host:'43.166.250.145',user:'dbo001',password:'BDQN123456',database:'db_zhty202410'});
const [rows] = await conn.execute(
  "SELECT id FROM a3s_cash_entries WHERE (order_number IS NULL OR order_number = '') AND source_type='t1200' AND date='2026-04-30' ORDER BY amount"
);
for (const e of rows) console.log(e.id);
await conn.end();

import mysql from 'mysql2/promise';
const conn = await mysql.createConnection({host:'43.166.250.145',user:'dbo001',password:'BDQN123456',database:'db_zhty202410'});
const [rows] = await conn.execute(
  "SELECT id, amount, date, note, method, category FROM a3s_cash_entries WHERE type='收入' AND (order_number IS NULL OR order_number = '') AND (source_type IS NULL OR source_type = '') ORDER BY date, amount"
);
for (const e of rows) {
  console.log(e.id.slice(0,20) + ' | ' + e.date + ' | $' + e.amount + ' | ' + (e.note||''));
}
console.log('Total: ' + rows.length);
await conn.end();

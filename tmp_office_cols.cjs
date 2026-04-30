const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: '43.166.250.145', port: 3306, user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410', charset: 'utf8mb4',
  });
  const [cols] = await conn.execute('DESCRIBE a3s_cash_entries');
  console.log('=== a3s_cash_entries cols ===');
  for (const c of cols) console.log(c.Field, c.Type);
  const [cnt] = await conn.execute('SELECT COUNT(*) as cnt FROM a3s_cash_entries WHERE office = 1');
  console.log('\nAlready office=1:', cnt[0].cnt);
  const [expCols] = await conn.execute('DESCRIBE a3s_expenses');
  console.log('\n=== a3s_expenses cols ===');
  for (const c of expCols) console.log(c.Field, c.Type);
  await conn.end();
}
main().catch(console.error);

const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: '43.166.250.145', port: 3306,
    user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410', charset: 'utf8mb4',
  });
  
  const [rows] = await conn.execute('SELECT expense_type, COUNT(*) as cnt FROM a3s_expenses GROUP BY expense_type ORDER BY cnt DESC LIMIT 15');
  console.log('=== Expense type distribution ===');
  for (const r of rows) console.log(JSON.stringify(r.expense_type||'').padEnd(30), r.cnt);

  const [empty] = await conn.execute("SELECT COUNT(*) as cnt FROM a3s_expenses WHERE expense_type IS NULL OR expense_type = ''");
  console.log('\nEmpty expense_type:', empty[0].cnt);

  const [total] = await conn.execute('SELECT COUNT(*) as cnt FROM a3s_expenses');
  console.log('Total expenses:', total[0].cnt);

  const [recent] = await conn.execute("SELECT id, target, detail, expense_type, expense_date FROM a3s_expenses WHERE expense_date >= '2026-04-28' ORDER BY expense_date DESC, id LIMIT 20");
  console.log('\n=== Recent expenses ===');
  for (const r of recent) console.log(r.expense_date, (r.target||'').padEnd(15), (r.detail||'').padEnd(25), 'type='+(r.expense_type||'').padEnd(25), r.id);

  const [office] = await conn.execute('SELECT COUNT(*) as cnt FROM a3s_cash_entries WHERE office = 1');
  console.log('\nCash entries with office=1:', office[0].cnt);
  const [totalCash] = await conn.execute('SELECT COUNT(*) as cnt FROM a3s_cash_entries');
  console.log('Total cash entries:', totalCash[0].cnt);

  const [ot] = await conn.execute("SELECT id, type, amount, date, office, source_type FROM a3s_cash_entries WHERE source_type='office-transfer' OR office=1 ORDER BY date DESC LIMIT 10");
  console.log('Office entries:');
  for (const r of ot) console.log(' ', r.date, r.type.padEnd(4), '$'+Number(r.amount).toFixed(2).padStart(8), 'office='+r.office, 'src='+(r.source_type||'-'), r.id);

  const [expOffice] = await conn.execute("SELECT COUNT(*) as cnt FROM a3s_expenses WHERE office = 1");
  console.log('\nExpenses with office=1:', expOffice[0].cnt);

  // Also check: how many inc- entries exist in cash_entries
  const [cashSrc] = await conn.execute("SELECT source_type, COUNT(*) as cnt FROM a3s_cash_entries GROUP BY source_type");
  console.log('\nCash entries by source_type:');
  for (const r of cashSrc) console.log(' ', JSON.stringify(r.source_type||'null'), r.cnt);

  await conn.end();
}
main().catch(console.error);

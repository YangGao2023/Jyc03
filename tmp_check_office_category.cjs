const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: '43.166.250.145', port: 3306, user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410', charset: 'utf8mb4',
    supportBigNumbers: true, bigNumberStrings: true,
  });

  // 办公室收入当前在 a3s_cash_entries 里有没有category
  const [ce] = await conn.execute(`
    SELECT category, COUNT(*) as cnt FROM a3s_cash_entries WHERE office=1 AND type='收入' GROUP BY category ORDER BY cnt DESC
  `);
  console.log("=== 办公室收入(cash_entries)现有category ===");
  for (const r of ce) console.log(`  category=${r.category || '(空)'}: ${r.cnt}笔`);

  // 办公室支出当前 expense_type
  const [exp] = await conn.execute(`
    SELECT expense_type, COUNT(*) as cnt FROM a3s_expenses WHERE office=1 GROUP BY expense_type ORDER BY cnt DESC
  `);
  console.log("\n=== 办公室支出(expenses)现有expense_type ===");
  for (const r of exp) console.log(`  expense_type=${r.expense_type || '(空)'}: ${r.cnt}笔`);

  // 确认a3s_office_transfers表是否存在
  const [tables] = await conn.execute("SHOW TABLES LIKE 'a3s_office_transfers'");
  console.log(`\n=== a3s_office_transfers 表存在: ${tables.length > 0}`);

  // T1000字典中P5相关的条目（办公室支出高频类型）
  const [dic] = await conn.execute("SELECT P1, C3, C4 FROM T1000 WHERE P1 IN (1875008753250734080,1890065465380835328,1890498448927625216,1890491680612814848,1000301)");
  console.log("\n=== 高频支出类型字典确认 ===");
  for (const r of dic) console.log(`  P1=${r.P1}: C3=${r.C3}, C4=${r.C4}`);

  await conn.end();
}
main().catch(console.error);

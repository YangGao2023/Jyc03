const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: '43.166.250.145', port: 3306, user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410', charset: 'utf8mb4',
    supportBigNumbers: true, bigNumberStrings: true,
  });

  console.log("=== a3s_cash_entries method distribution ===");
  const [cashMethods] = await conn.execute("SELECT method, COUNT(*) as cnt, ROUND(SUM(amount), 2) as total FROM a3s_cash_entries GROUP BY method ORDER BY cnt DESC");
  for (const r of cashMethods) console.log(`  ${r.method || '(null)'}: ${r.cnt}条, $${r.total}`);

  console.log("\n=== a3s_expenses payment_method distribution ===");
  const [expMethods] = await conn.execute("SELECT payment_method, COUNT(*) as cnt, ROUND(SUM(amount), 2) as total FROM a3s_expenses GROUP BY payment_method ORDER BY cnt DESC");
  for (const r of expMethods) console.log(`  ${r.payment_method || '(null)'}: ${r.cnt}条, $${r.total}`);

  // Check METHOD_OPTIONS in frontend
  console.log("\n=== Sample T1200 C4 codes (for reference) ===");
  const [t1200] = await conn.execute("SELECT C4, COUNT(*) as cnt FROM T1200 WHERE Z1=1 GROUP BY C4 ORDER BY cnt DESC");
  for (const r of t1200) console.log(`  C4=${r.C4}: ${r.cnt}`);

  await conn.end();
}
main().catch(console.error);

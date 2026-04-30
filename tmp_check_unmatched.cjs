const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: '43.166.250.145', port: 3306, user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410', charset: 'utf8mb4',
  });

  // Find T1200 office income records that don't have matching a3s_cash_entries
  const [unmatched] = await conn.execute(`
    SELECT t.P1, t.C6, t.C5/100 as amt, t.C2, t.C3, t.C7
    FROM T1200 t
    LEFT JOIN a3s_cash_entries c ON c.id = CONCAT('inc-', t.P1)
    WHERE t.Z1=1 AND t.Z2=1 AND t.P3='110' AND c.id IS NULL
    ORDER BY t.C6 DESC
  `);
  console.log(`Unmatched income office records: ${unmatched.length}`);
  for (const r of unmatched) {
    console.log(`  ${r.C6} | $${Number(r.amt).toFixed(2)} | ${r.C2||''} ${r.C3||''}`);
  }

  // Also check: any T1200 records that might have old_inc_ prefix?
  const [oldPrefixed] = await conn.execute(`
    SELECT COUNT(*) as cnt FROM a3s_cash_entries WHERE id LIKE 'old_inc_%' AND office = 1
  `);
  console.log(`\nCash entries with old_inc_ prefix and office=1: ${oldPrefixed[0].cnt}`);

  await conn.end();
}
main().catch(console.error);

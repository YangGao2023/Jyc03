const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: '43.166.250.145', port: 3306, user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410', charset: 'utf8mb4',
  });

  // Direct join-based update for ALL T1200 office records
  const [r1] = await conn.execute(`
    UPDATE a3s_cash_entries c
    INNER JOIN T1200 t ON c.id = CONCAT('inc-', t.P1)
    SET c.office = 1
    WHERE t.Z1 = 1 AND t.Z2 = 1 AND t.P3 = '110'
  `);
  console.log(`Cash entries updated: ${r1.affectedRows}`);

  // Same for expenses
  const [r2] = await conn.execute(`
    UPDATE a3s_expenses e
    INNER JOIN T1200 t ON e.id = CONCAT('exp-', t.P1)
    SET e.office = 1
    WHERE t.Z1 = 1 AND t.Z2 = 0 AND t.P3 = '110'
  `);
  console.log(`Expenses updated: ${r2.affectedRows}`);

  // Verify
  const [cnt] = await conn.execute("SELECT COUNT(*) as cnt FROM a3s_cash_entries WHERE office = 1");
  console.log(`Final cash_entries with office=1: ${cnt[0].cnt}`);
  const [cnt2] = await conn.execute("SELECT COUNT(*) as cnt FROM a3s_expenses WHERE office = 1");
  console.log(`Final expenses with office=1: ${cnt2[0].cnt}`);

  // Check today's records
  const [today] = await conn.execute("SELECT id, office FROM a3s_cash_entries WHERE id IN ('inc-2049870045781299200', 'inc-2049897950758441000')");
  for (const r of today) console.log(`  ${r.id}: office=${r.office}`);

  await conn.end();
}
main().catch(console.error);

const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: '43.166.250.145', port: 3306, user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410', charset: 'utf8mb4',
  });

  // Reset office flag first
  await conn.execute("UPDATE a3s_cash_entries SET office = 0");
  await conn.execute("UPDATE a3s_expenses SET office = 0");

  // Use old_id for JOIN (bigint) instead of CONCAT (which loses precision for huge P1 values)
  const [r1] = await conn.execute(`
    UPDATE a3s_cash_entries c
    INNER JOIN T1200 t ON c.old_id = t.P1
    SET c.office = 1
    WHERE t.Z1 = 1 AND t.Z2 = 1 AND t.P3 = '110'
  `);
  console.log(`Cash entries updated via old_id JOIN: ${r1.affectedRows}`);

  const [r2] = await conn.execute(`
    UPDATE a3s_expenses e
    INNER JOIN T1200 t ON e.old_id = t.P1
    SET e.office = 1
    WHERE t.Z1 = 1 AND t.Z2 = 0 AND t.P3 = '110'
  `);
  console.log(`Expenses updated via old_id JOIN: ${r2.affectedRows}`);

  // Verify
  const [today] = await conn.execute(
    "SELECT id, office FROM a3s_cash_entries WHERE id IN ('inc-2049870045781299200', 'inc-2049897950758441000')"
  );
  for (const r of today) console.log(`${r.id}: office=${r.office}`);
  const [total1] = await conn.execute("SELECT COUNT(*) as cnt FROM a3s_cash_entries WHERE office = 1");
  console.log(`Total cash_entries with office=1: ${total1[0].cnt}`);
  const [total2] = await conn.execute("SELECT COUNT(*) as cnt FROM a3s_expenses WHERE office = 1");
  console.log(`Total expenses with office=1: ${total2[0].cnt}`);

  await conn.end();
}
main().catch(console.error);

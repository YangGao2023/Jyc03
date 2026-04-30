const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: '43.166.250.145', port: 3306, user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410', charset: 'utf8mb4',
  });

  // Use SUBSTRING(id, 5) to extract the number part, compare as STRING with T1200.P1
  const [r1] = await conn.execute(`
    UPDATE a3s_cash_entries c
    INNER JOIN T1200 t ON CAST(t.P1 AS CHAR) = SUBSTRING(c.id, 5)
    SET c.office = 1
    WHERE t.Z1=1 AND t.Z2=1 AND t.P3='110'
  `);
  console.log(`Cash entries updated (by sub_id): ${r1.affectedRows}`);

  const [r2] = await conn.execute(`
    UPDATE a3s_expenses e
    INNER JOIN T1200 t ON CAST(t.P1 AS CHAR) = SUBSTRING(e.id, 5)
    SET e.office = 1
    WHERE t.Z1=1 AND t.Z2=0 AND t.P3='110'
  `);
  console.log(`Expenses updated (by sub_id): ${r2.affectedRows}`);

  // Verify
  const [cnt1] = await conn.execute("SELECT COUNT(*) as cnt FROM a3s_cash_entries WHERE office = 1");
  const [cnt2] = await conn.execute("SELECT COUNT(*) as cnt FROM a3s_expenses WHERE office = 1");
  console.log(`\nFinal: cash_entries office=1: ${cnt1[0].cnt}, expenses office=1: ${cnt2[0].cnt}`);

  for (const pid of ['2049870045781299200', '2049897950758441000']) {
    const [r] = await conn.execute(
      "SELECT id, office FROM a3s_cash_entries WHERE old_id = ?",
      [Number(pid)]
    );
    for (const row of r) console.log(`${row.id}: office=${row.office}`);
  }

  await conn.end();
}
main().catch(console.error);

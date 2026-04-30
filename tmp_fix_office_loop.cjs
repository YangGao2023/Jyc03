const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: '43.166.250.145', port: 3306, user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410', charset: 'utf8mb4',
  });

  // Get all T1200 office income records
  const [allP1s] = await conn.execute("SELECT P1 FROM T1200 WHERE Z1=1 AND Z2=1 AND P3='110'");
  console.log(`Total office income records: ${allP1s.length}`);

  let updated = 0;
  for (const r of allP1s) {
    const p1Str = String(r.P1);
    const [res] = await conn.execute(
      "UPDATE a3s_cash_entries SET office = 1 WHERE id = CONCAT('inc-', ?) AND office != 1",
      [p1Str]
    );
    updated += res.affectedRows;
  }
  console.log(`Updated: ${updated}`);

  // Same for expenses
  const [allExp] = await conn.execute("SELECT P1 FROM T1200 WHERE Z1=1 AND Z2=0 AND P3='110'");
  let expUpdated = 0;
  for (const r of allExp) {
    const p1Str = String(r.P1);
    const [res] = await conn.execute(
      "UPDATE a3s_expenses SET office = 1 WHERE id = CONCAT('exp-', ?) AND office != 1",
      [p1Str]
    );
    expUpdated += res.affectedRows;
  }
  console.log(`Expenses updated: ${expUpdated}`);

  // Verify
  const [cnt] = await conn.execute("SELECT COUNT(*) as cnt FROM a3s_cash_entries WHERE office = 1");
  console.log(`\nFinal cash_entries office=1: ${cnt[0].cnt}`);

  const [cnt2] = await conn.execute("SELECT COUNT(*) as cnt FROM a3s_expenses WHERE office = 1");
  console.log(`Final expenses office=1: ${cnt2[0].cnt}`);

  // Check today
  for (const pid of ['2049870045781299200', '2049897950758441000']) {
    const [r] = await conn.execute(
      "SELECT id, office FROM a3s_cash_entries WHERE id = CONCAT('inc-', ?)",
      [pid]
    );
    if (r.length > 0) console.log(`${r[0].id}: office=${r[0].office}`);
  }

  await conn.end();
}
main().catch(console.error);

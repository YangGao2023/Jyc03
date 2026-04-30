const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: '43.166.250.145', port: 3306, user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410', charset: 'utf8mb4',
  });

  // Check if today's office records got office=1
  const ids = ['inc-2049870045781299200', 'inc-2049897950758441000'];
  const [today] = await conn.execute(
    `SELECT id, office, old_id FROM a3s_cash_entries WHERE id IN (?, ?)`,
    ids
  );
  for (const r of today) console.log(`id=${r.id} office=${r.office} old_id=${r.old_id}`);

  // Count office=1 today
  const [cnt] = await conn.execute(
    "SELECT COUNT(*) as cnt FROM a3s_cash_entries WHERE office = 1"
  );
  console.log(`\nTotal office=1 in cash_entries: ${cnt[0].cnt}`);

  // Check all P1 values for office records using a different approach
  // First, get all T1200 P3='110' income P1 values, then check matching cash entries
  const [allP1s] = await conn.execute(
    "SELECT P1 FROM T1200 WHERE Z1=1 AND Z2=1 AND P3='110'"
  );
  console.log(`\nTotal T1200 office income records: ${allP1s.length}`);

  // Build a temp approach: for each P1, check cash entry
  let matched = 0;
  let unmatched_old = 0;
  let unmatched_huge = 0;
  for (const r of allP1s) {
    const p1 = String(r.P1);
    const [ce] = await conn.execute("SELECT id, office FROM a3s_cash_entries WHERE id = CONCAT('inc-', ?)", [p1]);
    if (ce.length > 0) {
      matched++;
    } else {
      if (Number(p1) > 1000000000000000000) {
        unmatched_huge++;
      } else {
        unmatched_old++;
      }
    }
  }
  console.log(`Matched in cash_entries: ${matched}`);
  console.log(`Unmatched (small P1): ${unmatched_old}`);
  console.log(`Unmatched (huge P1): ${unmatched_huge}`);

  await conn.end();
}
main().catch(console.error);

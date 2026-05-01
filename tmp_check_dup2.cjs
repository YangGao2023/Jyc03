const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({
    host: '43.166.250.145', port: 3306, user: 'dbo001',
    password: 'BDQN123456', database: 'db_zhty202410',
    connectionLimit: 2, supportBigNumbers: true, bigNumberStrings: true,
  });

  // T1200 Z2 counts
  const [r] = await pool.execute(
    "SELECT P3, Z2, COUNT(*) as cnt, ROUND(SUM(C5)/100, 2) as amt FROM T1200 WHERE Z1=1 GROUP BY P3, Z2 ORDER BY P3, Z2"
  );
  console.log('T1200 by P3 and Z2:');
  for (const x of r) console.log('  P3=%s Z2=%d: %d recs, $%s', x.P3, x.Z2, x.cnt, x.amt);

  // Cash entries t1200
  const [c] = await pool.execute(
    "SELECT office, COUNT(*) as cnt, ROUND(SUM(amount), 2) as amt FROM a3s_cash_entries WHERE source_type='t1200' GROUP BY office"
  );
  console.log('\ncash_entries t1200:');
  for (const x of c) console.log('  office=%d: %d recs, $%s', x.office, x.cnt, x.amt);

  // Show sample of duplicates to understand pattern
  const [dupes] = await pool.execute(
    "SELECT old_id, COUNT(*) as cnt FROM a3s_cash_entries WHERE source_type='t1200' GROUP BY old_id HAVING cnt > 1 ORDER BY old_id LIMIT 5"
  );
  for (const d of dupes) {
    const [rows] = await pool.execute(
      "SELECT id, office, amount, old_id FROM a3s_cash_entries WHERE old_id=? AND source_type='t1200' ORDER BY id",
      [String(d.old_id)]
    );
    for (const row of rows) {
      console.log('  dup: id=%s office=%d amt=%s old=%s', row.id, row.office, row.amount, row.old_id);
    }
  }

  await pool.end();
})();

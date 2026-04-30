const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: '43.166.250.145', port: 3306, user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410', charset: 'utf8mb4',
  });

  // Check unmatched T1200 office records: do they have matching cash entries or not?
  // Use a subquery approach that doesn't rely on JOIN
  const [allP1s] = await conn.execute("SELECT P1 FROM T1200 WHERE Z1=1 AND Z2=1 AND P3='110'");
  console.log(`Total office income records: ${allP1s.length}`);

  let withCashEntry = 0;
  let withoutCashEntry = 0;
  let withCashEntryButNoOffice = 0;

  for (const r of allP1s) {
    // Use JS string to avoid precision issues
    const p1Str = String(r.P1);
    // Query using the string directly
    const [res] = await conn.execute(
      "SELECT id, office FROM a3s_cash_entries WHERE id = CONCAT('inc-', ?)",
      [p1Str]
    );
    if (res.length > 0) {
      withCashEntry++;
      if (res[0].office !== 1) {
        withCashEntryButNoOffice++;
      }
    } else {
      withoutCashEntry++;
    }
  }
  console.log(`With cash entry: ${withCashEntry}`);
  console.log(`Without cash entry: ${withoutCashEntry}`);
  console.log(`With cash entry but office=0: ${withCashEntryButNoOffice}`);

  // Check: what prefix do these entries use?
  const [pref] = await conn.execute(`
    SELECT SUBSTRING(c.id, 1, 4) as prefix, COUNT(*) as cnt
    FROM T1200 t
    INNER JOIN a3s_cash_entries c ON c.old_id = t.P1
    WHERE t.Z1=1 AND t.Z2=1 AND t.P3='110'
    GROUP BY prefix
  `);
  console.log(`\nPrefix distribution of matched records:`);
  for (const r of pref) console.log(`  '${r.prefix}': ${r.cnt}`);

  await conn.end();
}
main().catch(console.error);

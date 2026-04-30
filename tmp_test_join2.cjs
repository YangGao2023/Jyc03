const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: '43.166.250.145', port: 3306, user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410', charset: 'utf8mb4',
  });

  // TEST 1: without c.source_type filter
  const [t1] = await conn.execute(`
    SELECT COUNT(*) as cnt
    FROM T1200 t
    INNER JOIN a3s_cash_entries c ON CAST(t.P1 AS CHAR) = SUBSTRING(c.id, 5)
    WHERE t.Z1=1 AND t.Z2=1 AND t.P3='110'
      AND c.source_type IS NOT NULL
  `);
  console.log(`With source_type NOT NULL: ${t1[0].cnt}`);

  const [t2] = await conn.execute(`
    SELECT COUNT(*) as cnt
    FROM T1200 t
    INNER JOIN a3s_cash_entries c ON CAST(t.P1 AS CHAR) = SUBSTRING(c.id, 5)
    WHERE t.Z1=1 AND t.Z2=1 AND t.P3='110'
  `);
  console.log(`Without source_type filter: ${t2[0].cnt}`);

  // Test with different date: only recent ones
  const [t3] = await conn.execute(`
    SELECT COUNT(*) as cnt
    FROM T1200 t
    INNER JOIN a3s_cash_entries c ON CAST(t.P1 AS CHAR) = SUBSTRING(c.id, 5)
    WHERE t.Z1=1 AND t.Z2=1 AND t.P3='110' AND t.C6 >= 20260401
  `);
  console.log(`Recent only (C6>=20260401): ${t3[0].cnt}`);

  // What about matching only P1 values that are > 1e18?
  const [t4] = await conn.execute(`
    SELECT COUNT(*) as cnt
    FROM T1200 t
    INNER JOIN a3s_cash_entries c ON CAST(t.P1 AS CHAR) = SUBSTRING(c.id, 5)
    WHERE t.Z1=1 AND t.Z2=1 AND t.P3='110' AND t.P1 > 1000000000000000
  `);
  console.log(`Only huge P1 (> 1e15): ${t4[0].cnt}`);

  // Test specifically: how many T1200 records have C6=20260430?
  const [t5] = await conn.execute("SELECT P1, P3, Z2 FROM T1200 WHERE Z1=1 AND Z2=1 AND C6=20260430");
  console.log(`\nAll income records for today (C6=20260430): ${t5.length}`);
  let officeCount = 0;
  for (const r of t5) {
    if (r.P3 === '110') {
      officeCount++;
      // Check cash entry
      const [ce] = await conn.execute(
        "SELECT id, office FROM a3s_cash_entries WHERE id = CONCAT('inc-', ?)",
        [String(r.P1)]
      );
      if (ce.length > 0) {
        console.log(`  P1=${r.P1}: cash_entry exists, office=${ce[0].office}`);
      } else {
        console.log(`  P1=${r.P1}: NO cash entry!`);
      }
    }
  }
  console.log(`Today office records: ${officeCount}`);

  await conn.end();
}
main().catch(console.error);

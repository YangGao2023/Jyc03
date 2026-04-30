const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: '43.166.250.145', port: 3306, user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410', charset: 'utf8mb4',
  });

  // Find ONE office record where office=0 and check its exact values
  const [missing] = await conn.execute(`
    SELECT t.P1, t.C6, t.C5/100 as amt, c.id, c.office, c.old_id, c.source_type
    FROM T1200 t
    INNER JOIN a3s_cash_entries c ON c.source_type = 't1200'
      AND CAST(t.P1 AS CHAR) = SUBSTRING(c.id, 5)
    WHERE t.Z1=1 AND t.Z2=1 AND t.P3='110' AND c.office = 0
    LIMIT 3
  `);
  console.log("=== Office records where office=0 but SHOULD match substring JOIN ===");
  console.log(`Count: ${missing.length}`);
  for (const r of missing) {
    console.log(`  P1=${r.P1} id='${r.id}' office=${r.office} old_id=${r.old_id} src='${r.source_type}' ${r.C6} $${Number(r.amt).toFixed(2)}`);
  }

  // Try without the source_type filter
  const [missing2] = await conn.execute(`
    SELECT count(*) as cnt
    FROM T1200 t
    INNER JOIN a3s_cash_entries c ON CAST(t.P1 AS CHAR) = SUBSTRING(c.id, 5)
    WHERE t.Z1=1 AND t.Z2=1 AND t.P3='110' AND c.office = 0
  `);
  console.log(`\nWithout source_type filter, still office=0: ${missing2[0].cnt}`);

  // Check with a large sample: compare CAST(P1 AS CHAR) vs SUBSTRING(id,5) directly
  const [samp] = await conn.execute(`
    SELECT t.P1, CAST(t.P1 AS CHAR) as p1_str, SUBSTRING(c.id, 5) as sub_str,
           t.P1 = CAST(SUBSTRING(c.id, 5) AS UNSIGNED) as num_match,
           CAST(t.P1 AS CHAR) = SUBSTRING(c.id, 5) as str_match,
           c.office, c.id
    FROM T1200 t
    INNER JOIN a3s_cash_entries c ON c.old_id = t.P1 AND c.source_type = 't1200'
    WHERE t.Z1=1 AND t.Z2=1 AND t.P3='110'
    LIMIT 10
  `);
  console.log(`\n=== Detailed comparison (first 10) ===`);
  for (const r of samp) {
    console.log(`  P1=${r.P1}`);
    console.log(`    p1_str='${r.p1_str}' sub_str='${r.sub_str}'`);
    console.log(`    num_match=${r.num_match} str_match=${r.str_match} office=${r.office}`);
  }

  await conn.end();
}
main().catch(console.error);

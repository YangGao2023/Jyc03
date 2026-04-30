const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: '43.166.250.145', port: 3306, user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410', charset: 'utf8mb4',
  });

  // Direct check: for P1=2049897950758441000, what's in T1200 and cash_entries?
  const [t1200] = await conn.execute(`
    SELECT P1, CAST(P1 AS CHAR) as p1_str, LENGTH(CAST(P1 AS CHAR)) as p1_len, P3
    FROM T1200 WHERE P1 = 2049897950758441000
  `);
  for (const r of t1200) {
    console.log(`T1200: P1=${r.P1} p1_str='${r.p1_str}' len=${r.p1_len} P3='${r.P3}'`);
  }

  const [cash] = await conn.execute(`
    SELECT id, SUBSTRING(id, 5) as sub_id, LENGTH(SUBSTRING(id, 5)) as sub_len, old_id, office, source_type
    FROM a3s_cash_entries WHERE old_id = 2049897950758440960
  `);
  for (const r of cash) console.log(`Cash: id='${r.id}' sub='${r.sub_id}' sub_len=${r.sub_len} old_id=${r.old_id} office=${r.office} src='${r.source_type}'`);

  // Try matching by the first character difference
  const [test] = await conn.execute(`
    SELECT 'inc-2049897950758441000' as test_id, '2049897950758441000' as test_sub
  `);
  for (const r of test) {
    console.log(`\ntest_id='${r.test_id}' (len=${r.test_id.length})`);
    console.log(`test_sub='${r.test_sub}' (len=${r.test_sub.length})`);
  }

  // Is the sub_id matching?
  const [matchTest] = await conn.execute(`
    SELECT COUNT(*) as cnt FROM a3s_cash_entries c
    INNER JOIN T1200 t ON t.P1 = 2049897950758441000
    WHERE c.old_id = 2049897950758440960
      AND '2049897950758441000' = SUBSTRING(c.id, 5)
  `);
  console.log(`\nSubstring exact match test: ${matchTest[0].cnt}`);

  await conn.end();
}
main().catch(console.error);

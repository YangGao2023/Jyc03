/**
 * 查 bigint 精度问题和列类型
 */
const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: '43.166.250.145', port: 3306,
    user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410',
  });

  // 1. Check column types for a3s_cash_entries
  const [cols] = await conn.execute("SHOW COLUMNS FROM a3s_cash_entries");
  console.log('=== a3s_cash_entries columns ===');
  for (const c of cols) {
    if (c.Field.includes('old') || c.Field.includes('id') || c.Field.includes('source'))
      console.log(c.Field, c.Type, c.Key);
  }

  // 2. Check T1200 P1 type
  const [t1200cols] = await conn.execute("SHOW COLUMNS FROM T1200 WHERE Field='P1'");
  console.log('\n=== T1200 P1 type ===');
  if (t1200cols[0]) console.log(t1200cols[0].Field, t1200cols[0].Type, t1200cols[0].Key);

  // 3. Test one orphaned value
  const p1 = '1891603100347797500';
  const [r1] = await conn.execute('SELECT id, old_id, source_type, amount FROM a3s_cash_entries WHERE old_id = ? AND source_type = ?', [p1, 't1200']);
  console.log('\n=== Direct match for P1=' + p1 + ' ===');
  console.log('cash_entries match:', r1.length);
  for (const r of r1) console.log('  id:', r.id, 'old_id:', r.old_id, 'type:', typeof r.old_id, 'amt:', r.amount);

  const [r2] = await conn.execute('SELECT P1, Z1, Z2 FROM T1200 WHERE P1 = ?', [p1]);
  console.log('T1200 match:', r2.length);
  for (const r of r2) console.log('  P1:', r.P1, 'Z1:', r.Z1, 'Z2:', r.Z2, 'type:', typeof r.P1);

  // 4. Compare types: what does P1 look like when read from T1200?
  const [rawT1200] = await conn.execute("SELECT P1, CAST(P1 AS CHAR) as p1str FROM T1200 WHERE P1 = ?", [p1]);
  console.log('\n=== raw P1 comparison ===');
  for (const r of rawT1200) {
    console.log('  P1:', r.P1, 'type:', typeof r.P1, 'str:', r.p1str);
  }

  // 5. What type is old_id in a3s_cash_entries?
  const [rawCash] = await conn.execute("SELECT old_id, CAST(old_id AS CHAR) as oldstr FROM a3s_cash_entries WHERE old_id = ?", [p1]);
  console.log('\n=== raw old_id comparison ===');
  for (const r of rawCash) {
    console.log('  old_id:', r.old_id, 'type:', typeof r.old_id, 'str:', r.oldstr);
  }

  // 6. Does the LEFT JOIN work with a char cast?
  const [joined] = await conn.execute(`
    SELECT c.id, c.old_id, CAST(c.old_id AS CHAR) as oldstr, t.P1, CAST(t.P1 AS CHAR) as p1str
    FROM a3s_cash_entries c
    LEFT JOIN T1200 t ON CAST(c.old_id AS CHAR) = CAST(t.P1 AS CHAR)
    WHERE c.id = 'inc-1891603100347797500' AND c.source_type = 't1200'
  `);
  console.log('\n=== JOIN with CAST ===');
  for (const r of joined) console.log('  id:', r.id, 'oldstr:', r.oldstr, 'p1str:', r.p1str);

  // 7. Check the max P1 - if > 2^53, we have bigint precision issues
  const [maxP1] = await conn.execute("SELECT MAX(P1) as maxp, MIN(P1) as minp FROM T1200");
  console.log('\n=== T1200 P1 range ===');
  console.log('  min:', maxP1[0].minp, 'max:', maxP1[0].maxp);
  console.log('  >= 2^53:', Number(maxP1[0].maxp) >= 9007199254740992);

  await conn.end();
}
main().catch(console.error);

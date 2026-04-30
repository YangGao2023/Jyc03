const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: '43.166.250.145', port: 3306, user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410', charset: 'utf8mb4',
  });

  // Check source_type for today's office records
  const [today] = await conn.execute(`
    SELECT c.id, c.source_type, c.old_id, c.office, CAST(t.P1 AS CHAR) as p1_str
    FROM a3s_cash_entries c
    INNER JOIN T1200 t ON c.old_id = t.P1
    WHERE t.P1 IN (2049870045781299200, 2049897950758441000)
  `);
  for (const r of today) console.log(`${r.id}: source_type='${r.source_type}' old_id=${r.old_id} office=${r.office} p1_str='${r.p1_str}'`);

  // How many T1200 office income records have matching cash entries?
  const [matched] = await conn.execute(`
    SELECT COUNT(*) as cnt
    FROM T1200 t
    INNER JOIN a3s_cash_entries c ON c.old_id = t.P1
    WHERE t.Z1=1 AND t.Z2=1 AND t.P3='110'
  `);
  console.log(`\nT1200 office income records with matching cash entry (by old_id): ${matched[0].cnt}`);

  // How many have source_type='t1200'?
  const [withType] = await conn.execute(`
    SELECT COUNT(*) as cnt
    FROM T1200 t
    INNER JOIN a3s_cash_entries c ON c.old_id = t.P1 AND c.source_type = 't1200'
    WHERE t.Z1=1 AND t.Z2=1 AND t.P3='110'
  `);
  console.log(`With source_type='t1200': ${withType[0].cnt}`);

  // Check: what source_types do these records have?
  const [types] = await conn.execute(`
    SELECT c.source_type, COUNT(*) as cnt
    FROM T1200 t
    INNER JOIN a3s_cash_entries c ON c.old_id = t.P1
    WHERE t.Z1=1 AND t.Z2=1 AND t.P3='110'
    GROUP BY c.source_type
  `);
  console.log(`\nSource type distribution for matched office records:`);
  for (const r of types) console.log(`  ${r.source_type || 'NULL'}: ${r.cnt}`);

  // Check: T1200 office records where source_type is NULL or not 't1200'
  const [nullType] = await conn.execute(`
    SELECT c.id, c.source_type, CAST(t.P1 AS CHAR) as p1_str, t.C6, t.C5/100 as amt
    FROM T1200 t
    INNER JOIN a3s_cash_entries c ON c.old_id = t.P1
    WHERE t.Z1=1 AND t.Z2=1 AND t.P3='110' 
      AND (c.source_type IS NULL OR c.source_type != 't1200')
    LIMIT 10
  `);
  console.log(`\nOffice records where source_type is NOT 't1200':`);
  for (const r of nullType) console.log(`  id=${r.id} source_type='${r.source_type}' ${r.C6} $${Number(r.amt).toFixed(2)}`);

  await conn.end();
}
main().catch(console.error);

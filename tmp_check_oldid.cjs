const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: '43.166.250.145', port: 3306, user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410', charset: 'utf8mb4',
  });

  // Check: what's the old_id for today's office entries?
  const [today] = await conn.execute(`
    SELECT id, old_id, IFNULL(old_id, 'NULL') as oid FROM a3s_cash_entries 
    WHERE id IN ('inc-2049870045781299200', 'inc-2049897950758441000')
  `);
  for (const r of today) console.log(`${r.id}: old_id=${r.oid}`);

  // Check: T1200 P3='110' records that DON'T match via old_id
  const [missed] = await conn.execute(`
    SELECT t.P1, t.C6, t.C5/100 as amt, c.old_id, c.office
    FROM T1200 t
    LEFT JOIN a3s_cash_entries c ON c.id = CONCAT('inc-', t.P1)
    WHERE t.Z1=1 AND t.Z2=1 AND t.P3='110' 
      AND c.office IS NULL  /* no cash entry at all */
    LIMIT 5
  `);
  console.log(`\nMissed (no cash entry): ${missed.length}`);
  for (const r of missed) console.log(`  P1=${r.P1} ${r.C6} $${r.amt}`);

  // Check office records that HAVE cash entries but office wasn't set
  const [noOffice] = await conn.execute(`
    SELECT t.P1, t.C6, c.id, c.office, c.old_id
    FROM T1200 t
    INNER JOIN a3s_cash_entries c ON c.id = CONCAT('inc-', t.P1)
    WHERE t.Z1=1 AND t.Z2=1 AND t.P3='110' AND c.office = 0
    LIMIT 5
  `);
  console.log(`\nOffice records with cash entry but office still 0: ${noOffice.length}`);
  for (const r of noOffice) console.log(`  P1=${r.P1} id=${r.id} office=${r.office} old_id=${r.old_id}`);

  // Also check: what is the old_id type in cash_entries versus P1 type in T1200?
  const [types] = await conn.execute(`
    SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = 'db_zhty202410' 
      AND TABLE_NAME IN ('a3s_cash_entries', 'T1200')
      AND COLUMN_NAME IN ('old_id', 'P1')
  `);
  console.log("\n=== Column types ===");
  for (const r of types) console.log(`${r.TABLE_NAME}.${r.COLUMN_NAME}: ${r.DATA_TYPE} (${r.COLUMN_TYPE})`);

  await conn.end();
}
main().catch(console.error);

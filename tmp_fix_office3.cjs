const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: '43.166.250.145', port: 3306, user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410', charset: 'utf8mb4',
  });

  // Find office records that are NOT caught by old_id JOIN but HAVE matching id
  const [mismatched] = await conn.execute(`
    SELECT t.P1, c.id, c.old_id, c.office,
      CAST(t.P1 AS CHAR) = SUBSTRING(c.id, 5) as substr_match,
      c.old_id = t.P1 as oldid_match,
      SUBSTRING(c.id, 5) as sub_str,
      CAST(t.P1 AS CHAR) as p1_str
    FROM T1200 t
    INNER JOIN a3s_cash_entries c ON c.source_type = 't1200' AND CAST(t.P1 AS CHAR) = SUBSTRING(c.id, 5)
    WHERE t.Z1=1 AND t.Z2=1 AND t.P3='110'
      AND (c.old_id IS NULL OR c.old_id != t.P1)
    ORDER BY t.P1
    LIMIT 5
  `);
  console.log(`=== Mismatched records (old_id wrong but id matches) ===`);
  console.log(`Count: ${mismatched.length}`);
  for (const r of mismatched) {
    console.log(`  P1=${r.P1}`);
    console.log(`  id='${r.id}'`);
    console.log(`  old_id=${r.old_id}`);
    console.log(`  p1_str='${r.p1_str}' sub_str='${r.sub_str}'`);
    console.log(`  substr_match=${r.substr_match} oldid_match=${r.oldid_match} office=${r.office}`);
  }

  // Count total
  const [mismatchTot] = await conn.execute(`
    SELECT COUNT(*) as cnt
    FROM T1200 t
    INNER JOIN a3s_cash_entries c ON c.source_type = 't1200' AND CAST(t.P1 AS CHAR) = SUBSTRING(c.id, 5)
    WHERE t.Z1=1 AND t.Z2=1 AND t.P3='110'
      AND (c.old_id IS NULL OR c.old_id != t.P1)
  `);
  console.log(`\nTotal mismatched: ${mismatchTot[0].cnt}`);

  // NOW the key question: does this mismatched set have office=0?
  const [noffice] = await conn.execute(`
    SELECT COUNT(*) as cnt
    FROM T1200 t
    INNER JOIN a3s_cash_entries c ON c.source_type = 't1200' AND CAST(t.P1 AS CHAR) = SUBSTRING(c.id, 5)
    WHERE t.Z1=1 AND t.Z2=1 AND t.P3='110'
      AND (c.old_id IS NULL OR c.old_id != t.P1)
      AND c.office = 0
  `);
  console.log(`\nMismatched AND office=0: ${noffice[0].cnt}`);

  // Try backfill using just ID-based matching
  const [update] = await conn.execute(`
    UPDATE a3s_cash_entries c
    INNER JOIN T1200 t ON c.source_type = 't1200' AND CAST(t.P1 AS CHAR) = SUBSTRING(c.id, 5)
    SET c.office = 1
    WHERE t.Z1=1 AND t.Z2=1 AND t.P3='110'
  `);
  console.log(`\nID-based backfill updated: ${update.affectedRows}`);

  // Verify
  const [cnt] = await conn.execute("SELECT COUNT(*) as cnt FROM a3s_cash_entries WHERE office = 1");
  console.log(`Total cash_entries with office=1: ${cnt[0].cnt}`);

  const [today] = await conn.execute(
    "SELECT id, office FROM a3s_cash_entries WHERE id IN ('inc-2049870045781299200', 'inc-2049897950758441000')"
  );
  for (const r of today) console.log(`${r.id}: office=${r.office}`);

  await conn.end();
}
main().catch(console.error);

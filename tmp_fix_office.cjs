const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: '43.166.250.145', port: 3306, user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410', charset: 'utf8mb4',
    supportBigNumbers: true,
    bigNumberStrings: true,
  });

  // First fix: correct imprecise IDs for huge-P1 records
  // Find T1200 records where SUBSTR(c.id, 5) != CAST(t.P1 AS CHAR)
  // This means the id was built from an imprecise JS Number

  // Reset office flags first
  await conn.execute("UPDATE a3s_cash_entries SET office = 0");
  await conn.execute("UPDATE a3s_expenses SET office = 0");

  // Method: use string-based matching for the UPDATE
  // SUBSTRING(c.id, 5) extracts the P1 part from 'inc-XXXXXXXXX'
  // CAST(t.P1 AS CHAR) gets the exact string representation of the T1200 P1

  // First, find how many records have imprecise IDs
  const [bad] = await conn.execute(`
    SELECT COUNT(*) as cnt
    FROM a3s_cash_entries c
    INNER JOIN T1200 t ON c.source_type = 't1200' AND c.old_id = t.P1
    WHERE t.Z1=1 AND t.Z2=1
      AND SUBSTRING(c.id, 5) != CAST(t.P1 AS CHAR)
  `);
  console.log(`Cash entries with imprecise IDs (old_id=P1 but id doesn't match): ${bad[0].cnt}`);

  // Check specific case
  const [p1rec] = await conn.execute(`
    SELECT c.id, CAST(t.P1 AS CHAR) as p1_str, c.old_id, t.P1
    FROM a3s_cash_entries c
    INNER JOIN T1200 t ON c.old_id = t.P1 AND c.source_type = 't1200'
    WHERE t.P1 = 2049897950758441000
  `);
  for (const r of p1rec) {
    console.log(`\nP1=2049897950758441000:`);
    console.log(`  c.id='${r.id}'`);
    console.log(`  t.P1=${r.P1} (bigint)`);
    console.log(`  p1_str='${r.p1_str}'`);
    console.log(`  substr(c.id,5)='${String(r.id).substring(4)}'`);
    console.log(`  old_id=${r.old_id}`);
  }

  // Fix imprecise IDs
  const [fix] = await conn.execute(`
    UPDATE a3s_cash_entries c
    INNER JOIN T1200 t ON c.old_id = t.P1 AND c.source_type = 't1200'
    SET c.id = CONCAT('inc-', CAST(t.P1 AS CHAR))
    WHERE SUBSTRING(c.id, 5) != CAST(t.P1 AS CHAR)
  `);
  console.log(`\nFixed imprecise IDs: ${fix.affectedRows}`);

  // Verify the fix
  const [p1rec2] = await conn.execute(`
    SELECT c.id, CAST(t.P1 AS CHAR) as p1_str, c.office
    FROM a3s_cash_entries c
    INNER JOIN T1200 t ON c.old_id = t.P1 AND c.source_type = 't1200'
    WHERE t.P1 = 2049897950758441000
  `);
  for (const r of p1rec2) console.log(`After fix: id='${r.id}' p1_str='${r.p1_str}'`);

  // Now backfill office flags
  const [r1] = await conn.execute(`
    UPDATE a3s_cash_entries c
    INNER JOIN T1200 t ON c.source_type = 't1200' AND c.old_id = t.P1
    SET c.office = 1
    WHERE t.Z1=1 AND t.Z2=1 AND t.P3='110'
  `);
  console.log(`\nOffice backfill (cash): ${r1.affectedRows}`);

  const [r2] = await conn.execute(`
    UPDATE a3s_expenses e
    INNER JOIN T1200 t ON e.source_type = 't1200' AND e.old_id = t.P1
    SET e.office = 1
    WHERE t.Z1=1 AND t.Z2=0 AND t.P3='110'
  `);
  console.log(`Office backfill (expense): ${r2.affectedRows}`);

  // Verify
  const [cnt1] = await conn.execute("SELECT COUNT(*) as cnt FROM a3s_cash_entries WHERE office = 1");
  const [cnt2] = await conn.execute("SELECT COUNT(*) as cnt FROM a3s_expenses WHERE office = 1");
  console.log(`\nFinal: cash_entries office=1: ${cnt1[0].cnt}, expenses office=1: ${cnt2[0].cnt}`);

  const [today] = await conn.execute(
    "SELECT id, office FROM a3s_cash_entries WHERE old_id IN (2049870045781299200, 2049897950758441000)"
  );
  for (const r of today) console.log(`${r.id}: office=${r.office}`);

  await conn.end();
}
main().catch(console.error);

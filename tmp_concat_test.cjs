const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: '43.166.250.145', port: 3306, user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410', charset: 'utf8mb4',
  });

  // Test: what does CONCAT produce for these big P1 values?
  const [concatTest] = await conn.execute(`
    SELECT t.P1, CONCAT('inc-', t.P1) as concat_id, t.P3, t.Z2
    FROM T1200 t WHERE t.Z1=1 AND t.P3='110' AND t.Z2=1 AND t.P1 > 2000000000000000000
    LIMIT 5
  `);
  console.log("=== CONCAT test ===");
  for (const r of concatTest) {
    console.log(`  P1=${r.P1}`);
    console.log(`  CONCAT: '${r.concat_id}'`);
    // Try matching
    const [match] = await conn.execute("SELECT id FROM a3s_cash_entries WHERE id = ?", [r.concat_id]);
    console.log(`  Match found: ${match.length}`);
    // Try matching with TRIM
    const [match2] = await conn.execute("SELECT id FROM a3s_cash_entries WHERE TRIM(id) = TRIM(?)", [r.concat_id]);
    console.log(`  Match after TRIM: ${match2.length}`);
    // What does the cash entry id look like?
    const [ce] = await conn.execute("SELECT id, LENGTH(id) as id_len FROM a3s_cash_entries WHERE old_id = ?", [Number(r.P1)]);
    if (ce.length > 0) {
      console.log(`  Cash entry id: '${ce[0].id}' (len=${ce[0].id_len})`);
      console.log(`  CONCAT id len: ${r.concat_id.length}`);
      console.log(`  MATCH: ${ce[0].id === r.concat_id}`);
    }
    console.log("");
  }

  await conn.end();
}
main().catch(console.error);

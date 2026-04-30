const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: '43.166.250.145', port: 3306, user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410', charset: 'utf8mb4',
  });

  // Check if these huge-P1 records are in cash_entries at all
  const [notIn] = await conn.execute(`
    SELECT t.P1, t.C6, t.C5/100 as amt, t.C2, t.Z2
    FROM T1200 t
    LEFT JOIN a3s_cash_entries c ON c.id = CONCAT('inc-', t.P1)
    WHERE t.Z1=1 AND t.Z2=1 AND t.P3='110' AND c.id IS NULL
    AND t.C6 >= 20260401
    LIMIT 10
  `);
  console.log("=== Unmatched recent office records ===");
  for (const r of notIn) {
    // Check if old system T1200.P2 links to an order that was migrated
    const [ord] = await conn.execute("SELECT id FROM a3s_orders WHERE old_id = ?", [r.P2]);
    const [cash] = await conn.execute("SELECT id FROM a3s_cash_entries WHERE old_id = ?", [Number(r.P1)]);
    console.log(`  ${r.C6} | $${Number(r.amt).toFixed(2)} | ${r.C2} | P1=${r.P1} | in_orders=${ord.length} | in_cash_by_oldid=${cash.length}`);
  }

  // Also check: is the reverse sync catching these? What's the last sync timestamp?
  const [sync] = await conn.execute("SELECT * FROM a3s_sync_state WHERE k = '_sync_old_ts'");
  console.log("\nSync state:");
  for (const r of sync) console.log(`  ${r.k}: ${r.v}`);

  // What's the T2 range of these huge-P1 records?
  const [t2Range] = await conn.execute(`
    SELECT MIN(T2) as minT2, MAX(T2) as maxT2 FROM T1200 
    WHERE Z1=1 AND Z2=1 AND P3='110' AND P1 > 1000000000000000000
  `);
  console.log(`\nHuge-P1 T1200 office records T2 range: ${t2Range[0]?.minT2} to ${t2Range[0]?.maxT2}`);

  // Try to find these in cash_entries by old_id instead of id
  const [byOldId] = await conn.execute("SELECT COUNT(*) as cnt FROM a3s_cash_entries WHERE old_id IS NOT NULL AND old_id > 1000000000000000000");
  console.log(`Cash entries with huge old_id: ${byOldId[0].cnt}`);

  await conn.end();
}
main().catch(console.error);

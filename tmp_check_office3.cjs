const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: '43.166.250.145', port: 3306, user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410', charset: 'utf8mb4',
  });

  // Check sync state
  const [sync] = await conn.execute("SELECT * FROM a3s_sync_state");
  console.log("=== Sync state ===");
  for (const r of sync) console.log(`  ${r.k}: ${String(r.v).slice(0,40)}`);

  // Check T2 on unmatched office records
  const [unmatched] = await conn.execute(`
    SELECT t.P1, t.C6, t.C5, t.C2, t.T1, t.T2, t.Z2
    FROM T1200 t WHERE t.Z1=1 AND t.P3='110' AND t.P1 > 1000000000000000000
    ORDER BY t.C6 DESC LIMIT 10
  `);
  console.log("\n=== Unmatched huge-P1 office records ===");
  for (const r of unmatched) console.log(`  P1=${r.P1} C6=${r.C6} amt=${Number(r.C5)/100} C2=${r.C2} T1=${r.T1} T2=${r.T2} Z2=${r.Z2}`);

  // Check: are there any huge P1 in cash_entries?
  const [hugeInCash] = await conn.execute("SELECT COUNT(*) as cnt FROM a3s_cash_entries WHERE old_id IS NOT NULL AND old_id > 1000000000000000000");
  console.log(`\nCash entries with huge old_id (> 1e18): ${hugeInCash[0].cnt}`);

  // What about exp- entries?
  const [hugeExp] = await conn.execute("SELECT COUNT(*) as cnt FROM a3s_expenses WHERE old_id IS NOT NULL AND old_id > 1000000000000000000");
  console.log(`Expenses with huge old_id (> 1e18): ${hugeExp[0].cnt}`);

  // Total T1200 records with huge P1
  const [hugeTotal] = await conn.execute("SELECT Z2, COUNT(*) as cnt FROM T1200 WHERE Z1=1 AND P1 > 1000000000000000000 GROUP BY Z2");
  console.log("\nT1200 records with huge P1:");
  for (const r of hugeTotal) console.log(`  Z2=${r.Z2}: ${r.cnt}`);

  // For these huge-P1 records, what's the smallest P1 (most recent migration/sync boundary)?
  const [minHugeP1] = await conn.execute("SELECT MIN(P1) as minP1 FROM T1200 WHERE Z1=1 AND P1 > 1000000000000000000");
  console.log(`\nEarliest huge P1 record: ${minHugeP1[0]?.minP1}`);
  const minMs = Number(minHugeP1[0]?.minP1 || 0) / 10000 - 62135596800000;
  console.log(`As Date: ${new Date(minMs).toISOString()}`);

  await conn.end();
}
main().catch(console.error);

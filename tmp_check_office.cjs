const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: '43.166.250.145', port: 3306,
    user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410', charset: 'utf8mb4',
  });

  // How many T1200 records have P3 = "110" (office flag)?
  const [officeRows] = await conn.execute("SELECT Z2, COUNT(*) as cnt FROM T1200 WHERE Z1=1 AND P3='110' GROUP BY Z2");
  console.log("=== T1200 office records (P3='110') ===");
  for (const r of officeRows) console.log(`  Z2=${r.Z2} (${r.Z2==1?'收入':'支出'}): ${r.cnt}`);

  // Total T1200 records
  const [total] = await conn.execute("SELECT COUNT(*) as cnt FROM T1200 WHERE Z1=1");
  console.log(`Total T1200 (Z1=1): ${total[0].cnt}`);

  // Today's T1200 records with P3="110"
  const [today] = await conn.execute("SELECT P1,P2,Z2,C5,C6,C3,C2 FROM T1200 WHERE Z1=1 AND P3='110' AND C6 >= 20260428 ORDER BY C6 DESC");
  console.log("\n=== Recent office records (P3='110') ===");
  for (const r of today) {
    const amt = Number(r.C5)/100;
    console.log(`  ${r.C6} | Z2=${r.Z2} | $${amt.toFixed(2).padStart(8)} | C2=${r.C2||''} | C3=${r.C3||''} | P1=${r.P1} P2=${r.P2}`);
  }

  // Also check T1210 (office transfer table)
  const [t1210] = await conn.execute("SELECT COUNT(*) as cnt FROM T1210 ORDER BY C6 DESC");
  console.log(`\nT1210 records: ${t1210[0].cnt}`);

  await conn.end();
}
main().catch(console.error);

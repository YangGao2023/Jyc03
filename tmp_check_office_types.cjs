const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: '43.166.250.145', port: 3306, user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410', charset: 'utf8mb4',
    supportBigNumbers: true, bigNumberStrings: true,
  });

  // 办公室收入用了哪些类型
  const [types] = await conn.execute(`
    SELECT t.P5, d.C4 as type_name, COUNT(*) as cnt, ROUND(SUM(t.C5)/100, 2) as total
    FROM T1200 t
    LEFT JOIN T1000 d ON t.P5 = d.P1
    WHERE t.P3=110 AND t.Z1=1 AND t.Z2=1
    GROUP BY t.P5 ORDER BY cnt DESC
  `);
  console.log("=== 办公室收入类型 ===");
  for (const r of types) console.log(`  P5=${r.P5}: ${r.type_name || '(无)'} — ${r.cnt}笔, $${r.total}`);

  // 办公室支出用了哪些类型
  const [expTypes] = await conn.execute(`
    SELECT t.P5, d.C4 as type_name, COUNT(*) as cnt, ROUND(SUM(t.C5)/100, 2) as total
    FROM T1200 t
    LEFT JOIN T1000 d ON t.P5 = d.P1
    WHERE t.P3=110 AND t.Z1=1 AND t.Z2=0
    GROUP BY t.P5 ORDER BY cnt DESC
  `);
  console.log("\n=== 办公室支出类型 ===");
  for (const r of expTypes) console.log(`  P5=${r.P5}: ${r.type_name || '(无)'} — ${r.cnt}笔, $${r.total}`);

  // T1210 样本
  const [t1210] = await conn.execute("SELECT * FROM T1210 WHERE Z1=1 LIMIT 3");
  console.log("\n=== T1210 样本 ===");
  for (const r of t1210) console.log(r);

  await conn.end();
}
main().catch(console.error);

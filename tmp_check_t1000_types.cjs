const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: '43.166.250.145', port: 3306, user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410', charset: 'utf8mb4',
    supportBigNumbers: true, bigNumberStrings: true,
  });

  // 1. 查完整的T1000支出类型字典
  const [dic] = await conn.execute(
    "SELECT P1, C4 FROM T1000 WHERE C1=3 AND C4 != ''"
  );
  const typeMap = {};
  for (const r of dic) typeMap[r.P1] = r.C4;
  console.log("T1000 支出类型字典共:", Object.keys(typeMap).length, "条");

  // 2. 查办公室支出的 P5 → 建议的类型名
  const [expTypes] = await conn.execute(`
    SELECT DISTINCT t.P5, d.C4 as type_name, COUNT(*) as cnt
    FROM T1200 t
    LEFT JOIN T1000 d ON t.P5 = d.P1
    WHERE t.P3=110 AND t.Z1=1 AND t.Z2=0
    GROUP BY t.P5 ORDER BY cnt DESC
  `);
  console.log("\n办公室支出(P5)分布:");
  for (const r of expTypes) {
    const suggested = typeMap[r.P5] || "(无匹配)";
    console.log(`  P5=${r.P5}: ${suggested} (当前expense_type示例), ${r.cnt}笔`);
  }

  // 3. 检查是否所有 P5 都匹配到了 T1000
  const missingP5 = expTypes.filter(r => !typeMap[r.P5]);
  console.log(`\n未匹配到T1000支出类型的P5: ${missingP5.length}个`);
  for (const r of missingP5) console.log(`  P5=${r.P5}: ${r.cnt}笔`);

  // 4. T1000 收入类型字典
  const [incDic] = await conn.execute(
    "SELECT P1, C4 FROM T1000 WHERE C1=2 AND C4 != ''"
  );
  const incTypeMap = {};
  for (const r of incDic) incTypeMap[r.P1] = r.C4;
  console.log("\nT1000 收入类型字典共:", Object.keys(incTypeMap).length, "条");

  const [incTypes] = await conn.execute(`
    SELECT DISTINCT t.P5, d.C4 as type_name, COUNT(*) as cnt
    FROM T1200 t
    LEFT JOIN T1000 d ON t.P5 = d.P1
    WHERE t.P3=110 AND t.Z1=1 AND t.Z2=1
    GROUP BY t.P5 ORDER BY cnt DESC
  `);
  console.log("\n办公室收入(P5)分布:");
  for (const r of incTypes) {
    const suggested = incTypeMap[r.P5] || "(无匹配)";
    console.log(`  P5=${r.P5}: ${suggested}, ${r.cnt}笔`);
  }

  // 5. T1000 类型分布完整统计
  const [allTypes] = await conn.execute(
    "SELECT C1, C3, COUNT(*) as cnt FROM T1000 GROUP BY C1, C3 ORDER BY C1"
  );
  console.log("\nT1000 全部类型分布:");
  for (const r of allTypes) {
    console.log(`  C1=${r.C1}: ${r.C3} — ${r.cnt}条`);
  }

  await conn.end();
}
main().catch(console.error);

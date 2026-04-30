const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: '43.166.250.145', port: 3306, user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410', charset: 'utf8mb4',
    supportBigNumbers: true, bigNumberStrings: true,
  });

  // T1200中办公室账套(110)的记录总数
  const [officeInT1200] = await conn.execute(
    "SELECT Z2, COUNT(*) as cnt, ROUND(SUM(C5)/100, 2) as total FROM T1200 WHERE P3=110 AND Z1=1 GROUP BY Z2"
  );
  console.log("=== T1200办公室账套(P3=110)记录 ===");
  for (const r of officeInT1200) {
    const label = r.Z2 === 1 ? "收入" : "支出";
    console.log(`  ${label}: ${r.cnt}笔, $${r.total}`);
  }

  // 检查a3s_cash_entries中office=1是否匹配
  const [ceOffice] = await conn.execute(
    `SELECT COUNT(*) as cnt, ROUND(SUM(amount), 2) as total FROM a3s_cash_entries WHERE office=1`
  );
  console.log(`\n=== a3s_cash_entries office=1: ${ceOffice[0].cnt}笔, $${ceOffice[0].total}`);

  const [expOffice] = await conn.execute(
    `SELECT COUNT(*) as cnt, ROUND(SUM(amount), 2) as total FROM a3s_expenses WHERE office=1`
  );
  console.log(`=== a3s_expenses office=1: ${expOffice[0].cnt}笔, $${expOffice[0].total}`);

  // 是否有T1200.P3=110但a3s_表没标办公室的？
  const [missingInc] = await conn.execute(`
    SELECT COUNT(*) as cnt FROM T1200 t
    INNER JOIN a3s_cash_entries c ON c.old_id = t.P1 AND c.type='收入'
    WHERE t.P3=110 AND t.Z1=1 AND t.Z2=1 AND c.office=0
  `);
  console.log(`\n=== 漏标的办公室收入(T1200.P3=110 但 cash_entries.office=0): ${missingInc[0].cnt}笔`);

  const [missingExp] = await conn.execute(`
    SELECT COUNT(*) as cnt FROM T1200 t
    INNER JOIN a3s_expenses e ON e.old_id = t.P1
    WHERE t.P3=110 AND t.Z1=1 AND t.Z2=0 AND e.office=0
  `);
  console.log(`=== 漏标的办公室支出(T1200.P3=110 但 expenses.office=0): ${missingExp[0].cnt}笔`);

  // T1210数据
  const [t1210] = await conn.execute(
    "SELECT Z2, COUNT(*) as cnt, ROUND(SUM(C2)/100, 2) as total FROM T1210 WHERE Z1=1 GROUP BY Z2"
  );
  console.log(`\n=== T1210现金调拨记录(活跃) ===`);
  for (const r of t1210) {
    const label = r.Z2 === 1 ? "转入" : "转出";
    console.log(`  ${label}: ${r.cnt}笔, $${r.total}`);
  }

  await conn.end();
}
main().catch(console.error);

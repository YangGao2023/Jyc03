const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: '43.166.250.145', port: 3306, user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410', charset: 'utf8mb4',
    supportBigNumbers: true, bigNumberStrings: true,
  });

  // 1. 建 a3s_office_transfers 表
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS a3s_office_transfers (
      id VARCHAR(64) PRIMARY KEY,
      type VARCHAR(10) NOT NULL DEFAULT '转入',
      amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      date DATE NOT NULL,
      note VARCHAR(200) NOT NULL DEFAULT '',
      old_id BIGINT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log("✅ a3s_office_transfers 表已创建");

  // 2. 导入 T1210 到 a3s_office_transfers
  const [t1210rows] = await conn.execute("SELECT * FROM T1210 WHERE Z1=1");
  let transferCount = 0;
  for (const t of t1210rows) {
    const id = `transfer-${String(t.P1)}`;
    const type = t.Z2 === 1 ? "转入" : "转出";
    const amount = Number(t.C2) / 100;
    const ymd = String(t.C3);
    const date = ymd.length === 8 ? `${ymd.slice(0,4)}-${ymd.slice(4,6)}-${ymd.slice(6,8)}` : ymd;
    const note = String(t.C4 || "");
    await conn.execute(
      `INSERT INTO a3s_office_transfers(id, type, amount, date, note, old_id)
       VALUES(?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE type=VALUES(type), amount=VALUES(amount), date=VALUES(date), note=VALUES(note)`,
      [id, type, amount, date, note, t.P1]
    );
    transferCount++;
  }
  console.log(`✅ T1210 导入: ${transferCount}条`);

  // 3. 回填办公室收入类型（category 字段）
  // 先建 P5 → C4 映射
  const [incTypes] = await conn.execute("SELECT P1, C4 FROM T1000 WHERE C1=2");
  const incMap = {};
  for (const r of incTypes) incMap[r.P1] = r.C4;

  // 对每个有 P5 的办公室收入记录进行回填
  const [incRows] = await conn.execute(
    "SELECT t.P1, t.P5 FROM T1200 t WHERE t.P3=110 AND t.Z1=1 AND t.Z2=1 AND t.P5 > 0"
  );
  let incUpdated = 0;
  for (const r of incRows) {
    const typeName = incMap[r.P5];
    if (!typeName) continue;
    await conn.execute(
      `UPDATE a3s_cash_entries SET category=? WHERE old_id=? AND type='收入' AND office=1`,
      [typeName, r.P1]
    );
    incUpdated++;
  }
  console.log(`✅ 办公室收入类型回填: ${incUpdated}条`);

  // 4. 回填办公室支出类型（expense_type 字段）
  const [expTypes] = await conn.execute("SELECT P1, C4 FROM T1000 WHERE C1=3");
  const expMap = {};
  for (const r of expTypes) expMap[r.P1] = r.C4;

  const [expRows] = await conn.execute(
    "SELECT t.P1, t.P5 FROM T1200 t WHERE t.P3=110 AND t.Z1=1 AND t.Z2=0 AND t.P5 > 0"
  );
  let expUpdated = 0;
  for (const r of expRows) {
    const typeName = expMap[r.P5];
    if (!typeName) continue;
    await conn.execute(
      `UPDATE a3s_expenses SET expense_type=? WHERE old_id=? AND office=1`,
      [typeName, r.P1]
    );
    expUpdated++;
  }
  console.log(`✅ 办公室支出类型回填: ${expUpdated}条`);

  // 5. 验证
  const [incCheck] = await conn.execute(
    "SELECT category, COUNT(*) as cnt FROM a3s_cash_entries WHERE office=1 AND type='收入' GROUP BY category ORDER BY cnt DESC"
  );
  console.log("\n=== 回填后办公室收入类型分布 ===");
  for (const r of incCheck) console.log(`  ${r.category || '(空)'}: ${r.cnt}笔`);

  const [expCheck] = await conn.execute(
    "SELECT expense_type, COUNT(*) as cnt FROM a3s_expenses WHERE office=1 GROUP BY expense_type ORDER BY cnt DESC LIMIT 20"
  );
  console.log("\n=== 回填后办公室支出类型分布(前20) ===");
  for (const r of expCheck) console.log(`  ${r.expense_type}: ${r.cnt}笔`);

  const [transferCheck] = await conn.execute("SELECT type, COUNT(*) as cnt, ROUND(SUM(amount),2) as total FROM a3s_office_transfers GROUP BY type");
  console.log("\n=== 转账记录 ===");
  for (const r of transferCheck) console.log(`  ${r.type}: ${r.cnt}笔, $${r.total}`);

  await conn.end();
}
main().catch(console.error);

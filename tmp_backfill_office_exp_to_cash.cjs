const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: '43.166.250.145', port: 3306, user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410', charset: 'utf8mb4',
    supportBigNumbers: true, bigNumberStrings: true,
  });

  // 查已有office-exp前缀的cash entries
  const [existing] = await conn.execute("SELECT COUNT(*) as cnt FROM a3s_cash_entries WHERE id LIKE 'office-exp-%'");
  console.log(`已有office-exp cash entries: ${existing[0].cnt}条`);

  // 读T1200办公室支出 → a3s_expenses → 写入a3s_cash_entries
  const [rows] = await conn.execute(`
    SELECT t.P1, t.C3, t.C4, t.C5, t.C6, t.C7, t.P5,
           e.id as expense_id, e.amount, e.expense_type, e.payment_method, e.expense_date, e.detail
    FROM T1200 t
    INNER JOIN a3s_expenses e ON e.old_id = t.P1
    WHERE t.P3=110 AND t.Z1=1 AND t.Z2=0 AND e.office=1
  `);
  console.log(`待处理的办公室支出: ${rows.length}条`);

  // 预加载T1000类型字典
  const [expTypes] = await conn.execute("SELECT P1, C4 FROM T1000 WHERE C1=3");
  const typeMap = {};
  for (const r of expTypes) typeMap[r.P1] = r.C4;

  let count = 0;
  for (const r of rows) {
    const isExisting = r.payment_method && r.amount && r.expense_date;
    const ymd = String(r.C6 || "");
    const date = ymd.length === 8 ? `${ymd.slice(0,4)}-${ymd.slice(4,6)}-${ymd.slice(6,8)}` : r.expense_date || "";
    const typeName = typeMap[r.P5] || r.expense_type || String(r.C3 || "");

    await conn.execute(
      `INSERT INTO a3s_cash_entries(id, type, amount, date, method, note, office, category, source_type, source_id, old_id)
       VALUES(?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         type=VALUES(type), amount=VALUES(amount), date=VALUES(date),
         method=VALUES(method), note=VALUES(note), office=VALUES(office),
         category=VALUES(category), source_type=VALUES(source_type)`,
      [`office-exp-${String(r.P1)}`, "支出", isExisting ? Number(r.amount) : Number(r.C5)/100, date,
       r.payment_method || "现金", String(r.C7 || r.C3 || ""), 1,
       typeName, "expense", r.expense_id || `exp-${String(r.P1)}`, r.P1]
    );
    count++;
  }
  console.log(`✅ 办公室支出写入cash_entries: ${count}条`);

  // 验证
  const [check] = await conn.execute(
    "SELECT type, category, COUNT(*) as cnt FROM a3s_cash_entries WHERE office=1 GROUP BY type, category ORDER BY type, cnt DESC"
  );
  console.log("\n办公室 tab 数据总览:");
  for (const r of check) {
    console.log(`  ${r.type}${r.category ? ` (${r.category})` : ''}: ${r.cnt}笔`);
  }

  await conn.end();
}
main().catch(console.error);

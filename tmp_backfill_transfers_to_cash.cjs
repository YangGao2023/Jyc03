const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: '43.166.250.145', port: 3306, user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410', charset: 'utf8mb4',
    supportBigNumbers: true, bigNumberStrings: true,
  });

  const fromYmd = (s) => {
    if (!s || s.length !== 8) return s || "";
    return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
  };

  const [t1210rows] = await conn.execute("SELECT * FROM T1210 WHERE Z1=1");
  let count = 0;
  for (const t of t1210rows) {
    const id = `transfer-${String(t.P1)}`;
    const type = t.Z2 === 1 ? "转入" : "转出";
    const amount = Number(t.C2) / 100;
    const date = fromYmd(String(t.C3 || ""));
    const note = String(t.C4 || "");

    await conn.execute(
      `INSERT INTO a3s_cash_entries(id, type, amount, date, method, note, office, source_type, old_id)
       VALUES(?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         type=VALUES(type), amount=VALUES(amount), date=VALUES(date),
         method=VALUES(method), note=VALUES(note), office=VALUES(office), source_type=VALUES(source_type)`,
      [id, type, amount, date, "现金", note, 1, "office-transfer", t.P1]
    );
    count++;
  }
  console.log(`✅ T1210写入a3s_cash_entries: ${count}条`);

  // 验证
  const [check] = await conn.execute(
    "SELECT type, COUNT(*) as cnt, ROUND(SUM(amount),2) as total FROM a3s_cash_entries WHERE source_type='office-transfer' GROUP BY type"
  );
  console.log("\n验证:");
  for (const r of check) console.log(`  ${r.type}: ${r.cnt}笔, $${r.total}`);

  console.log("\n✅ 完成");
  await conn.end();
}
main().catch(console.error);

/**
 * Sync office data from old system:
 * 1. T1200.P3='110' → mark cash_entries.office=1
 * 2. T1210 → insert into a3s_cash_entries (source_type='office-transfer', office=1)
 */
const mysql = require('mysql2/promise');

const METHOD_MAP = { 1: '现金', 2: '支票', 3: '转账', 4: '刷卡' };

async function main() {
  const pool = mysql.createPool({
    host: '43.166.250.145', port: 3306,
    user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410',
    connectionLimit: 5,
    supportBigNumbers: true, bigNumberStrings: true,
  });

  // ===== 1. Sync T1210 → a3s_cash_entries (office-transfer) =====
  const [t1210rows] = await pool.execute("SELECT * FROM T1210 WHERE Z1=1");
  let t1210Count = 0;
  for (const r of t1210rows) {
    const id = `transfer-${String(r.P1)}`;
    // Z2=1 → 转入, Z2=0 → 转出
    const type = Number(r.Z2) === 1 ? "转入" : "转出";
    const amount = Number(r.C2) / 100;
    // C3 = yyyyMMdd date
    const date = String(r.C3 || "").length >= 8 
      ? `${String(r.C3).slice(0,4)}-${String(r.C3).slice(4,6)}-${String(r.C3).slice(6,8)}`
      : "";
    const note = String(r.C4 || "");

    await pool.execute(
      `INSERT INTO a3s_cash_entries(id, type, amount, date, method, note, office, source_type, old_id)
       VALUES(?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         type=VALUES(type), amount=VALUES(amount), date=VALUES(date),
         method=VALUES(method), note=VALUES(note), office=VALUES(office),
         source_type=VALUES(source_type)`,
      [id, type, amount, date, "现金", note, 1, "office-transfer", r.P1]
    );
    t1210Count++;
  }
  console.log(`T1210 → a3s_cash_entries: ${t1210Count} 条`);

  // ===== 2. Mark T1200.P3='110' entries as office =====
  // First get all T1200 P3='110' entries and match by old_id
  const [t1200OfficeRows] = await pool.execute(
    "SELECT P1, Z2, C5, C6, C7, C4 FROM T1200 WHERE Z1=1 AND P3='110'"
  );
  console.log(`T1200 P3='110': ${t1200OfficeRows.length} 条`);

  // Match by old_id and update office flag
  let t1200MatchIncome = 0;
  let t1200MatchExpense = 0;
  for (const r of t1200OfficeRows) {
    try {
      const [res] = await pool.execute(
        "UPDATE a3s_cash_entries SET office=1 WHERE old_id=? AND office=0 LIMIT 1",
        [r.P1]
      );
      if (res.affectedRows > 0) {
        if (Number(r.Z2) === 1) t1200MatchIncome++;
        else t1200MatchExpense++;
      }
    } catch (e) {
      // Might not exist if P1 is too large for old_id
    }
  }

  // For entries that didn't match via old_id (e.g., P1 exceeds bigint range),
  // use P1 directly from T1200 (which has P3='110')
  // Since migration script uses INSERT IGNORE with id='inc-{P1}', match by id
  let byId = 0;
  for (const r of t1200OfficeRows) {
    const entryId = Number(r.Z2) === 1 ? `inc-${r.P1}` : null; // income entries only
    if (entryId) {
      const [res] = await pool.execute(
        "UPDATE a3s_cash_entries SET office=1 WHERE id=? AND office=0 LIMIT 1",
        [entryId]
      );
      if (res.affectedRows > 0) byId++;
    }
  }

  console.log(`  → income office=1 (old_id match): ${t1200MatchIncome}`);
  console.log(`  → expense office=1 (old_id match): ${t1200MatchExpense}`);
  console.log(`  → income office=1 (id match): ${byId}`);

  // ===== 3. Handle expenses table too =====
  let expOffice = 0;
  for (const r of t1200OfficeRows) {
    if (Number(r.Z2) !== 0) continue; // only expense direction
    const method = METHOD_MAP[Number(r.C4)] || '现金';
    // Check if already exists in a3s_expenses
    const [existing] = await pool.execute(
      "SELECT id FROM a3s_expenses WHERE old_id=? LIMIT 1",
      [r.P1]
    );
    if (existing.length > 0) {
      const [res] = await pool.execute(
        "UPDATE a3s_expenses SET office=1 WHERE old_id=? AND office=0 LIMIT 1",
        [r.P1]
      );
      if (res.affectedRows > 0) expOffice++;
    } else {
      // Insert new expense
      const note = r.C7 || r.C3 || '';
      const date = String(r.C6 || "").length >= 8 
        ? `${String(r.C6).slice(0,4)}-${String(r.C6).slice(4,6)}-${String(r.C6).slice(6,8)}`
        : "";
      await pool.execute(
        `INSERT IGNORE INTO a3s_expenses(id, target, detail, amount, expense_type, payment_method, expense_date, office, old_id)
         VALUES(?,?,?,?,?,?,?,?,?)`,
        [`exp-${r.P1}`, '', note, Number(r.C5)/100, '其他', method, date, 1, r.P1]
      );
      expOffice++;
    }
  }
  console.log(`  → a3s_expenses office=1: ${expOffice}`);

  // ===== 4. Verify =====
  const [officeCash] = await pool.execute(
    "SELECT type, COUNT(*) as cnt, ROUND(SUM(amount),2) as total FROM a3s_cash_entries WHERE office=1 GROUP BY type"
  );
  console.log('\n=== 验证办公室现金 ===');
  let balance = 0;
  for (const r of officeCash) {
    console.log(`  ${r.type}: ${r.cnt} 笔, $${r.total}`);
    if (r.type === '收入' || r.type === '转入') balance += Number(r.total);
    else balance -= Number(r.total);
  }
  console.log(`办公室余额: $${balance.toFixed(2)}`);

  const [officeExp] = await pool.execute(
    "SELECT COUNT(*) as cnt, ROUND(SUM(amount),2) as total FROM a3s_expenses WHERE office=1"
  );
  console.log(`办公室支出记录: ${officeExp[0].cnt} 笔, $${officeExp[0].total}`);

  await pool.end();
}
main().catch(err => { console.error(err); process.exit(1); });

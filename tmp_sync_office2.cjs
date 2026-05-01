const mysql = require('mysql2/promise');
async function main() {
  const pool = mysql.createPool({
    host:'43.166.250.145',port:3306,user:'dbo001',password:'BDQN123456',
    database:'db_zhty202410',connectionLimit:5,
    supportBigNumbers:true, bigNumberStrings:true,
  });

  // ===== 1. T1210 → a3s_cash_entries (office-transfer) =====
  const [t1210rows] = await pool.execute("SELECT * FROM T1210 WHERE Z1=1");
  let t1210Cnt = 0;
  for (const r of t1210rows) {
    const p1 = String(r.P1);
    const type = Number(r.Z2)===1 ? "转入" : "转出";
    const amt = Number(r.C2)/100;
    const date = String(r.C3||"").length>=8
      ? `${String(r.C3).slice(0,4)}-${String(r.C3).slice(4,6)}-${String(r.C3).slice(6,8)}` : "";
    await pool.execute(
      `INSERT INTO a3s_cash_entries(id,type,amount,date,method,note,office,source_type,old_id)
       VALUES(?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE type=VALUES(type),amount=VALUES(amount),
         date=VALUES(date),note=VALUES(note),office=VALUES(office),source_type=VALUES(source_type)`,
      [`transfer-${p1}`, type, amt, date, "现金", r.C4||'', 1, "office-transfer", parseInt(p1)]
    );
    t1210Cnt++;
  }
  console.log(`T1210 → cash_entries: ${t1210Cnt}`);

  // ===== 2. T1200 P3='110' income → mark cash_entries office=1 =====
  const [incRows] = await pool.execute(
    "SELECT P1, C5, C6, C7, C3 FROM T1200 WHERE Z1=1 AND P3='110' AND Z2=1"
  );
  // Bulk update by id pattern
  let incUpdated = 0, incInserted = 0;
  for (const r of incRows) {
    const p1 = String(r.P1);
    const entryId = `inc-${p1}`;
    const [res] = await pool.execute(
      "UPDATE a3s_cash_entries SET office=1 WHERE id=? AND office=0 LIMIT 1",
      [entryId]
    );
    if (res.affectedRows > 0) { incUpdated++; continue; }
    // Not found → might not have been synced; insert it
    const amt = Number(r.C5)/100;
    const date = String(r.C6||"").length>=8
      ? `${String(r.C6).slice(0,4)}-${String(r.C6).slice(4,6)}-${String(r.C6).slice(6,8)}` : "";
    const note = r.C7 || r.C3 || '';
    await pool.execute(
      `INSERT IGNORE INTO a3s_cash_entries(id,type,amount,date,method,note,office,source_type,old_id)
       VALUES(?,?,?,?,?,?,?,?,?)`,
      [entryId, '收入', amt, date, '现金', note, 1, 't1200', BigInt(p1)]
    );
    if (res.affectedRows || true) incInserted++;
  }
  console.log(`T1200 income office=1: ${incUpdated} updated, ${incInserted} inserted`);

  // ===== 3. T1200 P3='110' expense → mark/insert a3s_expenses office=1 =====
  const [expRows] = await pool.execute(
    "SELECT P1, C4, C5, C6, C7, C3, C2 FROM T1200 WHERE Z1=1 AND P3='110' AND Z2=0"
  );
  const METHOD_MAP = {1:'现金',2:'支票',3:'转账',4:'刷卡'};
  let expUpdated = 0, expInserted = 0;
  for (const r of expRows) {
    const p1 = String(r.P1);
    const expId = `exp-${p1}`;
    const [res] = await pool.execute(
      "UPDATE a3s_expenses SET office=1 WHERE id=? AND office=0 LIMIT 1",
      [expId]
    );
    if (res.affectedRows > 0) { expUpdated++; continue; }
    const amt = Number(r.C5)/100;
    const date = String(r.C6||"").length>=8
      ? `${String(r.C6).slice(0,4)}-${String(r.C6).slice(4,6)}-${String(r.C6).slice(6,8)}` : "";
    const note = r.C7 || r.C3 || '';
    const method = METHOD_MAP[Number(r.C4)] || '现金';
    await pool.execute(
      `INSERT IGNORE INTO a3s_expenses(id,target,detail,amount,expense_type,payment_method,expense_date,office,old_id)
       VALUES(?,?,?,?,?,?,?,?,?)`,
      [expId, r.C2||'', note, amt, '办公室', method, date, 1, BigInt(p1)]
    );
    expInserted++;
  }
  console.log(`T1200 expense office=1: ${expUpdated} updated, ${expInserted} inserted`);

  // ===== 4. Verify =====
  const [oc] = await pool.execute(
    "SELECT type, COUNT(*) as cnt, ROUND(SUM(amount),2) as total FROM a3s_cash_entries WHERE office=1 GROUP BY type"
  );
  console.log('\n=== 办公室现金 ===');
  let bal = 0;
  for (const r of oc) {
    console.log(`  ${r.type}: ${r.cnt}笔, $${r.total}`);
    if (r.type==='收入'||r.type==='转入') bal+=Number(r.total);
    else bal-=Number(r.total);
  }
  console.log(`办公室余额: $${bal.toFixed(2)}`);

  const [oe] = await pool.execute("SELECT COUNT(*) as cnt, ROUND(SUM(amount),2) as total FROM a3s_expenses WHERE office=1");
  console.log(`\n办公室支出: ${oe[0].cnt}笔, $${oe[0].total}`);
  console.log(`办公室(含支出): $${(bal - Number(oe[0].total)).toFixed(2)}`);

  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });

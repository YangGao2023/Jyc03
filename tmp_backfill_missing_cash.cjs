const mysql = require('mysql2/promise');
(async () => {
  const c = await mysql.createConnection({
    host:'43.166.250.145', port:3306,
    user:'dbo001', password:'BDQN123456',
    database:'db_zhty202410',
    supportBigNumbers: true, bigNumberStrings: true,
  });

  // 找出已存在 a3s_cash_entries 的 old_id 集合（限制不要重复）
  const [existing] = await c.execute("SELECT old_id FROM a3s_cash_entries WHERE source_type='t1200' AND old_id IS NOT NULL");
  const existingSet = new Set(existing.map(r => String(r.old_id)));

  // 找出旧系统所有 Z1=1 但不在 a3s_cash_entries 的记录
  const [missing] = await c.execute(
    "SELECT P1, C1, C2, C3, C4, C5, C6, C7, P2, P3, P5, Z2 FROM T1200 WHERE Z1=1"
  );
  console.log('T1200(Z1=1) 总记录:', missing.length);
  console.log('a3s_cash_entries 已有:', existingSet.size);

  let incAdded = 0, expAdded = 0, salAdded = 0;

  for (const t of missing) {
    const p1 = String(t.P1);
    if (existingSet.has(p1)) continue;

    const isIncome = Number(t.Z2) === 1;
    const amount = Number(t.C5) / 100;
    const isOffice = String(t.P3 || "") === "110" ? 1 : 0;
    const date = t.C6 ? `${t.C6.slice(0,4)}-${t.C6.slice(4,6)}-${t.C6.slice(6,8)}` : '';

    if (isIncome) {
      const c1 = Number(t.C1);
      if (c1 === 3) continue; // C1=3 salary income is weird, skip

      await c.execute(
        `INSERT IGNORE INTO a3s_cash_entries(id, type, amount, date, method, note, office, source_type, source_id, old_id)
         VALUES(?,?,?,?,?,?,?,?,?,?)`,
        [`inc-${p1}`, '收入', amount, date,
         '现金', String(t.C7 || t.C3 || ''), isOffice,
         't1200', p1, p1]
      );
      incAdded++;
    } else {
      // 支出：同步到 a3s_expenses 和 a3s_cash_entries
      await c.execute(
        `INSERT IGNORE INTO a3s_expenses(id, amount, expense_date, payment_method, target, detail, expense_type, remark, office, old_id)
         VALUES(?,?,?,?,?,?,?,?,?,?)`,
        [`exp-${p1}`, amount, date,
         '现金', String(t.C2 || ''), String(t.C3 || t.C2 || ''),
         String(t.C3 || t.C2 || ''), String(t.C7 || ''), isOffice, p1]
      );
      expAdded++;

      // 办公室支出同步到 a3s_cash_entries 方便统一展示
      if (isOffice) {
        await c.execute(
          `INSERT IGNORE INTO a3s_cash_entries(id, type, amount, date, method, note, office, source_type, source_id, old_id)
           VALUES(?,?,?,?,?,?,?,?,?,?)`,
          [`office-exp-${p1}`, '支出', amount, date,
           '现金', String(t.C7 || t.C3 || ''), 1,
           'expense', `exp-${p1}`, p1]
        );
      }
    }
  }

  console.log('\n补同步结果:');
  console.log('  新增收入:', incAdded);
  console.log('  新增支出:', expAdded);

  // 验证余额
  const [rNew] = await c.execute(
    "SELECT SUM(CASE WHEN type='收入' THEN amount WHEN type='支出' THEN -amount ELSE 0 END) as bal FROM a3s_cash_entries"
  );
  const [rOld] = await c.execute(
    "SELECT SUM(CASE WHEN Z2=1 THEN C5 WHEN Z2=0 OR C1=3 THEN -C5 ELSE 0 END)/100 as bal FROM T1200 WHERE Z1=1"
  );
  console.log('\n补完后:');
  console.log('  新系统余额:', Number(rNew[0].bal).toFixed(2));
  console.log('  旧系统余额:', Number(rOld[0].bal).toFixed(2));
  console.log('  差异:', (Number(rNew[0].bal) - Number(rOld[0].bal)).toFixed(2));

  await c.end();
})();

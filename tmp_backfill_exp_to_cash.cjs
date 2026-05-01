const mysql = require('mysql2/promise');
(async () => {
  const c = await mysql.createConnection({
    host:'43.166.250.145', port:3306,
    user:'dbo001', password:'BDQN123456',
    database:'db_zhty202410',
    supportBigNumbers: true, bigNumberStrings: true,
  });

  // 找出所有 T1200 Z2=0 非工资且未在 a3s_cash_entries 的支出
  const [missing] = await c.execute(`
    SELECT t.P1, t.C1, t.C2, t.C3, t.C4, t.C5, t.C6, t.C7, t.P3
    FROM T1200 t
    WHERE t.Z1=1 AND t.Z2=0 AND t.C1 != 3
      AND NOT EXISTS (
        SELECT 1 FROM a3s_cash_entries c
        WHERE c.old_id = t.P1 AND c.source_type = 'expense'
      )
  `);
  console.log('需要补回 a3s_cash_entries 的非工资支出:', missing.length, '条');

  let added = 0, errored = 0;
  for (const r of missing) {
    try {
      const p1 = String(r.P1);
      const isOffice = String(r.P3 || '') === '110' ? 1 : 0;
      const ceId = isOffice ? `office-exp-${p1}` : `exp-${p1}`;
      await c.execute(
        `INSERT IGNORE INTO a3s_cash_entries(id,type,amount,date,method,note,office,category,source_type,source_id,old_id)
         VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
        [ceId, '支出', Number(r.C5)/100,
         r.C6 ? `${String(r.C6).slice(0,4)}-${String(r.C6).slice(4,6)}-${String(r.C6).slice(6,8)}` : '',
         '现金', String(r.C7 || r.C3 || ''), isOffice,
         String(r.C3 || r.C2 || ''), 'expense', `exp-${p1}`, p1]
      );
      added++;
    } catch(e) {
      errored++;
    }
  }
  console.log('  新增:', added, '失败:', errored);

  // 验证
  const [rNew] = await c.execute(
    "SELECT SUM(CASE WHEN type='收入' THEN amount WHEN type='支出' THEN -amount ELSE 0 END) as bal FROM a3s_cash_entries"
  );
  const [rOld] = await c.execute(
    "SELECT SUM(CASE WHEN Z2=1 THEN C5 WHEN Z2=0 OR C1=3 THEN -C5 ELSE 0 END)/100 as bal FROM T1200 WHERE Z1=1"
  );
  console.log('\n=== 余额对比 ===');
  console.log('新系统 a3s_cash_entries:', Number(rNew[0].bal).toFixed(2));
  console.log('旧系统 T1200:', Number(rOld[0].bal).toFixed(2));
  console.log('差异:', (Number(rNew[0].bal) - Number(rOld[0].bal)).toFixed(2));

  await c.end();
})();

const mysql = require('mysql2/promise');
(async () => {
  const c = await mysql.createConnection({
    host:'43.166.250.145', port:3306,
    user:'dbo001', password:'BDQN123456',
    database:'db_zhty202410',
    supportBigNumbers: true, bigNumberStrings: true,
  });

  // Count C1=3 records already in a3s_cash_entries
  const [existing] = await c.execute("SELECT COUNT(*) as cnt FROM a3s_cash_entries WHERE source_type='t1200-salary'");
  console.log('已在 a3s_cash_entries 中的工资:', existing[0].cnt, '条');

  // Total C1=3 records in T1200
  const [total] = await c.execute("SELECT COUNT(*) as cnt, SUM(C5)/100 as total FROM T1200 WHERE Z1=1 AND C1=3");
  console.log('T1200 总工资:', total[0].cnt, '条,', Number(total[0].total).toFixed(2));

  // C1=3 with P2 > 0 (what migration section 9 checks)
  const [p2gt0] = await c.execute("SELECT COUNT(*) as cnt, SUM(C5)/100 as total FROM T1200 WHERE Z1=1 AND C1=3 AND P2 > 0");
  console.log('T1200 工资 P2>0:', p2gt0[0].cnt, '条,', Number(p2gt0[0].total).toFixed(2));

  // C1=3 with P2 = 0 or null
  const [p2zero] = await c.execute("SELECT COUNT(*) as cnt, SUM(C5)/100 as total FROM T1200 WHERE Z1=1 AND C1=3 AND (P2 IS NULL OR P2 = 0 OR P2 = '')");
  console.log('T1200 工资 P2=0:', p2zero[0].cnt, '条,', Number(p2zero[0].total).toFixed(2));

  // Z2 distribution
  const [z2dist] = await c.execute("SELECT Z2, COUNT(*) as cnt, SUM(C5)/100 as total FROM T1200 WHERE Z1=1 AND C1=3 GROUP BY Z2");
  console.log('\nC1=3 按 Z2 分布:');
  for (const r of z2dist) console.log(' Z2='+r.Z2, ':', r.cnt, '条,', Number(r.total).toFixed(2));

  // Now backfill missing salary to a3s_cash_entries
  const [missing] = await c.execute(`
    SELECT t.P1, t.C2, t.C3, t.C4, t.C5, t.C6, t.C7, t.P3, t.Z2
    FROM T1200 t
    WHERE t.Z1=1 AND t.C1=3
      AND NOT EXISTS (
        SELECT 1 FROM a3s_cash_entries c
        WHERE c.old_id = t.P1 AND c.source_type = 't1200-salary'
      )
  `);
  console.log('\n需要补的工资:', missing.length, '条');
  let added = 0;
  for (const r of missing) {
    try {
      const p1 = String(r.P1);
      await c.execute(
        `INSERT IGNORE INTO a3s_cash_entries(id,type,amount,date,method,note,office,source_type,source_id,old_id)
         VALUES(?,?,?,?,?,?,?,?,?,?)`,
        [`sal-${p1}`, '支出', Number(r.C5)/100,
         r.C6 ? `${String(r.C6).slice(0,4)}-${String(r.C6).slice(4,6)}-${String(r.C6).slice(6,8)}` : '',
         '现金', String(r.C7 || r.C3 || ''), 0,
         't1200-salary', p1, p1]
      );
      added++;
    } catch(e) {
      console.error('  E:', p1, e.message);
    }
  }
  console.log('  新增:', added);

  // Final balance check
  const [rNew] = await c.execute(
    "SELECT SUM(CASE WHEN type='收入' THEN amount WHEN type='支出' THEN -amount ELSE 0 END) as bal FROM a3s_cash_entries"
  );
  const [rOld] = await c.execute(
    "SELECT SUM(CASE WHEN Z2=1 THEN C5 WHEN Z2=0 OR C1=3 THEN -C5 ELSE 0 END)/100 as bal FROM T1200 WHERE Z1=1"
  );
  console.log('\n=== 最终余额 ===');
  console.log('新系统:', Number(rNew[0].bal).toFixed(2));
  console.log('旧系统:', Number(rOld[0].bal).toFixed(2));
  console.log('差异:', (Number(rNew[0].bal) - Number(rOld[0].bal)).toFixed(2));

  await c.end();
})();

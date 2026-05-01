const mysql = require('mysql2/promise');
(async()=>{
  const c = await mysql.createConnection({host:'43.166.250.145',port:3306,user:'dbo001',password:'BDQN123456',database:'db_zhty202410',supportBigNumbers:true,bigNumberStrings:true});

  // Fix: salary records (source_type=t1200-salary) with P3='110' should have office=1
  const [r] = await c.execute(`
    UPDATE a3s_cash_entries c
    INNER JOIN T1200 t ON c.old_id = t.P1
    SET c.office = 1
    WHERE t.Z1=1 AND t.C1=3 AND t.P3='110' AND c.source_type='t1200-salary' AND c.office=0
  `);
  console.log('修复 salary+P3=110 records:', r.affectedRows, '条');

  // Verify office totals
  const [r2] = await c.execute(
    "SELECT COUNT(*) as cnt, SUM(amount) as total FROM a3s_cash_entries WHERE office=1"
  );
  console.log('\n修复后 cash_entries office=1:', r2[0].cnt, '条,', Number(r2[0].total).toFixed(2));

  // Check if any remain
  const [r3] = await c.execute(`
    SELECT COUNT(*) as cnt, SUM(t.C5)/100 as total
    FROM T1200 t
    INNER JOIN a3s_cash_entries c ON c.old_id = t.P1
    WHERE t.Z1=1 AND t.Z2=0 AND t.P3='110' AND c.office=0
  `);
  console.log('\n剩余 P3=110 但 cash_entries office=0:', r3[0].cnt, '条,', Number(r3[0].total).toFixed(2));

  // Balance unchanged?
  const [r4] = await c.execute(
    "SELECT SUM(CASE WHEN type='收入' THEN amount WHEN type='支出' THEN -amount ELSE 0 END) as bal FROM a3s_cash_entries"
  );
  const [r5] = await c.execute(
    "SELECT SUM(CASE WHEN Z2=1 THEN C5 WHEN Z2=0 THEN -C5 ELSE 0 END)/100 as bal FROM T1200 WHERE Z1=1"
  );
  console.log('\n余额验证:');
  console.log('新系统:', Number(r4[0].bal).toFixed(2));
  console.log('旧系统:', Number(r5[0].bal).toFixed(2));
  console.log('差异:', (Number(r4[0].bal)-Number(r5[0].bal)).toFixed(2));

  // Fix the backfill script and sync function
  await c.end();
})();

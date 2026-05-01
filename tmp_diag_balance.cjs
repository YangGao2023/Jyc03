const mysql = require('mysql2/promise');
(async () => {
  const c = await mysql.createConnection({
    host:'43.166.250.145', port:3306,
    user:'dbo001', password:'BDQN123456',
    database:'db_zhty202410',
    supportBigNumbers: true, bigNumberStrings: true,
  });

  // 新系统详细余额组成
  const [r1] = await c.execute(
    "SELECT source_type, type, SUM(amount) as total FROM a3s_cash_entries GROUP BY source_type, type ORDER BY source_type"
  );
  console.log('=== a3s_cash_entries 按 source_type 分组 ===');
  for (const r of r1) {
    console.log(' ', r.source_type, '-', r.type, ':', Number(r.total).toFixed(2));
  }
  const [r1b] = await c.execute(
    "SELECT SUM(CASE WHEN type='收入' THEN amount WHEN type='支出' THEN -amount ELSE 0 END) as bal FROM a3s_cash_entries"
  );
  console.log('  a3s_cash_entries 余额:', Number(r1b[0].bal).toFixed(2));

  // 旧系统详细
  const [r2] = await c.execute(`
    SELECT C1, Z2, SUM(C5)/100 as total
    FROM T1200 WHERE Z1=1
    GROUP BY C1, Z2 ORDER BY C1, Z2
  `);
  console.log('\n=== T1200 分组 ===');
  let totalIncome = 0, totalExpense = 0;
  for (const r of r2) {
    const amt = Number(r.total);
    if (r.Z2 == 1) totalIncome += amt;
    else totalExpense += amt;
    console.log(' C1='+r.C1+' Z2='+r.Z2+':', amt.toFixed(2));
  }
  console.log('  T1200 收入:', totalIncome.toFixed(2));
  console.log('  T1200 支出:', totalExpense.toFixed(2));
  console.log('  T1200 余额:', (totalIncome - totalExpense).toFixed(2));

  // 旧系统日期范围
  const [r3] = await c.execute(
    `SELECT MIN(STR_TO_DATE(C6,'%Y%m%d%H%i%s')) as first, MAX(STR_TO_DATE(C6,'%Y%m%d%H%i%s')) as last
     FROM T1200 WHERE Z1=1 AND C6 IS NOT NULL AND C6!=''`
  );
  console.log('\nT1200 日期范围:', r3[0].first, '~', r3[0].last);

  await c.end();
})();

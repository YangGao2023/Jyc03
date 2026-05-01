const mysql = require('mysql2/promise');
(async () => {
  const c = await mysql.createConnection({
    host:'43.166.250.145', port:3306,
    user:'dbo001', password:'BDQN123456',
    database:'db_zhty202410',
    supportBigNumbers: true, bigNumberStrings: true,
  });

  // Check if a3s_expenses has salary records (C1=3)
  const [r] = await c.execute(`
    SELECT t.C1, COUNT(*) as cnt, SUM(e.amount) as total
    FROM a3s_expenses e
    INNER JOIN T1200 t ON e.old_id = t.P1 AND t.Z1=1
    GROUP BY t.C1 ORDER BY t.C1
  `);
  console.log('=== a3s_expenses 通过 old_id 匹配 T1200 C1 分布 ===');
  for (const x of r) {
    console.log('  C1=' + x.C1, ':', x.cnt, '条,', Number(x.total).toFixed(2));
  }

  // Check if salary (C1=3) is in a3s_expenses
  const [r2] = await c.execute(`
    SELECT COUNT(*) as cnt, SUM(e.amount) as total
    FROM a3s_expenses e
    INNER JOIN T1200 t ON e.old_id = t.P1 AND t.Z1=1 AND t.C1=3
  `);
  console.log('\n=== 工资(C1=3)在 a3s_expenses 中 ===');
  console.log('  条数:', r2[0].cnt, ' 金额:', Number(r2[0].total).toFixed(2));

  // Check salary in a3s_cash_entries
  const [r3] = await c.execute(
    "SELECT COUNT(*) as cnt, SUM(amount) as total FROM a3s_cash_entries WHERE source_type='t1200-salary'"
  );
  console.log('\n=== 工资在 a3s_cash_entries 中(source_type=t1200-salary) ===');
  console.log('  条数:', r3[0].cnt, ' 金额:', Number(r3[0].total).toFixed(2));

  // Old system salary total
  const [r4] = await c.execute(
    'SELECT COUNT(*) as cnt, SUM(C5)/100 as total FROM T1200 WHERE Z1=1 AND C1=3'
  );
  console.log('\n=== 旧系统工资(C1=3) ===');
  console.log('  条数:', r4[0].cnt, ' 金额:', Number(r4[0].total).toFixed(2));

  // Check how many salary old_ids exist in BOTH tables
  const [r5] = await c.execute(`
    SELECT COUNT(*) as cnt
    FROM a3s_expenses e
    INNER JOIN T1200 t ON e.old_id = t.P1 AND t.Z1=1 AND t.C1=3
    INNER JOIN a3s_cash_entries c ON c.source_type='t1200-salary' AND c.old_id = t.P1
  `);
  console.log('\n=== 工资同时存在于 a3s_expenses 和 a3s_cash_entries ===');
  console.log('  条数:', r5[0].cnt);

  await c.end();
})();

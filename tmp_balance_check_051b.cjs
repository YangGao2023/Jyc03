const mysql = require('mysql2/promise');
(async () => {
  const c = await mysql.createConnection({
    host:'43.166.250.145', port:3306,
    user:'dbo001', password:'BDQN123456',
    database:'db_zhty202410',
    supportBigNumbers: true, bigNumberStrings: true,
  });

  // 新系统类型分布
  const [r1] = await c.execute(
    "SELECT type, COUNT(*) as cnt, SUM(amount) as total FROM a3s_cash_entries GROUP BY type"
  );
  console.log('=== 新系统 a3s_cash_entries 类型分布 ===');
  for (const r of r1) {
    console.log('  ', r.type, ':', r.cnt, '条, 合计 $' + Number(r.total).toFixed(2));
  }

  // 旧系统类型分布
  const [r2] = await c.execute(
    "SELECT C1, Z2, COUNT(*) as cnt, SUM(C5)/100 as total FROM T1200 WHERE Z1=1 GROUP BY C1, Z2 ORDER BY C1"
  );
  console.log('\n=== 旧系统 T1200(Z1=1) C1类型分布 ===');
  for (const r of r2) {
    console.log('  C1=' + r.C1 + ' Z2=' + r.Z2 + ':', r.cnt, '条, 合计 $' + Number(r.total).toFixed(2));
  }

  // 对比种类差异：按金额
  const [r3] = await c.execute(
    "SELECT 'income' as side, COUNT(*) as cnt, SUM(C5)/100 as total FROM T1200 WHERE Z1=1 AND Z2=1"
  );
  const [r4] = await c.execute(
    "SELECT 'expense' as side, COUNT(*) as cnt, SUM(C5)/100 as total FROM T1200 WHERE Z1=1 AND Z2=0"
  );
  const [r5] = await c.execute(
    "SELECT 'salary' as side, COUNT(*) as cnt, SUM(C5)/100 as total FROM T1200 WHERE Z1=1 AND C1=3"
  );
  console.log('\n=== 旧系统分方向 ===');
  console.log('  收入(Z2=1):', r3[0].cnt, '条, $' + Number(r3[0].total).toFixed(2));
  console.log('  支出(Z2=0):', r4[0].cnt, '条, $' + Number(r4[0].total).toFixed(2));
  console.log('  工资(C1=3):', r5[0].cnt, '条, $' + Number(r5[0].total).toFixed(2));
  // 工资是支出的子集
  const [r6] = await c.execute(
    "SELECT COUNT(*) as cnt, SUM(C5)/100 as total FROM T1200 WHERE Z1=1 AND (Z2=0 OR C1=3)"
  );
  console.log('  支出合计(Z2=0 OR C1=3):', r6[0].cnt, '条, $' + Number(r6[0].total).toFixed(2));

  // 检查新系统的 source_type
  const [r7] = await c.execute(
    "SELECT source_type, COUNT(*) as cnt, SUM(amount) as total FROM a3s_cash_entries GROUP BY source_type"
  );
  console.log('\n=== 新系统 source_type 分布 ===');
  for (const r of r7) {
    console.log('  ', r.source_type || '(空)', ':', r.cnt, '条, 合计 $' + Number(r.total).toFixed(2));
  }

  await c.end();
})();

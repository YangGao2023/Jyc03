const mysql = require('mysql2/promise');
(async () => {
  const c = await mysql.createConnection({
    host:'43.166.250.145', port:3306,
    user:'dbo001', password:'BDQN123456',
    database:'db_zhty202410',
    supportBigNumbers: true, bigNumberStrings: true,
  });

  console.log('=== 旧系统 T1200 余额 (C5=分, 已/100) ===');
  // 旧系统: Z1=1 有效, Z2=1 收入方向, Z2=0 支出方向, C1=3 工资(支出)
  const [rOld] = await c.execute(
    "SELECT " +
    "SUM(CASE WHEN Z2=1 THEN C5 ELSE 0 END)/100 as income, " +
    "SUM(CASE WHEN Z2=0 OR C1=3 THEN C5 ELSE 0 END)/100 as expense, " +
    "SUM(CASE WHEN Z2=1 THEN C5 WHEN Z2=0 OR C1=3 THEN -C5 ELSE 0 END)/100 as balance " +
    "FROM T1200 WHERE Z1=1"
  );
  console.log('  收入:', rOld[0].income, '美元');
  console.log('  支出:', rOld[0].expense, '美元');
  console.log('  余额:', rOld[0].balance, '美元');

  console.log('\n=== 新系统 a3s_cash_entries 余额 ===');
  const [rNew] = await c.execute(
    "SELECT " +
    "SUM(CASE WHEN type='收入' THEN amount ELSE 0 END) as income, " +
    "SUM(CASE WHEN type='支出' THEN amount ELSE 0 END) as expense, " +
    "SUM(CASE WHEN type='收入' THEN amount WHEN type='支出' THEN -amount ELSE 0 END) as balance " +
    "FROM a3s_cash_entries"
  );
  console.log('  收入:', rNew[0].income);
  console.log('  支出:', rNew[0].expense);
  console.log('  余额:', rNew[0].balance);
  console.log('\n  差异(新-旧):', (rNew[0].balance||0) - (rOld[0].balance||0));

  // 按月对比
  console.log('\n=== 按月对比 (旧=分/100) ===');
  const [r3] = await c.execute(
    `SELECT CONCAT(YEAR(STR_TO_DATE(C6,'%Y%m%d%H%i%s')),'-',LPAD(MONTH(STR_TO_DATE(C6,'%Y%m%d%H%i%s')),2,'0')) as ym,
            SUM(CASE WHEN Z2=1 THEN C5 WHEN Z2=0 OR C1=3 THEN -C5 ELSE 0 END)/100 as old_bal
     FROM T1200 WHERE Z1=1 AND C6 IS NOT NULL AND C6!=''
     GROUP BY ym ORDER BY ym`
  );
  const [r4] = await c.execute(
    `SELECT DATE_FORMAT(created_at, '%Y-%m') as ym,
            SUM(CASE WHEN type='收入' THEN amount WHEN type='支出' THEN -amount ELSE 0 END) as new_bal
     FROM a3s_cash_entries
     GROUP BY ym ORDER BY ym`
  );
  const map = {};
  r3.forEach(x => { map[x.ym] = { old: Number(x.old_bal) }; });
  r4.forEach(x => { if(!map[x.ym]) map[x.ym]={}; map[x.ym].new = Number(x.new_bal); });
  let cumOld=0, cumNew=0;
  for(const ym of Object.keys(map).sort()) {
    const d = map[ym];
    cumOld += d.old||0; cumNew += d.new||0;
    const diff = (d.new||0) - (d.old||0);
    console.log(ym, '\t旧:', (d.old||0).toFixed(2), '\t新:', (d.new||0).toFixed(2), '\t差:', diff.toFixed(2));
  }
  console.log('\n累积\t旧:', cumOld.toFixed(2), '\t新:', cumNew.toFixed(2), '\t差:', (cumNew-cumOld).toFixed(2));

  // 也检查一下迁移计数
  const [cnt] = await c.execute("SELECT COUNT(*) as n FROM a3s_cash_entries");
  const [cnt2] = await c.execute("SELECT COUNT(*) as n FROM T1200 WHERE Z1=1");
  console.log('\n=== 条数 ===');
  console.log('T1200(Z1=1):', cnt2[0].n, '条');
  console.log('a3s_cash_entries:', cnt[0].n, '条');

  await c.end();
})();

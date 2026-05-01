const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({
    host: '43.166.250.145', port: 3306, user: 'dbo001',
    password: 'BDQN123456', database: 'db_zhty202410',
    waitForConnections: true, connectionLimit: 2
  });

  // Summary
  const [ord] = await pool.execute("SELECT COUNT(*) as c FROM a3s_orders");
  const [cli] = await pool.execute("SELECT COUNT(*) as c FROM a3s_clients");
  const [ce] = await pool.execute("SELECT type, COUNT(*) as c, ROUND(SUM(amount),2) as total FROM a3s_cash_entries GROUP BY type");
  const [exp] = await pool.execute("SELECT COUNT(*) as c, ROUND(SUM(amount),2) as total FROM a3s_expenses");
  const [emp] = await pool.execute("SELECT COUNT(*) as c FROM a3s_employees");
  const [pay] = await pool.execute("SELECT month, COUNT(*) as c, ROUND(SUM(net_salary),2) as total FROM a3s_payrolls GROUP BY month ORDER BY month");
  const [mat] = await pool.execute("SELECT COUNT(*) as c FROM a3s_materials");
  const [sup] = await pool.execute("SELECT COUNT(*) as c FROM a3s_suppliers");

  console.log('=== 新系统数据概况 ===');
  console.log('订单:', ord[0].c);
  console.log('客户:', cli[0].c);
  ce.forEach(r => console.log('现金流水 type='+r.type+':', r.c, '条, $'+r.total));
  console.log('支出:', exp[0].c, '条, $'+exp[0].total);
  console.log('员工:', emp[0].c);
  console.log('工资发放:', pay.reduce((s,p)=>s+p.c,0), '条');
  pay.forEach(p => console.log('  month:', p.month, p.c, '条, $'+p.total));
  console.log('物料:', mat[0].c);
  console.log('供应商:', sup[0].c);

  // Check: do we have salary in expenses?
  const [salExp] = await pool.execute("SELECT COUNT(*) as c, ROUND(SUM(amount),2) as total FROM a3s_expenses WHERE expense_type='工资'");
  console.log('\n工资类型支出:', salExp[0].c, '条, $'+salExp[0].total);

  // Check: salary in cash_entries
  const [salCe] = await pool.execute("SELECT type, COUNT(*) as c, ROUND(SUM(amount),2) as total FROM a3s_cash_entries WHERE source_type='t1200-salary' GROUP BY type");
  console.log('工资现金条目:', salCe.length > 0 ? salCe.map(r=>`type=${r.type}: ${r.c}条 $${r.total}`).join(', ') : '0条');

  // Check: any expense records with wrong type?
  const [badTypes] = await pool.execute(`
    SELECT expense_type, COUNT(*) as c FROM a3s_expenses e
    WHERE EXISTS (SELECT 1 FROM db_zhty202410.T1200 t WHERE t.Z1=1 AND t.C1=3 AND t.P2>0 AND e.old_id=t.P1)
    GROUP BY expense_type
    ORDER BY c DESC
  `);
  console.log('\n工资支出类型分布:');
  badTypes.forEach(r => console.log('  '+r.expense_type+':', r.c));

  // Any cash entries with wrong type?
  const [badCe] = await pool.execute("SELECT source_type, type, COUNT(*) as c FROM a3s_cash_entries WHERE source_type='t1200-salary' GROUP BY source_type, type");
  console.log('\n工资现金类型分布:');
  badCe.forEach(r => console.log('  source_type='+r.source_type+' type='+r.type+':', r.c));

  await pool.end();
})();

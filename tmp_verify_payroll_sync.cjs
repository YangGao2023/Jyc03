const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({
    host: '43.166.250.145', port: 3306, user: 'dbo001',
    password: 'BDQN123456', database: 'db_zhty202410',
    waitForConnections: true, connectionLimit: 2
  });

  // Check payrolls
  const [pc] = await pool.execute("SELECT COUNT(*) as c FROM a3s_payrolls");
  console.log('a3s_payrolls:', pc[0].c, 'records');

  // Check salary cash entries
  const [ce] = await pool.execute("SELECT COUNT(*) as c FROM a3s_cash_entries WHERE source_type='t1200-salary'");
  console.log('a3s_cash_entries salary (t1200-salary):', ce[0].c, 'records');

  // Also check: were any already there from the original T1200 sync?
  const [ceSal2] = await pool.execute("SELECT COUNT(*) as c FROM a3s_cash_entries WHERE source_type='t1200-salary' OR (id LIKE 'sal-%')");
  console.log('a3s_cash_entries with sal- prefix:', ceSal2[0].c, 'records');

  // Sample payroll
  const [ps] = await pool.execute("SELECT id, month, employee_name, net_salary, payment_status, paid_at FROM a3s_payrolls ORDER BY paid_at DESC LIMIT 5");
  console.log('\nLatest 5 payrolls:');
  ps.forEach(r => console.log(' ', r.id, r.employee_name, r.month, '$'+r.net_salary, r.payment_status, r.paid_at));

  if (ce[0].c === 0) {
    // Section 9 didn't run - need to run it separately
    console.log('\n⚠️ 工资收入现金条目似乎没同步完，需要单独跑');
  }

  await pool.end();
})();

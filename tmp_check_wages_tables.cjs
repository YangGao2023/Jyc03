const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({
    host: '43.166.250.145', port: 3306, user: 'dbo001',
    password: 'BDQN123456', database: 'db_zhty202410',
    waitForConnections: true, connectionLimit: 2
  });

  // Check old system salary tables
  const [tables] = await pool.execute("SHOW TABLES LIKE '%0404%'");
  console.log('old sys tables with 0404:', tables.map(t=>Object.values(t)[0]));

  const [tables2] = await pool.execute("SHOW TABLES LIKE '%040%'");
  console.log('old sys tables with 040:', tables2.map(t=>Object.values(t)[0]));

  // Check for F0404
  try {
    const [cols] = await pool.execute("SHOW COLUMNS FROM db_zhty202410.F0404");
    console.log('\nF0404 exists! Columns:');
    cols.forEach(c => console.log(' ', c.Field, c.Type));
    const [cnt] = await pool.execute("SELECT COUNT(*) FROM db_zhty202410.F0404");
    console.log('F0404 count:', cnt[0]['COUNT(*)']);
  } catch(e) {
    console.log('\nF0404 not found:', e.message);
  }

  // Check for any salary/payroll related tables in old system
  const [allTables] = await pool.execute("SHOW TABLES FROM db_zhty202410");
  const salaryTables = allTables.filter(t => {
    const name = Object.values(t)[0];
    return name.includes('040') || name.includes('工资') || name.includes('WAGE') || name.includes('PAY');
  });
  console.log('\nOld sys salary-related tables:');
  salaryTables.forEach(t => console.log(' ', Object.values(t)[0]));

  // Check a3s tables
  const [a3sTables] = await pool.execute("SHOW TABLES LIKE 'a3s_wage%'");
  console.log('\na3s_wage% tables:');
  a3sTables.forEach(t => console.log(' ', Object.values(t)[0]));

  // Check what's in a3s_wages if it exists
  try {
    const [payroll] = await pool.execute("SELECT * FROM a3s_wages LIMIT 5");
    console.log('\na3s_wages sample:');
    payroll.forEach(r => console.log(' ', JSON.stringify(r)));
  } catch(e) {
    console.log('\na3s_wages not found:', e.message);
  }

  // Check biz-store data for PAYROLL
  // Instead, check the data loaded by biz-store
  try {
    const [p] = await pool.execute("SHOW COLUMNS FROM a3s_payrolls");
    console.log('\na3s_payrolls columns:');
    p.forEach(c => console.log(' ', c.Field, c.Type));
    const [pc] = await pool.execute("SELECT COUNT(*) FROM a3s_payrolls");
    console.log('a3s_payrolls count:', pc[0]['COUNT(*)']);
    const [ps] = await pool.execute("SELECT * FROM a3s_payrolls LIMIT 3");
    ps.forEach(r => console.log('  ', JSON.stringify(r)));
  } catch(e) {
    console.log('a3s_payrolls not found:', e.message);
  }

  await pool.end();
})();

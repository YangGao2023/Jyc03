const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({
    host: '43.166.250.145', port: 3306, user: 'dbo001',
    password: 'BDQN123456', database: 'db_zhty202410',
    waitForConnections: true, connectionLimit: 2
  });

  // T1310 - Salary payment table
  try {
    const [cols] = await pool.execute("SHOW COLUMNS FROM db_zhty202410.T1310");
    console.log('=== T1310 exists! Columns:');
    cols.forEach(c => console.log(' ', c.Field, c.Type));

    const [cnt] = await pool.execute("SELECT COUNT(*) as c FROM db_zhty202410.T1310 WHERE Z1=1");
    console.log('\nActive T1310 records (Z1=1):', cnt[0].c);

    const [cntVoided] = await pool.execute("SELECT COUNT(*) as c FROM db_zhty202410.T1310 WHERE Z1=0");
    console.log('Voided T1310 records (Z1=0):', cntVoided[0].c);

    // Sample: show recent payment records
    const [sample] = await pool.execute(`
      SELECT t.P1, t.P2, e.C2 as emp_name, t.C1 as start_date, t.C2 as end_date, t.C4 as amount, t.C6 as paid_datetime, t.Z1
      FROM db_zhty202410.T1310 t
      JOIN db_zhty202410.T1003 e ON t.P2 = e.P1
      WHERE t.Z1=1
      ORDER BY t.C6 DESC
      LIMIT 10
    `);
    console.log('\n=== Recent 10 salary payments (paid) ===');
    sample.forEach(r => console.log(' ', r.emp_name, 'period:', r.start_date, '-', r.end_date, 'amt:', r.amount, 'paid:', r.paid_datetime));

    // Count unique paid periods
    const [periods] = await pool.execute(`
      SELECT C1 as start, C2 as end, COUNT(DISTINCT P2) as emp_count, SUM(C4) as total_amount
      FROM db_zhty202410.T1310 WHERE Z1=1
      GROUP BY C1, C2
      ORDER BY C1 DESC
      LIMIT 10
    `);
    console.log('\n=== Latest 10 paid periods ===');
    periods.forEach(r => console.log(' ', r.start, '-', r.end, 'emps:', r.emp_count, 'total:', r.total_amount));

    // Check T1200 with C3=3 (salary income)
    const [t1200Salary] = await pool.execute(`
      SELECT COUNT(*) as c, SUM(C8) as total
      FROM db_zhty202410.T1200
      WHERE Z1=1 AND C3=3
    `);
    console.log('\nT1200 salary income (C3=3):', t1200Salary[0].c, 'records, total:', t1200Salary[0].total);

  } catch(e) {
    console.log('T1310 not found:', e.message);
  }

  await pool.end();
})();

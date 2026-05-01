const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({
    host: '43.166.250.145', port: 3306, user: 'dbo001',
    password: 'BDQN123456', database: 'db_zhty202410',
    waitForConnections: true, connectionLimit: 2
  });

  // Check Z2 value for salary T1200 records (C1=3, P2>0)
  const [z2Dist] = await pool.execute(`
    SELECT Z2, COUNT(*) as c, SUM(C5) as total_cents
    FROM db_zhty202410.T1200 
    WHERE Z1=1 AND C1=3 AND P2 > 0
    GROUP BY Z2
  `);
  console.log('Salary T1200 (C1=3, P2>0) by Z2:');
  z2Dist.forEach(r => console.log('  Z2=' + r.Z2 + ': ' + r.c + ' records, $' + (r.total_cents/100).toFixed(2)));

  // Check current a3s_payrolls schema
  const [payCols] = await pool.execute("SHOW COLUMNS FROM a3s_payrolls");
  console.log('\na3s_payrolls columns:');
  payCols.forEach(c => console.log(' ', c.Field, c.Type));

  // T1310 sample - all columns
  const [t1310Sample] = await pool.execute(`
    SELECT t.P1, t.P2, e.C2 as emp_name, t.C1, t.C2, t.C3, t.C4, t.C6, t.Z1
    FROM db_zhty202410.T1310 t
    JOIN db_zhty202410.T1003 e ON t.P2 = e.P1
    WHERE t.Z1=1
    ORDER BY t.C6 DESC
    LIMIT 3
  `);
  console.log('\nT1310 sample:');
  t1310Sample.forEach(r => console.log(' ', JSON.stringify(r)));

  // Check: how does old system determine "paid"? Just T1310.Z1=1 with matching period?
  // Or is it more nuanced?
  const [paidCount] = await pool.execute(`
    SELECT COUNT(DISTINCT CONCAT(t.P2, '-', t.C1, '-', t.C2)) as c
    FROM db_zhty202410.T1310 t
    WHERE t.Z1=1
  `);
  console.log('\nUnique employee+period paid:', paidCount[0].c);

  // Latest week - how many employees paid?
  const [latestPeriod] = await pool.execute(`
    SELECT C1, C2, COUNT(DISTINCT P2) as emps, SUM(C4) as total
    FROM db_zhty202410.T1310 WHERE Z1=1
    GROUP BY C1, C2
    ORDER BY C1 DESC
    LIMIT 1
  `);
  console.log('\nLatest paid period:');
  latestPeriod.forEach(r => console.log(' ', r.C1, '-', r.C2, r.emps, 'emps, total:', r.total, 'cents'));

  await pool.end();
})();

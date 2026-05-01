const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({
    host: '43.166.250.145', port: 3306, user: 'dbo001',
    password: 'BDQN123456', database: 'db_zhty202410',
    waitForConnections: true, connectionLimit: 2
  });

  // Check: are T1200 salary records (C1=3 with date-range description) in cash_entries?
  // Salary T1200 inserts use C3 like '20250203-20250209'
  const [salaryT1200] = await pool.execute(`
    SELECT COUNT(*) as c, SUM(C5) as total
    FROM db_zhty202410.T1200 
    WHERE Z1=1 AND C1=3 AND P2 > 0
  `);
  console.log('T1200 salary records (C1=3, P2 > 0):', salaryT1200[0].c, 'total:', salaryT1200[0].total, '(cents)');
  console.log('  That is $' + (salaryT1200[0].total / 100).toFixed(2));

  // Check if these are in cash_entries (by P1 id)
  const [pairs] = await pool.execute(`
    SELECT t.P1, t.P2, t.P4 as emp_p1, e.C2 as emp_name, t.C3 as period, t.C5 as amount_cents, t.C6 as date
    FROM db_zhty202410.T1200 t
    JOIN db_zhty202410.T1003 e ON t.P4 = e.P1
    WHERE t.Z1=1 AND t.C1=3 AND t.P2 > 0
    ORDER BY t.C6 DESC
    LIMIT 10
  `);
  console.log('\n=== Recent salary payments in T1200 ===');
  pairs.forEach(r => console.log(' ', r.emp_name, 'period:', r.period, 'amt:', r.amount_cents, 'cents date:', r.date, 'T1200.P1:', r.P1));

  // Check if these P1 values are in cash_entries.source_id
  const sampleP1 = pairs[0].P1;
  const [ce] = await pool.execute(
    "SELECT id, amount, type, source_type, source_id, target_name FROM a3s_cash_entries WHERE source_id=?",
    [String(sampleP1)]
  );
  console.log('\nCash entry for T1200.P1=' + sampleP1 + ':');
  if (ce.length > 0) {
    ce.forEach(r => console.log(' ', JSON.stringify(r)));
  } else {
    console.log('  NOT FOUND in cash_entries');
  }

  // Also check if C3=3 (type=3 not income from orders) was synced
  // The migration wrote: source_type CASE WHEN C1 IN (1,2) THEN ... but maybe C1=3 was also included
  const [ce3] = await pool.execute(
    "SELECT COUNT(*) as c, SUM(amount) as total FROM a3s_cash_entries WHERE type='收入'"
  );
  console.log('\nCash entries total income:', ce3[0].c, 'records, $' + (ce3[0].total / 100).toFixed(2));

  // Check count of entries with source_id containing T1200 salary refs
  const [ceSalary] = await pool.execute(`
    SELECT COUNT(*) as c
    FROM a3s_cash_entries ce
    INNER JOIN db_zhty202410.T1200 t ON ce.source_id = CAST(t.P1 AS CHAR)
    WHERE t.Z1=1 AND t.C1=3 AND t.P2 > 0
  `);
  console.log('Cash entries matching T1200 salary records:', ceSalary[0].c);

  // Summary
  console.log('\n=== SUMMARY ===');
  console.log('T1310 active payments:', 1343);
  console.log('T1200 salary records (C1=3, P2>0, Z1=1):', salaryT1200[0].c);
  console.log('Cash entries with salary link:', ceSalary[0].c);

  await pool.end();
})();

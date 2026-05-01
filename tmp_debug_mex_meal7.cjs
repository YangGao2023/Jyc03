const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({
    host: '43.166.250.145', port: 3306, user: 'dbo001',
    password: 'BDQN123456', database: 'db_zhty202410',
    waitForConnections: true, connectionLimit: 2
  });

  // Debug: A艾丽斯 - check the employee_id value match
  console.log('=== A艾丽斯 ID comparison ===');
  
  // From T1003
  const [emp] = await pool.execute("SELECT P1, C2 FROM db_zhty202410.T1003 WHERE C2='A艾丽斯'");
  console.log('T1003.P1:', emp[0].P1);
  console.log('T1003.P1 as string:', String(emp[0].P1));

  // T1300 C7=1 for A艾丽斯
  const [t1300] = await pool.execute(
    "SELECT CAST(P2 AS CHAR) as p2_str, C2, C7 FROM db_zhty202410.T1300 WHERE P2=? AND C7=1 LIMIT 3",
    [emp[0].P1]
  );
  console.log('\nT1300 C7=1 for A艾丽斯:');
  t1300.forEach(r => console.log('  P2:', r.p2_str, 'C2:', r.C2, 'C7:', r.C7));

  // Check a3s_attendances for A艾丽斯 - what emp_id do they have?
  const [att] = await pool.execute(
    "SELECT id, date, employee_id, meal_allowance FROM a3s_attendances WHERE employee_name='A艾丽斯' AND meal_allowance=0 LIMIT 3"
  );
  console.log('\na3s_attendances A艾丽斯:');
  att.forEach(r => {
    console.log('  id:', r.id.toString(), 'date:', r.date, 'emp_id:', r.employee_id);
    // Try to match with P2
    console.log('  emp_id matches T1003.P1:', r.employee_id === String(emp[0].P1));
  });

  // Broader check: what employee_id values exist in a3s_attendances for A employees?
  const [attIds] = await pool.execute(
    "SELECT DISTINCT employee_id, employee_name FROM a3s_attendances WHERE employee_name LIKE 'A%'"
  );
  console.log('\n=== All A-employee IDs in a3s_attendances ===');
  for (const a of attIds) {
    // Find matching T1003 record
    const [emp2] = await pool.execute(
      "SELECT P1, C2 FROM db_zhty202410.T1003 WHERE C2=?",
      [a.employee_name]
    );
    const match = emp2.length > 0 && a.employee_id === String(emp2[0].P1);
    console.log(' ', a.employee_name, 'att.emp_id:', a.employee_id, 'T1003.P1:', emp2[0]?.P1, 'match:', match);
    if (!match && emp2.length > 0) {
      console.log('   att type:', typeof a.employee_id, 't1003 type:', typeof emp2[0].P1);
      console.log('   att repr:', JSON.stringify(a.employee_id), 't1003 repr:', JSON.stringify(String(emp2[0].P1)));
      console.log('   att len:', a.employee_id?.length, 't1003 len:', String(emp2[0].P1)?.length);
    }
  }

  // Also check: there was an earlier meal=1 backfill (2463 records). How did they match?
  console.log('\n=== Previously matched meal=1 record sample ===');
  const [matched] = await pool.execute(
    "SELECT id, date, employee_name, employee_id FROM a3s_attendances WHERE meal_allowance=1 LIMIT 3"
  );
  for (const m of matched) {
    const [t] = await pool.execute(
      "SELECT P2, C7 FROM db_zhty202410.T1300 WHERE P1=?",
      [parseInt(m.id)]
    );
    console.log('  att id:', m.id.toString(), 'name:', m.employee_name, 'emp_id:', m.employee_id);
    console.log('  T1300.P2:', t[0]?.P2, 'T1300.P2==emp_id:', t.length > 0 && String(t[0].P2) === m.employee_id);
  }

  await pool.end();
})();

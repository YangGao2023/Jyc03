const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({
    host: '43.166.250.145', port: 3306, user: 'dbo001',
    password: 'BDQN123456', database: 'db_zhty202410',
    waitForConnections: true, connectionLimit: 2
  });

  // Check T1300 data with C7=1
  const [t1300] = await pool.execute("SELECT P1, P2, C1, C2, C5, C7 FROM db_zhty202410.T1300 WHERE Z1=1 AND C7=1 LIMIT 5");
  console.log('=== T1300 C7=1 examples ===');
  t1300.forEach(r => console.log('  P1:', r.P1, 'P2:', r.P2, 'C1:', r.C1, 'C2:', r.C2, 'C5:', r.C5, 'C7:', r.C7));

  // Get employee IDs from T1300 C7=1 distinct
  const [empIds] = await pool.execute("SELECT DISTINCT P2 FROM db_zhty202410.T1300 WHERE Z1=1 AND C7=1");
  console.log('\n=== Distinct employees with C7=1 ===');
  for (const e of empIds.slice(0, 5)) {
    const [emp] = await pool.execute("SELECT P1, C2 FROM db_zhty202410.T1003 WHERE P1 = ?", [e.P2]);
    if (emp.length) console.log('  T1003.P2:', e.P2, 'name:', emp[0].C2);
    // Check if this employee exists in a3s_attendances
    const [att] = await pool.execute("SELECT COUNT(*) as c FROM a3s_attendances WHERE employee_id = ?", [String(e.P2)]);
    console.log('     a3s_attendances count:', att[0].c);
    // Check a3s_attendances date formats
    if (att[0].c > 0) {
      const [dates] = await pool.execute("SELECT date, employee_id, meal_allowance FROM a3s_attendances WHERE employee_id = ? AND meal_allowance = 1 LIMIT 3", [String(e.P2)]);
      if (dates.length) console.log('     already has meal_allowance=1:', dates.length);
      const [noMeal] = await pool.execute("SELECT date FROM a3s_attendances WHERE employee_id = ? AND meal_allowance = 0 LIMIT 2", [String(e.P2)]);
      if (noMeal.length) console.log('     sample dates with meal=0:', noMeal.map(r => r.date));
    }
  }

  await pool.end();
})();

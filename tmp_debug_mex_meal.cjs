const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({
    host: '43.166.250.145', port: 3306, user: 'dbo001',
    password: 'BDQN123456', database: 'db_zhty202410',
    waitForConnections: true, connectionLimit: 2
  });

  // Mexican employees P1 in T1003
  const [mex] = await pool.execute("SELECT P1, C2, C12 FROM db_zhty202410.T1003 WHERE Z1=1 AND C2 LIKE 'A%'");
  console.log('=== Mexican employees T1003 ===');
  for (const e of mex) {
    console.log(' ', e.P1, e.C2, 'C12(meal_eligible):', e.C12);
    
    // Count T1300 records with C7=1 for this employee
    const [t1300c7] = await pool.execute(
      "SELECT COUNT(*) as c FROM db_zhty202410.T1300 WHERE Z1=1 AND P2=? AND C7=1",
      [e.P1]
    );
    console.log('    T1300 C7=1 count:', t1300c7[0].c);

    // Check a3s_attendances meal_allowance
    const [att] = await pool.execute(
      "SELECT date, meal_allowance FROM a3s_attendances WHERE employee_id=? AND date >= '2026-04-27' AND date <= '2026-05-01' ORDER BY date",
      [String(e.P1)]
    );
    console.log('    a3s_attendances this week:');
    att.forEach(r => console.log('      ', r.date, 'meal:', r.meal_allowance));

    // Sample: check if the id-based join matched
    const [matched] = await pool.execute(
      "SELECT COUNT(*) as c FROM a3s_attendances att WHERE att.employee_id=? AND att.meal_allowance=1",
      [String(e.P1)]
    );
    console.log('    total att with meal=1:', matched[0].c);
  }

  // Compare with a Chinese employee who DOES have meal
  const [zhang] = await pool.execute("SELECT P1, C2, C12 FROM db_zhty202410.T1003 WHERE C2='张善锦'");
  if (zhang.length) {
    console.log('\n=== 张善锦 (reference: has meal) ===');
    const [zt] = await pool.execute(
      "SELECT COUNT(*) as c FROM db_zhty202410.T1300 WHERE Z1=1 AND P2=? AND C7=1",
      [zhang[0].P1]
    );
    console.log('  T1300 C7=1:', zt[0].c);
    
    const [za] = await pool.execute(
      "SELECT COUNT(*) as c FROM a3s_attendances WHERE employee_id=? AND meal_allowance=1",
      [String(zhang[0].P1)]
    );
    console.log('  a3s_attendances meal=1:', za[0].c);
  }

  // Check: how many a3s_attendances rows have matching id in T1300 with C7=1
  console.log('\n=== ID match scan sample ===');
  const [idSample] = await pool.execute(`
    SELECT att.id, att.employee_name, att.meal_allowance, t.C7
    FROM a3s_attendances att
    LEFT JOIN db_zhty202410.T1300 t ON CAST(att.id AS DECIMAL(30)) = t.P1
    WHERE att.employee_name LIKE 'A%'
    LIMIT 10
  `);
  idSample.forEach(r => console.log('  id:', r.id, 'name:', r.employee_name, 'att.meal:', r.meal_allowance, 't.C7:', r.C7));

  await pool.end();
})();

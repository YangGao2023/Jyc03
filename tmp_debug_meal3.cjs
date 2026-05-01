const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({
    host: '43.166.250.145', port: 3306, user: 'dbo001',
    password: 'BDQN123456', database: 'db_zhty202410',
    waitForConnections: true, connectionLimit: 2
  });

  // Check T1300 column types
  const [desc] = await pool.execute("DESCRIBE db_zhty202410.T1300");
  console.log('=== T1300 columns ===');
  desc.forEach(r => console.log(' ', r.Field, r.Type, r.Key));

  // Check a3s_attendances column types
  const [desc2] = await pool.execute("DESCRIBE a3s_attendances");
  console.log('\n=== a3s_attendances columns ===');
  desc2.forEach(r => console.log(' ', r.Field, r.Type, r.Key));

  // Check exact match: 张善锦 P2
  console.log('\n=== Direct queries ===');
  
  // Find 张善锦 in T1003
  const [zhang] = await pool.execute("SELECT P1, C2 FROM db_zhty202410.T1003 WHERE C2 = '张善锦'");
  console.log('T1003 张善锦 P1:', zhang[0]?.P1, typeof zhang[0]?.P1);

  // Check T1300 for 张善锦 with C7=1  
  const [t1300] = await pool.execute(
    "SELECT P1, P2, C1, C2, C7 FROM db_zhty202410.T1300 WHERE P2 = ? AND C7 = 1 LIMIT 3",
    [zhang[0]?.P1]
  );
  console.log('T1300 for 张善锦 C7=1:', t1300.length);
  t1300.forEach(r => console.log('  P1:', r.P1, 'P2:', r.P2, 'C2:', r.C2, 'C1:', r.C1, 'C7:', r.C7));
  
  // Check a3s_attendances for 张善锦
  const [att] = await pool.execute(
    "SELECT id, date, employee_id FROM a3s_attendances WHERE employee_id = ? LIMIT 3",
    [String(zhang[0]?.P1)]
  );
  console.log('a3s_attendances for 张善锦:', att.length);
  att.forEach(r => console.log('  id:', r.id, 'date:', r.date, 'emp_id:', r.employee_id, typeof r.employee_id));

  // Quick check: sample count of a3s_attendances that have P2 match
  const [all] = await pool.execute("SELECT COUNT(*) as c FROM a3s_attendances");
  console.log('\nTotal a3s_attendances:', all[0].c);

  await pool.end();
})();

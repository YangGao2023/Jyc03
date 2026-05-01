const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({
    host: '43.166.250.145', port: 3306, user: 'dbo001',
    password: 'BDQN123456', database: 'db_zhty202410',
    waitForConnections: true, connectionLimit: 2
  });

  // Test: for 张善锦 (P2=1880696069134880800), on a day with C7=1
  // T1300 C2 = 20250203 → att.date should be 2025-02-03
  const [t1300row] = await pool.execute(
    "SELECT P1, P2, C1, C2 FROM db_zhty202410.T1300 WHERE Z1=1 AND P2=1880696069134880800 AND C7=1 LIMIT 3"
  );
  console.log('=== T1300 rows for 张善锦 with C7=1 ===');
  t1300row.forEach(r => {
    console.log('  P1:', r.P1, 'C2:', r.C2, 'C1:', r.C1);
  });

  // Now find matching att record
  const rawDate = String(t1300row[0].C2);  // '20250203'
  const formattedDate = rawDate.slice(0,4) + '-' + rawDate.slice(4,6) + '-' + rawDate.slice(6,8);
  console.log('\n  Formatted date:', formattedDate);
  
  const [attRow] = await pool.execute(
    "SELECT id, date, employee_id, meal_allowance FROM a3s_attendances WHERE employee_id = ? AND date = ?",
    ['1880696069134880800', formattedDate]
  );
  console.log('  Matching att rows:', attRow.length);
  attRow.forEach(r => console.log('    id:', r.id, 'date:', r.date, 'emp_id:', r.employee_id, 'meal:', r.meal_allowance));

  // Try the exact UPDATE JOIN
  console.log('\n=== Testing JOIN directly ===');
  const [testJoin] = await pool.execute(`
    SELECT att.id, att.date, att.employee_id, t.P2, t.C2
    FROM a3s_attendances att
    JOIN (
      SELECT P2, C2
      FROM db_zhty202410.T1300
      WHERE Z1=1 AND C7=1
      GROUP BY P2, C2
    ) t
      ON CAST(att.employee_id AS CHAR) = CAST(t.P2 AS CHAR)
      AND REPLACE(att.date, '-', '') = t.C2
    LIMIT 10
  `);
  console.log('  JOIN matched rows:', testJoin.length);
  testJoin.forEach(r => console.log('    att.date:', r.date, 'att.emp:', r.employee_id, 't.C2:', r.C2, 't.P2:', r.P2));

  await pool.end();
})();

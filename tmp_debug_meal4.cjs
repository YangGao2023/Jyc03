const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({
    host: '43.166.250.145', port: 3306, user: 'dbo001',
    password: 'BDQN123456', database: 'db_zhty202410',
    waitForConnections: true, connectionLimit: 2
  });

  // Test: 张善锦 on 20250203 → a3s should have date='2025-02-03'
  const [match] = await pool.execute(
    "SELECT id, date, employee_id, employee_name, meal_allowance FROM a3s_attendances WHERE employee_id = '1880696069134880800' AND date = '2025-02-03'"
  );
  console.log('张善锦 2025-02-03 authcheck:', match.length, 'records');
  match.forEach(r => console.log('  ', r.id, r.date, r.employee_name, 'meal:', r.meal_allowance));

  // Test JOIN directly
  const [joinTest] = await pool.execute(`
    SELECT att.id, att.date, att.employee_name, att.meal_allowance, t.C2, t.C7
    FROM a3s_attendances att
    INNER JOIN db_zhty202410.T1300 t ON CAST(t.P2 AS CHAR) = att.employee_id
    WHERE t.C7 = 1 AND att.date = CONCAT(LEFT(t.C2,4), '-', SUBSTR(t.C2,5,2), '-', RIGHT(t.C2,2))
    LIMIT 10
  `);
  console.log('\nJOIN test (any date):', joinTest.length, 'rows');
  joinTest.forEach(r => console.log('  att:', r.date, r.employee_name, 'meal:', r.meal_allowance, '| t.C2:', r.C2, 't.C7:', r.C7));

  // Try the actual UPDATE but with correct date format
  // att.date = '2025-02-03' → we need to match t.C2 = '20250203'
  // So: CONCAT(LEFT(t.C2,4), '-', SUBSTR(t.C2,5,2), '-', RIGHT(t.C2,2)) = att.date
  console.log('\n=== Running UPDATE with correct date conversion ===');
  const [result] = await pool.execute(`
    UPDATE a3s_attendances att
    INNER JOIN db_zhty202410.T1300 t ON CAST(t.P2 AS CHAR) = att.employee_id
    SET att.meal_allowance = 1
    WHERE t.C7 = 1
      AND CONCAT(LEFT(t.C2,4), '-', SUBSTR(t.C2,5,2), RIGHT(t.C2,2)) = att.date
  `);
  console.log('Updated rows:', result.affectedRows);

  // Verify
  const [v] = await pool.execute('SELECT meal_allowance, COUNT(*) as c FROM a3s_attendances GROUP BY meal_allowance');
  v.forEach(r => console.log('  meal_allowance=' + r.meal_allowance + ': ' + r.c + ' rows'));

  await pool.end();
})();

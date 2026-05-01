const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({
    host: '43.166.250.145', port: 3306, user: 'dbo001',
    password: 'BDQN123456', database: 'db_zhty202410',
    waitForConnections: true, connectionLimit: 2
  });

  // Use BINARY to avoid collation mismatch
  const [result] = await pool.execute(`
    UPDATE a3s_attendances att
    SET att.meal_allowance = 1
    WHERE EXISTS (
      SELECT 1 FROM db_zhty202410.T1300 t
      WHERE t.Z1=1 AND t.C7=1
        AND CAST(t.P2 AS CHAR) = att.employee_id
        AND CONCAT(LEFT(t.C2,4), '-', SUBSTR(t.C2,5,2), '-', SUBSTR(t.C2,7,2)) = att.date COLLATE utf8mb4_unicode_ci
    )
  `);
  console.log('Updated:', result.affectedRows);

  // Verify
  const [v] = await pool.execute('SELECT meal_allowance, COUNT(*) as c FROM a3s_attendances GROUP BY meal_allowance');
  v.forEach(r => console.log('  meal=' + r.meal_allowance + ': ' + r.c));

  // Check Mexican employees this week
  console.log('\n=== Mexican employees this week (after fix) ===');
  const [mex] = await pool.execute(`
    SELECT att.employee_name, att.date, MAX(att.meal_allowance) as meal
    FROM a3s_attendances att
    WHERE att.employee_name LIKE 'A%' AND att.date >= '2026-04-27'
    GROUP BY att.employee_name, att.date
    ORDER BY att.employee_name, att.date
  `);
  mex.forEach(r => console.log(' ', r.employee_name, r.date, 'meal:', r.meal ? '✅' : '❌'));

  await pool.end();
})();

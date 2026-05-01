const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({
    host: '43.166.250.145', port: 3306, user: 'dbo001',
    password: 'BDQN123456', database: 'db_zhty202410',
    waitForConnections: true, connectionLimit: 2
  });

  // Step 1: Verify the match works
  console.log('=== Step 1: Test T1300 → a3s_attendances via employee_id + date ===');

  // Count a3s_attendances that have matching T1300 C7=1 by emp+date
  const [testMatch] = await pool.execute(`
    SELECT COUNT(*) as c
    FROM a3s_attendances att
    WHERE EXISTS (
      SELECT 1 FROM db_zhty202410.T1300 t
      WHERE t.Z1=1 AND t.C7=1
        AND CAST(t.P2 AS CHAR) = att.employee_id
        AND CONCAT(LEFT(t.C2,4), '-', SUBSTR(t.C2,5,2), '-', SUBSTR(t.C2,7,2)) = att.date
    )
  `);
  console.log('  a3s_attendances with matching T1300 C7=1:', testMatch[0].c);

  // Step 2: Do the UPDATE
  console.log('\n=== Step 2: Backfill meal_allowance ===');
  
  // Using IN clause with subquery to avoid collation issues
  const [result] = await pool.execute(`
    UPDATE a3s_attendances att
    SET att.meal_allowance = 1
    WHERE EXISTS (
      SELECT 1 FROM db_zhty202410.T1300 t
      WHERE t.Z1=1 AND t.C7=1
        AND CAST(t.P2 AS CHAR) = att.employee_id
        AND CONCAT(LEFT(t.C2,4), '-', SUBSTR(t.C2,5,2), '-', SUBSTR(t.C2,7,2)) = att.date
    )
  `);
  console.log('  Updated:', result.affectedRows);

  // Step 3: Verify
  const [v] = await pool.execute('SELECT meal_allowance, COUNT(*) as c FROM a3s_attendances GROUP BY meal_allowance');
  v.forEach(r => console.log('  meal=' + r.meal_allowance + ': ' + r.c));

  // Step 4: Check the Mexican employees this week
  console.log('\n=== Step 4: Mexican employees this week ===');
  const [mex] = await pool.execute(`
    SELECT att.employee_name, att.date, MAX(att.meal_allowance) as meal
    FROM a3s_attendances att
    WHERE att.employee_name LIKE 'A%' AND att.date >= '2026-04-27'
    GROUP BY att.employee_name, att.date
    ORDER BY att.employee_name, att.date
  `);
  mex.forEach(r => console.log(' ', r.employee_name, r.date, 'meal:', r.meal));

  await pool.end();
})();

const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({
    host: '43.166.250.145', port: 3306, user: 'dbo001',
    password: 'BDQN123456', database: 'db_zhty202410',
    waitForConnections: true, connectionLimit: 2
  });

  // Verify: check a few employees
  const [emp] = await pool.execute(`
    SELECT att.employee_name, att.meal_allowance, COUNT(*) as c
    FROM a3s_attendances att
    WHERE att.employee_name IN ('张善锦', '王雄', '董事长')
    GROUP BY att.employee_name, att.meal_allowance
    ORDER BY att.employee_name, att.meal_allowance
  `);
  console.log('=== Sample employees meal_allowance scan ===');
  emp.forEach(r => console.log(' ', r.employee_name, 'meal:', r.meal_allowance, 'count:', r.c));

  // Sample: 张善锦 on 2025-02-03 (C7=1)
  const [zhang] = await pool.execute(
    "SELECT id, date, employee_name, meal_allowance FROM a3s_attendances WHERE employee_id = '1880696069134880800' AND date = '2025-02-03'"
  );
  console.log('\n张善锦 2025-02-03:', zhang[0]?.meal_allowance);

  // Count employees with meal_allowance in consolidated view
  const [countMeal] = await pool.execute(`
    SELECT COUNT(*) as c FROM (
      SELECT date, employee_id, MAX(meal_allowance) as has_meal
      FROM a3s_attendances
      GROUP BY date, employee_id
      HAVING has_meal = 1
    ) t
  `);
  console.log('Consolidated employee+date days with meal:', countMeal[0].c);

  // Overall stats
  const [stats] = await pool.execute(`
    SELECT 
      COUNT(*) as total_rows,
      SUM(CASE WHEN meal_allowance=1 THEN 1 ELSE 0 END) as with_meal,
      SUM(CASE WHEN meal_allowance=0 THEN 1 ELSE 0 END) as without_meal
    FROM a3s_attendances
  `);
  console.log('\nOverall:', stats[0].total_rows, 'rows,', stats[0].with_meal, 'with meal,', stats[0].without_meal, 'without');

  await pool.end();
})();

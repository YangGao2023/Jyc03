const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({
    host: '43.166.250.145', port: 3306, user: 'dbo001',
    password: 'BDQN123456', database: 'db_zhty202410',
    waitForConnections: true, connectionLimit: 2
  });

  // For A艾丽斯 Apr 27-30: check meal_allowance for ALL records (including duplicates)
  const [all] = await pool.execute(`
    SELECT id, date, employee_name, worked_minutes, meal_allowance, generated_by, note
    FROM a3s_attendances
    WHERE employee_id='1904152978684776400' AND date >= '2026-04-27' AND date <= '2026-04-30'
    ORDER BY date, id
  `);
  console.log('=== A艾丽斯 ALL records Apr 27-30 ===');
  all.forEach(r => console.log(' ', r.date, 'id:', r.id.toString(), 'worked:', r.worked_minutes, 'meal:', r.meal_allowance, 'gen:', r.generated_by?.slice(0,20)));

  // Also check after GROUP BY consolidation
  const [consolidated] = await pool.execute(`
    SELECT 
      CONCAT('ATT-', REPLACE(date, '-', ''), '-', COALESCE(NULLIF(employee_code,""), employee_id)) as id,
      date, employee_name,
      SUM(worked_minutes) as worked,
      SUM(leave_minutes) as leave,
      SUM(overtime_minutes) as ot,
      MAX(meal_allowance) as meal
    FROM a3s_attendances
    WHERE employee_id='1904152978684776400' AND date >= '2026-04-27' AND date <= '2026-04-30'
    GROUP BY date, employee_id, employee_name, employee_code
    ORDER BY date
  `);
  console.log('\n=== A艾丽斯 CONSOLIDATED Apr 27-30 ===');
  consolidated.forEach(r => console.log(' ', r.date, 'worked:', r.worked, 'leave:', r.leave, 'ot:', r.ot, 'meal:', r.meal));

  await pool.end();
})();

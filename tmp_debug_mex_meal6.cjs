const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({
    host: '43.166.250.145', port: 3306, user: 'dbo001',
    password: 'BDQN123456', database: 'db_zhty202410',
    waitForConnections: true, connectionLimit: 2
  });

  // Count records by id length groups
  const [byLen] = await pool.execute(`
    SELECT 
      CASE 
        WHEN LENGTH(CAST(id AS CHAR)) < 14 THEN 'small (<14)'
        WHEN LENGTH(CAST(id AS CHAR)) BETWEEN 14 AND 15 THEN 'medium (14-15, T1300)'
        WHEN LENGTH(CAST(id AS CHAR)) BETWEEN 16 AND 17 THEN 'large (16-17, auto-gen)'
        ELSE 'huge (>17)'
      END as group_name,
      COUNT(*) as c,
      AVG(meal_allowance) as avg_meal,
      COUNT(DISTINCT CONCAT(date, employee_id)) as unique_days
    FROM a3s_attendances
    GROUP BY group_name
    ORDER BY MIN(LENGTH(CAST(id AS CHAR)))
  `);
  console.log('=== Records by id length ===');
  byLen.forEach(r => console.log(' ', r.group_name, ':', r.c, 'avg_meal:', r.avg_meal, 'unique_days:', r.unique_days));

  // Check the auto-generated record ids pattern
  const [autoSample] = await pool.execute(`
    SELECT id, date, employee_name, worked_minutes, meal_allowance, created_at
    FROM a3s_attendances
    WHERE LENGTH(CAST(id AS CHAR)) >= 16
    LIMIT 5
  `);
  console.log('\n=== Auto-generated records sample ===');
  autoSample.forEach(r => console.log('  id:', r.id.toString().slice(0, 25), 'date:', r.date, 'name:', r.employee_name, 'worked:', r.worked_minutes, 'meal:', r.meal_allowance, 'created:', r.created_at));

  // Are these from a cron-generated batch?
  const [createdAtDist] = await pool.execute(`
    SELECT DATE(created_at) as day, COUNT(*) as c
    FROM a3s_attendances
    GROUP BY DATE(created_at)
    ORDER BY day
  `);
  console.log('\n=== records by created_at day ===');
  createdAtDist.forEach(r => console.log(' ', r.day, ':', r.c, 'rows'));

  // Check A艾丽斯 - do the migration records exist at all?
  const [aliceAll] = await pool.execute(`
    SELECT id, date, employee_name, LENGTH(CAST(id AS CHAR)) as id_len
    FROM a3s_attendances
    WHERE employee_name = 'A艾丽斯'
    ORDER BY date
    LIMIT 10
  `);
  console.log('\n=== A艾丽斯 ALL attendance records ===');
  aliceAll.forEach(r => console.log('  id:', r.id.toString(), 'len:', r.id_len, 'date:', r.date));

  await pool.end();
})();

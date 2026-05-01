const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({
    host: '43.166.250.145', port: 3306, user: 'dbo001',
    password: 'BDQN123456', database: 'db_zhty202410',
    waitForConnections: true, connectionLimit: 2
  });

  // 1. Check consolidated attendance: pick a recent date range
  const [consolidated] = await pool.execute(`
    SELECT 
      CONCAT('ATT-', REPLACE(date, '-', ''), '-', COALESCE(NULLIF(employee_code,""), employee_id)) as id,
      date, employee_id, employee_name, employee_code,
      SUM(worked_minutes) as worked_raw,
      SUM(leave_minutes) as leave_minutes,
      SUM(overtime_minutes) as overtime_minutes
    FROM a3s_attendances 
    WHERE date >= '2026-04-20' AND date <= '2026-04-30'
    GROUP BY date, employee_id, employee_name, employee_code
    ORDER BY date DESC, employee_id
    LIMIT 30
  `);
  console.log('=== Consolidated attendance (Apr 20-30, first 30) ===');
  console.log('date\temp\tname\tworked_raw\tleave\tovertime');
  consolidated.forEach(r => console.log(r.date, r.employee_id, r.employee_name, r.worked_raw, r.leave_minutes, r.overtime_minutes));

  // 2. Count how many unique employee+date combos exist
  const [count] = await pool.execute(`
    SELECT COUNT(*) as c FROM (
      SELECT date, employee_id FROM a3s_attendances GROUP BY date, employee_id
    ) as t
  `);
  console.log(`\nUnique employee+date combos: ${count[0].c} (vs 9864 raw T1300 rows)`);

  // 3. Check for multi-record days
  const [multi] = await pool.execute(`
    SELECT date, employee_id, employee_name, COUNT(*) as records
    FROM a3s_attendances
    GROUP BY date, employee_id
    HAVING COUNT(*) > 1
    ORDER BY records DESC
    LIMIT 10
  `);
  console.log('\n=== Multi-record days (top 10) ===');
  multi.forEach(r => console.log(r.date, r.employee_id, r.employee_name, r.records + ' records'));

  await pool.end();
})();

/**
 * 从 T1300.C7 回填 a3s_attendances.meal_allowance
 * T1300 的饭补是 per-event 的（上班/加班记录有饭补），
 * 按 employee + date 合并后，只要当天有饭补就算 true
 */
const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({
    host: '43.166.250.145', port: 3306, user: 'dbo001',
    password: 'BDQN123456', database: 'db_zhty202410',
    waitForConnections: true, connectionLimit: 2
  });

  const [result] = await pool.execute(`
    UPDATE a3s_attendances att
    JOIN (
      SELECT P2 as emp_id, C2 as raw_date
      FROM db_zhty202410.T1300
      WHERE Z1=1 AND C7=1
      GROUP BY P2, C2
    ) t
      ON CAST(att.employee_id AS CHAR) = CAST(t.emp_id AS CHAR)
      AND REPLACE(att.date, '-', '') = t.raw_date
    SET att.meal_allowance = 1
  `);
  console.log(`✅ 回填 meal_allowance: ${result.affectedRows} 条`);

  // Verify
  const [v] = await pool.execute('SELECT meal_allowance, COUNT(*) as c FROM a3s_attendances GROUP BY meal_allowance');
  v.forEach(r => console.log(`  meal_allowance=${r.meal_allowance}: ${r.c} 条`));

  await pool.end();
})();

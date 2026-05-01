const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({
    host: '43.166.250.145', port: 3306, user: 'dbo001',
    password: 'BDQN123456', database: 'db_zhty202410',
    waitForConnections: true, connectionLimit: 2
  });

  // Approach 1: Use id match (a3s.id = T1300.P1)
  console.log('=== Approach 1: id match ===');
  const [r1] = await pool.execute(`
    UPDATE a3s_attendances att
    SET att.meal_allowance = 1
    WHERE CAST(att.id AS DECIMAL(30)) IN (
      SELECT t.P1 FROM db_zhty202410.T1300 t WHERE t.Z1=1 AND t.C7=1
    )
  `);
  console.log('Updated:', r1.affectedRows);

  // Verify
  const [v] = await pool.execute('SELECT meal_allowance, COUNT(*) as c FROM a3s_attendances GROUP BY meal_allowance');
  v.forEach(r => console.log('  meal=' + r.meal_allowance + ': ' + r.c));

  await pool.end();
})();

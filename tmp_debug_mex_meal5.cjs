const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({
    host: '43.166.250.145', port: 3306, user: 'dbo001',
    password: 'BDQN123456', database: 'db_zhty202410',
    waitForConnections: true, connectionLimit: 2
  });

  // Verify A艾丽斯 T1300 exact records
  const [t1300Alice] = await pool.execute(
    "SELECT P2, C2, C1, C5, C7 FROM db_zhty202410.T1300 WHERE P2 = (SELECT P1 FROM db_zhty202410.T1003 WHERE C2='A艾丽斯') AND C2 >= '20260427' AND Z1=1"
  );
  console.log('A艾丽斯 T1300 >= 20260427:', t1300Alice.length);
  t1300Alice.forEach(r => console.log('  C2:', r.C2, 'C1:', r.C1, 'C5:', r.C5, 'C7:', r.C7));

  // Check created_at for the big-id records
  const [created] = await pool.execute(`
    SELECT id, date, created_at, generated_by, meal_allowance
    FROM a3s_attendances
    WHERE employee_id='1904152978684776400' AND date >= '2026-04-27'
    ORDER BY id
  `);
  console.log('\nA艾丽斯 big-id records creation time:');
  created.forEach(r => console.log('  id:', r.id.toString(), 'date:', r.date, 'created:', r.created_at, 'gen:', r.generated_by, 'meal:', r.meal_allowance));

  // How many total records have large ids (not from migration)?
  const [largeIds] = await pool.execute(
    "SELECT COUNT(*) as c FROM a3s_attendances WHERE LENGTH(CAST(id AS CHAR)) > 15"
  );
  console.log('\nRecords with id > 15 chars (auto-generated):', largeIds[0].c);

  const [smallIds] = await pool.execute(
    "SELECT COUNT(*) as c FROM a3s_attendances WHERE LENGTH(CAST(id AS CHAR)) <= 15"
  );
  console.log('Records with id <= 15 chars (from migration):', smallIds[0].c);

  await pool.end();
})();

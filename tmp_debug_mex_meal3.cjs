const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({
    host: '43.166.250.145', port: 3306, user: 'dbo001',
    password: 'BDQN123456', database: 'db_zhty202410',
    waitForConnections: true, connectionLimit: 2
  });

  // Check last T1300 dates for Mexican employees
  const [lastDates] = await pool.execute(`
    SELECT t.P2, e.C2 as name, MAX(t.C2) as last_date, COUNT(*) as total
    FROM db_zhty202410.T1300 t
    JOIN db_zhty202410.T1003 e ON t.P2 = e.P1
    WHERE t.Z1=1 AND e.C2 LIKE 'A%' AND e.Z1=1
    GROUP BY t.P2, e.C2
    ORDER BY e.C2
  `);
  console.log('=== Last T1300 records for Mexican employees ===');
  lastDates.forEach(r => console.log(' ', r.name, 'last:', r.last_date, 'total:', r.total));

  // Check a3s_attendances ids for these recent records - where did they come from?
  const [attRecent] = await pool.execute(`
    SELECT att.id, att.date, att.employee_name, att.worked_minutes, att.note
    FROM a3s_attendances att
    WHERE att.employee_name LIKE 'A%' AND att.date >= '2026-04-27'
    ORDER BY att.employee_name, att.date
  `);
  console.log('\n=== a3s_attendances recent records for A employees ===');
  attRecent.forEach(r => console.log(' ', r.employee_name, r.date, 'id:', r.id, 'worked:', r.worked_minutes, 'note:', r.note?.slice(0,30)));

  // Are these from the migration or auto-generated?
  console.log('\n=== Check id format for these records ===');
  for (const r of attRecent.slice(0, 4)) {
    const [t1300] = await pool.execute(
      "SELECT COUNT(*) as c FROM db_zhty202410.T1300 WHERE P1=?",
      [parseInt(r.id)]
    );
    console.log('  id:', r.id, 'exists in T1300:', t1300[0].c > 0);
  }

  await pool.end();
})();

const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({
    host: '43.166.250.145', port: 3306, user: 'dbo001',
    password: 'BDQN123456', database: 'db_zhty202410',
    waitForConnections: true, connectionLimit: 2
  });

  // Case study: A艾丽斯 on a recent day with attendance
  const [aAlice] = await pool.execute(
    "SELECT P2, C2, C1, C5, C7 FROM db_zhty202410.T1300 WHERE Z1=1 AND P2=1904152978684776400 AND C2 >= '20260427' ORDER BY C2"
  );
  console.log('=== A艾丽斯 T1300 Apr 27-30 ===');
  aAlice.forEach(r => console.log('  C2:', r.C2, 'C1:', r.C1, '(0=work/1=leave/2=ot)', 'C5:', r.C5, 'min', 'C7:', r.C7));

  // Check a3s_attendances for same period
  const [attAlice] = await pool.execute(
    "SELECT id, date, meal_allowance FROM a3s_attendances WHERE employee_id='1904152978684776400' AND date >= '2026-04-27' AND date <= '2026-04-30' ORDER BY date"
  );
  console.log('\n=== A艾丽斯 a3s_attendances Apr 27-30 ===');
  for (const a of attAlice) {
    // Check if this id matches T1300 with C7=1
    const [t] = await pool.execute(
      "SELECT C7 FROM db_zhty202410.T1300 WHERE P1=?",
      [parseInt(a.id)]
    );
    console.log('  date:', a.date, 'id:', a.id, 'meal:', a.meal_allowance, 't.C7:', t[0]?.C7 ?? 'no match');
  }

  // Also check A文森
  console.log('\n=== A文森 T1300 Apr 27-30 ===');
  const [awen] = await pool.execute(
    "SELECT P2, C2, C1, C5, C7 FROM db_zhty202410.T1300 WHERE Z1=1 AND P2=1906699838796468200 AND C2 >= '20260427' ORDER BY C2"
  );
  awen.forEach(r => console.log('  C2:', r.C2, 'C1:', r.C1, 'C5:', r.C5, 'C7:', r.C7));

  const [attWen] = await pool.execute(
    "SELECT id, date, meal_allowance FROM a3s_attendances WHERE employee_id='1906699838796468200' AND date >= '2026-04-27' AND date <= '2026-04-30' ORDER BY date"
  );
  console.log('=== A文森 a3s_attendances Apr 27-30 ===');
  for (const a of attWen) {
    const [t] = await pool.execute(
      "SELECT C7 FROM db_zhty202410.T1300 WHERE P1=?",
      [parseInt(a.id)]
    );
    console.log('  date:', a.date, 'id:', a.id, 'meal:', a.meal_allowance, 't.C7:', t[0]?.C7 ?? 'no match');
  }

  await pool.end();
})();

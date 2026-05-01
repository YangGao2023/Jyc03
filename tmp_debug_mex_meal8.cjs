const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({
    host: '43.166.250.145', port: 3306, user: 'dbo001',
    password: 'BDQN123456', database: 'db_zhty202410',
    waitForConnections: true, connectionLimit: 2
  });

  // Check T1300 C7=1 for A加百列 and A戴比스 this week
  const [mexT1300] = await pool.execute(`
    SELECT e.C2 as name, t.C2 as raw_date, t.C1 as type, t.C5 as mins, t.C7
    FROM db_zhty202410.T1300 t
    JOIN db_zhty202410.T1003 e ON t.P2 = e.P1
    WHERE e.C2 IN ('A加百列', 'A戴比斯')
      AND t.C2 >= '20260427' AND t.Z1=1
    ORDER BY e.C2, t.C2
  `);
  console.log('=== T1300 for A加百列 and A戴比斯 this week ===');
  mexT1300.forEach(r => console.log(' ', r.name, r.raw_date, 'type:', r.type, 'mins:', r.mins, 'C7:', r.C7));

  // Check a3s_attendances for the same
  const [mexAtt] = await pool.execute(`
    SELECT employee_name, date, MAX(meal_allowance) as meal
    FROM a3s_attendances
    WHERE employee_name IN ('A加百列', 'A戴比斯') AND date >= '2026-04-27'
    GROUP BY employee_name, date
    ORDER BY employee_name, date
  `);
  console.log('\n=== a3s_attendances for same employees ===');
  mexAtt.forEach(r => console.log(' ', r.employee_name, r.date, 'meal:', r.meal ? '✅' : '❌'));

  await pool.end();
})();

const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({host:'43.166.250.145',port:3306,user:'dbo001',password:'BDQN123456',database:'db_zhty202410',connectionLimit:2});

  // How many T1200 P3='110' actually have matching cash_entries?
  const [match] = await pool.execute(`
    SELECT COUNT(*) as cnt, SUM(CASE WHEN t.Z2=1 THEN 1 ELSE 0 END) as income,
           SUM(CASE WHEN t.Z2=0 THEN 1 ELSE 0 END) as expense
    FROM T1200 t
    LEFT JOIN a3s_cash_entries c ON c.old_id = t.P1
    WHERE t.Z1=1 AND t.P3='110' AND c.id IS NOT NULL
  `);
  console.log('T1200 P3=110 with cash_entries match:', match[0]);

  // Those that DON'T match
  const [noMatch] = await pool.execute(`
    SELECT COUNT(*) as cnt, t.Z2
    FROM T1200 t
    LEFT JOIN a3s_cash_entries c ON c.old_id = t.P1
    WHERE t.Z1=1 AND t.P3='110' AND c.id IS NULL
    GROUP BY t.Z2
  `);
  console.log('T1200 P3=110 WITHOUT cash_entries match:');
  noMatch.forEach(r => console.log(`  Z2=${r.Z2}: ${r.cnt} records`));

  // Check if expenses matching works for T1200 (Z2=0) records
  const [expMatch] = await pool.execute(`
    SELECT COUNT(*) as cnt
    FROM T1200 t
    LEFT JOIN a3s_expenses e ON e.old_id = t.P1
    WHERE t.Z1=1 AND t.P3='110' AND t.Z2=0 AND e.id IS NOT NULL
  `);
  console.log('\nT1200 P3=110 Z2=0 with a3s_expenses match:', expMatch[0].cnt);

  // Sample unmatched records
  const [sample] = await pool.execute(`
    SELECT t.P1, t.Z2, t.C5/100 as amt, t.C6, t.C7, t.C3
    FROM T1200 t
    LEFT JOIN a3s_cash_entries c ON c.old_id = t.P1
    WHERE t.Z1=1 AND t.P3='110' AND c.id IS NULL AND t.Z2=1
    LIMIT 5
  `);
  console.log('\nSample unmatched income records:');
  sample.forEach(r => console.log(`  P1=${r.P1}, Z2=${r.Z2}, $${r.amt}, ${r.C6}, note=${r.C7||r.C3||''}`));

  // What about id match (inc-{P1})?
  // Show the first few unmatched P1 values  
  const [check] = await pool.execute(`
    SELECT t.P1 AS p1_value, t.P1 > 999999999999999999 as too_big
    FROM T1200 t
    WHERE t.Z1=1 AND t.P3='110' AND t.Z2=1
    LIMIT 10
  `);
  console.log('\nSample P1 values (income):');
  check.forEach(r => console.log(`  P1=${r.p1_value}, too_big=${r.too_big}`));

  await pool.end();
})();

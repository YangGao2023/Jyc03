const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({
    host: '43.166.250.145', port: 3306, user: 'dbo001',
    password: 'BDQN123456', database: 'db_zhty202410',
    waitForConnections: true, connectionLimit: 2
  });

  // Get T1300 C7=1 records with employee name
  // T1003.C2 has name, T1300.P2 = T1003.P1
  const [t1300meals] = await pool.execute(`
    SELECT DISTINCT 
      t.C2 as raw_date,
      e.C2 as emp_name
    FROM db_zhty202410.T1300 t
    JOIN db_zhty202410.T1003 e ON t.P2 = e.P1
    WHERE t.Z1=1 AND t.C7=1
  `);
  console.log('T1300 C7=1 unique date+name:', t1300meals.length);

  // Build lookup: name → Set of dates
  const mealLookup = new Map();
  for (const r of t1300meals) {
    const date = r.raw_date.slice(0, 4) + '-' + r.raw_date.slice(4, 6) + '-' + r.raw_date.slice(6, 8);
    const list = mealLookup.get(r.emp_name) || new Set();
    list.add(date);
    mealLookup.set(r.emp_name, list);
  }

  // Get all a3s_attendances with meal=0
  const [attendance] = await pool.execute("SELECT id, date, employee_name FROM a3s_attendances WHERE meal_allowance = 0");
  console.log('a3s_attendances with meal=0:', attendance.length);

  // Match by employee_name + date
  let batch = [];
  let updated = 0;
  for (const a of attendance) {
    const empDates = mealLookup.get(a.employee_name);
    if (empDates && empDates.has(a.date)) {
      batch.push(a.id);
      if (batch.length >= 500) {
        const [res] = await pool.execute(
          'UPDATE a3s_attendances SET meal_allowance = 1 WHERE id IN (' + batch.map(() => '?').join(',') + ')',
          batch
        );
        updated += res.affectedRows;
        batch = [];
      }
    }
  }
  if (batch.length > 0) {
    const [res] = await pool.execute(
      'UPDATE a3s_attendances SET meal_allowance = 1 WHERE id IN (' + batch.map(() => '?').join(',') + ')',
      batch
    );
    updated += res.affectedRows;
  }
  console.log('Updated:', updated);

  // Verify
  const [v] = await pool.execute('SELECT meal_allowance, COUNT(*) as c FROM a3s_attendances GROUP BY meal_allowance');
  v.forEach(r => console.log('  meal=' + r.meal_allowance + ': ' + r.c));

  // Check Mexican employees this week
  const [mex] = await pool.execute(`
    SELECT employee_name, date, MAX(meal_allowance) as meal
    FROM a3s_attendances
    WHERE employee_name LIKE 'A%' AND date >= '2026-04-27'
    GROUP BY employee_name, date
    ORDER BY employee_name, date
  `);
  console.log('\n=== Mexican employees this week ===');
  mex.forEach(r => console.log(' ', r.employee_name, r.date, r.meal ? '✅' : '❌'));

  // Overall stats
  const [stats] = await pool.execute(`
    SELECT COUNT(*) as c FROM (
      SELECT date, employee_id, MAX(meal_allowance) as meal
      FROM a3s_attendances
      GROUP BY date, employee_id
      HAVING meal = 1
    ) t
  `);
  console.log('\nUnique employee+date days with meal:', stats[0].c);

  await pool.end();
})();

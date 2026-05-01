const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({host:'43.166.250.145',port:3306,user:'dbo001',password:'BDQN123456',database:'db_zhty202410',connectionLimit:2});

  // Check when migration last ran - look at created_at distribution
  const [ts] = await pool.execute(`
    SELECT DATE(created_at) as d, COUNT(*) as cnt, ROUND(SUM(amount),2) as total
    FROM a3s_cash_entries WHERE created_at IS NOT NULL
    GROUP BY DATE(created_at) ORDER BY d
  `);
  console.log('cash_entries by created_at date:');
  ts.forEach(r => console.log(`  ${r.d}: ${r.cnt} entries, $${r.total}`));

  // Check a3s_office_transfers schema
  const [otCols] = await pool.execute("SHOW COLUMNS FROM a3s_office_transfers");
  console.log('\na3s_office_transfers columns:');
  otCols.forEach(c => console.log(`  ${c.Field} ${c.Type}`));

  // Check what T1210 represents - sample
  const [t1210] = await pool.execute("SELECT * FROM T1210 WHERE Z1=1 LIMIT 5");
  console.log('\nT1210 sample:');
  t1210.forEach(r => console.log(JSON.stringify(r)));

  await pool.end();
})();

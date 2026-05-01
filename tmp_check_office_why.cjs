const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({host:'43.166.250.145',port:3306,user:'dbo001',password:'BDQN123456',database:'db_zhty202410',connectionLimit:2});

  // Total cash entries count
  const [total] = await pool.execute("SELECT COUNT(*) as c FROM a3s_cash_entries");
  console.log('Total cash_entries:', total[0].c);

  // Check if T1210-sourced entries exist at all
  const [t1210] = await pool.execute("SELECT COUNT(*) as c FROM a3s_cash_entries WHERE source_type='office-transfer'");
  console.log('office-transfer entries:', t1210[0].c);

  // Check when the last insert/update happened across all cash_entries
  const [latest] = await pool.execute("SELECT MAX(created_at) as latest FROM a3s_cash_entries");
  console.log('Latest created_at:', latest[0].latest);

  // Check the cash_entries schema for column info
  const [cols] = await pool.execute("SHOW FULL COLUMNS FROM a3s_cash_entries");
  console.log('\nColumns:');
  cols.forEach(c => console.log(c.Field, c.Type, c.Default));

  // Check if old_id exists and what values are there
  const [withOldId] = await pool.execute("SELECT COUNT(*) as c FROM a3s_cash_entries WHERE old_id IS NOT NULL AND old_id > 0");
  console.log('\nEntries with old_id:', withOldId[0].c);

  // Check T1200 for P3='110' (office) entries
  const [t1200Office] = await pool.execute("SELECT COUNT(*) as c, SUM(Z2) as dir FROM T1200 WHERE Z1=1 AND P3='110'");
  console.log('\nT1200 P3=110:', t1200Office[0].c, 'records, Z2 sum:', t1200Office[0].dir);

  // T1210 total
  const [t1210rows] = await pool.execute("SELECT COUNT(*) as c FROM T1210 WHERE Z1=1");
  console.log('T1210 active records:', t1210rows[0].c);

  await pool.end();
})();

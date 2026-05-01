const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({host:'43.166.250.145',port:3306,user:'dbo001',password:'BDQN123456',database:'db_zhty202410',connectionLimit:2});

  // Check T1113 (office transfers in old system)
  try {
    const [t1113] = await pool.execute("SHOW TABLES LIKE 'T1113'");
    if (t1113.length > 0) {
      const [cnt] = await pool.execute("SELECT COUNT(*) as c FROM T1113");
      console.log('T1113 count:', cnt[0].c);
      const [sample] = await pool.execute("SELECT * FROM T1113 LIMIT 10");
      sample.forEach(r => console.log(JSON.stringify(r)));
    }
  } catch(e) { console.log('T1113 error:', e.message); }

  // Check if there's an office table
  const [tables] = await pool.execute("SHOW TABLES LIKE '%office%'");
  console.log('Office tables:', tables.map(t => Object.values(t)[0]));

  // Check if there's a T1200 or T1112
  const [t1200like] = await pool.execute("SHOW TABLES LIKE 'T1112'");
  console.log('T1112 exists:', t1200like.length > 0);

  // Check how the office balance was previously stored
  // Look at non-income/expense cash_entries
  const [nonStandard] = await pool.execute("SELECT DISTINCT type FROM a3s_cash_entries");
  console.log('Cash entry types:', nonStandard.map(r => r.type));

  // Check expenses with office flag
  const [expOff] = await pool.execute("SELECT COUNT(*) as c, COALESCE(SUM(amount),0) as total FROM a3s_expenses WHERE office=1");
  console.log('Expenses with office=1:', expOff[0].c, expOff[0].total);

  // All cash entries
  const [allCE] = await pool.execute("SELECT id, type, amount, note, category, source_type, office, created_at FROM a3s_cash_entries ORDER BY created_at DESC LIMIT 20");
  console.log('\nRecent cash entries:');
  allCE.forEach(r => console.log(r.id, r.type, r.amount, r.office, r.note?.substring(0,40), r.created_at));

  await pool.end();
})();

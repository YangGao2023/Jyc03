const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({host:'43.166.250.145',port:3306,user:'dbo001',password:'BDQN123456',database:'db_zhty202410',connectionLimit:2});
  
  // Check ALL cash_entries regardless of office flag
  const [all] = await pool.execute("SELECT type, COUNT(*) as cnt, COALESCE(SUM(amount),0) as total FROM a3s_cash_entries GROUP BY type");
  console.log('All cash_entries by type:', all);

  // Check all cash_entries
  const [totalCE] = await pool.execute("SELECT COUNT(*) as c FROM a3s_cash_entries");
  console.log('Total cash_entries:', totalCE[0].c);

  // Look for any records with office-related notes or categories
  const [officeLike] = await pool.execute("SELECT id, type, amount, note, category, created_at FROM a3s_cash_entries WHERE note LIKE '%办公%' OR note LIKE '%办公室%' OR category LIKE '%办公%' OR category LIKE '%办公室%' LIMIT 10");
  console.log('Office-like entries:', officeLike.length);
  officeLike.forEach(r => console.log(JSON.stringify(r)));

  // Check the biz-store snapshot
  const [snap] = await pool.execute("SELECT snapshot_value FROM a3s_biz_snapshots ORDER BY revision DESC LIMIT 1");
  if (snap.length > 0) {
    const data = JSON.parse(snap[0].snapshot_value);
    if (data.cashEntries) {
      const officeEntries = data.cashEntries.filter(e => e.office === 1 || e.office === true);
      console.log('\nSnapshot office entries:', officeEntries.length);
      officeEntries.forEach(e => console.log(e.id, e.type, e.amount, e.note, e.date));
    }
  } else {
    console.log('No snapshots found');
  }

  await pool.end();
})();

const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({host:'43.166.250.145',port:3306,user:'dbo001',password:'BDQN123456',database:'db_zhty202410',connectionLimit:2});

  // Check a3s_office_transfers
  const [offTrans] = await pool.execute("SELECT COUNT(*) as c FROM a3s_office_transfers");
  console.log('a3s_office_transfers:', offTrans[0].c);
  
  const [offSample] = await pool.execute("SELECT * FROM a3s_office_transfers LIMIT 10");
  offSample.forEach(r => console.log(JSON.stringify(r)));

  // Check if cash_entries have source_type = 'office-transfer'
  const [srcType] = await pool.execute("SELECT source_type, COUNT(*) as cnt, COALESCE(SUM(amount),0) as total FROM a3s_cash_entries GROUP BY source_type");
  console.log('\ncash_entries by source_type:');
  srcType.forEach(r => console.log(r.source_type, r.cnt, r.total));

  // Check for entries with office=1 by source_type
  const [offSrc] = await pool.execute("SELECT source_type, COUNT(*) as cnt, COALESCE(SUM(amount),0) as total FROM a3s_cash_entries WHERE office=1 GROUP BY source_type");
  console.log('\nOffice entries by source_type:');
  offSrc.forEach(r => console.log(r.source_type, r.cnt, r.total));

  // full list of all office entries
  const [offList] = await pool.execute("SELECT id, type, amount, note, category, source_type, created_at FROM a3s_cash_entries WHERE office=1 ORDER BY created_at");
  console.log('\nAll office cash entries:');
  offList.forEach(r => console.log(r.id, r.type, r.amount, r.note?.substring(0,30), r.source_type, r.created_at));

  await pool.end();
})();

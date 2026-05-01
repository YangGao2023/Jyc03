const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({host:'43.166.250.145',port:3306,user:'dbo001',password:'BDQN123456',database:'db_zhty202410',connectionLimit:2});
  
  // Count office cash entries
  const [cnt] = await pool.execute("SELECT COUNT(*) as c, COALESCE(SUM(amount),0) as total FROM a3s_cash_entries WHERE office=1");
  console.log('Office cash_entries:', cnt[0].c, 'entries, total:', cnt[0].total);
  
  // By type
  const [byType] = await pool.execute("SELECT type, COUNT(*) as cnt, COALESCE(SUM(amount),0) as total FROM a3s_cash_entries WHERE office=1 GROUP BY type");
  console.log('By type:', byType);

  // Office expenses
  const [exp] = await pool.execute("SELECT COUNT(*) as c, COALESCE(SUM(amount),0) as total FROM a3s_expenses WHERE office=1");
  console.log('Office expenses:', exp[0].c, 'entries, total:', exp[0].total);
  
  await pool.end();
})();

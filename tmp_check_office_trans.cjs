const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({host:'43.166.250.145',port:3306,user:'dbo001',password:'BDQN123456',database:'db_zhty202410',connectionLimit:2});

  // Full office transfers  
  const [trans] = await pool.execute("SELECT type, COUNT(*) as cnt, COALESCE(SUM(amount),0) as total FROM a3s_office_transfers GROUP BY type");
  console.log('Office transfers by type:', trans);

  // Running balance
  const [allTrans] = await pool.execute("SELECT type, amount, note, date FROM a3s_office_transfers ORDER BY created_at");
  let bal = 0;
  allTrans.forEach(t => {
    if (t.type === '转入') bal += Number(t.amount);
    else bal -= Number(t.amount);
  });
  console.log('Office transfers total balance:', bal);

  // Check if there's a sync script in init
  const [scripts] = await pool.execute("SHOW PROCEDURE STATUS WHERE db='db_zhty202410'");
  console.log('Stored procedures:', scripts.length);
  
  await pool.end();
})();

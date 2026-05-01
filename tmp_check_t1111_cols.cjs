const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({host:'43.166.250.145',port:3306,user:'dbo001',password:'BDQN123456',database:'db_zhty202410',connectionLimit:2});
  
  // Full column list for T1111
  const [cols] = await pool.execute("SHOW FULL COLUMNS FROM T1111");
  console.log('=== ALL T1111 columns ===');
  cols.forEach((c,i) => console.log(i, c.Field, c.Type));

  // Get a full row and look at all values
  const [row] = await pool.execute("SELECT * FROM T1111 WHERE Z1=1 LIMIT 1");
  console.log('\n=== Full row ===');
  for (const [k,v] of Object.entries(row[0])) {
    console.log(k + ':', v);
  }

  await pool.end();
})();

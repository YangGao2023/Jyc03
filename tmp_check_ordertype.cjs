const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({host:'43.166.250.145',port:3306,user:'dbo001',password:'BDQN123456',database:'db_zhty202410',connectionLimit:2});
  const [r] = await pool.execute("SELECT DISTINCT order_type, COUNT(*) as cnt FROM a3s_orders GROUP BY order_type");
  console.log(r);
  await pool.end();
})();

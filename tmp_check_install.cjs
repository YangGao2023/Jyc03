const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({
    host: '43.166.250.145', port: 3306, user: 'dbo001',
    password: 'BDQN123456', database: 'db_zhty202410',
    connectionLimit: 2, supportBigNumbers: true, bigNumberStrings: true,
  });

  const [r] = await pool.execute(
    "SELECT order_number, order_type, install_info FROM a3s_orders WHERE install_info IS NOT NULL AND install_info != '' LIMIT 3"
  );
  console.log('Orders with install:', r.length);
  for (const x of r) console.log(' ', x.order_number, x.order_type, (x.install_info || '').substring(0, 100));

  const [t] = await pool.execute('SELECT COUNT(*) as cnt FROM a3s_orders');
  console.log('Total orders:', t[0].cnt);

  // Check what field stores install info in T1111
  const [old] = await pool.execute(
    "SELECT P1, C1, C7, C8, C9, C10 FROM T1111 WHERE Z1=1 AND (C7 != '' OR C8 != '' OR C9 != '' OR C10 != '') LIMIT 5"
  );
  console.log('\nT1111 with text fields:');
  for (const x of old) console.log(' ', x.P1, x.C1, 'C7:', (x.C7 || '').substring(0, 40), 'C8:', (x.C8 || '').substring(0, 40), 'C9:', (x.C9 || '').substring(0, 40), 'C10:', (x.C10 || '').substring(0, 40));

  // Check a3s_orders columns
  const [cols] = await pool.execute("DESCRIBE a3s_orders");
  console.log('\na3s_orders columns:');
  for (const c of cols) console.log(' ', c.Field, c.Type);

  await pool.end();
})();

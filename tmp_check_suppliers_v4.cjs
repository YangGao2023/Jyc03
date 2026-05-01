const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({
    host: '43.166.250.145', port: 3306, user: 'dbo001',
    password: 'BDQN123456', database: 'db_zhty202410',
    waitForConnections: true, connectionLimit: 2
  });

  // Check suppliers table
  const [col] = await pool.execute("SHOW COLUMNS FROM a3s_suppliers");
  console.log('=== a3s_suppliers columns ===');
  col.forEach(c => console.log(c.Field, c.Type));

  const [cnt] = await pool.execute("SELECT COUNT(*) as c FROM a3s_suppliers");
  console.log('\nSuppliers count:', cnt[0].c);

  if (cnt[0].c > 0) {
    const [rows] = await pool.execute("SELECT * FROM a3s_suppliers LIMIT 5");
    rows.forEach(r => console.log(JSON.stringify(r)));
  } else {
    // Maybe suppliers are stored in a different table? Check T1000 for suppliers
    const [t1000] = await pool.execute("SELECT P1, C2, C3 FROM T1000 WHERE C1=2 LIMIT 50");
    console.log('\nT1000 (C1=2=供应商) sample:');
    t1000.forEach(r => console.log(r.P1, r.C2, r.C3));

    const [t1000cnt] = await pool.execute("SELECT C1, COUNT(*) as c FROM T1000 GROUP BY C1");
    console.log('\nT1000 by C1:');
    t1000cnt.forEach(r => console.log('  C1='+r.C1+':', r.c));

    // Check a3s_clients for is_supplier flag
    const [clCol] = await pool.execute("SHOW COLUMNS FROM a3s_clients");
    console.log('\na3s_clients columns:', clCol.map(c=>c.Field).join(', '));

    const [supClients] = await pool.execute("SELECT id, name, is_supplier, supplier_category FROM a3s_clients WHERE is_supplier=1 LIMIT 10");
    console.log('\nClients with is_supplier=1:', supClients.length);
    supClients.forEach(r => console.log(JSON.stringify(r)));
  }

  await pool.end();
})();

const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({
    host: '43.166.250.145', port: 3306, user: 'dbo001',
    password: 'BDQN123456', database: 'db_zhty202410',
    waitForConnections: true, connectionLimit: 2
  });

  // Check a3s_clients full schema
  const [clCols] = await pool.execute("SHOW COLUMNS FROM a3s_clients");
  console.log('=== a3s_clients columns ===');
  clCols.forEach(c => console.log(c.Field, c.Type, c.Null, c.Default));

  // Check if there's any supplier reference in clients
  const [clRoles] = await pool.execute("SELECT id, name, roles FROM a3s_clients WHERE roles IS NOT NULL AND roles != '' LIMIT 10");
  console.log('\nClients with roles:');
  clRoles.forEach(r => console.log(r.id, r.name, r.roles));

  // Check for supplier-related data in T1000
  console.log('\n=== T1000 C1=2 (supplier codes) ===');
  const [t1000c2] = await pool.execute("SELECT P1, C2, C3 FROM T1000 WHERE C1=2");
  t1000c2.forEach(r => console.log(r.P1, r.C2, r.C3));

  console.log('\n=== T1000 C1=3 (??? codes) ===');
  const [t1000c3] = await pool.execute("SELECT P1, C2, C3 FROM T1000 WHERE C1=3 LIMIT 10");
  t1000c3.forEach(r => console.log(r.P1, r.C2, r.C3));

  // Check if there's a supplier old_id reference - maybe old data in a different table
  const [oldTabs] = await pool.execute("SHOW TABLES LIKE '%supplier%'");
  console.log('\nTables like supplier:', oldTabs.length);
  oldTabs.forEach(t => console.log(Object.values(t)[0]));

  const [oldTabs2] = await pool.execute("SHOW TABLES LIKE '%supply%'");
  console.log('\nTables like supply:', oldTabs2.length);
  oldTabs2.forEach(t => console.log(Object.values(t)[0]));

  // Check T1001 purchase/order records for supplier names
  console.log('\n=== T1001 top-level supplier field check ===');
  const [t1001] = await pool.execute("SELECT C1, C2 FROM T1001 WHERE Z1=1 LIMIT 5");
  t1001.forEach(r => console.log('C1:', r.C1, 'C2:', r.C2));

  // Check if suppliers were imported via a different mechanism
  console.log('\n=== a3s_suppliers: any old_id? ===');
  const [supCols] = await pool.execute("SHOW COLUMNS FROM a3s_suppliers");
  const hasOldId = supCols.some(c => c.Field === 'old_id');
  console.log('Has old_id:', hasOldId);
  if (hasOldId) {
    const [supp] = await pool.execute("SELECT id, name, old_id FROM a3s_suppliers LIMIT 5");
    console.log('Suppliers:', supp.length);
    supp.forEach(r => console.log(r.id, r.name, r.old_id));
  }

  await pool.end();
})();

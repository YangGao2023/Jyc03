const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({
    host: '43.166.250.145', port: 3306, user: 'dbo001',
    password: 'BDQN123456', database: 'db_zhty202410',
    waitForConnections: true, connectionLimit: 2
  });

  // Check ALL old system tables
  const [tables] = await pool.execute("SHOW TABLES FROM db_zhty202410");
  console.log('=== All old system tables ===');
  tables.forEach(t => console.log(' ', Object.values(t)[0]));

  // Also check if F0404 references some other table
  try {
    const [f0404Data] = await pool.execute("SELECT * FROM db_zhty202410.T0404 LIMIT 3");
    console.log('\nT0404 sample:');
    f0404Data.forEach(r => console.log(' ', JSON.stringify(r)));
  } catch(e) {
    console.log('\nT0404 not found:', e.message);
  }

  // Try other table patterns
  for (const tbl of ['T0401', 'T0402', 'T0403', 'T0404', 'T0405', 'T_0404']) {
    try {
      const [cnt] = await pool.execute(`SELECT COUNT(*) as c FROM db_zhty202410.${tbl}`);
      console.log(`${tbl}:`, cnt[0].c, 'rows');
    } catch(e) {
      console.log(`${tbl}: not found`);
    }
  }

  await pool.end();
})();

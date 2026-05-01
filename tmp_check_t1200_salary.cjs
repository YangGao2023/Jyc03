const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({
    host: '43.166.250.145', port: 3306, user: 'dbo001',
    password: 'BDQN123456', database: 'db_zhty202410',
    waitForConnections: true, connectionLimit: 2
  });

  // Check T1200 columns to find amount field
  const [cols] = await pool.execute("SHOW COLUMNS FROM db_zhty202410.T1200");
  console.log('=== T1200 all columns ===');
  cols.forEach(c => console.log(' ', c.Field, c.Type));

  // The salary income from T1200 - figure out the correct column
  // Based on earlier analysis, C8 might be wrong. Let me check what amount col is
  try {
    const [t1200] = await pool.execute(`
      SELECT P1, P2, C3, C4, C5, C6, C7, C8, C9, C10
      FROM db_zhty202410.T1200
      WHERE Z1=1 AND P2 > 0 AND C3=3
      LIMIT 5
    `);
    console.log('\nT1200 salary sample:');
    t1200.forEach(r => console.log(' ', JSON.stringify(r)));
  } catch(e) {
    console.log('Error with C8:', e.message);
    // Try without C8
    const [t12002] = await pool.execute(`
      SELECT P1, P2, C3, C4, C5, C6, C7
      FROM db_zhty202410.T1200
      WHERE Z1=1 AND C3=3
      LIMIT 3
    `);
    console.log('\nT1200 salary sample (without C8):');
    t12002.forEach(r => console.log(' ', JSON.stringify(r)));
  }

  // Also check: F0404 wrote to T1200.C8 (amount) but the actual field may be different
  // The F0404 code says: values({T1200P1},{T1310P1},0,{P2},0,0,3,'{YG[2]}','{rq1}-{rq2}',1,{JE},...
  // So T1200 columns are: P1,P2,P3,P4,P5,P6,C1,C2,C3,C4,C5,C6,C7,T1,T2,Z1
  // Mapping: C1=3 (type), C2=name, C3='rq1-rq2', C4=1, C5=JE (amount?), C6=date, C7=''
  const [t12003] = await pool.execute(`
    SELECT P1, P2, P3, P4, C1, C2, C3, C4, C5, C6, C7, T1, T2, Z1
    FROM db_zhty202410.T1200
    WHERE Z1=1 AND C1=3
    LIMIT 5
  `);
  console.log('\nT1200 C1=3 (full columns):');
  t12003.forEach(r => console.log(' ', JSON.stringify(r)));

  await pool.end();
})();

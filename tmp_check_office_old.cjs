const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({host:'43.166.250.145',port:3306,user:'dbo001',password:'BDQN123456',database:'db_zhty202410',connectionLimit:2});

  // T1113 total balance calculation (old system office transfers)
  const [t1113] = await pool.execute(`
    SELECT 
      CASE WHEN C1=1 THEN '转入' WHEN C1=2 THEN '转出' ELSE '其他' END as type,
      COUNT(*) as cnt,
      COALESCE(SUM(C2),0) as total
    FROM T1113 WHERE Z1=1
    GROUP BY C1
  `);
  console.log('T1113 by C1 (1=转出, 2=转入):', t1113);

  // Full balance from T1113
  const [allT1113] = await pool.execute("SELECT C1, C2, C3, C4, C5 FROM T1113 WHERE Z1=1 ORDER BY T1");
  console.log('T1113 total records:', allT1113.length);
  let bal = 0;
  allT1113.forEach(r => {
    if (r.C1 === 2) bal += Number(r.C2)/100; // 转入=positive
    else bal -= Number(r.C2)/100; // 转出=negative
  });
  console.log('T1113 balance:', bal);

  // Check if T1113 records were ever synced to a3s_cash_entries
  // Look for any entries with source_type containing 't1113' or 'office' or matching old_ids
  const [ce] = await pool.execute(`
    SELECT source_type, source_id, COUNT(*) as cnt, COALESCE(SUM(amount),0) as total 
    FROM a3s_cash_entries 
    WHERE source_type LIKE '%t1113%' OR source_type LIKE '%office%' OR source_type LIKE '%transfer%'
    GROUP BY source_type, source_id
  `);
  console.log('\nCash entries with office/transfer/t1113 source:', ce.length);

  // When was the last time office entries existed?
  // Look for any hints in a3s_office_transfers about what happened
  const [trans] = await pool.execute("SELECT MIN(created_at) as first, MAX(created_at) as last FROM a3s_office_transfers");
  console.log('Office transfers created between:', trans[0].first, 'and', trans[0].last);

  await pool.end();
})();

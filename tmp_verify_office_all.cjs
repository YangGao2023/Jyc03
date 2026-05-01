const mysql = require('mysql2/promise');
(async()=>{
  const c = await mysql.createConnection({host:'43.166.250.145',port:3306,user:'dbo001',password:'BDQN123456',database:'db_zhty202410',supportBigNumbers:true,bigNumberStrings:true});

  // Full cross-check: all T1200 Z2=0 with any office indicator vs cash_entries office flag
  const [r] = await c.execute(`
    SELECT 
      SUM(CASE WHEN c.office=1 THEN 1 ELSE 0 END) as ok,
      SUM(CASE WHEN (c.office IS NULL OR c.office=0) THEN 1 ELSE 0 END) as missing
    FROM T1200 t
    LEFT JOIN a3s_cash_entries c ON c.old_id = t.P1
    WHERE t.Z1=1 AND (t.P3='110' OR t.C1=2)
      AND NOT (t.C1=3 AND t.Z2=1)
  `);
  console.log('T1200 办公室指标 vs cash_entries office=1:');
  console.log('  匹配:', r[0].ok, '条');
  console.log('  缺失:', r[0].missing, '条');

  // Check income records that are office-related
  const [r2] = await c.execute(`
    SELECT SUM(CASE WHEN c.office=1 THEN 1 ELSE 0 END) as ok,
           SUM(CASE WHEN (c.office IS NULL OR c.office=0) THEN 1 ELSE 0 END) as missing
    FROM T1200 t
    LEFT JOIN a3s_cash_entries c ON c.old_id = t.P1 AND c.source_type='t1200'
    WHERE t.Z1=1 AND t.Z2=1 AND t.P3='110'
  `);
  console.log('\nT1200 Z2=1 且有 P3=110 收入:');
  console.log('  cash_entries office=1:', r2[0].ok, '条');
  console.log('  cash_entries office=0:', r2[0].missing, '条');

  await c.end();
})();

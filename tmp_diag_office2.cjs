const mysql = require('mysql2/promise');
(async()=>{
  const c = await mysql.createConnection({host:'43.166.250.145',port:3306,user:'dbo001',password:'BDQN123456',database:'db_zhty202410',supportBigNumbers:true,bigNumberStrings:true});
  
  // Get 5 sample records where T1200 office but cash_entry office=0
  const [r] = await c.execute(`
    SELECT t.P1, t.C5, t.C6, t.C7, t.C3 as tC3, t.P3, 
           c.id as ceid, c.office as ceoff, c.source_type, c.amount as ceamt
    FROM T1200 t
    INNER JOIN a3s_cash_entries c ON c.old_id = t.P1
    WHERE t.Z1=1 AND t.Z2=0 AND t.P3='110' AND c.office=0
    LIMIT 10
  `);
  console.log('10条 T1200办公室 但 cash_entries office=0 的样本:');
  for(const x of r) console.log(' P1:',x.P1,'C5:',x.C5,'C6:',x.C6,'P3:',x.P3,'ceid:',x.ceid,'ceoff:',x.ceoff,'type:',x.source_type,'amt:',x.ceamt);
  
  // When was the original dual-write's isOffice check?
  // The old code checked: const isOffice = String(t.P3 || "") === "110" ? 1 : 0;
  // But these records aren't P3='110'... wait, they ARE P3='110'. Let me check.
  
  // Maybe the original sync only wrote office expenses with source_type='expense',
  // and the 338 missing are from the period when the sync didn't exist?
  
  // Check duplicates
  const [r2] = await c.execute(`
    SELECT old_id, COUNT(*) as cnt FROM a3s_cash_entries 
    WHERE old_id IS NOT NULL GROUP BY old_id HAVING cnt > 1 LIMIT 20
  `);
  console.log('\n重复 old_id 在 cash_entries:');
  for(const x of r2) console.log(' old_id:',x.old_id,'次数:',x.cnt);
  
  // Count office records in cash_entries by source
  const [r3] = await c.execute(
    "SELECT source_type, COUNT(*) as cnt, SUM(amount) as total FROM a3s_cash_entries WHERE office=1 GROUP BY source_type ORDER BY source_type"
  );
  console.log('\ncash_entries 中 office=1 按 source_type:');
  for(const x of r3) console.log(' ',x.source_type,':',x.cnt,'条,',Number(x.total).toFixed(2));
  
  await c.end();
})();

const mysql = require('mysql2/promise');
(async()=>{
  const c = await mysql.createConnection({host:'43.166.250.145',port:3306,user:'dbo001',password:'BDQN123456',database:'db_zhty202410',supportBigNumbers:true,bigNumberStrings:true});
  
  const [r1] = await c.execute("SELECT COUNT(*) as cnt, SUM(amount) as total FROM a3s_cash_entries WHERE office=1 AND source_type='expense'");
  const [r2] = await c.execute("SELECT COUNT(*) as cnt, SUM(amount) as total FROM a3s_expenses WHERE office=1");
  const [r3] = await c.execute("SELECT COUNT(*) as cnt, SUM(amount) as total FROM a3s_cash_entries WHERE office=1");
  const [r4] = await c.execute("SELECT COUNT(*) as cnt, SUM(C5)/100 as total FROM T1200 WHERE Z1=1 AND P3='110' AND Z2=0");
  const [r5] = await c.execute("SELECT COUNT(*) as cnt, SUM(C5)/100 as total FROM T1200 WHERE Z1=1 AND (P3='110' OR C2='120' OR C1=2) AND Z2=0");
  
  console.log('=== 办公室数据现状 ===');
  console.log('a3s_cash_entries 中 office=1 且 expense:', r1[0].cnt, '条,', Number(r1[0].total).toFixed(2));
  console.log('a3s_expenses 中 office=1:', r2[0].cnt, '条,', Number(r2[0].total).toFixed(2));
  console.log('a3s_cash_entries 中 office=1 总计:', r3[0].cnt, '条,', Number(r3[0].total).toFixed(2));
  console.log('T1200 P3=110 Z2=0:', r4[0].cnt, '条,', Number(r4[0].total).toFixed(2));
  console.log('T1200 P3=110/C1=2 Z2=0:', r5[0].cnt, '条,', Number(r5[0].total).toFixed(2));

  const [r6] = await c.execute("SELECT e.id, e.amount, e.office as eoff, ce.office as ceoff, ce.source_type FROM a3s_expenses e LEFT JOIN a3s_cash_entries ce ON ce.old_id = e.old_id AND ce.source_type='expense' WHERE e.office=1 LIMIT 10");
  console.log('\na3s_expenses office=1, 对应 cash_entries:');
  for(const x of r6) console.log('  id:',x.id,'amt:',x.amount,'e.office:',x.eoff,'ce.office:',x.ceoff,'type:',x.source_type);
  
  // Also check: how many office expenses from T1200 DON'T have a matching cash_entry with office=1?
  const [r7] = await c.execute(`
    SELECT COUNT(*) as cnt, SUM(t.C5)/100 as total
    FROM T1200 t
    WHERE t.Z1=1 AND t.Z2=0 AND t.P3='110' 
      AND NOT EXISTS (
        SELECT 1 FROM a3s_cash_entries c
        WHERE c.old_id = t.P1 AND c.office=1
      )
  `);
  console.log('\nT1200办公室支出 未在 a3s_cash_entries 有 office标志的:', r7[0].cnt, '条,', Number(r7[0].total).toFixed(2));
  
  // And: how many have wrong office flag?
  const [r8] = await c.execute(`
    SELECT COUNT(*) as cnt, SUM(t.C5)/100 as total
    FROM T1200 t
    INNER JOIN a3s_cash_entries c ON c.old_id = t.P1
    WHERE t.Z1=1 AND t.Z2=0 AND t.P3='110' AND c.office != 1
  `);
  console.log('T1200办公室支出 在 cash_entries 但 office!=1:', r8[0].cnt, '条,', Number(r8[0].total).toFixed(2));

  // Check: non-office T1200 expenses that ended up with office=1 in cash_entries
  const [r9] = await c.execute(`
    SELECT COUNT(*) as cnt, SUM(t.C5)/100 as total
    FROM T1200 t
    INNER JOIN a3s_cash_entries c ON c.old_id = t.P1
    WHERE t.Z1=1 AND t.Z2=0 AND (t.P3 IS NULL OR t.P3 != '110') AND c.office=1
  `);
  console.log('非办公室T1200 但 cash_entries office=1:', r9[0].cnt, '条,', Number(r9[0].total).toFixed(2));

  await c.end();
})();

const mysql = require('mysql2/promise');
(async()=>{
  const c = await mysql.createConnection({host:'43.166.250.145',port:3306,user:'dbo001',password:'BDQN123456',database:'db_zhty202410',supportBigNumbers:true,bigNumberStrings:true});
  const [r]=await c.execute("SELECT P1 FROM T1200 WHERE C1=3 AND Z2=1");
  const p1s = r.map(x=>String(x.P1));
  const ph = p1s.map(()=>'?').join(',');
  const [r2]=await c.execute('SELECT id,source_type,type,amount,old_id FROM a3s_cash_entries WHERE old_id IN ('+ph+')', p1s);
  console.log('C1=3 Z2=1 记录在 a3s_cash_entries 中的:', r2.length);
  for(const x of r2) console.log(' id:',x.id,'type:',x.type,'amt:',x.amount,'old_id:',x.old_id);
  const [r3]=await c.execute("SELECT SUM(CASE WHEN Z2=1 THEN C5 ELSE 0 END)/100 as inc, SUM(CASE WHEN Z2=0 THEN C5 ELSE 0 END)/100 as exp FROM T1200 WHERE Z1=1");
  console.log('\nT1200 Z2=1 收入:', Number(r3[0].inc).toFixed(2));
  console.log('T1200 Z2=0 支出:', Number(r3[0].exp).toFixed(2));
  console.log('纯 Z2 余额:', (Number(r3[0].inc)-Number(r3[0].exp)).toFixed(2));
  console.log('含 C1=3 余额:', (Number(r3[0].inc)-Number(r3[0].exp)-Number(r3[0].exp)).toFixed(2));
  // Actually let me do a correct old system balance
  // Income: Z2=1 (all types)
  // Expense: Z2=0 (all types) + C1=3 (salary records, even if Z2=1)
  // But actually C1=3 Z2=1 records are salary corrections recorded as income
  // The CORRECT old system balance is just: income(Z2=1) - expense(Z2=0)
  const [r4]=await c.execute("SELECT SUM(CASE WHEN Z2=1 THEN C5 WHEN Z2=0 THEN -C5 ELSE 0 END)/100 as bal FROM T1200 WHERE Z1=1");
  console.log('\n正确定义余额(Z2=1 - Z2=0):', Number(r4[0].bal).toFixed(2));
  await c.end();
})();

const mysql = require('mysql2/promise');
(async()=>{
  const c = await mysql.createConnection({host:'43.166.250.145',port:3306,user:'dbo001',password:'BDQN123456',database:'db_zhty202410',supportBigNumbers:true,bigNumberStrings:true});

  // Check 1853171297374689
  const [r]=await c.execute("SELECT id,source_type,type,amount,old_id FROM a3s_cash_entries WHERE old_id='1853171297374689'");
  console.log('1853171297374689:', r.length, '条');
  for(const x of r) console.log(' ', x.id, x.source_type, x.type, x.amount);

  // Check duplicates
  const [r2]=await c.execute("SELECT id,source_type,type,amount,old_id FROM a3s_cash_entries WHERE id LIKE 'sal-174%' OR id LIKE 'sal-183%'");
  console.log('\n重复的:', r2.length);
  for(const x of r2) console.log(' ', x.id, x.source_type, x.type, x.amount, 'old:', x.old_id);

  // Delete duplicates and re-check balance
  await c.execute("DELETE FROM a3s_cash_entries WHERE id='sal-1740541838826678'");
  await c.execute("DELETE FROM a3s_cash_entries WHERE id='sal-1835791145585625'");

  const [r3]=await c.execute("SELECT SUM(CASE WHEN type='收入' THEN amount WHEN type='支出' THEN -amount ELSE 0 END) as bal FROM a3s_cash_entries");
  const [r4]=await c.execute("SELECT SUM(CASE WHEN Z2=1 THEN C5 WHEN Z2=0 THEN -C5 ELSE 0 END)/100 as bal FROM T1200 WHERE Z1=1");
  console.log('\n删重复后余额:');
  console.log('新系统:', Number(r3[0].bal).toFixed(2));
  console.log('旧系统:', Number(r4[0].bal).toFixed(2));
  console.log('差异:', (Number(r3[0].bal)-Number(r4[0].bal)).toFixed(2));
  await c.end();
})();

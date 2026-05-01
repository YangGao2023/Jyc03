const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({host:'43.166.250.145',port:3306,user:'dbo001',password:'BDQN123456',database:'db_zhty202410',connectionLimit:2});

  // Final check
  const [oc] = await pool.execute(
    "SELECT type, COUNT(*) as cnt, ROUND(SUM(amount),2) as total FROM a3s_cash_entries WHERE office=1 GROUP BY type"
  );
  console.log('=== 办公室现金 ===');
  let bal = 0;
  for (const r of oc) {
    console.log(`  ${r.type}: ${r.cnt}笔, $${r.total}`);
    if (r.type==='收入'||r.type==='转入') bal+=Number(r.total);
    else bal-=Number(r.total);
  }
  console.log(`办公室余额: $${bal.toFixed(2)}`);

  const [oe] = await pool.execute("SELECT COUNT(*) as cnt, ROUND(SUM(amount),2) as total FROM a3s_expenses WHERE office=1");
  console.log(`\n办公室支出: ${oe[0].cnt}笔, $${oe[0].total}`);

  // T1210 balance separately
  const [t1210] = await pool.execute("SELECT Z2, COUNT(*) as cnt, ROUND(SUM(C2)/100,2) as total FROM T1210 WHERE Z1=1 GROUP BY Z2");
  console.log('\n旧系统T1210:');
  let t1210bal=0;
  t1210.forEach(r => {
    const t = Number(r.Z2)===1 ? '转入' : '转出';
    console.log(`  ${t}: ${r.cnt}笔, $${r.total}`);
    if (Number(r.Z2)===1) t1210bal+=Number(r.total);
    else t1210bal-=Number(r.total);
  });
  console.log(`T1210余额: $${t1210bal.toFixed(2)}`);

  await pool.end();
})();

/**
 * a3s_consistency_check.cjs
 * 部署前一致性检查 —— 余额必须等于旧系统。
 * 不等于就是错，不用查别的。
 */
const mysql = require('mysql2/promise');

async function run() {
  const c = await mysql.createConnection({
    host:'43.166.250.145',port:3306,user:'dbo001',password:'BDQN123456',
    database:'db_zhty202410',supportBigNumbers:true,bigNumberStrings:true,
  });

  const [rNew] = await c.execute(
    "SELECT SUM(CASE WHEN type='收入' THEN amount WHEN type='支出' THEN -amount ELSE 0 END) as bal FROM a3s_cash_entries"
  );
  const [rOld] = await c.execute(
    "SELECT SUM(CASE WHEN Z2=1 THEN C5 WHEN Z2=0 THEN -C5 ELSE 0 END)/100 as bal FROM T1200 WHERE Z1=1"
  );

  const diff = Number(rNew[0].bal) - Number(rOld[0].bal);
  if (Math.abs(diff) > 0.01) {
    console.log(`❌ 余额不匹配`);
    console.log(`   新系统: $${Number(rNew[0].bal).toFixed(2)}`);
    console.log(`   旧系统: $${Number(rOld[0].bal).toFixed(2)}`);
    console.log(`   差异: $${diff.toFixed(2)}`);
    process.exit(1);
  }

  console.log(`✅ 余额匹配: $${Number(rNew[0].bal).toFixed(2)}`);
  await c.end();
}

run().catch(e => { console.error('检查失败:', e.message); process.exit(1); });

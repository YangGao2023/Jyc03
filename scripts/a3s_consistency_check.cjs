/**
 * a3s_consistency_check.cjs
 * 部署前一致性检查 —— 自动验证总额、办公室、类型三个维度都对齐
 * 每次构建/部署前跑一次，有问题先报，不修
 */
const mysql = require('mysql2/promise');

async function run() {
  const c = await mysql.createConnection({
    host:'43.166.250.145',port:3306,user:'dbo001',password:'BDQN123456',
    database:'db_zhty202410',supportBigNumbers:true,bigNumberStrings:true,
  });

  const issues = [];

  // ── 1. 总额 ──
  const [rBal] = await c.execute(
    "SELECT SUM(CASE WHEN type='收入' THEN amount WHEN type='支出' THEN -amount ELSE 0 END) as newBal FROM a3s_cash_entries"
  );
  const [rOld] = await c.execute(
    "SELECT SUM(CASE WHEN Z2=1 THEN C5 WHEN Z2=0 THEN -C5 ELSE 0 END)/100 as oldBal FROM T1200 WHERE Z1=1"
  );
  const balDiff = Number(rBal[0].newBal) - Number(rOld[0].oldBal);
  if (Math.abs(balDiff) > 0.01) {
    issues.push(`总额不匹配: 新系统 ${Number(rBal[0].newBal).toFixed(2)}, 旧系统 ${Number(rOld[0].oldBal).toFixed(2)}, 差异 ${balDiff.toFixed(2)}`);
  }

  // ── 2. 办公室支出 (P3='110' + Z2=0) ──
  const [rOff] = await c.execute(`
    SELECT COUNT(*) as cnt, COALESCE(SUM(t.C5)/100,0) as total
    FROM T1200 t
    WHERE t.Z1=1 AND t.Z2=0 AND t.P3='110'
  `);
  const [rOffNew] = await c.execute(`
    SELECT COUNT(*) as cnt, COALESCE(SUM(c.amount),0) as total
    FROM T1200 t
    INNER JOIN a3s_cash_entries c ON c.old_id = t.P1
    WHERE t.Z1=1 AND t.Z2=0 AND t.P3='110' AND c.office=1
  `);
  const offDiff = Number(rOffNew[0].total) - Number(rOff[0].total);
  if (Math.abs(offDiff) > 0.01) {
    issues.push(`办公室支出 office=1 不匹配: 新 ${Number(rOffNew[0].total).toFixed(2)}, 旧 ${Number(rOff[0].total).toFixed(2)}, 差异 ${offDiff.toFixed(2)}`);
  }
  const [rOffMiss] = await c.execute(`
    SELECT COUNT(*) as cnt FROM T1200 t
    INNER JOIN a3s_cash_entries c ON c.old_id = t.P1
    WHERE t.Z1=1 AND t.Z2=0 AND t.P3='110' AND (c.office IS NULL OR c.office=0)
  `);
  if (rOffMiss[0].cnt > 0) {
    issues.push(`办公室支出在 cash_entries 但 office=0: ${rOffMiss[0].cnt} 条`);
  }

  // ── 3. 工资办公室 (C1=3 + P3='110') ──
  const [rSalOff] = await c.execute(`
    SELECT COUNT(*) as cnt FROM T1200 t
    INNER JOIN a3s_cash_entries c ON c.old_id = t.P1 AND c.source_type='t1200-salary'
    WHERE t.Z1=1 AND t.C1=3 AND t.P3='110' AND (c.office IS NULL OR c.office=0)
  `);
  if (rSalOff[0].cnt > 0) {
    issues.push(`工资办公室在 cash_entries 但 office=0: ${rSalOff[0].cnt} 条`);
  }

  // ── 4. 收入办公室 (P3='110' + Z2=1) ──
  const [rOffInc] = await c.execute(`
    SELECT COUNT(*) as cnt FROM T1200 t
    INNER JOIN a3s_cash_entries c ON c.old_id = t.P1 AND c.source_type='t1200'
    WHERE t.Z1=1 AND t.Z2=1 AND t.P3='110' AND (c.office IS NULL OR c.office=0)
  `);
  if (rOffInc[0].cnt > 0) {
    issues.push(`收入办公室在 cash_entries 但 office=0: ${rOffInc[0].cnt} 条`);
  }

  if (issues.length === 0) {
    console.log('✅ 一致性检查通过');
    console.log(`   总额: $${Number(rBal[0].newBal).toFixed(2)} (= 旧系统 $${Number(rOld[0].oldBal).toFixed(2)})`);
    console.log(`   办公室支出: $${Number(rOffNew[0].total).toFixed(2)} (= 旧系统 $${Number(rOff[0].total).toFixed(2)})`);
    console.log(`   办公室收入标志: 全部正确`);
  } else {
    console.log('❌ 一致性检查失败:'); 
    for (const issue of issues) console.log('  -', issue);
    process.exit(1);
  }

  await c.end();
}

run().catch(e => { console.error('检查出错:', e.message); process.exit(1); });

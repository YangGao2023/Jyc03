/**
 * 深查收入差异来源
 */
const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: '43.166.250.145', port: 3306,
    user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410',
  });

  // 1. 收入按 source_type 分布
  const [srcTypes] = await conn.execute(`
    SELECT source_type, COUNT(*) as cnt, ROUND(SUM(amount), 2) as total
    FROM a3s_cash_entries WHERE type='收入'
    GROUP BY source_type ORDER BY total DESC
  `);
  console.log('=== 收入按 source_type 分布 ===');
  for (const r of srcTypes) console.log(`  ${r.source_type || '(null)'}: ${r.cnt}条, $${r.total}`);

  // 2. t1200 收入 vs 旧系统T1200对比（确认同步是否正确）
  const [t1200Count] = await conn.execute(`
    SELECT COUNT(*) as cnt, ROUND(SUM(amount), 2) as total
    FROM a3s_cash_entries WHERE type='收入' AND source_type='t1200'
  `);
  const [oldT1200] = await conn.execute(`
    SELECT COUNT(*) as cnt, ROUND(SUM(C5)/100, 2) as total FROM T1200 WHERE Z1=1 AND Z2=1
  `);
  console.log(`\n=== T1200 收入对比 ===`);
  console.log(`  新系统 source_type=t1200: ${t1200Count[0].cnt}条, $${t1200Count[0].total}`);
  console.log(`  旧系统 T1200 Z2=1: ${oldT1200[0].cnt}条, $${oldT1200[0].total}`);
  console.log(`  差额: $${(t1200Count[0].total - oldT1200[0].total).toFixed(2)}`);

  // 3. 非 t1200 的收入来源明细
  const [nonT1200] = await conn.execute(`
    SELECT source_type, source_id, order_number, type, old_id, amount, date, method, note, category
    FROM a3s_cash_entries WHERE type='收入' AND (source_type IS NULL OR source_type != 't1200')
    ORDER BY date DESC LIMIT 50
  `);
  if (nonT1200.length > 0) {
    console.log(`\n=== 非 t1200 来源的收入（前50条）===`);
    for (const r of nonT1200) {
      console.log(`  ${r.date} $${r.amount.toFixed(2)} source_type=${r.source_type || '(null)'} source_id=${r.source_id || '(null)'} old_id=${r.old_id || '(null)'} order=${r.order_number || '-'} note=${(r.note||'').slice(0,30)} category=${r.category||'-'}`);
    }
  }

  // 4. 是否有多笔 "订单付款" 同时也在 t1200 里
  const [dualTest] = await conn.execute(`
    SELECT c.order_number, COUNT(*) as cnt, ROUND(SUM(c.amount), 2) as total
    FROM a3s_cash_entries c
    WHERE c.type='收入' AND c.order_number != '' AND c.order_number IS NOT NULL
    GROUP BY c.order_number HAVING cnt > 1
    ORDER BY cnt DESC LIMIT 20
  `);
  if (dualTest.length > 0) {
    console.log(`\n=== 同一订单有多笔收入的 ===`);
    for (const r of dualTest) console.log(`  订单 ${r.order_number}: ${r.cnt}笔收入, 共$${r.total}`);
  }

  // 5. 按年份看收入趋势（对比旧系统）
  const [yrNew] = await conn.execute(`
    SELECT LEFT(date, 4) as yr, ROUND(SUM(amount), 2) as inc
    FROM a3s_cash_entries WHERE type='收入' GROUP BY LEFT(date, 4) ORDER BY yr
  `);
  const [yrOld] = await conn.execute(`
    SELECT t.* FROM (
      SELECT LEFT(from_ymd, 4) as yr, ROUND(SUM(amt)/100, 2) as inc
      FROM (
        SELECT CASE WHEN C6 IS NOT NULL AND C6 != '' THEN C6 ELSE C1 END as from_ymd,
               C5 as amt FROM T1200 WHERE Z1=1 AND Z2=1
      ) sub
      GROUP BY yr ORDER BY yr
    ) t
  `);
  console.log(`\n=== 按年收入对比 ===`);
  const oldMap = {};
  for (const r of yrOld) oldMap[r.yr] = r.inc;
  for (const r of yrNew) {
    const oldInc = oldMap[r.yr] || 0;
    console.log(`  ${r.yr}: 新系统 $${r.inc} | 旧系统 $${oldInc} | 差额 $${(r.inc - oldInc).toFixed(2)}`);
  }

  // 6. 检查：是否有收入来自 订单付款 但同一笔也被同步到 t1200
  const [paymentIncome] = await conn.execute(`
    SELECT source_type, COUNT(*) as cnt, ROUND(SUM(amount), 2) as total
    FROM a3s_cash_entries WHERE type='收入' AND source_type IS NULL
    GROUP BY source_type
  `);
  console.log(`\n=== source_type=null 的收入 ===`);
  for (const r of paymentIncome) console.log(`  ${r.cnt}条, $${r.total}`);

  // 7. 检查具体哪个月的差额最大（按月对比新旧）
  const [monthNew] = await conn.execute(`
    SELECT LEFT(date, 7) as mon, ROUND(SUM(amount), 2) as inc
    FROM a3s_cash_entries WHERE type='收入'
    GROUP BY mon ORDER BY mon
  `);
  const [monthOld] = await conn.execute(`
    SELECT LEFT(CASE WHEN C6 != '' THEN C6 ELSE C1 END, 6) as mon_6, ROUND(SUM(C5)/100, 2) as inc
    FROM T1200 WHERE Z1=1 AND Z2=1 GROUP BY mon_6 ORDER BY mon_6
  `);
  const oldMonMap = {};
  for (const r of monthOld) {
    const y = r.mon_6.slice(0,4);
    const m = r.mon_6.slice(4,6);
    oldMonMap[`${y}-${m}`] = r.inc;
  }
  console.log(`\n=== 月度收入新旧对比（显差异）===`);
  for (const r of monthNew) {
    const oldInc = oldMonMap[r.mon] || 0;
    const diff = r.inc - oldInc;
    if (Math.abs(diff) > 100) console.log(`  ${r.mon}: 新 $${r.inc} | 旧 $${oldInc} | 差额 $${diff.toFixed(2)}`);
  }

  await conn.end();
}
main().catch(console.error);

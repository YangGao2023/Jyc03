/**
 * 追查为什么新系统有3092条收入但旧系统T1200只有2688条收入
 */
const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: '43.166.250.145', port: 3306,
    user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410',
  });

  // 1. T1200 全量统计
  console.log('=== T1200 全量 ===');
  const [t1200Stats] = await conn.execute(`
    SELECT Z1, Z2, COUNT(*) as cnt, ROUND(SUM(C5)/100, 2) as total
    FROM T1200 GROUP BY Z1, Z2 ORDER BY Z1, Z2
  `);
  for (const r of t1200Stats) console.log(`  Z1=${r.Z1} Z2=${r.Z2} Z3=${r.Z3}: ${r.cnt}条, $${r.total}`);

  // 2. a3s 中 T1200 收入的 old_id 范围
  const [oldIdRange] = await conn.execute(`
    SELECT MIN(old_id) as min_id, MAX(old_id) as max_id, COUNT(*) as cnt
    FROM a3s_cash_entries WHERE type='收入' AND source_type='t1200'
  `);
  console.log(`\n=== 新系统 T1200 收入 old_id 范围 ===`);
  console.log(`  min=${oldIdRange[0].min_id} max=${oldIdRange[0].max_id} cnt=${oldIdRange[0].cnt}`);

  // 3. T1200 的 P1 范围
  const [t1200Range] = await conn.execute(`SELECT MIN(P1) as min_p, MAX(P1) as max_p FROM T1200`);
  console.log(`\n=== T1200 P1 范围 ===`);
  console.log(`  min=${t1200Range[0].min_p} max=${t1200Range[0].max_p}`);

  // 4. 找新系统里有但旧系统没对应的记录
  const [orphans] = await conn.execute(`
    SELECT c.id, c.old_id, c.amount, c.date, c.source_type, c.source_id
    FROM a3s_cash_entries c
    LEFT JOIN T1200 t ON c.old_id = t.P1
    WHERE c.type='收入' AND c.source_type='t1200' AND t.P1 IS NULL
    LIMIT 30
  `);
  if (orphans.length > 0) {
    console.log(`\n=== 新系统有但T1200没对应的收入（前30条）===`);
    for (const r of orphans) {
      console.log(`  id=${r.id} old_id=${r.old_id} amount=$${r.amount} date=${r.date} source_id=${r.source_id}`);
    }
  } else {
    console.log('\n=== 所有新系统收入都有对应的T1200记录 ===');
  }

  // 5. T1200 中有但新系统 cash_entries 没有的
  const [missing] = await conn.execute(`
    SELECT t.P1, t.Z1, t.Z2, t.C5/100 as amount, t.C6 as ymd
    FROM T1200 t
    LEFT JOIN a3s_cash_entries c ON c.old_id = t.P1 AND c.source_type = 't1200'
    WHERE c.id IS NULL AND t.Z1=1 AND t.Z2=1
    LIMIT 20
  `);
  if (missing.length > 0) {
    console.log(`\n=== T1200 有但新系统缺少的收入（前20条）===`);
    for (const r of missing) console.log(`  P1=${r.P1} Z1=${r.Z1} Z2=${r.Z2} amount=$${r.amount} date=${r.ymd}`);
  } else {
    console.log('\n=== 所有T1200收入都已同步到新系统 ===');
  }

  // 6. 关键检查：是否一条 T1200 产生了多条 cash_entries（同 old_id 出现多次）
  const [multiOldId] = await conn.execute(`
    SELECT old_id, COUNT(*) as cnt, ROUND(SUM(amount), 2) as total
    FROM a3s_cash_entries WHERE type='收入' AND source_type='t1200'
    GROUP BY old_id HAVING cnt > 1
    ORDER BY cnt DESC LIMIT 20
  `);
  if (multiOldId.length > 0) {
    console.log(`\n=== 同一个 old_id 出现多次的收入 ===`);
    for (const r of multiOldId) {
      const [details] = await conn.execute(`SELECT id, amount, date, method FROM a3s_cash_entries WHERE old_id=? AND source_type='t1200'`, [r.old_id]);
      for (const d of details) console.log(`  old_id=${r.old_id} [${d.id}] amount=$${d.amount} date=${d.date} method=${d.method}`);
    }
  } else {
    console.log('\n=== 无重复 old_id ===');
  }

  // 7. 检查 syncCashFlowFromOld 是否把非 Z2=1 的也写入了收入
  // 即：T1200 Z2=0 的记录但新系统是 type='收入'
  const [wrongType] = await conn.execute(`
    SELECT c.id, c.old_id, c.amount, t.Z2 as t1200_z2, t.Z1 as t1200_z1
    FROM a3s_cash_entries c
    INNER JOIN T1200 t ON c.old_id = t.P1 AND c.source_type = 't1200'
    WHERE c.type='收入' AND t.Z2 != 1
    LIMIT 20
  `);
  if (wrongType.length > 0) {
    console.log(`\n=== T1200 Z2≠1 但在新系统是收入的 ===`);
    for (const r of wrongType) console.log(`  id=${r.id} old_id=${r.old_id} amount=$${r.amount} T1200_Z1=${r.t1200_z1} T1200_Z2=${r.t1200_z2}`);
  } else {
    console.log('\n=== T1200 Z2 与 new 类型一致，无错配 ===');
  }

  await conn.end();
}
main().catch(console.error);

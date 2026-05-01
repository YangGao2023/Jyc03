/**
 * 验证 bigint 精度推论：迁移脚本无 bigNumberStrings 产生重复条目
 */
const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: '43.166.250.145', port: 3306,
    user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410',
  });

  // 1. 找一组 P1 > 2^53 的 T1200 收入，看有多少重复
  const [bigP1] = await conn.execute(`
    SELECT c.id, c.old_id, c.amount, c.date, c.method, c.category,
           t.P1 as real_p1, t.C5/100 as real_amt, t.C6 as real_ymd
    FROM a3s_cash_entries c
    INNER JOIN T1200 t ON c.source_type='t1200' AND c.old_id IS NOT NULL
    WHERE c.type='收入' AND c.old_id >= 9007199254740992
    GROUP BY c.id HAVING COUNT(t.P1) > 1
    LIMIT 10
  `);
  console.log('=== 大数字 P1 的多匹配 ===');

  // Actually let me just count - how many entries are duplicated?
  // Count total entries where old_id >= 2^53
  const [bigIds] = await conn.execute(`
    SELECT COUNT(*) as total,
      SUM(CASE WHEN t.P1 IS NOT NULL THEN 1 ELSE 0 END) as matched_to_t1200
    FROM a3s_cash_entries c
    LEFT JOIN T1200 t ON c.old_id = t.P1
    WHERE c.type='收入' AND c.source_type='t1200'
  `);
  console.log(`  total: ${bigIds[0].total}, matched: ${bigIds[0].matched_to_t1200}`);

  // 2. Check: how many distinct T1200 P1 should there be?
  const [t1200Incs] = await conn.execute(`
    SELECT COUNT(*) as cnt, ROUND(SUM(C5)/100, 2) as total FROM T1200 WHERE Z1=1 AND Z2=1
  `);
  console.log(`  T1200 income rows: ${t1200Incs[0].cnt}, $${t1200Incs[0].total}`);

  // 3. How many entries have id like 'inc-XXXX' where the number part would lose precision?
  const [precise] = await conn.execute(`
    SELECT COUNT(*) as total,
      SUM(CASE WHEN old_id >= 9007199254740992 THEN 1 ELSE 0 END) as big_ids,
      SUM(CASE WHEN old_id < 9007199254740992 THEN 1 ELSE 0 END) as safe_ids
    FROM a3s_cash_entries WHERE type='收入' AND source_type='t1200'
  `);
  console.log(`\n=== 精度完好 vs 可能损失 ===`);
  console.log(`  < 2^53 (安全): ${precise[0].safe_ids}`);
  console.log(`  >= 2^53 (可能损失): ${precise[0].big_ids}`);

  // 4. Check what ids look like - find entries that differ only in the last digit
  const [sample] = await conn.execute(`
    SELECT id, old_id FROM a3s_cash_entries 
    WHERE type='收入' AND source_type='t1200' AND old_id >= 1891603100347797000
    ORDER BY id LIMIT 5
  `);
  console.log(`\n=== 样本对比 ===`);
  for (const r of sample) console.log(`  id=${r.id} old_id=${r.old_id}`);

  // 5. Compare with T1200: same P1 value
  const [tp1] = await conn.execute(`
    SELECT P1, C5/100 as amt, C6 as ymd FROM T1200 
    WHERE P1 >= 1891603100347797000 AND P1 <= 1891603100347798000
    ORDER BY P1
  `);
  console.log(`\n=== T1200 同范围 P1 ===`);
  for (const r of tp1) console.log(`  P1=${r.P1} amt=$${r.amt} ymd=${r.ymd}`);

  await conn.end();
}
main().catch(console.error);

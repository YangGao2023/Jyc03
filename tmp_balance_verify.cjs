/**
 * 按旧系统 F060302 公式计算实际余额：余额 = 收入 + 转入 - 支出 - 转出
 * 用正确 bigint 字符串连接，排除误差
 */
const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: '43.166.250.145', port: 3306,
    user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410',
    supportBigNumbers: true,
    bigNumberStrings: true,
  });

  // 全部按类型 + 月汇总
  const [rows] = await conn.execute(`
    SELECT 
      LEFT(date, 7) as mon,
      SUM(CASE WHEN type='收入' THEN amount ELSE 0 END) as income,
      SUM(CASE WHEN type='转入' THEN amount ELSE 0 END) as transfer_in,
      SUM(CASE WHEN type='支出' THEN amount ELSE 0 END) as outlay,
      SUM(CASE WHEN type='转出' THEN amount ELSE 0 END) as transfer_out
    FROM a3s_cash_entries
    WHERE date IS NOT NULL AND date != ''
    GROUP BY LEFT(date, 7)
    ORDER BY mon
  `);

  console.log('=== 新系统总计（含重复）= 收入+转入-支出-转出 ===');
  console.log('月      收入        转入        支出        转出        本期净    累计余额');
  let cum = 0;
  for (const r of rows) {
    const ni = Number(r.income) + Number(r.transfer_in);
    const ne = Number(r.outlay) + Number(r.transfer_out);
    const net = ni - ne;
    cum += net;
    console.log(r.mon,
      Number(r.income).toFixed(2), Number(r.transfer_in).toFixed(2),
      Number(r.outlay).toFixed(2), Number(r.transfer_out).toFixed(2),
      net.toFixed(2), cum.toFixed(2));
  }
  console.log('');
  console.log('YANG 说的旧系统 2026-04 底余额: $130,714.21');
  console.log('我的新系统 2026-04 底累计:     $' + cum.toFixed(2));
  console.log('差距: $' + (cum - 130714.21).toFixed(2));

  // 不重复版本：只取 id = CONCAT('inc-', old_id) 的正确记录
  console.log('\n=== 排除精度损坏重复后的正确余额 ===');
  const [clean] = await conn.execute(`
    SELECT 
      LEFT(date, 7) as mon,
      SUM(CASE WHEN type='收入' THEN amount ELSE 0 END) as income,
      SUM(CASE WHEN type='转入' THEN amount ELSE 0 END) as transfer_in,
      SUM(CASE WHEN type='支出' THEN amount ELSE 0 END) as outlay,
      SUM(CASE WHEN type='转出' THEN amount ELSE 0 END) as transfer_out
    FROM a3s_cash_entries
    WHERE date IS NOT NULL AND date != ''
      AND (source_type != 't1200' OR id = CONCAT('inc-', old_id))
    GROUP BY LEFT(date, 7)
    ORDER BY mon
  `);
  let c2 = 0;
  for (const r of clean) {
    const ni = Number(r.income) + Number(r.transfer_in);
    const ne = Number(r.outlay) + Number(r.transfer_out);
    const net = ni - ne;
    c2 += net;
    console.log(r.mon,
      Number(r.income).toFixed(2), Number(r.transfer_in).toFixed(2),
      Number(r.outlay).toFixed(2), Number(r.transfer_out).toFixed(2),
      net.toFixed(2), c2.toFixed(2));
  }
  console.log('');
  console.log('去重后 2026-04 底累计: $' + c2.toFixed(2));
  console.log('目标 (旧系统):          $130,714.21');
  console.log('剩余差距: $' + (c2 - 130714.21).toFixed(2));

  // 如果还有差距，查有没有旧系统不包含但新系统有的条目
  // 比如 T1200 中 Z1=0 (已删除) 的记录被同步进来了
  if (Math.abs(c2 - 130714.21) > 1) {
    console.log('\n=== 排查：T1200 Z1=0 但新系统含有的收入 ===');
    const [z0Income] = await conn.execute(`
      SELECT c.id, c.old_id, c.amount, c.date, t.Z1 as t1200_z1
      FROM a3s_cash_entries c
      INNER JOIN T1200 t ON c.old_id = t.P1
      WHERE c.type='收入' AND c.source_type='t1200' AND t.Z1 = 0
        AND c.id = CONCAT('inc-', c.old_id)
      ORDER BY c.date
    `);
    let z0total = 0;
    for (const r of z0Income) {
      console.log('  ', r.date, '$' + Number(r.amount).toFixed(2), 'old_id:', r.old_id, 'T1200 Z1=', r.t1200_z1);
      z0total += Number(r.amount);
    }
    console.log('Z1=0 收入总计: $' + z0total.toFixed(2));
  }

  // 查 T1200 Z1=0 的支出
  if (Math.abs(c2 - 130714.21) > 1) {
    console.log('\n=== 排查：T1200 Z1=0 但新系统含有的支出 ===');
    const [z0Exp] = await conn.execute(`
      SELECT id, old_id, amount, expense_date FROM a3s_expenses
      WHERE source_type = 't1200' AND old_id IS NOT NULL
    `);
    // Can't easily join - let me check separately
  }

  // Total count of unique income entries (no duplicates)
  const [countInfo] = await conn.execute(`
    SELECT COUNT(*) as total,
      SUM(CASE WHEN source_type='t1200' AND id = CONCAT('inc-', old_id) THEN 1 ELSE 0 END) as clean_t1200,
      SUM(CASE WHEN source_type='t1200' AND id != CONCAT('inc-', old_id) THEN 1 ELSE 0 END) as corrupt_t1200,
      SUM(CASE WHEN source_type IS NULL OR source_type != 't1200' THEN 1 ELSE 0 END) as other
    FROM a3s_cash_entries WHERE type='收入'
  `);
  console.log('\n=== 收入条目去重统计 ===');
  console.log('  正确(t1200):', countInfo[0].clean_t1200,
              ', 精度损坏重复:', countInfo[0].corrupt_t1200,
              ', 其他:', countInfo[0].other,
              ', 总计:', countInfo[0].total);

  await conn.end();
}
main().catch(console.error);

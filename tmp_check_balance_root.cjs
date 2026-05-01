/**
 * 查公司总账：对比 a3s_cash_entries + a3s_expenses 的完整月度汇总
 * 不写数据库，只读
 */
const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: '43.166.250.145', port: 3306,
    user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410',
  });

  // 1. 全部现金记录类型分布
  const [cashTypes] = await conn.execute(`
    SELECT type, COUNT(*) as count, ROUND(SUM(amount), 2) as total
    FROM a3s_cash_entries GROUP BY type ORDER BY type
  `);
  console.log('=== a3s_cash_entries 类型分布 ===');
  for (const r of cashTypes) console.log(`  ${r.type}: ${r.count}条, $${r.total}`);

  // 2. 全部支出
  const [expSum] = await conn.execute(`SELECT COUNT(*) as count, ROUND(SUM(amount), 2) as total FROM a3s_expenses`);
  console.log(`\n=== a3s_expenses ===`);
  console.log(`  总计: ${expSum[0].count}条, $${expSum[0].total}`);

  // 3. 月度汇总（按月）
  const [monthlyIncome] = await conn.execute(`
    SELECT LEFT(date, 7) as month, ROUND(SUM(amount), 2) as income
    FROM a3s_cash_entries WHERE type='收入' GROUP BY LEFT(date, 7) ORDER BY month
  `);
  const [monthlyExpense] = await conn.execute(`
    SELECT LEFT(expense_date, 7) as month, ROUND(SUM(amount), 2) as expense
    FROM a3s_expenses WHERE expense_date IS NOT NULL GROUP BY LEFT(expense_date, 7) ORDER BY month
  `);
  
  const expMap = {};
  for (const r of monthlyExpense) expMap[r.month] = r.expense;
  
  console.log(`\n=== 月度收支汇总（仅 收入 类型）===`);
  let cum = 0;
  for (const r of monthlyIncome) {
    const inc = r.income;
    const exp = expMap[r.month] || 0;
    cum += inc - exp;
    console.log(`  ${r.month}: 收入 ${inc} - 支出 ${exp} = 净 ${(inc - exp).toFixed(2)}, 累计 ${cum.toFixed(2)}`);
  }

  // 4. 特别检查：是否有 "类型" 是 '收入' 以外的 cash_entry 被计入收入
  const [weirdIncome] = await conn.execute(`
    SELECT DISTINCT type, source_type, COUNT(*) as cnt, ROUND(SUM(amount), 2) as total
    FROM a3s_cash_entries WHERE type != '收入' AND type != '支出' AND type != '转入' AND type != '转出'
    GROUP BY type, source_type
  `);
  if (weirdIncome.length > 0) {
    console.log('\n=== 异常类型（非标准4种）=== ');
    for (const r of weirdIncome) console.log(`  type="${r.type}" source_type="${r.source_type}": ${r.cnt}条, $${r.total}`);
  }

  // 5. 检查每个月的转账数据量
  const [transByMonth] = await conn.execute(`
    SELECT LEFT(date, 7) as month, type, COUNT(*) as cnt, ROUND(SUM(amount), 2) as total
    FROM a3s_cash_entries WHERE type IN ('转入', '转出')
    GROUP BY LEFT(date, 7), type ORDER BY month, type
  `);
  console.log(`\n=== 转账月度分布 ===`);
  for (const r of transByMonth) console.log(`  ${r.month} ${r.type}: ${r.cnt}条, $${r.total}`);

  // 6. 检查是否同一笔 T1200 被插了两次（重复）
  const [dupCheck] = await conn.execute(`
    SELECT old_id, source_type, COUNT(*) as cnt FROM a3s_cash_entries
    WHERE source_type = 't1200' AND old_id IS NOT NULL
    GROUP BY old_id, source_type HAVING cnt > 1 LIMIT 10
  `);
  if (dupCheck.length > 0) {
    console.log('\n=== 疑似重复（同 old_id 多条）=== ');
    for (const r of dupCheck) console.log(`  source_type=${r.source_type} old_id=${r.old_id}: ${r.cnt}条`);
  } else {
    console.log('\n=== 无重复记录 ===');
  }

  // 7. 检查旧系统 T1200 的总收入（用于对比）
  const [oldIncome] = await conn.execute(`
    SELECT ROUND(SUM(C5)/100, 2) as total FROM T1200 WHERE Z1=1 AND Z2=1
  `);
  const [newIncome] = await conn.execute(`
    SELECT ROUND(SUM(amount), 2) as total FROM a3s_cash_entries WHERE type='收入'
  `);
  console.log(`\n=== 新旧收入对比 ===`);
  console.log(`  旧系统 T1200 Z2=1 总收入: $${oldIncome[0].total}`);
  console.log(`  新系统 cash_entries 收入: $${newIncome[0].total}`);
  console.log(`  差异: $${(newIncome[0].total - oldIncome[0].total).toFixed(2)} (新-旧)`);

  // 8. 检查旧系统 T1200 的总支出
  const [oldExp] = await conn.execute(`
    SELECT ROUND(SUM(C5)/100, 2) as total FROM T1200 WHERE Z1=1 AND Z2=0
  `);
  console.log(`\n=== 新旧支出对比 ===`);
  console.log(`  旧系统 T1200 Z2=0 总支出: $${oldExp[0].total}`);
  console.log(`  新系统 expenses 总支出: $${expSum[0].total}`);
  console.log(`  差异: $${(expSum[0].total - oldExp[0].total).toFixed(2)} (新-旧)`);

  // 9. 检查旧系统总余额 = T1111 结余 + T1200 未关联
  const [orderBal] = await conn.execute(`SELECT ROUND(SUM(C15 - (SELECT COALESCE(SUM(C2),0) FROM T1113 WHERE T1113.P2 = T1111.P1 AND C1=1))/100, 2) as bal FROM T1111 WHERE Z1 NOT IN (0)`);
  console.log(`\n=== 旧系统订单余额 ===`);
  console.log(`  T1111 订单总余额: $${orderBal[0].bal}`);

  await conn.end();
}
main().catch(console.error);

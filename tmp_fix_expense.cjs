const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: '43.166.250.145', port: 3306,
    user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410',
    supportBigNumbers: true,
    bigNumberStrings: true,
  });

  // Step 1: Delete orphan expenses (those with no matching T1200.P1)
  console.log('=== 删除无 T1200 匹配的孤立支出 ===');
  const [orphans] = await conn.execute(`
    SELECT COUNT(*) as cnt, ROUND(SUM(e.amount), 2) as total
    FROM a3s_expenses e
    LEFT JOIN T1200 t ON BINARY e.old_id = t.P1
    WHERE e.source_type = 't1200' AND t.P1 IS NULL
  `);
  console.log('孤立支出:', orphans[0].cnt, '条, 总金额: $' + orphans[0].total);

  const [delExp] = await conn.execute(`
    DELETE e FROM a3s_expenses e
    LEFT JOIN T1200 t ON BINARY e.old_id = t.P1
    WHERE e.source_type = 't1200' AND t.P1 IS NULL
  `);
  console.log('已删:', delExp.affectedRows, '条');

  // Step 2: Verify total
  const [totals] = await conn.execute(`
    SELECT
      ROUND((SELECT COALESCE(SUM(amount),0) FROM a3s_cash_entries WHERE type='收入'), 2) as total_income,
      ROUND((SELECT COALESCE(SUM(amount),0) FROM a3s_expenses), 2) as total_expense
  `);
  const net = Number(totals[0].total_income) - Number(totals[0].total_expense);
  console.log('\n=== 最终余额 ===');
  console.log('收入: $' + totals[0].total_income);
  console.log('支出: $' + totals[0].total_expense);
  console.log('净额: $' + net.toFixed(2));
  console.log('目标: $130,714.21');
  console.log('差距: $' + (net - 130714.21).toFixed(2));

  // Step 3: Monthly check
  console.log('\n=== 修复后月度收支 ===');
  const [months] = await conn.execute(`
    SELECT mon, income, expense FROM (
      SELECT LEFT(date, 7) as mon, ROUND(SUM(amount), 2) as income
      FROM a3s_cash_entries WHERE type='收入'
      GROUP BY LEFT(date, 7)
    ) i
    NATURAL JOIN (
      SELECT LEFT(expense_date, 7) as mon, ROUND(SUM(amount), 2) as expense
      FROM a3s_expenses
      GROUP BY LEFT(expense_date, 7)
    ) e
    ORDER BY mon
  `);
  let cum = 0;
  for (const r of months) {
    const net2 = Number(r.income) - Number(r.expense);
    cum += net2;
    console.log(r.mon, '收入:', Number(r.income).toFixed(2), '支出:', Number(r.expense).toFixed(2), '净:', net2.toFixed(2), '累计:', cum.toFixed(2));
  }

  await conn.end();
}
main().catch(console.error);

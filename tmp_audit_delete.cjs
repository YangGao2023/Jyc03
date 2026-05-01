/**
 * 第1步：查明要删除的重复收入 + 多余支出
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

  // 1. 查看精度损坏的重复收入——id 不匹配 T1200.P1 的记录（用 BINARY 解决 collation 冲突）
  const [corrupt] = await conn.execute(`
    SELECT COUNT(*) as cnt, ROUND(SUM(ce.amount), 2) as total
    FROM a3s_cash_entries ce
    WHERE ce.type='收入' AND ce.source_type='t1200'
      AND BINARY ce.id NOT IN (
        SELECT CONCAT('inc-', CAST(t.P1 AS CHAR))
        FROM T1200 t
        WHERE t.Z1=1 AND t.Z2=1
      )
  `);
  console.log('精度损坏的重复收入:', corrupt[0].cnt, '条, $' + corrupt[0].total);

  // 2. 确认保留的正确收入数
  const [correct] = await conn.execute(`
    SELECT COUNT(*) as cnt, ROUND(SUM(ce.amount), 2) as total
    FROM a3s_cash_entries ce
    WHERE ce.type='收入' AND ce.source_type='t1200'
      AND BINARY ce.id IN (
        SELECT CONCAT('inc-', CAST(t.P1 AS CHAR))
        FROM T1200 t
        WHERE t.Z1=1 AND t.Z2=1
      )
  `);
  console.log('正确收入:', correct[0].cnt, '条, $' + correct[0].total);

  // 3. 确认删除后的累计月份分布
  const [afterDel] = await conn.execute(`
    SELECT 
      LEFT(ce.date, 7) as mon,
      ROUND(SUM(ce.amount), 2) as income,
      ROUND(SUM(CASE WHEN e.id IS NOT NULL THEN e.amount ELSE 0 END), 2) as expense
    FROM a3s_cash_entries ce
    LEFT JOIN a3s_expenses e ON e.expense_date LIKE CONCAT(LEFT(ce.date, 7), '%')
    WHERE ce.type='收入'
      AND (ce.source_type != 't1200' OR ce.id IN (
        SELECT CONCAT('inc-', CAST(t.P1 AS CHAR))
        FROM T1200 t WHERE t.Z1=1 AND t.Z2=1
      ))
    GROUP BY LEFT(ce.date, 7)
    ORDER BY mon
  `);
  console.log('\n删除后各月（这个查询不准，换一个）');

  // 4. 查找 $280 多出的支出（用 BINARY 解决 collation）
  const [expExtra] = await conn.execute(`
    SELECT e.id, e.old_id, e.amount, e.expense_date, e.source_type, 
      t.Z1, t.Z2, t.P3
    FROM a3s_expenses e
    LEFT JOIN T1200 t ON BINARY e.old_id = t.P1
    WHERE e.source_type = 't1200'
      AND t.P1 IS NULL
  `);
  if (expExtra.length > 0) {
    console.log('\n没有 T1200 匹配的支出:');
    for (const r of expExtra) {
      console.log('  id:', r.id, 'old_id:', r.old_id, 'amount:', '$' + Number(r.amount).toFixed(2), 
        'date:', r.expense_date, 'type:', r.source_type);
    }
  } else {
    console.log('\n无孤立支出（所有支出都有 T1200 匹配）');
  }

  // 4b. 查是否有两条相同 T1200.P1 的支出
  const [dupExp] = await conn.execute(`
    SELECT old_id, COUNT(*) as cnt, ROUND(SUM(amount), 2) as total
    FROM a3s_expenses
    WHERE source_type='t1200' AND old_id IS NOT NULL
    GROUP BY old_id
    HAVING cnt > 1
  `);
  if (dupExp.length > 0) {
    console.log('\n重复支出（同一 old_id 多条）:');
    for (const r of dupExp) {
      console.log('  old_id:', r.old_id, '条数:', r.cnt, '总额: $' + r.total);
    }
  }

  // 5. 查看所有 cash_entries 的 office 标记情况
  const [officeCheck] = await conn.execute(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN office=1 THEN 1 ELSE 0 END) as flagged,
      ROUND(SUM(CASE WHEN type='收入' THEN amount ELSE 0 END), 2) as total_income,
      ROUND(SUM(CASE WHEN type='支出' AND office=1 THEN amount ELSE 0 END), 2) as office_outlay
    FROM a3s_cash_entries
  `);
  console.log('\ncash_entries 全局:', JSON.stringify(officeCheck[0]));

  await conn.end();
}
main().catch(console.error);

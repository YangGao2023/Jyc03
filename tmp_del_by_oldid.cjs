const mysql = require('mysql2/promise');
async function main() {
  const c = await mysql.createConnection({
    host: '43.166.250.145', port: 3306,
    user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410',
    supportBigNumbers: true,
    bigNumberStrings: true,
  });

  // Delete the orphan by old_id (precision-damaged, no T1200 match)
  const del = await c.execute("DELETE FROM a3s_expenses WHERE old_id = ? AND amount = 280", ["1894867610395348992"]);
  console.log('已删:', del[0].affectedRows);

  // Verify
  const net = Number((await c.execute("SELECT (SELECT COALESCE(SUM(amount),0) FROM a3s_cash_entries WHERE type=?)-(SELECT COALESCE(SUM(amount),0) FROM a3s_expenses) as net", ["收入"]))[0][0].net);
  console.log('净额: $' + net.toFixed(2));
  console.log('目标: $130,714.21');
  console.log('差距: $' + (net - 130714.21).toFixed(2));

  // Monthly breakdown
  const [months] = await c.execute(`
    SELECT mon, income, expense FROM (
      SELECT LEFT(date, 7) as mon, ROUND(SUM(amount), 2) as income
      FROM a3s_cash_entries WHERE type=?
      GROUP BY LEFT(date, 7)
    ) i NATURAL JOIN (
      SELECT LEFT(expense_date, 7) as mon, ROUND(SUM(amount), 2) as expense
      FROM a3s_expenses
      GROUP BY LEFT(expense_date, 7)
    ) e ORDER BY mon
  `, ["收入"]);
  let cum = 0;
  for (const r of months) {
    const net2 = Number(r.income) - Number(r.expense);
    cum += net2;
    console.log(r.mon, '收入:', Number(r.income).toFixed(2), '支出:', Number(r.expense).toFixed(2), '净:', net2.toFixed(2), '累计:', cum.toFixed(2));
  }

  await c.end();
}
main().catch(console.error);

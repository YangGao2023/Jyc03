const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: '43.166.250.145', port: 3306,
    user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410',
    supportBigNumbers: true,
    bigNumberStrings: true,
  });

  // Verify the orphan exists
  const [orphans] = await conn.execute(`
    SELECT COUNT(*) as cnt FROM a3s_expenses WHERE source_type='t1200' AND BINARY id='exp-1894867610395349000'
  `);
  console.log('孤立支出条数:', orphans[0].cnt);

  // Delete it
  const [del] = await conn.execute(`
    DELETE FROM a3s_expenses WHERE source_type='t1200' AND BINARY id='exp-1894867610395349000'
  `);
  console.log('已删:', del.affectedRows);

  // Verify totals
  const [totals] = await conn.execute(`
    SELECT
      ROUND((SELECT COALESCE(SUM(amount),0) FROM a3s_cash_entries WHERE type='收入'), 2) as income,
      ROUND((SELECT COALESCE(SUM(amount),0) FROM a3s_expenses), 2) as expense
  `);
  const net = Number(totals[0].income) - Number(totals[0].expense);
  console.log('\n收入: $' + totals[0].income);
  console.log('支出: $' + totals[0].expense);
  console.log('净额: $' + net.toFixed(2));
  console.log('目标: $130,714.21');
  console.log('差距: $' + (net - 130714.21).toFixed(2));
  
  await conn.end();
}
main().catch(console.error);

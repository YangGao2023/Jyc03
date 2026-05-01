const mysql = require('mysql2/promise');
(async () => {
  const c = await mysql.createConnection({
    host:'43.166.250.145', port:3306,
    user:'dbo001', password:'BDQN123456',
    database:'db_zhty202410',
    supportBigNumbers: true, bigNumberStrings: true,
  });

  // a3s_expenses total
  const [r] = await c.execute('SELECT COUNT(*) as cnt, SUM(amount) as total FROM a3s_expenses');
  console.log('a3s_expenses:', r[0].cnt, '条, 合计', Number(r[0].total).toFixed(2));

  // T1200 expense total
  const [r2] = await c.execute('SELECT COUNT(*) as cnt, SUM(C5)/100 as total FROM T1200 WHERE Z1=1 AND Z2=0');
  console.log('T1200 Z2=0:', r2[0].cnt, '条, 合计', Number(r2[0].total).toFixed(2));

  // Count matching old_ids
  const [r3] = await c.execute('SELECT COUNT(DISTINCT old_id) as cnt FROM a3s_expenses WHERE old_id IS NOT NULL');
  console.log('a3s_expenses 有 old_id 的记录:', r3[0].cnt, '条');

  // T1200 expense ID count
  const [r4] = await c.execute('SELECT COUNT(*) as cnt FROM T1200 WHERE Z1=1 AND Z2=0');
  console.log('T1200 支出记录:', r4[0].cnt, '条');

  // a3s_cash_entries total
  const [r5] = await c.execute("SELECT SUM(CASE WHEN type='收入' THEN amount ELSE 0 END) as inc, SUM(CASE WHEN type='支出' THEN amount ELSE 0 END) as exp FROM a3s_cash_entries");
  console.log('\na3s_cash_entries 收入:', Number(r5[0].inc).toFixed(2));
  console.log('a3s_cash_entries 支出:', Number(r5[0].exp).toFixed(2));
  console.log('a3s_cash_entries 余额:', (Number(r5[0].inc) - Number(r5[0].exp)).toFixed(2));

  // Calculate total website balance = cash_entries balance - a3s_expenses (since expenses from T1200 go to a3s_expenses not a3s_cash_entries)
  const [r6] = await c.execute("SELECT SUM(amount) as total FROM a3s_expenses");
  const cashBal = Number(r5[0].inc) - Number(r5[0].exp);
  const expTotal = Number(r6[0].total);
  console.log('\na3s_expenses 全部支出:', expTotal.toFixed(2));
  console.log('网站总余额(现金 - 支出):', (cashBal - expTotal).toFixed(2));
  console.log('旧系统余额:', Number(r2[0].total).toFixed(2));

  await c.end();
})();

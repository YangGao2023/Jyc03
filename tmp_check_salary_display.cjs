const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({
    host: '43.166.250.145', port: 3306, user: 'dbo001',
    password: 'BDQN123456', database: 'db_zhty202410',
    waitForConnections: true, connectionLimit: 2
  });

  // Check: what salary-related records look like in a3s_expenses
  // (these come from original T1200 Z2=0 sync where salary had Z2=0)
  const [salExp] = await pool.execute(`
    SELECT id, target, detail, amount, expense_type, expense_date
    FROM a3s_expenses
    WHERE old_id IN (
      SELECT P1 FROM db_zhty202410.T1200 WHERE Z1=1 AND C1=3 AND P2>0
    )
    LIMIT 5
  `);
  console.log('=== Salary items in a3s_expenses ===');
  salExp.forEach(r => console.log('  id:', r.id, 'target:', r.target, 'detail:', r.detail, 'amt:', r.amount, 'type:', r.expense_type, 'date:', r.expense_date));
  console.log('Total salary in a3s_expenses:', salExp.length > 0 ? 'exists' : 'none');

  // Count salary in expenses
  const [cnt] = await pool.execute(`
    SELECT COUNT(*) as c FROM a3s_expenses e
    WHERE EXISTS (
      SELECT 1 FROM db_zhty202410.T1200 t 
      WHERE t.Z1=1 AND t.C1=3 AND t.P2>0 AND e.old_id = t.P1
    )
  `);
  console.log('Count:', cnt[0].c);

  // Check my section 9 cash entries 
  const [salCe] = await pool.execute(`
    SELECT id, type, amount, note, source_type
    FROM a3s_cash_entries
    WHERE source_type='t1200-salary'
    LIMIT 5
  `);
  console.log('\n=== My section 9 cash entries ===');
  salCe.forEach(r => console.log('  id:', r.id, 'type:', r.type, 'amt:', r.amount, 'note:', r.note, 'source:', r.source_type));
  console.log('Total:', salCe.length > 0 ? 'exists' : '0');

  // Check: current income total  
  const [ct] = await pool.execute("SELECT SUM(amount) as c FROM a3s_cash_entries WHERE type='收入'");
  console.log('\nTotal income in cash_entries:', ct[0].c);

  await pool.end();
})();

const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({
    host: '43.166.250.145', port: 3306, user: 'dbo001',
    password: 'BDQN123456', database: 'db_zhty202410',
    waitForConnections: true, connectionLimit: 2
  });

  // 1. Delete the wrong t1200-salary income entries from cash_entries
  const [del] = await pool.execute("DELETE FROM a3s_cash_entries WHERE source_type='t1200-salary'");
  console.log('Deleted t1200-salary from cash_entries:', del.affectedRows);

  // 2. Fix expense_type in a3s_expenses for salary items
  const [fix] = await pool.execute(`
    UPDATE a3s_expenses e
    JOIN db_zhty202410.T1200 t ON e.old_id = t.P1
    SET e.expense_type = '工资'
    WHERE t.Z1=1 AND t.C1=3 AND t.P2 > 0 AND e.expense_type != '工资'
  `);
  console.log('Fixed expense_type to 工资:', fix.affectedRows);

  // Verify
  const [v1] = await pool.execute("SELECT expense_type, COUNT(*) as c FROM a3s_expenses WHERE expense_type != '工资' AND old_id IN (SELECT P1 FROM db_zhty202410.T1200 WHERE Z1=1 AND C1=3 AND P2>0) GROUP BY expense_type");
  console.log('\nRemaining bad types:');
  v1.forEach(r => console.log('  type:', r.expense_type, 'count:', r.c));

  const [v2] = await pool.execute("SELECT COUNT(*) as c FROM a3s_cash_entries WHERE source_type='t1200-salary'");
  console.log('Remaining t1200-salary in cash_entries:', v2[0].c);

  const [v3] = await pool.execute("SELECT SUM(amount) as c FROM a3s_cash_entries WHERE type='收入'");
  console.log('Total income after cleanup:', v3[0].c);

  // 3. Now add salary as expense in cash_entries correctly
  // Add them with type='支出', note='工资', source_type='t1200-salary'
  const [rows] = await pool.execute(
    "SELECT * FROM T1200 WHERE Z1=1 AND C1=3 AND P2 > 0"
  );
  // Use batch insert
  let batch = [];
  for (const r of rows) {
    batch.push([
      `sal-${r.P1}`, '支出', (r.C5||0)/100,
      r.C6 ? (String(r.C6).slice(0,4)+'-'+String(r.C6).slice(4,6)+'-'+String(r.C6).slice(6,8)) : '',
      '工资', '现金', '', r.P1, 't1200-salary', String(r.P1)
    ]);
    if (batch.length >= 500) {
      await connQuery(pool, batch);
      batch = [];
    }
  }
  if (batch.length) await connQuery(pool, batch);
  console.log('\nAdded salary to cash_entries as 支出:', rows.length);

  // Final verify
  const [v4] = await pool.execute("SELECT type, COUNT(*) as c, SUM(amount) as total FROM a3s_cash_entries WHERE source_type='t1200-salary' GROUP BY type");
  v4.forEach(r => console.log('  type:', r.type, 'count:', r.c, 'total:', r.total));

  await pool.end();
})();

async function connQuery(pool, batch) {
  await pool.query(
    `INSERT IGNORE INTO a3s_cash_entries(id,type,amount,date,note,method,order_number,old_id,source_type,source_id) VALUES ?`,
    [batch]
  );
}

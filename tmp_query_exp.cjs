const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({ host:'43.166.250.145', port:3306, database:'db_zhty202410', user:'dbo001', password:'BDQN123456', waitForConnections:true, connectionLimit:2 });
  
  // Check if the expense ever existed
  const [r1] = await pool.execute("SELECT id, old_id, expense_type, amount, expense_date, office, created_at, updated_at FROM a3s_expenses WHERE id=?", ['exp-1822914200173241']);
  console.log('Expense found:', r1.length);
  
  // Check the cash entry
  const [r2] = await pool.execute("SELECT id, source_type, source_id, type, amount, date, office, note, category, created_at FROM a3s_cash_entries WHERE id=?", ['office-exp-1822914200173241']);
  console.log('Cash entry:', JSON.stringify(r2[0], null, 2));
  
  // Check T1200 for this amount on this date
  const [r3] = await pool.execute(
    "SELECT * FROM a3s_cash_entries WHERE note LIKE ? AND amount=? AND type='支出' AND office=1",
    ['%叉车%', 310]
  );
  console.log('Match by note/amount:', r3.length);
  if (r3.length > 0) console.log(JSON.stringify(r3[0], null, 2));
  
  // Check T1200 entries
  const [r4] = await pool.execute(
    "SELECT * FROM old_T1200 WHERE JSON_EXTRACT(raw_data, '$[10]') = ? AND JSON_EXTRACT(raw_data, '$[16]') = 0",
    ['31000']
  );
  console.log('T1200 $310 expense entries:', r4.length);
  r4.slice(0,3).forEach(r => {
    const rd = JSON.parse(r.raw_data);
    console.log('  Z1=' + rd[15] + ' P3=' + rd[2] + ' C5=' + rd[10] + ' date=' + rd[4] + ' descr=' + (rd[12]||'') + ' Z2=' + rd[16]);
  });
  
  // Check all expense entries with source_type='expense' AND office=1 
  const [r5] = await pool.execute(
    "SELECT ce.id, ce.source_id, ce.amount, ce.date, ce.note, ce.category FROM a3s_cash_entries ce WHERE ce.source_type='expense' AND ce.office=1"
  );
  console.log('\nAll office expense cash entries:', r5.length);
  const missing = [];
  for (const row of r5) {
    const [ex] = await pool.execute("SELECT id, office FROM a3s_expenses WHERE id=?", [row.source_id]);
    if (ex.length === 0 || !ex[0].office) {
      missing.push(row);
    }
  }
  console.log('Missing/deleted source expenses:', missing.length);
  missing.forEach(r => console.log('  ' + r.id + ' sid=' + r.source_id + ' amt=' + r.amount + ' note=' + r.note));
  
  await pool.end();
})().catch(e => console.error(e.message));

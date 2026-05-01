const mysql = require('mysql2/promise');
(async () => {
  const conn = await mysql.createConnection({host:'43.166.250.145',user:'dbo001',password:'BDQN123456',database:'db_zhty202410',charset:'utf8mb4'});
  const [rows] = await conn.query(
    'SELECT id, order_number, source_type, note, target_name, amount, method, created_at FROM a3s_cash_entries WHERE source_type = ? ORDER BY created_at DESC LIMIT 20',
    ['misc']
  );
  for (const r of rows) {
    console.log('ID:', r.id, '| amount:', r.amount, '| method:', r.method);
    console.log('  note:', JSON.stringify(r.note));
    console.log('  target:', JSON.stringify(r.target_name));
    if (r.note && r.note.includes('\n')) console.log('  *** HAS NEWLINES IN note *** len:', r.note.length, '| JSON:', JSON.stringify(r.note));
    if (r.target_name && r.target_name.includes('\n')) console.log('  *** HAS NEWLINES IN target ***');
  }
  // Also check all entries with newlines in note
  const [allRows] = await conn.query(
    "SELECT id, source_type, note FROM a3s_cash_entries WHERE note LIKE '%\n%' OR note LIKE '%\r%' LIMIT 20"
  );
  if (allRows.length) {
    console.log('\n=== Entries with newlines in note ===');
    for (const r of allRows) {
      console.log('ID:', r.id, '| source:', r.source_type, '| note:', JSON.stringify(r.note));
    }
  } else {
    console.log('\nNo entries found with newlines in note');
  }
  await conn.end();
})();

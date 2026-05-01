const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({
    host: '43.166.250.145', port: 3306, user: 'dbo001',
    password: 'BDQN123456', database: 'db_zhty202410',
    connectionLimit: 2, supportBigNumbers: true, bigNumberStrings: true,
  });

  // Check for duplicate old_ids  
  const [dupes] = await pool.execute(
    "SELECT old_id, COUNT(*) as cnt FROM a3s_cash_entries WHERE old_id IS NOT NULL AND old_id > 0 GROUP BY old_id HAVING cnt > 1"
  );
  console.log('Duplicate old_ids:', dupes.length);
  if (dupes.length > 0) {
    for (const d of dupes) console.log(' ', d.old_id, '->', d.cnt);
    // Show first 3 in detail
    const [d1] = await pool.execute("SELECT id, office, amount, source_type, old_id FROM a3s_cash_entries WHERE old_id = ?", [String(dupes[0].old_id)]);
    for (const r of d1) console.log('  id:', r.id, 'office:', r.office, 'amt:', r.amount, 'src:', r.source_type, 'old:', r.old_id);
  }

  // Total count by source_type
  const [st] = await pool.execute("SELECT source_type, COUNT(*) as cnt FROM a3s_cash_entries GROUP BY source_type");
  console.log('\nBy source_type:');
  st.forEach(r => console.log(' ', r.source_type, r.cnt));

  // Count by office flag
  const [off] = await pool.execute("SELECT office, COUNT(*) as cnt FROM a3s_cash_entries GROUP BY office");
  console.log('\nBy office flag:');
  off.forEach(r => console.log(' ', r.office, r.cnt));

  await pool.end();
})();

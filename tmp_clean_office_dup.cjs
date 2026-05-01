const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({
    host: '43.166.250.145', port: 3306, user: 'dbo001',
    password: 'BDQN123456', database: 'db_zhty202410',
    connectionLimit: 2, supportBigNumbers: true, bigNumberStrings: true,
  });

  // Find all old_ids with duplicates
  const [dupes] = await pool.execute(
    "SELECT old_id, COUNT(*) as cnt FROM a3s_cash_entries WHERE source_type='t1200' AND old_id IS NOT NULL AND old_id > 0 GROUP BY old_id HAVING cnt > 1"
  );
  console.log('Duplicate old_ids to clean:', dupes.length);
  let deleted = 0;
  for (const d of dupes) {
    const oldId = String(d.old_id);
    const correctId = 'inc-' + oldId; // Uses bigNumberStrings so oldId is exact
    // Find entries for this old_id
    const [rows] = await pool.execute(
      "SELECT id, office FROM a3s_cash_entries WHERE old_id=? AND source_type='t1200' ORDER BY id",
      [oldId]
    );
    // Keep the one with correct id, delete others
    for (const row of rows) {
      if (row.id === correctId) continue; // keep correct id
      // Delete truncated id entry
      await pool.execute("DELETE FROM a3s_cash_entries WHERE id=? AND source_type='t1200'", [row.id]);
      deleted++;
      console.log('  deleted: %s (office=%d) old_id=%s', row.id, row.office, oldId);
    }
  }
  console.log('Total deleted: %d', deleted);

  // Now also handle expense dupes
  const [expDupes] = await pool.execute(
    "SELECT old_id, COUNT(*) as cnt FROM a3s_expenses WHERE old_id IS NOT NULL AND old_id > 0 GROUP BY old_id HAVING cnt > 1"
  );
  console.log('\nExpense duplicates: %d', expDupes.length);
  let expDeleted = 0;
  for (const d of expDupes) {
    const oldId = String(d.old_id);
    const correctId = 'exp-' + oldId;
    const [rows] = await pool.execute(
      "SELECT id, office FROM a3s_expenses WHERE old_id=? ORDER BY id",
      [oldId]
    );
    for (const row of rows) {
      if (row.id === correctId) continue;
      await pool.execute("DELETE FROM a3s_expenses WHERE id=?", [row.id]);
      expDeleted++;
    }
  }
  console.log('Expense duplicates deleted: %d', expDeleted);

  // Verify
  const [v] = await pool.execute(
    "SELECT source_type, office, COUNT(*) as cnt, ROUND(SUM(amount),2) as total FROM a3s_cash_entries GROUP BY source_type, office ORDER BY source_type, office"
  );
  console.log('\n=== After cleanup ===');
  for (const x of v) {
    console.log('  src=%s office=%d: %d recs $%s', x.source_type, x.office, x.cnt, x.total);
  }

  // Office balance calculation
  const [oc] = await pool.execute(
    "SELECT type, COUNT(*) as cnt, ROUND(SUM(amount),2) as total FROM a3s_cash_entries WHERE office=1 GROUP BY type"
  );
  let bal = 0;
  console.log('\nOffice cash:');
  for (const r of oc) {
    console.log('  %s: %d recs $%s', r.type, r.cnt, r.total);
    if (r.type === '收入' || r.type === '转入') bal += Number(r.total);
    else bal -= Number(r.total);
  }
  console.log('  Balance: $%s', bal.toFixed(2));

  const [oe] = await pool.execute(
    "SELECT COUNT(*) as cnt, ROUND(SUM(amount),2) as total FROM a3s_expenses WHERE office=1"
  );
  console.log('Office expenses: %d recs $%s', oe[0].cnt, oe[0].total);
  console.log('Net (including expenses): $%s', (bal - Number(oe[0].total)).toFixed(2));

  await pool.end();
})();

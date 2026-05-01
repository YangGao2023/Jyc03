const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({
    host: '43.166.250.145', port: 3306, user: 'dbo001',
    password: 'BDQN123456', database: 'db_zhty202410',
    connectionLimit: 2, supportBigNumbers: true, bigNumberStrings: true,
  });

  // Clean cash_entries duplicates
  const [dupes] = await pool.execute(`SELECT old_id, COUNT(*) as cnt FROM a3s_cash_entries WHERE source_type='t1200' AND old_id IS NOT NULL AND old_id>0 GROUP BY old_id HAVING cnt>1`);
  console.log('Cash dupes:', dupes.length);
  let d = 0;
  for (const dup of dupes) {
    const oid = String(dup.old_id);
    const correct = 'inc-' + oid;
    const [rows] = await pool.execute(`SELECT id, office FROM a3s_cash_entries WHERE old_id=? AND source_type='t1200'`, [oid]);
    for (const r of rows) {
      if (r.id === correct) continue;
      await pool.execute('DELETE FROM a3s_cash_entries WHERE id=?', [r.id]);
      d++;
    }
  }
  console.log('Deleted:', d);

  // Clean expenses duplicates
  const [ed] = await pool.execute("SELECT old_id, COUNT(*) as cnt FROM a3s_expenses WHERE old_id IS NOT NULL AND old_id>0 GROUP BY old_id HAVING cnt>1");
  console.log('Exp dupes:', ed.length);
  let d2 = 0;
  for (const dup of ed) {
    const oid = String(dup.old_id);
    const correct = 'exp-' + oid;
    const [rows] = await pool.execute('SELECT id, office FROM a3s_expenses WHERE old_id=?', [oid]);
    for (const r of rows) {
      if (r.id === correct) continue;
      await pool.execute('DELETE FROM a3s_expenses WHERE id=?', [r.id]);
      d2++;
    }
  }
  console.log('Exp deleted:', d2);

  // Fix office flags
  const [i] = await pool.execute(
    `UPDATE a3s_cash_entries c INNER JOIN T1200 t ON c.source_type='t1200' AND c.old_id=t.P1 AND t.P3='110' AND t.Z2=1 SET c.office=1 WHERE c.office=0`
  );
  console.log('Cash office fixed:', i.affectedRows);
  const [e] = await pool.execute(
    `UPDATE a3s_expenses e INNER JOIN T1200 t ON e.source_type='t1200' AND e.old_id=t.P1 AND t.P3='110' AND t.Z2=0 SET e.office=1 WHERE e.office=0`
  );
  console.log('Exp office fixed:', e.affectedRows);
  const [o] = await pool.execute(
    `UPDATE a3s_cash_entries SET office=1 WHERE source_type='office-transfer' AND office=0`
  );
  console.log('Transfer office fixed:', o.affectedRows);

  // Verify
  const [oc] = await pool.execute('SELECT type,COUNT(*) as cnt,ROUND(SUM(amount),2) as total FROM a3s_cash_entries WHERE office=1 GROUP BY type');
  let bal = 0;
  for (const r of oc) {
    if (r.type === '收入' || r.type === '转入') bal += Number(r.total);
    else bal -= Number(r.total);
  }
  const [oe] = await pool.execute('SELECT COUNT(*) as cnt,ROUND(SUM(amount),2) as total FROM a3s_expenses WHERE office=1');
  console.log('\nAfter fix:');
  console.log('Cash entries:', oc);
  console.log('Cash balance:', bal.toFixed(2));
  console.log('Office expenses:', oe[0].total);
  console.log('Net:', (bal - Number(oe[0].total)).toFixed(2));

  await pool.end();
})();

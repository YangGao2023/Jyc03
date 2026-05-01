const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: '43.166.250.145', port: 3306,
    user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410',
    supportBigNumbers: true,
    bigNumberStrings: true,
  });

  // Find the $280 expense entry(ies) in Feb 2025
  const [feb280] = await conn.execute(`
    SELECT e.id, e.old_id, e.amount, e.expense_date, e.source_type, e.detail, e.target
    FROM a3s_expenses e
    WHERE e.expense_date LIKE '2025-02%' AND e.amount = 280
  `);
  console.log('Feb 2025 $280 entries:', feb280.length);
  for (const r of feb280) {
    console.log(r.id, r.old_id, '$' + Number(r.amount).toFixed(2), r.expense_date, r.source_type, 'detail:', r.detail, 'target:', r.target);
  }

  // Check if they match T1200
  const [t1200Match] = await conn.execute(`
    SELECT COUNT(*) as cnt
    FROM a3s_expenses e
    INNER JOIN T1200 t ON BINARY e.old_id = t.P1
    WHERE e.expense_date LIKE '2025-02%' AND e.amount = 280
  `);
  console.log('\nT1200 matched: ' + t1200Match[0].cnt);

  // Check for orphans
  const [orphans] = await conn.execute(`
    SELECT e.id, e.old_id, e.amount
    FROM a3s_expenses e
    LEFT JOIN T1200 t ON BINARY e.old_id = t.P1
    WHERE e.expense_date LIKE '2025-02%' AND e.amount = 280 AND t.P1 IS NULL
  `);
  console.log('\nOrphans (no T1200 match): ' + orphans.length);
  for (const r of orphans) {
    console.log(r.id, r.old_id, '$' + Number(r.amount).toFixed(2));
  }

  // Total T1200 Feb 2025 expense
  const [t1200Feb] = await conn.execute(`
    SELECT ROUND(SUM(C5)/100, 2) as total
    FROM T1200 WHERE Z1=1 AND Z2=0 AND C6 LIKE '202502%'
  `);
  console.log('\nT1200 Feb expense total: $' + Number(t1200Feb[0].total).toFixed(2));

  // Total a3s_expenses Feb 2025
  const [a3sFeb] = await conn.execute(`
    SELECT ROUND(SUM(amount), 2) as total
    FROM a3s_expenses WHERE expense_date LIKE '2025-02%'
  `);
  console.log('a3s_expenses Feb total: $' + Number(a3sFeb[0].total).toFixed(2));
  console.log('Difference: $' + (Number(a3sFeb[0].total) - Number(t1200Feb[0].total)).toFixed(2));

  // Count duplicates by old_id
  const [dupOldIds] = await conn.execute(`
    SELECT old_id, COUNT(*) as cnt, ROUND(SUM(amount), 2) as total, GROUP_CONCAT(amount ORDER BY id) as amounts
    FROM a3s_expenses
    WHERE expense_date LIKE '2025-02%'
    GROUP BY old_id HAVING cnt > 1
  `);
  if (dupOldIds.length > 0) {
    console.log('\nDuplicate old_id(s) in Feb:');
    for (const r of dupOldIds) {
      console.log('  old_id:', r.old_id, 'cnt:', r.cnt, 'total: $' + r.total, 'amounts:', r.amounts);
    }
  }

  await conn.end();
}
main().catch(console.error);

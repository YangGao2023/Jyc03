const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: '43.166.250.145', port: 3306,
    user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410',
    supportBigNumbers: true,
    bigNumberStrings: true,
  });

  // Find all $280 Feb entries
  const [r] = await conn.execute("SELECT id, old_id, amount, expense_date, detail, target, source_type FROM a3s_expenses WHERE expense_date LIKE '2025-02%' AND amount = 280");
  console.log('Found:', r.length);
  for (const x of r) {
    console.log('  id:', x.id, 'old_id:', x.old_id, '$' + Number(x.amount).toFixed(2), 'detail:', x.detail, 'source:', x.source_type);
  }

  // Try to delete by old_id match with T1200
  const [d] = await conn.execute("DELETE e FROM a3s_expenses e LEFT JOIN T1200 t ON e.old_id = t.P1 WHERE e.source_type='t1200' AND e.amount = 280 AND e.expense_date LIKE '2025-02%' AND t.P1 IS NULL COLLATE utf8mb4_unicode_ci");
  console.log('Delete result:', d.affectedRows);

  // After delete
  const [r2] = await conn.execute("SELECT id, old_id, amount FROM a3s_expenses WHERE expense_date LIKE '2025-02%' AND amount = 280");
  console.log('After delete, remaining:', r2.length);
  for (const x of r2) {
    console.log('  id:', x.id, 'old_id:', x.old_id);
  }

  // Try casting
  const [d2] = await conn.execute("DELETE e FROM a3s_expenses e LEFT JOIN T1200 t ON BINARY e.old_id = CAST(t.P1 AS CHAR) WHERE e.source_type='t1200' AND e.amount = 280 AND e.expense_date LIKE '2025-02%' AND t.P1 IS NULL");
  console.log('Delete2 result:', d2.affectedRows);

  // Final check
  const [r3] = await conn.execute("SELECT id, old_id, amount FROM a3s_expenses WHERE expense_date LIKE '2025-02%' AND amount = 280");
  console.log('Final remaining:', r3.length);
  for (const x of r3) {
    console.log('  id:', x.id, 'old_id:', x.old_id);
  }

  await conn.end();
}
main().catch(console.error);

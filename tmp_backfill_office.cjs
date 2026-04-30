const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: '43.166.250.145', port: 3306, user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410', charset: 'utf8mb4',
  });

  // Backfill cash_entries.office for T1200 income records with P3='110'
  // T1200 P1 = a3s_cash_entries.old_id where the T1200 Z2=1 (income)
  // But old_id is a bigint, not varchar. Need to match via exp-{p1} prefix pattern.

  // Actually: a3s_cash_entries.id = 'inc-' + T1200.P1 (string concat)
  // We need to find T1200 rows where P3='110' and Z2=1
  // Then update a3s_cash_entries.office = 1 where id matches 'inc-' + T1200.P1

  // Method: find T1200 office records, get their P1 values, update cash entries
  const [officeIncs] = await conn.execute(
    "SELECT CONCAT('inc-', P1) as cash_id FROM T1200 WHERE Z1=1 AND Z2=1 AND P3='110'"
  );
  console.log(`Income office records (T1200 Z2=1 P3=110): ${officeIncs.length}`);

  if (officeIncs.length > 0) {
    const ids = officeIncs.map(r => r.cash_id);
    // Batch update in chunks of 500
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const placeholders = chunk.map(() => '?').join(',');
      const [res] = await conn.execute(
        `UPDATE a3s_cash_entries SET office = 1 WHERE id IN (${placeholders})`,
        chunk
      );
      console.log(`  chunk ${i/500+1}: updated ${res.affectedRows}`);
    }
  }

  // Backfill cash_entries.office for T1200 expense records with P3='110'
  // Expenses go to a3s_expenses, not a3s_cash_entries
  // But some office expense records might exist in a3s_expenses
  const [officeExps] = await conn.execute(
    "SELECT CONCAT('exp-', P1) as exp_id FROM T1200 WHERE Z1=1 AND Z2=0 AND P3='110'"
  );
  console.log(`\nExpense office records (T1200 Z2=0 P3=110): ${officeExps.length}`);

  if (officeExps.length > 0) {
    const ids = officeExps.map(r => r.exp_id);
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const placeholders = chunk.map(() => '?').join(',');
      const [res] = await conn.execute(
        `UPDATE a3s_expenses SET office = 1 WHERE id IN (${placeholders})`,
        chunk
      );
      console.log(`  chunk ${i/500+1}: updated ${res.affectedRows}`);
    }
  }

  // Also backfill cash_entries.office for cash entries linked to T1200 expense records
  // If T1200 Z2=0 (expense) and P3='110', the corresponding a3s_expenses has office=1
  // But cash_entries don't have these as direct entries (they're in a3s_expenses)
  // So no cash entries to update for expenses.

  // Verify
  const [cashOffice] = await conn.execute("SELECT COUNT(*) as cnt FROM a3s_cash_entries WHERE office = 1");
  console.log(`\nFinal: cash_entries with office=1: ${cashOffice[0].cnt}`);

  const [expOffice] = await conn.execute("SELECT COUNT(*) as cnt FROM a3s_expenses WHERE office = 1");
  console.log(`Final: expenses with office=1: ${expOffice[0].cnt}`);

  await conn.end();
}
main().catch(console.error);

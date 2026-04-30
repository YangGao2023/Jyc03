const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: '43.166.250.145', port: 3306,
    user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410', charset: 'utf8mb4',
  });

  // Backfill empty expense_type with detail text as fallback
  const [affected] = await conn.execute(
    "UPDATE a3s_expenses SET expense_type = detail WHERE expense_type IS NULL OR expense_type = ''"
  );
  console.log(`Backfilled: ${affected.affectedRows} rows`);

  // Verify
  const [remaining] = await conn.execute("SELECT COUNT(*) as cnt FROM a3s_expenses WHERE expense_type IS NULL OR expense_type = ''");
  console.log(`Remaining empty: ${remaining[0].cnt}`);

  await conn.end();
}
main().catch(console.error);

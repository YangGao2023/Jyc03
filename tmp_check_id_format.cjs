const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: '43.166.250.145', port: 3306, user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410', charset: 'utf8mb4',
  });

  // Check the actual format of inc- IDs for huge P1 records
  const [sample] = await conn.execute(`
    SELECT id FROM a3s_cash_entries WHERE old_id IS NOT NULL AND old_id > 1000000000000000000 LIMIT 3
  `);
  console.log("=== Sample IDs from cash_entries with huge old_id ===");
  for (const r of sample) console.log(`  id=${r.id}`);

  // Try direct match with one specific P1
  const [direct] = await conn.execute(`
    SELECT id FROM a3s_cash_entries WHERE id = CONCAT('inc-', '2049870045781299200')
  `);
  console.log(`\nDirect match for inc-2049870045781299200: ${direct.length}`);

  // Try with LTRIM to handle any whitespace
  const [trimmed] = await conn.execute(`
    SELECT id FROM a3s_cash_entries WHERE TRIM(id) = CONCAT('inc-', TRIM('2049870045781299200'))
  `);
  console.log(`Trimmed match: ${trimmed.length}`);

  // Check: what IDs does a3s_cash_entries have for today's P1=2049870045781299200?
  const [byOldId] = await conn.execute(`
    SELECT id, old_id FROM a3s_cash_entries WHERE old_id = 2049870045781299200
  `);
  console.log(`\nBy old_id=2049870045781299200: ${byOldId.length}`);
  for (const r of byOldId) console.log(`  id='${r.id}' old_id=${r.old_id}`);

  // Also try to find if there's a substring match
  const [like] = await conn.execute(`
    SELECT id, old_id FROM a3s_cash_entries WHERE id LIKE 'inc-2049870045781299200%'
  `);
  console.log(`LIKE match: ${like.length}`);
  for (const r of like) console.log(`  id='${r.id}' old_id=${r.old_id}`);

  await conn.end();
}
main().catch(console.error);

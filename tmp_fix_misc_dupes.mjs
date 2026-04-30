import mysql from 'mysql2/promise';
const conn = await mysql.createConnection({host:'43.166.250.145',user:'dbo001',password:'BDQN123456',database:'db_zhty202410'});

// Step 1: Delete the 3 today's misc entries that duplicate order payments
const [del] = await conn.execute(
  "DELETE FROM a3s_cash_entries WHERE id IN ('inc-2049893407974887','inc-2049897950758441','inc-2049904295297552')"
);
console.log('Deleted ' + del.affectedRows + ' duplicate misc entries (today)');

// Step 2: Tag remaining 30 as source_type='t1200' (they have matching T1200 records)
const [tag] = await conn.execute(
  "UPDATE a3s_cash_entries SET source_type='t1200' WHERE type='收入' AND (order_number IS NULL OR order_number = '') AND (source_type IS NULL OR source_type = '')"
);
console.log('Tagged ' + tag.affectedRows + ' entries as source_type=t1200');

// Verify
const [remaining] = await conn.execute(
  "SELECT COUNT(*) as c FROM a3s_cash_entries WHERE type='收入' AND (order_number IS NULL OR order_number = '') AND (source_type IS NULL OR source_type = '')"
);
console.log('Remaining null-source_type entries: ' + remaining[0].c);

await conn.end();

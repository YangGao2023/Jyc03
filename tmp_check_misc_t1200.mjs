import mysql from 'mysql2/promise';
const conn = await mysql.createConnection({host:'43.166.250.145',user:'dbo001',password:'BDQN123456',database:'db_zhty202410'});

// Check today's 3 misc entries ($200, $172, $1100) - do they have matching T1200 records?
// These are inc-2049893407974887 ($200), inc-2049897950758441 ($172), inc-2049904295297552 ($1100)
const ids = ['inc-2049893407974887', 'inc-2049897950758441', 'inc-2049904295297552'];
const placeholders = ids.map(() => '?').join(',');
const [cashEntries] = await conn.execute(
  `SELECT id, old_id, amount, date, note FROM a3s_cash_entries WHERE id IN (${placeholders})`,
  ids
);
for (const e of cashEntries) {
  // Check T1200 for the matching old_id
  const [t1200] = await conn.execute('SELECT P1,P2,P3,P4,P6 FROM T1200 WHERE P1=?', [e.old_id]);
  if (t1200.length > 0) {
    const t = t1200[0];
    console.log(`${e.id.slice(0,20)} $${e.amount} old_id=${e.old_id} note="${e.note}"`);
    console.log(`  T1200: P1=${t.P1} P2(link)=${t.P2} P3(amount)=${t.P3} P4(date)=${t.P4} P6(note)=${t.P6}`);
    // Check if T1200.P2 links to an order
    if (t.P2 && t.P2 > 0) {
      const [t1111] = await conn.execute('SELECT P1, P2 FROM T1111 WHERE P1=?', [t.P2]);
      if (t1111.length > 0) {
        console.log(`  Linked to T1111 order P1=${t1111[0].P1}`);
      }
    }
  } else {
    console.log(`${e.id.slice(0,20)} $${e.amount} - NOT found in T1200`);
  }
}

// Also check all 33 entries for T1200 matches
console.log('\n--- All 33 entries old_id check ---');
const [allNoSource] = await conn.execute(
  "SELECT id, old_id, amount, date FROM a3s_cash_entries WHERE type='收入' AND (order_number IS NULL OR order_number = '') AND (source_type IS NULL OR source_type = '')"
);
let foundInT1200 = 0;
let notFound = 0;
for (const e of allNoSource) {
  if (e.old_id) {
    const [t] = await conn.execute('SELECT P1, P2 FROM T1200 WHERE P1=?', [e.old_id]);
    if (t.length > 0) foundInT1200++;
    else { notFound++; console.log(`  NOT in T1200: ${e.id.slice(0,20)} old_id=${e.old_id} $${e.amount}`); }
  } else {
    notFound++; console.log(`  No old_id: ${e.id.slice(0,20)} $${e.amount}`);
  }
}
console.log(`Found in T1200: ${foundInT1200}, Not found/No old_id: ${notFound}`);

await conn.end();

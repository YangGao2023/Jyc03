const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, 'data', 'biz.db');

try {
  const db = new Database(dbPath, { readonly: true });
  const count = db.prepare('SELECT COUNT(*) as c FROM orders').get();
  console.log('Orders in DB:', count.c);

  const sample = db.prepare("SELECT order_number, balance, payment_history FROM orders WHERE balance > 0 LIMIT 1").get();
  if (sample) {
    console.log('Sample:', JSON.stringify({
      order_number: sample.order_number,
      balance: sample.balance,
      payment_history: String(sample.payment_history || '').slice(0, 200)
    }));
  } else {
    console.log('No balance>0 orders');
  }

  // Check payment_history length distribution
  const phCounts = db.prepare("SELECT payment_history FROM orders").all().map(r => {
    const ph = r.payment_history;
    if (!ph) return 0;
    try { return JSON.parse(ph).length; } catch { return 0; }
  });
  console.log('Payment history lengths:', {
    total: phCounts.length,
    zero: phCounts.filter(c => c === 0).length,
    nonZero: phCounts.filter(c => c > 0).length,
    sampleCounts: phCounts.filter(c => c > 0).slice(0, 10)
  });

  db.close();
} catch (e) {
  console.error('Error:', e.message);
}

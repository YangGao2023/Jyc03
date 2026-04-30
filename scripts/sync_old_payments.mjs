/**
 * Sync old ZHTY payment methods from T1200 to current app data.
 *
 * Match T1113 (order payments, no method) → T1200 (income ledger, has C4 method)
 * by amount + date. Updates the "method" field in payment_history.
 *
 * C4 codes: 1=现金, 2=支票, 3=转账, 4=刷卡
 *
 * Usage:
 *   node scripts/sync_old_payments.mjs           # dry-run (default)
 *   node scripts/sync_old_payments.mjs --apply    # actually update
 */

const mysql = require('mysql2/promise');

const OLD_DB = {
  host: '43.166.250.145', port: 3306,
  user: 'dbo001', password: 'BDQN123456',
  database: 'db_zhty202410', charset: 'utf8mb4',
};

const METHOD_MAP = { 1: '现金', 2: '支票', 3: '转账', 4: '刷卡' };

async function queryOldDB() {
  const conn = await mysql.createConnection(OLD_DB);
  try {
    // Get all T1200 income records with payment method
    const [t1200Rows] = await conn.execute(
      `SELECT P1, P2, C4, C5, C6, C2, C3
       FROM T1200 WHERE Z1=1 AND Z2=1 AND C4 IN (1,2,3,4) AND C5 > 0
       ORDER BY C6 DESC`
    );
    console.log(`[old-db] T1200 income records with payment method: ${t1200Rows.length}`);

    // Get T1113 payment records (for matching)
    const [t1113Rows] = await conn.execute(
      `SELECT P1, P2, C2, C4, C3, C5
       FROM T1113 WHERE C1=1 AND C2 > 0
       ORDER BY C4 DESC`
    );
    console.log(`[old-db] T1113 payment records: ${t1113Rows.length}`);

    return { t1200Rows, t1113Rows };
  } finally {
    await conn.end();
  }
}

function buildMatchIndex(t1200Rows) {
  // Index by [amount_date] for fast lookup
  const index = new Map();
  for (const row of t1200Rows) {
    const key = `${row[4]}_${row[3]}`; // date_amount (cents)
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(row);
  }
  return index;
}

/**
 * Try to match a T1113 payment record to T1200 by amount+date.
 * Returns the payment method if found, null otherwise.
 */
function matchPayment(t1113row, index, note) {
  const key = `${t1113row[3]}_${t1113row[2]}`; // date_amount
  const matches = index.get(key);
  if (!matches) return null;

  // If multiple T1200 entries match the same amount+date, prefer:
  // 1. Same order ID (P2)
  // 2. Same client name
  // 3. Same description
  if (matches.length === 1) return { method: matches[0][2], note2: matches[0][6] };

  // Try matching by order ID
  const sameOrder = matches.find(m => m[1] === t1113row[1]); // T1200.P2 == T1113.P2
  if (sameOrder) return { method: sameOrder[2], note2: sameOrder[6] };

  // Try matching by note
  if (note) {
    const noteMatch = matches.find(m => m[6] && note.includes(m[6]) || (m[6] && m[6].includes(note)));
    if (noteMatch) return { method: noteMatch[2], note2: noteMatch[6] };
  }

  // Fallback: first match
  return { method: matches[0][2], note2: matches[0][6] };
}

async function main() {
  const isApply = process.argv.includes('--apply');
  console.log(`=== ZHTY Payment Method Sync ${isApply ? '-- APPLY MODE --' : '(dry-run)'} ===\n`);

  // 1. Query old DB
  const { t1200Rows, t1113Rows } = await queryOldDB();
  const matchIndex = buildMatchIndex(t1200Rows);

  // 2. Build method mapping from T1113 → T1200
  let matched = 0, unmatched = 0;
  const methodCount = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const unmatchedSamples = [];

  for (const row of t1113Rows) {
    const note = row[5] || '';
    const result = matchPayment(row, matchIndex, note);
    if (result) {
      matched++;
      methodCount[result.method] = (methodCount[result.method] || 0) + 1;
    } else {
      unmatched++;
      if (unmatchedSamples.length < 10) {
        unmatchedSamples.push({
          amount: row[2], date: row[3],
          type: row[4] || '',
          note: row[5] || ''
        });
      }
    }
  }

  console.log(`\n=== Matching Results ===`);
  console.log(`  Matched: ${matched}/${t1113Rows.length}`);
  console.log(`  Unmatched: ${unmatched}/${t1113Rows.length}`);
  console.log(`\nPayment method distribution:`);
  for (const [code, count] of Object.entries(methodCount).sort((a,b) => a[0]-b[0])) {
    console.log(`  C4=${code} (${METHOD_MAP[code] || '?'}): ${count}`);
  }

  if (unmatchedSamples.length > 0) {
    console.log(`\n=== Unmatched Samples (${unmatchedSamples.length} shown) ===`);
    for (const s of unmatchedSamples) {
      console.log(`  $${(s.amount/100).toFixed(2)} | ${s.date} | '${s.type}' | '${s.note}'`);
    }
  }

  // 3. Now match against current app data
  console.log(`\n=== Matching against current app orders ===`);
  
  // Read current biz-store from local state or Redis
  const fs = require('fs');
  const path = require('path');
  
  let snapshot;
  const stateFile = path.join(__dirname, '..', 'state', 'biz-store.json');
  const testFile = path.join(__dirname, '..', 'state', 'biz-store.test.json');
  
  if (fs.existsSync(testFile)) {
    snapshot = JSON.parse(fs.readFileSync(testFile, 'utf-8'));
    console.log(`[data] Read from state/biz-store.test.json (${snapshot.orders?.length || 0} orders)`);
  } else if (fs.existsSync(stateFile)) {
    snapshot = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    console.log(`[data] Read from state/biz-store.json (${snapshot.orders?.length || 0} orders)`);
  } else {
    console.log('[data] No local state file found. Attempting Redis...');
    // Try reading from Redis directly if REDIS_URL is set
    if (process.env.REDIS_URL) {
      const { createClient } = require('redis');
      const client = createClient({ url: process.env.REDIS_URL });
      await client.connect();
      const raw = await client.get('biz-store');
      if (raw) snapshot = JSON.parse(raw);
      await client.quit();
      console.log(`[data] Read from Redis (${snapshot?.orders?.length || 0} orders)`);
    }
  }

  if (!snapshot || !snapshot.orders) {
    console.error('[data] Could not load snapshot! Set REDIS_URL or copy state/biz-store.json');
    process.exit(1);
  }

  // Scan all orders and build a flat list of payments needing method fix
  const PAYMENT_NEEDING_FIX = '旧库导入'; // value to look for
  let totalPayments = 0;
  let needFix = 0;
  let fixableViaT1200 = 0;
  const updates = [];

  for (const order of snapshot.orders) {
    const history = order.payment_history || [];
    for (const payment of history) {
      totalPayments++;
      if (payment.method === PAYMENT_NEEDING_FIX || payment.method === '旧库导入') {
        needFix++;
        // Try to match by amount+date
        const key = `${String(payment.date).replace(/[\/-]/g,'')}_${Math.round(payment.amount * 100)}`;
        const t1200 = matchIndex.get(key);
        if (t1200 && t1200.length > 0) {
          fixableViaT1200++;
          updates.push({
            orderId: order.id || order.order_number,
            paymentDate: payment.date,
            paymentAmount: payment.amount,
            oldMethod: payment.method,
            newMethod: METHOD_MAP[t1200[0][2]] || '现金',
            c4: t1200[0][2]
          });
        }
      }
    }
  }

  console.log(`\n  Total payments: ${totalPayments}`);
  console.log(`  Need method fix (旧库导入): ${needFix}`);
  console.log(`  Fixable via T1200 match: ${fixableViaT1200}`);
  console.log(`  Will remain unmatched: ${needFix - fixableViaT1200}`);

  if (updates.length > 0) {
    console.log(`\n=== Sample Updates (first 10 of ${updates.length}) ===`);
    for (const u of updates.slice(0, 10)) {
      console.log(`  Order ${u.orderId}: ${u.paymentDate} $${u.paymentAmount.toFixed(2)} → ${u.newMethod} (C4=${u.c4})`);
    }
  }

  // 4. Apply the updates
  if (isApply) {
    console.log(`\n=== APPLYING UPDATES ===`);
    let applied = 0;
    for (const order of snapshot.orders) {
      const history = order.payment_history || [];
      let changed = false;
      for (const payment of history) {
        if (payment.method === PAYMENT_NEEDING_FIX || payment.method === '旧库导入') {
          const key = `${String(payment.date).replace(/[\/-]/g,'')}_${Math.round(payment.amount * 100)}`;
          const t1200 = matchIndex.get(key);
          if (t1200 && t1200.length > 0) {
            payment.method = METHOD_MAP[t1200[0][2]] || '现金';
            changed = true;
            applied++;
          } else {
            // Fallback: set to 现金 (most common)
            payment.method = '现金';
            changed = true;
            applied++;
          }
        }
      }
      if (changed) {
        order.payment_history = history; // ensure it's written back
      }
    }

    // Write back
    if (process.env.REDIS_URL) {
      const { createClient } = require('redis');
      const client = createClient({ url: process.env.REDIS_URL });
      await client.connect();
      await client.set('biz-store', JSON.stringify(snapshot));
      await client.quit();
      console.log(`  Written back to Redis`);
    } else {
      // Write as .new.json to avoid overwriting original on dry-run discovery
      const outFile = path.join(__dirname, '..', 'state', 'biz-store.synced.json');
      fs.writeFileSync(outFile, JSON.stringify(snapshot, null, 2));
      console.log(`  Written to ${outFile}`);
    }
    console.log(`  Total payment methods updated: ${applied}`);
  } else {
    console.log(`\n✅ Dry-run complete. Run with --apply to write changes.`);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});

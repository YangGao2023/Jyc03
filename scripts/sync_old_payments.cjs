/**
 * Sync old ZHTY payment methods from T1200 to current app data.
 *
 * T1200: P1, P2(orderId), C4=method(1现金/2支票/3转账/4刷卡), C5=amount(分), C6=date(YYYYMMDD), C2=client, C3=desc
 * T1113: P1, P2(orderId), C2=amount(分), C4=date(YYYYMMDD), C3=type, C5=note
 *
 * Match by date+amount (T1113 -> T1200) to recover payment methods.
 *
 * Usage:
 *   node sync_old_payments.cjs           # dry-run
 *   node sync_old_payments.cjs --apply    # actually update
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const OLD_DB = {
  host: '43.166.250.145', port: 3306,
  user: 'dbo001', password: 'BDQN123456',
  database: 'db_zhty202410', charset: 'utf8mb4',
};

const METHOD_MAP = { 1: '现金', 2: '支票', 3: '转账', 4: '刷卡' };

async function queryOldDB() {
  const conn = await mysql.createConnection(OLD_DB);
  try {
    const [t1200Rows] = await conn.execute(
      `SELECT P1, P2, C4, C5, C6, C2, C3
       FROM T1200 WHERE Z1=1 AND Z2=1 AND C4 IN (1,2,3,4) AND C5 > 0
       ORDER BY C6 DESC`
    );
    console.log(`[old-db] T1200 income with C4 method: ${t1200Rows.length}`);
    if (t1200Rows.length > 0) {
      const r = t1200Rows[0];
      console.log(`[old-db] Sample: P1=${r.P1} C4=${r.C4} C5=${r.C5} C6=${r.C6} client=${r.C2}`);
    }

    const [t1113Rows] = await conn.execute(
      `SELECT P1, P2, C2, C4, C3, C5
       FROM T1113 WHERE C1=1 AND C2 > 0
       ORDER BY C4 DESC`
    );
    console.log(`[old-db] T1113 payments: ${t1113Rows.length}`);
    if (t1113Rows.length > 0) {
      const r = t1113Rows[0];
      console.log(`[old-db] Sample: P1=${r.P1} C2=${r.C2} C4=${r.C4}`);
    }
    return { t1200Rows, t1113Rows };
  } finally {
    await conn.end();
  }
}

function buildIndex(t1200Rows) {
  const idx = new Map();
  for (const row of t1200Rows) {
    const key = `${row.C6}_${row.C5}`; // date_amount(cents)
    if (!idx.has(key)) idx.set(key, []);
    idx.get(key).push(row);
  }
  let shown = 0;
  for (const [k, v] of idx) {
    if (shown++ >= 2) break;
    console.log(`[idx] key='${k}': ${v.length} rows, C4=${v[0].C4}`);
  }
  console.log(`[idx] ${idx.size} unique keys from ${t1200Rows.length} rows`);
  return idx;
}

async function main() {
  const isApply = process.argv.includes('--apply');
  console.log(`=== ZHTY Payment Method Sync ${isApply ? '-- APPLY --' : '(dry-run)'} ===\n`);

  const { t1200Rows, t1113Rows } = await queryOldDB();
  const t1200Idx = buildIndex(t1200Rows);

  // === T1113 -> T1200 matching stats ===
  let matched = 0, unmatched = 0;
  const methodCount = {};
  for (const row of t1113Rows) {
    const key = `${row.C4}_${row.C2}`;
    const matches = t1200Idx.get(key);
    if (matches && matches.length > 0) {
      matched++;
      const c4 = matches[0].C4;
      methodCount[c4] = (methodCount[c4] || 0) + 1;
    } else {
      unmatched++;
    }
  }
  console.log(`\nT1113->T1200 match: ${matched}/${t1113Rows.length}`);
  console.log(`Unmatched: ${unmatched}`);
  for (const c of Object.keys(methodCount).sort((a,b) => Number(a)-Number(b))) {
    console.log(`  C4=${c} (${METHOD_MAP[c] || '?'}): ${methodCount[c]}`);
  }

  // === Match against current app ===
  console.log(`\n=== App data ===`);
  let snapshot;
  const stateFile = path.join(__dirname, 'state', 'biz-store.json');
  const testFile = path.join(__dirname, 'state', 'biz-store.test.json');

  if (fs.existsSync(testFile)) {
    snapshot = JSON.parse(fs.readFileSync(testFile, 'utf-8'));
    console.log(`Read state/biz-store.test.json (${snapshot.orders?.length || 0} orders)`);
  } else if (fs.existsSync(stateFile)) {
    snapshot = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    console.log(`Read state/biz-store.json (${snapshot.orders?.length || 0} orders)`);
  } else if (process.env.REDIS_URL) {
    const { createClient } = require('redis');
    const client = createClient({ url: process.env.REDIS_URL });
    await client.connect();
    const raw = await client.get('biz-store');
    if (raw) snapshot = JSON.parse(raw);
    await client.quit();
    console.log(`Read Redis (${snapshot?.orders?.length || 0} orders)`);
  }

  if (!snapshot || !snapshot.orders) {
    console.error('Cannot load snapshot!');
    process.exit(1);
  }

  // Check actual "旧库导入" values in the data
  const badValues = new Set();
  let totalPayments = 0, needFix = 0, fixable = 0, unfixable = 0;
  const fixC4 = {};
  const samples = [];

  for (const order of snapshot.orders) {
    for (const p of (order.payment_history || [])) {
      totalPayments++;
      badValues.add(p.method);
      if (p.method === '旧库导入' || p.method === '') {
        needFix++;
        const nd = String(p.date).replace(/[\/-]/g, '');
        const key = `${nd}_${Math.round(p.amount * 100)}`;
        const matches = t1200Idx.get(key);
        if (matches && matches.length > 0) {
          fixable++;
          const c4 = matches[0].C4;
          fixC4[c4] = (fixC4[c4] || 0) + 1;
          if (samples.length < 10) {
            samples.push({ order: order.order_number || order.id, date: p.date, amount: p.amount, method: METHOD_MAP[c4] || c4, c4 });
          }
        } else {
          unfixable++;
        }
      }
    }
  }

  console.log(`\nTotal payments: ${totalPayments}`);
  console.log(`Unique method values found:`, [...badValues]);
  console.log(`Need fix (旧库导入): ${needFix}`);
  console.log(`Fixable via T1200: ${fixable}`);
  console.log(`Unfixable (fallback to 现金): ${unfixable}`);

  if (fixable > 0) {
    console.log(`\nFixable C4 distribution:`);
    for (const c of Object.keys(fixC4).sort((a,b) => Number(a)-Number(b))) {
      console.log(`  C4=${c} (${METHOD_MAP[c] || '?'}): ${fixC4[c]}`);
    }
    console.log(`\nSamples:`);
    for (const s of samples) {
      console.log(`  ${s.order}: $${s.amount} ${s.date} -> ${s.method} (C4=${s.c4})`);
    }
  }

  // === Apply ===
  if (isApply) {
    console.log(`\n=== APPLYING ===`);
    let applied = 0;
    for (const order of snapshot.orders) {
      let changed = false;
      for (const p of (order.payment_history || [])) {
        if (p.method === '旧库导入') {
          const nd = String(p.date).replace(/[\/-]/g, '');
          const key = `${nd}_${Math.round(p.amount * 100)}`;
          const matches = t1200Idx.get(key);
          p.method = (matches && matches.length > 0) ? METHOD_MAP[matches[0].C4] || '现金' : '现金';
          changed = true;
          applied++;
        }
      }
    }

    if (process.env.REDIS_URL) {
      const { createClient } = require('redis');
      const client = createClient({ url: process.env.REDIS_URL });
      await client.connect();
      await client.set('biz-store', JSON.stringify(snapshot));
      await client.quit();
      console.log(`Written to Redis`);
    } else {
      const outFile = path.join(__dirname, 'state', 'biz-store.synced.json');
      fs.writeFileSync(outFile, JSON.stringify(snapshot, null, 2));
      console.log(`Written to ${outFile}`);
    }
    console.log(`Updated ${applied} payment entries`);
  } else {
    console.log(`\nDry-run complete. Run with --apply to write.`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });

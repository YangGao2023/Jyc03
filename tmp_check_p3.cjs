const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: '43.166.250.145', port: 3306, user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410', charset: 'utf8mb4',
  });

  // Direct check: P3 value for today's records
  const [today] = await conn.execute(`
    SELECT P1, P3, Z2, C5/100 as amt, C2, C3, C6
    FROM T1200 WHERE Z1=1 AND C6=20260430 ORDER BY P1
  `);
  console.log(`Today's T1200 records (C6=20260430): ${today.length}`);
  for (const r of today) {
    console.log(`  P1=${r.P1} P3='${r.P3}' Z2=${r.Z2} $${Number(r.amt).toFixed(2)} C2='${r.C2}' C3='${r.C3}'`);
  }

  // Check: are there any with P3='110'?
  const [p3] = await conn.execute(`
    SELECT COUNT(*) as cnt FROM T1200 WHERE Z1=1 AND P3='110' AND C6=20260430
  `);
  console.log(`\nToday with P3='110': ${p3[0].cnt}`);

  // Maybe the P3 value has different spacing?
  const [p3raw] = await conn.execute(`
    SELECT P1, HEX(P3) as p3_hex, LENGTH(P3) as p3_len
    FROM T1200 WHERE Z1=1 AND C6=20260430 AND SUBSTRING(P3,1,3)='110'
  `);
  console.log(`\nP3 starting with '110': ${p3raw.length}`);
  for (const r of p3raw) console.log(`  P1=${r.P1} hex='${r.p3_hex}' len=${r.p3_len}`);

  await conn.end();
}
main().catch(console.error);

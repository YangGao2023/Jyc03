const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: '43.166.250.145', port: 3306, user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410', charset: 'utf8mb4',
  });

  // Direct test: does the substring JOIN work for these huge P1 values?
  const [testJoin] = await conn.execute(`
    SELECT COUNT(*) as cnt
    FROM a3s_cash_entries c
    INNER JOIN T1200 t ON CAST(t.P1 AS CHAR) = SUBSTRING(c.id, 5)
    WHERE t.Z1=1 AND t.Z2=1 AND t.P3='110'
  `);
  console.log(`Substring JOIN count: ${testJoin[0].cnt}`);

  // Test with the specific P1 value
  const [testVal] = await conn.execute(`
    SELECT CAST(t.P1 AS CHAR) as p1_str, SUBSTRING(c.id, 5) as sub_id
    FROM a3s_cash_entries c
    INNER JOIN T1200 t ON c.old_id = t.P1
    WHERE t.P1 = 2049897950758441000
  `);
  for (const r of testVal) {
    console.log(`p1_str='${r.p1_str}' sub_id='${r.sub_id}'`);
    console.log(`  p1_str HASH=${r.p1_str} ${r.p1_str.length}`);
    console.log(`  sub_id HASH=${r.sub_id} ${r.sub_id.length}`);
    console.log(`  EQUAL=${r.p1_str === r.sub_id}`);
  }

  // Test with HEX
  const [hexTest] = await conn.execute(`
    SELECT HEX(SUBSTRING(c.id, 5)) as hex_sub, HEX(CAST(t.P1 AS CHAR)) as hex_p1
    FROM a3s_cash_entries c
    INNER JOIN T1200 t ON c.old_id = t.P1
    WHERE t.P1 = 2049897950758441000
  `);
  for (const r of hexTest) {
    console.log(`\nhex_sub='${r.hex_sub}'`);
    console.log(`hex_p1='${r.hex_p1}'`);
    console.log(`  EQUAL=${r.hex_sub === r.hex_p1}`);
  }

  await conn.end();
}
main().catch(console.error);

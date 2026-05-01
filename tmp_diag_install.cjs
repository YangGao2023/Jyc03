const mysql = require('mysql2/promise');
(async () => {
  const c = await mysql.createConnection({
    host: '43.166.250.145', port: 3306,
    user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410',
    supportBigNumbers: true, bigNumberStrings: true,
  });

  // 1. T1111 columns
  const [cols] = await c.execute('SHOW COLUMNS FROM T1111');
  console.log('T1111 columns:');
  cols.forEach((col, i) => console.log('  [' + i + ']', col.Field, col.Type));

  // 2. Recent 10 - all columns
  console.log('\n=== T1111 最近10条 ===');
  const [recent] = await c.execute('SELECT * FROM T1111 ORDER BY C11 DESC LIMIT 10');
  for (const r of recent) {
    console.log('P1:', r.P1, 'C1:', JSON.stringify(r.C1), 'C2:', r.C2);
    console.log('  C3:', JSON.stringify(r.C3), 'C4:', JSON.stringify((r.C4 || '').slice(0, 30)));
    console.log('  C5:', JSON.stringify((r.C5 || '').slice(0, 30)));
    console.log('  C7:', r.C7, 'C8:', r.C8);
    console.log('  C10:', JSON.stringify((r.C10 || '').slice(0, 80)));
    console.log('  C11:', JSON.stringify((r.C11 || '').slice(0, 50)));
    console.log('  C15:', r.C15, 'C16:', JSON.stringify((r.C16 || '').slice(0, 50)));
    console.log('  C17:', JSON.stringify(r.C17), 'C18:', JSON.stringify((r.C18 || '').slice(0, 30)));
    console.log('  Z1:', r.Z1);
    console.log('---');
  }

  // 3. a3s_orders current state
  const [oStats] = await c.execute(
    `SELECT COUNT(*) as total,
            SUM(CASE WHEN install_info IS NULL OR install_info = '' THEN 1 ELSE 0 END) as empty_install,
            SUM(CASE WHEN phone IS NULL OR phone = '' THEN 1 ELSE 0 END) as empty_phone,
            SUM(CASE WHEN address IS NULL OR address = '' THEN 1 ELSE 0 END) as empty_addr,
            SUM(CASE WHEN client_name IS NULL OR client_name = '' THEN 1 ELSE 0 END) as empty_name
     FROM a3s_orders`
  );
  console.log('\na3s_orders:');
  console.log('  total:', oStats[0].total);
  console.log('  empty install_info:', oStats[0].empty_install);
  console.log('  empty phone:', oStats[0].empty_phone);
  console.log('  empty address:', oStats[0].empty_addr);
  console.log('  empty client_name:', oStats[0].empty_name);

  // 4. Phone sample from T1111.C18
  console.log('\n=== T1111 C18(电话) 样本 ===');
  const [phones] = await c.execute(
    `SELECT C1, C18, C16 FROM T1111 WHERE C18 IS NOT NULL AND C18 != '' ORDER BY C11 DESC LIMIT 15`
  );
  for (const r of phones) {
    console.log('  C1:', r.C1, 'C18:', JSON.stringify(r.C18), 'C16:', JSON.stringify((r.C16 || '').slice(0, 30)));
  }

  // 4b. Phone empty count in T1111
  const [pStats] = await c.execute(
    `SELECT COUNT(*) as total,
            SUM(CASE WHEN C18 IS NULL OR C18 = '' THEN 1 ELSE 0 END) as empty_phone,
            SUM(CASE WHEN C16 IS NULL OR C16 = '' THEN 1 ELSE 0 END) as empty_addr
     FROM T1111 WHERE Z1 NOT IN (0)`
  );
  console.log('\nT1111 active orders:');
  console.log('  total:', pStats[0].total);
  console.log('  empty C18(phone):', pStats[0].empty_phone);
  console.log('  empty C16(address):', pStats[0].empty_addr);

  // 5. Installer sample
  console.log('\n=== T1111 C11(安装人员) 样本 ===');
  const [installers] = await c.execute(
    `SELECT C1, C11, C10 FROM T1111 WHERE C11 IS NOT NULL AND C11 != '' ORDER BY C11 DESC LIMIT 15`
  );
  for (const r of installers) {
    console.log('  C1:', r.C1, 'C11:', JSON.stringify(r.C11), 'C10:', JSON.stringify((r.C10 || '').slice(0, 60)));
  }

  // 6. T1111 C10 has content stats
  const [c10Stats] = await c.execute(
    `SELECT COUNT(*) as total,
            SUM(CASE WHEN C10 IS NOT NULL AND C10 != '' THEN 1 ELSE 0 END) as has_c10,
            SUM(CASE WHEN C11 IS NOT NULL AND C11 != '' THEN 1 ELSE 0 END) as has_c11
     FROM T1111 WHERE Z1 NOT IN (0)`
  );
  console.log('\nT1111 active - C10/C11 content:');
  console.log('  total:', c10Stats[0].total);
  console.log('  has C10(install content):', c10Stats[0].has_c10);
  console.log('  has C11(installers):', c10Stats[0].has_c11);

  // 7. Check split: phone and address in a3s_orders vs T1111
  console.log('\n=== 空 phone 订单在 T1111 是否有电话 ===');
  const [missingPhoneInT1111] = await c.execute(
    `SELECT o.order_number, o.phone, o.client_name, o.old_id,
            t.C1, t.C18, t.C16, t.C17
     FROM a3s_orders o
     INNER JOIN T1111 t ON o.old_id = t.P1
     WHERE (o.phone IS NULL OR o.phone = '')
       AND t.C18 IS NOT NULL AND t.C18 != ''
     LIMIT 10`
  );
  if (missingPhoneInT1111.length === 0) {
    console.log('  说明: a3s_orders空phone的在T1111也没C18');
  } else {
    for (const r of missingPhoneInT1111) {
      console.log('  单号:', r.order_number, 'a3s phone:', JSON.stringify(r.phone), 'T1111 C18:', JSON.stringify(r.C18));
    }
  }

  await c.end();
})();

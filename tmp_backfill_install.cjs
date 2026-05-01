const mysql = require('mysql2/promise');
(async () => {
  const c = await mysql.createConnection({
    host: '43.166.250.145', port: 3306,
    user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410',
    supportBigNumbers: true, bigNumberStrings: true,
  });

  // 1. 补 install_info: C10→install_info (旧映射错为C3)
  const [r1] = await c.execute(
    `UPDATE a3s_orders o
     INNER JOIN T1111 t ON o.old_id = t.P1
     SET o.install_info = t.C10
     WHERE (o.install_info IS NULL OR o.install_info = '')
      AND t.C10 IS NOT NULL AND t.C10 != ''`
  );
  console.log('补 install_info:', r1.affectedRows, '条');

  // 2. 补 installers: C11→installers
  const [r2] = await c.execute(
    `UPDATE a3s_orders o
     INNER JOIN T1111 t ON o.old_id = t.P1
     SET o.installers = t.C11
     WHERE (o.installers IS NULL OR o.installers = '')
      AND t.C11 IS NOT NULL AND t.C11 != ''`
  );
  console.log('补 installers:', r2.affectedRows, '条');

  // 3. 补 phone: C18→phone
  const [r3] = await c.execute(
    `UPDATE a3s_orders o
     INNER JOIN T1111 t ON o.old_id = t.P1
     SET o.phone = t.C18
     WHERE (o.phone IS NULL OR o.phone = '')
      AND t.C18 IS NOT NULL AND t.C18 != ''`
  );
  console.log('补 phone:', r3.affectedRows, '条');

  // 4. 补 address: C16→address
  const [r4] = await c.execute(
    `UPDATE a3s_orders o
     INNER JOIN T1111 t ON o.old_id = t.P1
     SET o.address = t.C16
     WHERE (o.address IS NULL OR o.address = '')
      AND t.C16 IS NOT NULL AND t.C16 != ''`
  );
  console.log('补 address:', r4.affectedRows, '条');

  // 5. 验证
  const [stats] = await c.execute(
    `SELECT
            COUNT(*) as total,
            SUM(CASE WHEN install_info IS NULL OR install_info = '' THEN 1 ELSE 0 END) as empty_install,
            SUM(CASE WHEN installers IS NULL OR installers = '' THEN 1 ELSE 0 END) as empty_installers,
            SUM(CASE WHEN phone IS NULL OR phone = '' THEN 1 ELSE 0 END) as empty_phone,
            SUM(CASE WHEN address IS NULL OR address = '' THEN 1 ELSE 0 END) as empty_addr
     FROM a3s_orders`
  );
  console.log('\n回填后 a3s_orders:');
  console.log('  总数:', stats[0].total);
  console.log('  空 install_info:', stats[0].empty_install);
  console.log('  空 installers:', stats[0].empty_installers);
  console.log('  空 phone:', stats[0].empty_phone);
  console.log('  空 address:', stats[0].empty_addr);

  // 6. 验证几个样本
  const [samples] = await c.execute(
    `SELECT order_number, client_name, phone, address, installers, install_info
     FROM a3s_orders
     WHERE installers IS NOT NULL AND installers != ''
     ORDER BY order_date DESC LIMIT 5`
  );
  console.log('\n样本验证（有安装人员的订单）:');
  for (const s of samples) {
    console.log('  单号:', s.order_number, '客户:', s.client_name);
    console.log('   电话:', s.phone);
    console.log('   地址:', s.address ? s.address.slice(0, 40) : '(空)');
    console.log('   安装人员:', s.installers);
    console.log('   安装内容:', s.install_info ? s.install_info.slice(0, 60) : '(空)');
  }

  await c.end();
})();

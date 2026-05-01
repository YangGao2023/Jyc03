/**
 * 检查安装信息的数据完整性
 */
const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: '43.166.250.145', port: 3306,
    user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410',
    supportBigNumbers: true,
    bigNumberStrings: true,
  });

  // 1. 统计 install_info 是否为空
  const [stats] = await conn.execute(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN install_info IS NULL OR install_info = '' THEN 1 ELSE 0 END) as empty_install,
      SUM(CASE WHEN client_name IS NULL OR client_name = '' THEN 1 ELSE 0 END) as empty_name,
      SUM(CASE WHEN phone IS NULL OR phone = '' THEN 1 ELSE 0 END) as empty_phone,
      SUM(CASE WHEN address IS NULL OR address = '' THEN 1 ELSE 0 END) as empty_address
    FROM a3s_orders
    WHERE order_type = '定制单' OR order_type = '批发单'
  `);
  console.log('订单统计:');
  console.log('  总数:', stats[0].total);
  console.log('  空 install_info:', stats[0].empty_install, '(' + (stats[0].empty_install / stats[0].total * 100).toFixed(1) + '%)');
  console.log('  空 client_name:', stats[0].empty_name);
  console.log('  空 phone:', stats[0].empty_phone);
  console.log('  空 address:', stats[0].empty_address);

  // Wait, that was wrong - phone and address aren't on a3s_orders usually
  // Let me check a3s_orders column list
  const [cols] = await conn.execute('SHOW COLUMNS FROM a3s_orders');
  const colNames = cols.map(c => c.Field);
  console.log('\na3s_orders 列:', colNames.join(', '));

  // 2. 最近的订单——检查安装信息完整性
  console.log('\n最近的定制单（含 install_info）:');
  const [recent] = await conn.execute(`
    SELECT order_number, order_type, client_name, phone, address,
      install_info, order_date
    FROM a3s_orders
    WHERE (order_type = '定制单' OR order_type = '批发单')
      AND (install_info IS NOT NULL AND install_info != '')
    ORDER BY order_date DESC
    LIMIT 20
  `);

  for (const r of recent) {
    console.log('\n  ---');
    console.log('  单号:', r.order_number);
    console.log('  类型:', r.order_type);
    console.log('  日期:', r.order_date);
    console.log('  客户:', r.client_name);
    console.log('  电话:', r.phone || '(空)');
    console.log('  地址:', r.address || '(空)');
    console.log('  安装内容:', r.install_info);
  }

  // 3. 检查最近 3 个月的订单——含安装信息的比例
  const [monthly] = await conn.execute(`
    SELECT 
      LEFT(order_date, 7) as mon,
      COUNT(*) as total,
      SUM(CASE WHEN install_info IS NOT NULL AND install_info != '' THEN 1 ELSE 0 END) as has_install
    FROM a3s_orders
    WHERE order_type = '定制单' AND order_date >= '2026-01'
    GROUP BY LEFT(order_date, 7)
    ORDER BY mon
  `);
  console.log('\n2026年每月安装信息覆盖:');
  for (const r of monthly) {
    console.log(`  ${r.mon}: 共${r.total}单, 有安装信息${r.has_install}单 (${(Number(r.has_install)/Number(r.total)*100).toFixed(1)}%)`);
  }

  // 4. 检查旧系统 T1111 中哪些订单有安装内容
  const [oldInstall] = await conn.execute(`
    SELECT COUNT(*) as total,
      SUM(CASE WHEN C3 IS NOT NULL AND C3 != '' THEN 1 ELSE 0 END) as has_install
    FROM T1111
    WHERE C2 = '1'
  `);
  console.log('\n旧系统 T1111(定制单) 安装信息:');
  console.log('  总定制单:', oldInstall[0].total);
  console.log('  有安装内容:', oldInstall[0].has_install, '(' + (Number(oldInstall[0].has_install)/Number(oldInstall[0].total)*100).toFixed(1) + '%)');

  // 5. 检查最新的有安装内容的单（只看今天最近的）
  console.log('\n今天/近期的完整安装信息（老系统 T1111）:');
  const [recentOld] = await conn.execute(`
    SELECT P1, P2, P3, C1, C2, C3, C5, C6, C9, C10, C11, C15
    FROM T1111
    WHERE C3 IS NOT NULL AND C3 != ''
    ORDER BY C11 DESC
    LIMIT 10
  `);
  for (const r of recentOld) {
    console.log('\n  --- T1111');
    console.log('  P1:', r.P1, 'P2:', r.P2, 'P3:', r.P3);
    console.log('  C1(单号):', r.C1, 'C2(type):', r.C2, 'C3(安装内容):', r.C3);
    console.log('  C5(总价/100):', Number(r.C5||0)/100, 'C6:', r.C6);
    console.log('  C9(安装费用):', r.C9, 'C10:', r.C10, 'C11(日期):', r.C11, 'C15(地址):', r.C15);
  }

  // 6. Check: who has install_info in T1111.C3 that's populated vs empty
  console.log('\n\nT1111 C3(安装内容) 详细统计:');
  const [c3Stats] = await conn.execute(`
    SELECT LENGTH(C3) as len, COUNT(*) as cnt
    FROM T1111 WHERE C2='1' AND C3 IS NOT NULL AND C3 != ''
    GROUP BY LENGTH(C3) ORDER BY len
  `);
  for (const r of c3Stats) {
    console.log('  C3 长度:', r.len, '条数:', r.cnt);
  }

  await conn.end();
}
main().catch(console.error);

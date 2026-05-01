/**
 * 补全现有订单的 total_after_tax 和 address
 * 从 T1111.C15（税后总金额）和 T1111.C16（安装地址）同步到 a3s_orders
 */
const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: '43.166.250.145', port: 3306,
    user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410',
  });

  // 1. backfill total_after_tax
  const [orders] = await conn.execute(
    `SELECT o.order_number, o.total_price, o.total_after_tax, t.P1, t.C7, t.C15
     FROM a3s_orders o
     JOIN T1111 t ON o.old_id = t.P1
     WHERE t.C15 > 0 AND t.C15 != t.C7`
  );
  let taxCount = 0;
  for (const r of orders) {
    const correctAfterTax = (r.C15 || 0) / 100;
    if (Math.abs(correctAfterTax - r.total_after_tax) > 0.01) {
      await conn.execute(
        `UPDATE a3s_orders SET total_after_tax = ? WHERE order_number = ?`,
        [correctAfterTax, r.order_number]
      );
      taxCount++;
    }
  }
  console.log(`✅ 补全 total_after_tax: ${taxCount} 条`);

  // 2. backfill address
  const [addrOrders] = await conn.execute(
    `SELECT o.order_number, o.address, t.C16
     FROM a3s_orders o
     JOIN T1111 t ON o.old_id = t.P1
     WHERE t.C16 != '' AND (o.address IS NULL OR o.address = '')`
  );
  let addrCount = 0;
  for (const r of addrOrders) {
    await conn.execute(
      `UPDATE a3s_orders SET address = ? WHERE order_number = ?`,
      [r.C16, r.order_number]
    );
    addrCount++;
  }
  console.log(`✅ 补全 address: ${addrCount} 条`);
  console.log(`\n总览: tax_fixed=${taxCount}, address_fixed=${addrCount}`);

  await conn.end();
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });

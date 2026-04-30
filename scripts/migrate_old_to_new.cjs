/**
 * 高效迁移脚本：一次性批量查询，避免逐行子查询
 */
const mysql = require('mysql2/promise');

const METHOD_MAP = { 1: '现金', 2: '支票', 3: '转账', 4: '刷卡' };
const TYPE_MAP = { 1: '定制单', 2: '批发单' };
const CLIENT_ROLES = ['客户', '供应商'];

async function main() {
  const conn = await mysql.createConnection({
    host: '43.166.250.145', port: 3306,
    user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410',
  });

  const start = Date.now();
  console.log('🚀 开始迁移...\n');

  // Pre-load client name map (used by orders + appointments)
  const [allClientNames] = await conn.execute("SELECT P1, C1 FROM T1002");
  const clientNameMap = {};
  for (const c of allClientNames) clientNameMap[c.P1] = c.C1;

  // Truncate new tables
  const tables = ['a3s_cash_entries','a3s_expenses','a3s_orders','a3s_clients',
    'a3s_materials','a3s_employees','a3s_appointments','a3s_attendances',
    'a3s_payrolls','a3s_quotes','a3s_purchases','a3s_suppliers',
    'a3s_print_archives','a3s_vip_prices'];
  for (const t of tables) {
    await conn.execute(`DELETE FROM ${t}`);
  }

  // ── 1. 客户 T1002 ──
  {
    const [rows] = await conn.execute("SELECT * FROM T1002 WHERE Z1=1");
    for (const r of rows) {
      let roles = '["客户"]';
      if (r.C2 === 1) roles = '["供应商"]';
      else if (r.C2 === 3) roles = '["客户","供应商"]';
      await conn.execute(
        `INSERT IGNORE INTO a3s_clients(id,name,contact,phone,email,address,note,roles,old_id) VALUES(?,?,?,?,?,?,?,?,?)`,
        [String(r.P1), r.C1, r.C1, r.C6 || r.C7 || '', r.C5 || '', r.C4 || '', r.C11 || '', roles, r.P1]
      );
    }
    console.log(`✅ 客户: ${rows.length}`);
  }

  // ── 2. 订单 T1111 ──
  {
    // Bulk load all payments T1113
    const [allPayments] = await conn.execute("SELECT * FROM T1113 WHERE Z1=1");
    const payByOrder = {};
    for (const p of allPayments) {
      if (!payByOrder[p.P2]) payByOrder[p.P2] = [];
      payByOrder[p.P2].push(p);
    }

    // Bulk load all materials T1112
    const [allMaterials] = await conn.execute("SELECT * FROM T1112 WHERE Z1=1");
    const matByOrder = {};
    for (const m of allMaterials) {
      if (!matByOrder[m.P2]) matByOrder[m.P2] = [];
      matByOrder[m.P2].push(m);
    }

    // Bulk load T1200 for payment method matching
    const [allT1200] = await conn.execute("SELECT P2, C4, C5, C6 FROM T1200 WHERE Z1=1 AND Z2=1");
    const t1200ByOrder = {};
    for (const t of allT1200) {
      if (!t1200ByOrder[t.P2]) t1200ByOrder[t.P2] = [];
      t1200ByOrder[t.P2].push(t);
    }

    // Bulk load T1001 names
    const [allMatNames] = await conn.execute("SELECT P1, C3 FROM T1001");
    const matNameMap = {};
    for (const m of allMatNames) matNameMap[m.P1] = m.C3;

    const [rows] = await conn.execute("SELECT * FROM T1111 WHERE Z1 NOT IN (0)");
    let count = 0;
    for (const r of rows) {
      const orderNum = r.C1 || `OLD-${r.P1}`;
      const orderType = TYPE_MAP[r.C2] || '定制单';
      const clientName = clientNameMap[r.P2] || r.C17 || '';
      const totalPrice = (r.C7 || 0) / 100;

      // Payments for this order
      const payments = payByOrder[r.P1] || [];
      const paymentHistory = [];
      let amountPaid = 0;
      for (const p of payments) {
        const isRefund = p.C1 === 0;
        const amt = (p.C2 || 0) / 100;
        if (isRefund) amountPaid -= amt;
        else amountPaid += amt;

        // Find method from T1200 by date+amount match
        let method = '现金';
        const t1200s = t1200ByOrder[r.P1] || [];
        for (const t of t1200s) {
          if (t.C5 === p.C2 && t.C6 === p.C4) {
            method = METHOD_MAP[t.C4] || '现金';
            break;
          }
        }

        paymentHistory.push({
          date: p.C4 ? fmtDate(p.C4) : '',
          amount: amt,
          method,
          type: isRefund ? 'refund' : 'payment',
          note: p.C5 || ''
        });
      }

      const totalAfterTax = totalPrice;
      const balance = Math.max(0, totalAfterTax - amountPaid);
      const status = amountPaid >= totalPrice ? '结清' : (amountPaid > 0 ? '未付清' : (STATUS_MAP[r.Z1] || '下单'));

      // Materials
      const mats = matByOrder[r.P1] || [];
      const materialRows = mats.map(m => ({
        name: matNameMap[m.P3] || '未知',
        spec: m.C4 || '',
        qty: m.C1 || 0,
        unit: m.C2 || '个',
        unit_price: (m.C11 || 0) / 100,
      }));

      await conn.execute(
        `INSERT IGNORE INTO a3s_orders
         (order_number,order_type,client_name,client_id,phone,description,
          total_price,total_after_tax,amount_paid,balance,
          order_date,status,install_info,remarks,
          payment_history,material_rows,old_id,old_status)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [orderNum, orderType, clientName, String(r.P2||''), r.C18||'',
         r.C5||'', totalPrice, totalAfterTax, amountPaid, balance,
         r.C8 ? fmtDate(r.C8) : null, status, r.C3||'', r.C10||'',
         JSON.stringify(paymentHistory), JSON.stringify(materialRows),
         r.P1, r.Z1]
      );
      count++;
    }
    console.log(`✅ 订单: ${count}`);
  }

  // ── 3. 收支 T1200 ──
  {
    // Build order number cache
    const [orderNums] = await conn.execute("SELECT P1, C1 FROM T1111");
    const orderNumMap = {};
    for (const o of orderNums) orderNumMap[o.P1] = o.C1 || '';

    // Income
    const [incRows] = await conn.execute("SELECT * FROM T1200 WHERE Z1=1 AND Z2=1");
    for (const r of incRows) {
      const method = METHOD_MAP[r.C4] || '现金';
      await conn.execute(
        `INSERT IGNORE INTO a3s_cash_entries(id,type,amount,date,note,method,order_number,old_id,source_type,source_id)
         VALUES(?,?,?,?,?,?,?,?,?,?)`,
        [`inc-${r.P1}`, '收入', (r.C5||0)/100,
         r.C6?fmtDate(r.C6):'', r.C7||r.C3||'', method,
         orderNumMap[r.P2]||'', r.P1, 't1200', String(r.P1)]
      );
    }
    console.log(`✅ 收入: ${incRows.length}`);

    // Expenses
    const [expRows] = await conn.execute("SELECT * FROM T1200 WHERE Z1=1 AND Z2=0");
    for (const r of expRows) {
      const method = METHOD_MAP[r.C4] || '现金';
      await conn.execute(
        `INSERT IGNORE INTO a3s_expenses(id,target,detail,amount,expense_type,payment_method,expense_date,remark,old_id)
         VALUES(?,?,?,?,?,?,?,?,?)`,
        [`exp-${r.P1}`, r.C2||'', r.C3||'', (r.C5||0)/100,
         r.C3||'其他', method,
         r.C6?fmtDate(r.C6):'', r.C7||'', r.P1]
      );
    }
    console.log(`✅ 支出: ${expRows.length}`);
  }

  // ── 4. 物料 T1001 ──
  {
    // Bulk load category names from T1000
    const [cats] = await conn.execute("SELECT P1, C3 FROM T1000 WHERE C1=1");
    const catMap = {};
    for (const c of cats) catMap[c.P1] = c.C3;

    const [rows] = await conn.execute("SELECT * FROM T1001 WHERE Z1=1");
    for (const r of rows) {
      await conn.execute(
        `INSERT IGNORE INTO a3s_materials(id,code,name,specification,size,unit,stock_quantity,
         factory_price_rmb,usd_cost,sale_price_usd,weight,purchase_price,remark,color,material,other,image,category,old_id)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [String(r.P1), r.C1||'', r.C3||'', r.C6||'', r.C5||'', r.C11||'个', r.C10||0,
         (r.C19||0)/100, (r.C20||0)/100, (r.C21||0)/100, parseFloat(r.C4)||0,
         (r.C20||0)/100, r.C12||'', r.C7||'', r.C8||'', r.C9||'', r.C13||'', catMap[r.P2]||'', r.P1]
      );
    }
    console.log(`✅ 物料: ${rows.length}`);
  }

  // ── 5. 员工 T1003 ──
  {
    const [rows] = await conn.execute("SELECT * FROM T1003 WHERE Z1=1");
    for (const r of rows) {
      await conn.execute(
        `INSERT IGNORE INTO a3s_employees(id,code,name,phone,status,old_id)
         VALUES(?,?,?,?,?,?)`,
        [String(r.P1), r.C1||'', r.C2||'', r.C7||'', '在职', r.P1]
      );
    }
    console.log(`✅ 员工: ${rows.length}`);
  }

  // ── 6. 预约 T1114 ──
  {
    const [rows] = await conn.execute("SELECT * FROM T1114 WHERE Z1=1");
    for (const r of rows) {
      const clientName = clientNameMap[r.P4] || '';
      await conn.execute(
        `INSERT IGNORE INTO a3s_appointments(id,client_name,client_id,appointment_date,appointment_time,description,old_id)
         VALUES(?,?,?,?,?,?,?)`,
        [String(r.P1), clientName, r.P4?String(r.P4):'',
         r.C2?fmtDate(r.C2):'', r.C3||'', r.C4||'', r.P1]
      );
    }
    console.log(`✅ 预约: ${rows.length}`);
  }

  // ── 7. 考勤 T1300 ──
  {
    const [allEmps] = await conn.execute("SELECT P1, C2 FROM T1003");
    const empNameMap = {};
    for (const e of allEmps) empNameMap[e.P1] = e.C2;

    const [rows] = await conn.execute("SELECT * FROM T1300 WHERE Z1=1");
    // Batch INSERT 500 rows at a time
    let batch = [];
    for (const r of rows) {
      const empName = r.P2 ? (empNameMap[r.P2] || '') : '';
      const min = r.C5||0;
      const t = r.C1;
      batch.push([
        String(r.P1), r.C2?fmtDate(r.C2):'', r.P2?String(r.P2):'', empName,
        t===0?min:0, t===1?min:0, t===2?min:0, r.C6||''
      ]);
      if (batch.length >= 500) {
        await conn.query(
          'INSERT IGNORE INTO a3s_attendances(id,date,employee_id,employee_name,worked_minutes,leave_minutes,overtime_minutes,note) VALUES ?',
          [batch]
        );
        batch = [];
      }
    }
    if (batch.length) {
      await conn.query(
        'INSERT IGNORE INTO a3s_attendances(id,date,employee_id,employee_name,worked_minutes,leave_minutes,overtime_minutes,note) VALUES ?',
        [batch]
      );
    }
    console.log(`✅ 考勤: ${rows.length}`);
  }

  // ── Summary ──
  console.log('\n=== 迁移总结 ===');
  for (const t of tables) {
    const [r] = await conn.execute(`SELECT COUNT(*) as c FROM ${t}`);
    console.log(`  ${t}: ${r[0].c}`);
  }
  console.log(`\n⏱ ${((Date.now()-start)/1000).toFixed(1)}s`);
  await conn.end();
}

function fmtDate(d) {
  return d && d.length >= 8 ? `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}` : d;
}

const STATUS_MAP = { 1: '下单', 2: '未付清', 6: '结清', 9: '已关闭' };

main().catch(err => { console.error(err); process.exit(1); });

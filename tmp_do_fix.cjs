/**
 * 修复脚本：删损坏收入 + 批量补正确收入 + 修多余支出
 * 
 * 列顺序 (a3s_cash_entries):
 * id, type, amount, date, method, note, office, category, target_name, order_number, source_type, source_id, old_id
 */
const mysql = require('mysql2/promise');

function codeToMethod(code) {
  const methods = {0:'',1:'现金',2:'Zelle',3:'银行卡',4:'支票',5:'信用卡',6:'微信',7:'支付宝',8:'银行转账',9:'其他'};
  return methods[code] || '';
}

function fromYyyymmdd(s) {
  if (!s || s.length < 8) return s;
  return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
}

function fromCents(v) { return Math.round(Number(v) * 100) / 100 / 100; }
// Actually the amount in T1200.C5 is already in cents. For the copy we use C5/100.
// But the sync code does: const amount = fromCents(Number(t.C5));
// where fromCents = (v) => Number(v) / 100

async function main() {
  const conn = await mysql.createConnection({
    host: '43.166.250.145', port: 3306,
    user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410',
    supportBigNumbers: true,
    bigNumberStrings: true,
  });

  // === 第1步：删除损坏收入 ===
  console.log('=== 第1步：删除损坏收入 ===');
  // 先统计
  const [cnt] = await conn.execute(`
    SELECT COUNT(*) as cnt, ROUND(SUM(amount), 2) as total
    FROM a3s_cash_entries ce
    WHERE ce.type='收入' AND ce.source_type='t1200'
      AND BINARY ce.id NOT IN (
        SELECT CONCAT('inc-', CAST(t.P1 AS CHAR))
        FROM T1200 t WHERE t.Z1=1 AND t.Z2=1
      )
  `);
  console.log('待删:', cnt[0].cnt, '条, 总金额: $' + cnt[0].total);

  const [del] = await conn.execute(`
    DELETE FROM a3s_cash_entries
    WHERE type='收入' AND source_type='t1200'
      AND BINARY id NOT IN (
        SELECT CONCAT('inc-', CAST(t.P1 AS CHAR))
        FROM T1200 t WHERE t.Z1=1 AND t.Z2=1
      )
  `);
  console.log('已删:', del.affectedRows, '条');

  // === 第2步：查询已有正确条目 ===
  console.log('\n=== 第2步：查出已有正确条目 ===');
  const [existing] = await conn.execute(`
    SELECT source_id FROM a3s_cash_entries
    WHERE type='收入' AND source_type='t1200'
  `);
  const existingSet = new Set(existing.map(r => String(r.source_id)));
  console.log('已有:', existingSet.size, '条');

  // === 第3步：加载 T1000 类型映射 ===
  console.log('\n=== 第3步：加载类型映射 ===');
  const [incTypes] = await conn.execute(`SELECT P1, C4 FROM T1000 WHERE C5='收入' OR C5=''`);
  const incTypeMap = {};
  for (const r of incTypes) incTypeMap[String(r.P1)] = String(r.C4 || "");

  const [orderMap] = await conn.execute(`SELECT P1, C1 FROM T1111`);
  const orderNumMap = {};
  for (const r of orderMap) orderNumMap[String(r.P1)] = String(r.C1 || "");

  // === 第4步：补回缺失的正确收入 ===
  console.log('\n=== 第4步：补回缺失收入 ===');
  const [missing] = await conn.execute(`
    SELECT P1, P2, P3, P4, P5, C1, C2, C3, C4, C5, C6, C7
    FROM T1200 WHERE Z1=1 AND Z2=1
    ORDER BY C6, C1
  `);

  let inserted = 0, skipped = 0;
  let batch = [];
  let totalAmt = 0;

  for (const row of missing) {
    const p1 = String(row.P1);
    if (existingSet.has(p1)) { skipped++; continue; }

    const amount = Number(row.C5) / 100;
    totalAmt += amount;
    const isOffice = String(row.P3 || "") === "110" ? 1 : 0;
    const typeName = incTypeMap[String(row.P5 || "0")] || "";

    batch.push([
      `inc-${p1}`,        // id
      "收入",              // type
      amount,             // amount
      fromYyyymmdd(String(row.C6 || "")),  // date
      codeToMethod(Number(row.C4)),        // method
      String(row.C7 || row.C3 || ""),      // note
      isOffice,                            // office
      typeName,                            // category
      String(row.C2 || ""),                // target_name
      orderNumMap[String(row.P2)] || "",   // order_number
      "t1200",                             // source_type
      p1,                                  // source_id
      p1,                                  // old_id
    ]);
    inserted++;

    if (batch.length >= 500) {
      await doInsert(conn, batch);
      console.log('  已插:', inserted, '条, 总金额: $' + totalAmt.toFixed(2));
      batch = [];
    }
  }

  if (batch.length > 0) {
    await doInsert(conn, batch);
  }
  console.log('跳过:', skipped, '条, 新插入:', inserted, '条, 总额: $' + totalAmt.toFixed(2));

  // === 第5步：核实多余支出 ===
  console.log('\n=== 第5步：多余支出排查 ===');
  const [expOrphan] = await conn.execute(`
    SELECT e.id, e.old_id, e.amount, e.expense_date
    FROM a3s_expenses e
    LEFT JOIN T1200 t ON BINARY e.old_id = t.P1
    WHERE e.source_type = 't1200' AND t.P1 IS NULL
  `);
  if (expOrphan.length > 0) {
    console.log('T1200 无匹配支出（精度损坏孤儿）:', expOrphan.length, '条');
    for (const r of expOrphan) {
      console.log(`  id=${r.id} old_id=${r.old_id} $${Number(r.amount).toFixed(2)} ${r.expense_date}`);
    }
  } else {
    console.log('无孤立支出——所有支出都有 T1200 匹配');
  }

  // 查同 old_id 多条支出
  const [dupExp] = await conn.execute(`
    SELECT old_id, COUNT(*) as cnt, ROUND(SUM(amount), 2) as total
    FROM a3s_expenses
    WHERE source_type='t1200' AND old_id IS NOT NULL
    GROUP BY old_id HAVING cnt > 1
  `);
  if (dupExp.length > 0) {
    console.log('\n重复支出（同 old_id 多条）:', dupExp.length, '组');
    for (const r of dupExp) {
      console.log(`  old_id=${r.old_id} cnt=${r.cnt} total=$${r.total}`);
    }
  }

  // === 第6步：最终余额验证 ===
  console.log('\n=== 第6步：最终余额验证 ===');
  const [finalBalance] = await conn.execute(`
    SELECT 
      LEFT(ce.date, 7) as mon,
      ROUND(SUM(ce.amount), 2) as income,
      COALESCE(ROUND(SUM(e.amount), 2), 0) as expense
    FROM a3s_cash_entries ce
    LEFT JOIN a3s_expenses e ON LEFT(e.expense_date, 7) = LEFT(ce.date, 7)
    WHERE ce.type='收入'
    GROUP BY LEFT(ce.date, 7)
    ORDER BY mon
  `);

  let cum = 0;
  for (const r of finalBalance) {
    const net = Number(r.income) - Number(r.expense);
    cum += net;
    // This cross-join query is wrong for per-month. Use a better method.
  }

  // Better: check total sum
  const [totals] = await conn.execute(`
    SELECT
      ROUND((SELECT COALESCE(SUM(amount),0) FROM a3s_cash_entries WHERE type='收入'), 2) as total_income,
      ROUND((SELECT COALESCE(SUM(amount),0) FROM a3s_expenses), 2) as total_expense
  `);
  console.log('全局收入:', '$' + totals[0].total_income);
  console.log('全局支出:', '$' + totals[0].total_expense);
  console.log('净额:', '$' + (Number(totals[0].total_income) - Number(totals[0].total_expense)).toFixed(2));

  // 按月正确查询
  console.log('\n修复后月度收支:');
  const [months] = await conn.execute(`
    SELECT mon, income, expense FROM (
      SELECT LEFT(date, 7) as mon, ROUND(SUM(amount), 2) as income
      FROM a3s_cash_entries WHERE type='收入'
      GROUP BY LEFT(date, 7)
    ) i
    NATURAL JOIN (
      SELECT LEFT(expense_date, 7) as mon, ROUND(SUM(amount), 2) as expense
      FROM a3s_expenses
      GROUP BY LEFT(expense_date, 7)
    ) e
    ORDER BY mon
  `);
  let c2 = 0;
  for (const r of months) {
    if (r.mon < '2025-01') continue;
    const net = Number(r.income) - Number(r.expense);
    c2 += net;
    console.log(r.mon, '收入:', Number(r.income).toFixed(2), '支出:', Number(r.expense).toFixed(2), '净:', net.toFixed(2), '累计:', c2.toFixed(2));
  }

  await conn.end();
}

async function doInsert(conn, batch) {
  const ph = batch.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?)').join(',');
  const flat = batch.flat();
  await conn.execute(`
    INSERT IGNORE INTO a3s_cash_entries
      (id, type, amount, date, method, note, office,
       category, target_name, order_number, source_type, source_id, old_id)
    VALUES ${ph}
  `, flat);
}

main().catch(console.error);

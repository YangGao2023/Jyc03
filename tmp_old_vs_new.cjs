/**
 * 按旧系统 F060302 公式，直接从旧 T 表算余额
 * 对比新系统，找到差距
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

  // 旧系统 F060302: 收入(T1200 Z2=1) + 转入(T1210 Z2=1) - 支出(T1200 Z2=0) - 转出(T1210 Z2=0)
  console.log('=== 旧系统 F060302：直接从 T1200 + T1210 算 ===');
  
  // T1200 收入按月
  const [t1200Inc] = await conn.execute(`
    SELECT LEFT(CASE WHEN C6 != '' THEN C6 ELSE C1 END, 6) as mon6,
      ROUND(SUM(C5)/100, 2) as total
    FROM T1200 WHERE Z1=1 AND Z2=1
    GROUP BY mon6 ORDER BY mon6
  `);
  // T1200 支出按月
  const [t1200Exp] = await conn.execute(`
    SELECT LEFT(CASE WHEN C6 != '' THEN C6 ELSE C1 END, 6) as mon6,
      ROUND(SUM(C5)/100, 2) as total
    FROM T1200 WHERE Z1=1 AND Z2=0
    GROUP BY mon6 ORDER BY mon6
  `);
  // T1210 转入 (Z2=1)
  const [t1210In] = await conn.execute(`
    SELECT LEFT(CASE WHEN C3 != '' THEN C3 ELSE C3 END, 6) as mon6,
      ROUND(SUM(C2)/100, 2) as total
    FROM T1210 WHERE Z1=1 AND Z2=1
    GROUP BY mon6 ORDER BY mon6
  `);
  // T1210 转出 (Z2=0)
  const [t1210Out] = await conn.execute(`
    SELECT LEFT(CASE WHEN C3 != '' THEN C3 ELSE C3 END, 6) as mon6,
      ROUND(SUM(C2)/100, 2) as total
    FROM T1210 WHERE Z1=1 AND Z2=0
    GROUP BY mon6 ORDER BY mon6
  `);

  function toMap(arr) {
    const m = {};
    for (const r of arr) {
      const y = r.mon6.slice(0,4);
      const mo = r.mon6.slice(4,6);
      m[`${y}-${mo}`] = Number(r.total);
    }
    return m;
  }

  const incMap = toMap(t1200Inc);
  const expMap = toMap(t1200Exp);
  const trInMap = toMap(t1210In);
  const trOutMap = toMap(t1210Out);

  // All months
  const allMons = [...new Set([...Object.keys(incMap), ...Object.keys(expMap), ...Object.keys(trInMap), ...Object.keys(trOutMap)])].sort();
  
  console.log('月      收入(T1200)  转入(T1210)  支出(T1200)  转出(T1210)  本期净    累计');
  let cum = 0;
  for (const mon of allMons) {
    const inc = incMap[mon] || 0;
    const trIn = trInMap[mon] || 0;
    const exp = expMap[mon] || 0;
    const trOut = trOutMap[mon] || 0;
    const net = inc + trIn - exp - trOut;
    cum += net;
    if (mon >= '2025-01' && mon <= '2026-04')
      console.log(mon, inc.toFixed(2), trIn.toFixed(2), exp.toFixed(2), trOut.toFixed(2), net.toFixed(2), cum.toFixed(2));
  }
  console.log('\n旧系统 2026-04 底余额: $' + cum.toFixed(2));

  // 现在用同样公式算新系统的 a3s_cash_entries
  console.log('\n=== 新系统 cash_entries ===');
  const [newCum] = await conn.execute(`
    SELECT 
      LEFT(date, 7) as mon,
      SUM(CASE WHEN type='收入' THEN amount ELSE 0 END) as income,
      SUM(CASE WHEN type='转入' THEN amount ELSE 0 END) as transfer_in,
      SUM(CASE WHEN type='支出' THEN amount ELSE 0 END) as outlay,
      SUM(CASE WHEN type='转出' THEN amount ELSE 0 END) as transfer_out
    FROM a3s_cash_entries
    WHERE date IS NOT NULL AND date != ''
    GROUP BY LEFT(date, 7)
    ORDER BY mon
  `);
  let c2 = 0;
  console.log('月      收入        转入        支出        转出        本期净    累计');
  for (const r of newCum) {
    if (r.mon < '2025-01' || r.mon > '2026-04') continue;
    const net = Number(r.income) + Number(r.transfer_in) - Number(r.outlay) - Number(r.transfer_out);
    c2 += net;
    console.log(r.mon,
      Number(r.income).toFixed(2), Number(r.transfer_in).toFixed(2),
      Number(r.outlay).toFixed(2), Number(r.transfer_out).toFixed(2),
      net.toFixed(2), c2.toFixed(2));
  }
  console.log('\n新系统 2026-04 底余额: $' + c2.toFixed(2));
  console.log('差异: $' + (c2 - cum).toFixed(2));

  // 排查：新系统收入 vs 旧系统 T1200 收入的逐月对比
  console.log('\n=== 新系统 vs 旧系统 收入逐月对比 ===');
  for (const r of newCum) {
    if (r.mon < '2025-01' || r.mon > '2026-04') continue;
    const oldInc = incMap[r.mon] || 0;
    const diff = Number(r.income) - oldInc;
    if (Math.abs(diff) > 0.01)
      console.log(r.mon, '新:', Number(r.income).toFixed(2), '旧:', oldInc.toFixed(2), '差:', diff.toFixed(2));
  }

  // 排查：新系统 支出 vs 旧系统 T1200 支出逐月对比
  console.log('\n=== 新系统 vs 旧系统 支出逐月对比 ===');
  for (const r of newCum) {
    if (r.mon < '2025-01' || r.mon > '2026-04') continue;
    const oldExp = expMap[r.mon] || 0;
    // 新系统的支出只有 office 支出在 cash_entries，主支出在 a3s_expenses
    const diff = Number(r.outlay) - oldExp;
    if (Math.abs(diff) > 0.01)
      console.log(r.mon, '新:', Number(r.outlay).toFixed(2), '旧:', oldExp.toFixed(2), '差:', diff.toFixed(2));
  }

  // 对比 a3s_cash_entries 中 type='支出' vs T1200 支出
  const [expCum] = await conn.execute(`
    SELECT LEFT(expense_date, 7) as mon, ROUND(SUM(amount), 2) as total
    FROM a3s_expenses
    WHERE expense_date IS NOT NULL AND expense_date != ''
    GROUP BY LEFT(expense_date, 7)
    ORDER BY mon
  `);
  const expNewMap = {};
  for (const r of expCum) expNewMap[r.mon] = Number(r.total);
  console.log('\n=== a3s_expenses vs T1200 支出逐月 ===');
  for (const r of expCum) {
    if (r.mon < '2025-01' || r.mon > '2026-04') continue;
    const oldExp = expMap[r.mon] || 0;
    const diff = Number(r.total) - oldExp;
    if (Math.abs(diff) > 0.01)
      console.log(r.mon, '新exp:', Number(r.total).toFixed(2), '旧:', oldExp.toFixed(2), '差:', diff.toFixed(2));
  }

  await conn.end();
}
main().catch(console.error);

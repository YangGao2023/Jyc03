/**
 * 按旧系统 F060302 的真实公式计算：
 * P3='110'的 T1200 + 全部 T1210
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

  // F060302: T1200 P3='110' (office only)
  const [t1200Inc] = await conn.execute(`
    SELECT LEFT(CASE WHEN C6 != '' THEN C6 ELSE C1 END, 6) as mon6,
      ROUND(SUM(C5)/100, 2) as total
    FROM T1200 WHERE Z1=1 AND Z2=1 AND P3='110'
    GROUP BY mon6 ORDER BY mon6
  `);
  const [t1200Exp] = await conn.execute(`
    SELECT LEFT(CASE WHEN C6 != '' THEN C6 ELSE C1 END, 6) as mon6,
      ROUND(SUM(C5)/100, 2) as total
    FROM T1200 WHERE Z1=1 AND Z2=0 AND P3='110'
    GROUP BY mon6 ORDER BY mon6
  `);
  const [t1210In] = await conn.execute(`
    SELECT LEFT(CASE WHEN C3 != '' THEN C3 ELSE C3 END, 6) as mon6,
      ROUND(SUM(C2)/100, 2) as total
    FROM T1210 WHERE Z1=1 AND Z2=1
    GROUP BY mon6 ORDER BY mon6
  `);
  const [t1210Out] = await conn.execute(`
    SELECT LEFT(CASE WHEN C3 != '' THEN C3 ELSE C3 END, 6) as mon6,
      ROUND(SUM(C2)/100, 2) as total
    FROM T1210 WHERE Z1=1 AND Z2=0
    GROUP BY mon6 ORDER BY mon6
  `);

  function toMap(arr) {
    const m = {};
    for (const r of arr) {
      const mo = r.mon6.slice(4,6);
      m[`${r.mon6.slice(0,4)}-${mo}`] = Number(r.total);
    }
    return m;
  }

  const incMap = toMap(t1200Inc);
  const expMap = toMap(t1200Exp);
  const trInMap = toMap(t1210In);
  const trOutMap = toMap(t1210Out);
  const allMons = [...new Set([...Object.keys(incMap), ...Object.keys(expMap), ...Object.keys(trInMap), ...Object.keys(trOutMap)])].sort();

  console.log('=== 旧系统 F060302 公式 (P3=110 + T1210) ===');
  console.log('月      收入(P3=110)  转入(T1210)  支出(P3=110)  转出(T1210)  本期净    累计');
  let cum = 0;
  for (const mon of allMons) {
    const inc = incMap[mon] || 0;
    const trIn = trInMap[mon] || 0;
    const exp = expMap[mon] || 0;
    const trOut = trOutMap[mon] || 0;
    const net = inc + trIn - exp - trOut;
    cum += net;
    if (mon >= '2024-01')
      console.log(mon, inc.toFixed(2), trIn.toFixed(2), exp.toFixed(2), trOut.toFixed(2), net.toFixed(2), cum.toFixed(2));
  }
  console.log('\n2026-04 底累计: $' + cum.toFixed(2));

  // 新系统也同样公式：a3s_cash_entries
  console.log('\n=== 新系统 a3s_cash_entries (全量) ===');
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
  for (const r of newCum) {
    if (r.mon < '2024-01' || r.mon > '2026-04') continue;
    const net = Number(r.income) + Number(r.transfer_in) - Number(r.outlay) - Number(r.transfer_out);
    c2 += net;
  }
  console.log('新系统(含重复) 2026-04 底: $' + c2.toFixed(2));

  // 新系统去重：只保留 id = CONCAT('inc-', old_id) 的正确条目
  const [cleanCum] = await conn.execute(`
    SELECT 
      LEFT(date, 7) as mon,
      SUM(CASE WHEN type='收入' THEN amount ELSE 0 END) as income,
      SUM(CASE WHEN type='转入' THEN amount ELSE 0 END) as transfer_in,
      SUM(CASE WHEN type='支出' THEN amount ELSE 0 END) as outlay,
      SUM(CASE WHEN type='转出' THEN amount ELSE 0 END) as transfer_out
    FROM a3s_cash_entries
    WHERE date IS NOT NULL AND date != ''
      AND (source_type != 't1200' 
           OR id = CONCAT('inc-', old_id))
    GROUP BY LEFT(date, 7)
    ORDER BY mon
  `);
  let c3 = 0;
  for (const r of cleanCum) {
    if (r.mon < '2024-01' || r.mon > '2026-04') continue;
    const net = Number(r.income) + Number(r.transfer_in) - Number(r.outlay) - Number(r.transfer_out);
    c3 += net;
  }
  console.log('新系统(去重) 2026-04 底: $' + c3.toFixed(2));

  // 旧系统 2026-05 只看 P3='110'
  console.log('\n=== 2026-05 明细 ===');
  // Old system income for May 2026 P3='110'
  const [mayOffice] = await conn.execute(`
    SELECT 
      SUM(CASE WHEN Z2=1 THEN C5/100 ELSE 0 END) as income,
      SUM(CASE WHEN Z2=0 THEN C5/100 ELSE 0 END) as expense
    FROM T1200 WHERE Z1=1 AND P3='110' AND C6 LIKE '202605%'
  `);
  // Also check non-P3=110 T1200 for May
  const [mayNonOffice] = await conn.execute(`
    SELECT 
      SUM(CASE WHEN Z2=1 THEN C5/100 ELSE 0 END) as income,
      SUM(CASE WHEN Z2=0 THEN C5/100 ELSE 0 END) as expense
    FROM T1200 WHERE Z1=1 AND P3 != '110' AND C6 LIKE '202605%'
  `);
  // All expenses from a3s_expenses for May 2026
  const [mayExp] = await conn.execute(`
    SELECT ROUND(SUM(amount), 2) as total FROM a3s_expenses WHERE expense_date LIKE '2026-05%'
  `);
  console.log('旧系统T1200 P3=110 5月收入: $' + (Number(mayOffice[0]?.income || 0)).toFixed(2));
  console.log('旧系统T1200 P3=110 5月支出: $' + (Number(mayOffice[0]?.expense || 0)).toFixed(2));
  console.log('旧系统T1200 非110 5月收入: $' + (Number(mayNonOffice[0]?.income || 0)).toFixed(2));
  console.log('新系统 a3s_expenses 5月:    $' + (Number(mayExp[0]?.total || 0)).toFixed(2));

  await conn.end();
}
main().catch(console.error);

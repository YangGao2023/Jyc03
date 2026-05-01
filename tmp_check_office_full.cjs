const mysql = require('mysql2/promise');
(async()=>{
  const c = await mysql.createConnection({host:'43.166.250.145',port:3306,user:'dbo001',password:'BDQN123456',database:'db_zhty202410',supportBigNumbers:true,bigNumberStrings:true});

  // ── OLD SYSTEM F0603 SHOWTT() ──
  // T1200 办公室: P3=110
  //   sr = sum of C5 where Z2=1 (收入)
  //   zc = sum of C5 where Z2=0 (支出)
  const [r1] = await c.execute(
    "SELECT SUM(CASE WHEN Z2=1 THEN C5 ELSE 0 END)/100 as sr, SUM(CASE WHEN Z2=0 THEN C5 ELSE 0 END)/100 as zc FROM T1200 WHERE Z1=1 AND P3='110'"
  );
  console.log('=== 旧系统 F0603.ShowTT (P3=110) ===');
  console.log('收入合计:', Number(r1[0].sr).toFixed(2));
  console.log('支出合计:', Number(r1[0].zc).toFixed(2));
  console.log('结余:', (Number(r1[0].sr)-Number(r1[0].zc)).toFixed(2));

  // T1210 办公室转账: P3=110
  const [r2] = await c.execute(
    "SELECT SUM(CASE WHEN Z2=1 THEN C2 ELSE 0 END)/100 as I, SUM(CASE WHEN Z2=0 THEN C2 ELSE 0 END)/100 as O FROM T1210 WHERE Z1=1"
  );
  console.log('\n=== T1210 转账 ===');
  console.log('转入:', Number(r2[0].I).toFixed(2));
  console.log('转出:', Number(r2[0].O).toFixed(2));
  console.log('实际剩余(含转账):', (Number(r1[0].sr)+Number(r2[0].I)-Number(r1[0].zc)-Number(r2[0].O)).toFixed(2));

  // ── NEW SYSTEM: 办公室 tab 显示什么 ──
  // cash_entries 中 office=1 的部分
  const [r3] = await c.execute(`
    SELECT source_type, type, COUNT(*) as cnt, SUM(amount) as total
    FROM a3s_cash_entries WHERE office=1
    GROUP BY source_type, type ORDER BY source_type, type
  `);
  console.log('\n=== 新系统 cash_entries 中 office=1 的分组 ===');
  let newInc = 0, newExp = 0;
  for(const x of r3) {
    console.log(' ', x.source_type, x.type, ':', x.cnt, '条,', Number(x.total).toFixed(2));
    if (x.type === '收入' || x.type === '转入') newInc += Number(x.total);
    else newExp += Number(x.total);
  }
  console.log('  新系统 office 收入合计:', newInc.toFixed(2));
  console.log('  新系统 office 支出合计:', newExp.toFixed(2));
  console.log('  新系统 office 结余:', (newInc-newExp).toFixed(2));

  // 逐条检查每个 office=1 的 T1200 旧记录在 cash_entries 是否正确
  // 检查类型是否对 (收入/支出)
  const [r4] = await c.execute(`
    SELECT t.P3, t.Z2, c.source_type, c.type, c.office
    FROM T1200 t
    INNER JOIN a3s_cash_entries c ON c.old_id = t.P1
    WHERE t.Z1=1 AND t.P3='110'
      AND ((t.Z2=1 AND c.type != '收入') OR (t.Z2=0 AND c.type != '支出'))
    LIMIT 10
  `);
  console.log('\n=== T1200 P3=110 在 cash_entries 但类型不匹配 ===');
  for(const x of r4) console.log(' P3:',x.P3,'Z2:',x.Z2,'stype:',x.source_type,'type:',x.type,'office:',x.office);
  console.log('  总计:', r4.length, '条');

  await c.end();
})();

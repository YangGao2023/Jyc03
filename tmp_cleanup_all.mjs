import mysql from 'mysql2/promise';
const conn = await mysql.createConnection({host:'43.166.250.145',user:'dbo001',password:'BDQN123456',database:'db_zhty202410'});

// Materials already done from first partial run
// Now do appointments - just delete all old_app_ records
console.log('=== APPOINTMENTS ===');
const [appBefore] = await conn.execute('SELECT COUNT(*) as c FROM a3s_appointments');
const [appDel] = await conn.execute("DELETE FROM a3s_appointments WHERE id LIKE 'old_app_%'");
console.log(`Deleted ${appDel.affectedRows} old_app_ records`);
const [appAfter] = await conn.execute('SELECT COUNT(*) as c FROM a3s_appointments');
console.log(`Appointments: ${appBefore[0].c} -> ${appAfter[0].c}`);

console.log('\n=== CLIENTS ===');
const [clCols] = await conn.execute('SHOW COLUMNS FROM a3s_clients');
console.log('Columns:', clCols.map(c=>c.Field).join(', '));
const [clTotal] = await conn.execute('SELECT COUNT(*) as c FROM a3s_clients');
console.log(`Total: ${clTotal[0].c}`);
// duplicates by name
const [clByName] = await conn.execute(`
  SELECT name, COUNT(*) as cnt FROM a3s_clients GROUP BY name HAVING cnt > 1 ORDER BY cnt DESC LIMIT 20`);
console.log(`Duplicate names: ${clByName.length}`);
for (const r of clByName) console.log(`  "${r.name}" x${r.cnt}`);
// duplicates by old_id
const [clByOld] = await conn.execute(`
  SELECT old_id, COUNT(*) as cnt FROM a3s_clients WHERE old_id IS NOT NULL AND old_id > 0 GROUP BY old_id HAVING cnt > 1`);
console.log(`Duplicate old_id: ${clByOld.length} (top 10):`);
for (const r of clByOld.slice(0,10)) console.log(`  old_id=${r.old_id} x${r.cnt}`);

console.log('\n=== ORDERS ===');
const [ordCols] = await conn.execute('SHOW COLUMNS FROM a3s_orders');
console.log('Columns:', ordCols.map(c=>c.Field).join(', '));
const [ordTotal] = await conn.execute('SELECT COUNT(*) as c FROM a3s_orders');
console.log(`Total: ${ordTotal[0].c}`);
// duplicates by old_id
const [ordByOld] = await conn.execute(`
  SELECT old_id, COUNT(*) as cnt FROM a3s_orders WHERE old_id IS NOT NULL AND old_id > 0 GROUP BY old_id HAVING cnt > 1`);
console.log(`Duplicate old_id: ${ordByOld.length} (top 10):`);
for (const r of ordByOld.slice(0,10)) console.log(`  old_id=${r.old_id} x${r.cnt}`);

console.log('\n=== EMPLOYEES ===');
const [empTotal] = await conn.execute('SELECT COUNT(*) as c FROM a3s_employees');
const [empOld] = await conn.execute("SELECT COUNT(*) as c FROM a3s_employees WHERE id LIKE 'old_emp_%'");
const [empActive] = await conn.execute("SELECT COUNT(*) as c FROM a3s_employees WHERE id NOT LIKE 'old_emp_%'");
console.log(`Total: ${empTotal[0].c} (old: ${empOld[0].c}, good: ${empActive[0].c})`);

console.log('\n=== CASH ENTRIES ===');
const [cashTotal] = await conn.execute('SELECT COUNT(*) as c FROM a3s_cash_entries');
const [cashIncome] = await conn.execute("SELECT COUNT(*) as c FROM a3s_cash_entries WHERE type='收入'");
const [cashExpense] = await conn.execute("SELECT COUNT(*) as c FROM a3s_cash_entries WHERE type='支出'");
const [cashTransfer] = await conn.execute("SELECT COUNT(*) as c FROM a3s_cash_entries WHERE type='转出'");
console.log(`Total: ${cashTotal[0].c} (收入: ${cashIncome[0].c}, 支出: ${cashExpense[0].c}, 转出: ${cashTransfer[0].c})`);

console.log('\n=== EXPENSES ===');
const [expTotal] = await conn.execute('SELECT COUNT(*) as c FROM a3s_expenses');
console.log(`Total: ${expTotal[0].c}`);

await conn.end();
console.log('\n=== DONE ===');

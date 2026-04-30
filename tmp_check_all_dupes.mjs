import mysql from 'mysql2/promise';
const conn = await mysql.createConnection({host:'43.166.250.145',user:'dbo001',password:'BDQN123456',database:'db_zhty202410'});

// Check cash entries that would show as misc income: type='收入' AND no order_number AND no source_type
const [miscCandidates] = await conn.execute(`
  SELECT id, type, order_number, source_type, amount, date, method, category, note
  FROM a3s_cash_entries 
  WHERE type='收入' AND (order_number IS NULL OR order_number = '')
  ORDER BY date DESC LIMIT 20`);
console.log('\nCash entries type=收入 with no order_number:');
for (const r of miscCandidates) {
  console.log(`id=${r.id} amt=${r.amount} date=${r.date} source_type=${r.source_type} category=${r.category} note=${r.note}`);
}

const [cnt] = await conn.execute(`SELECT COUNT(*) as c FROM a3s_cash_entries WHERE type='收入' AND (order_number IS NULL OR order_number = '')`);
console.log(`\nTotal type=收入 with no order_number: ${cnt[0].c}`);

const [cntNoSource] = await conn.execute(`SELECT COUNT(*) as c FROM a3s_cash_entries WHERE type='收入' AND (order_number IS NULL OR order_number = '') AND (source_type IS NULL OR source_type = '')`);
console.log(`Total type=收入 with no order_number AND no source_type: ${cntNoSource[0].c}`);

// Check duplicate counts per table
// Materials: old_mat_ vs non-prefixed
const [matOld] = await conn.execute('SELECT COUNT(*) as c FROM a3s_materials WHERE id LIKE \'old_mat_%\'');
const [matGood] = await conn.execute('SELECT COUNT(*) as c FROM a3s_materials WHERE id NOT LIKE \'old_mat_%\'');
console.log(`\nMaterials: ${matOld[0].c} old-prefixed, ${matGood[0].c} non-prefixed`);

// Appointments: old_app_ vs non-prefixed
const [appOld] = await conn.execute('SELECT COUNT(*) as c FROM a3s_appointments WHERE id LIKE \'old_app_%\'');
const [appGood] = await conn.execute('SELECT COUNT(*) as c FROM a3s_appointments WHERE id NOT LIKE \'old_app_%\'');
console.log(`Appointments: ${appOld[0].c} old-prefixed, ${appGood[0].c} non-prefixed`);

// Check clients
const [clCols] = await conn.execute('SHOW COLUMNS FROM a3s_clients');
console.log('\na3s_clients columns:', clCols.map(r => r.Field).join(', '));
const [clTotal] = await conn.execute('SELECT COUNT(*) as c FROM a3s_clients');
console.log(`a3s_clients: ${clTotal[0].c} total`);

// Check orders
const [ordCols] = await conn.execute('SHOW COLUMNS FROM a3s_orders');
console.log('\na3s_orders columns:', ordCols.map(r => r.Field).join(', '));
const [oTotal] = await conn.execute('SELECT COUNT(*) as c FROM a3s_orders');
console.log(`a3s_orders: ${oTotal[0].c} total`);

await conn.end();

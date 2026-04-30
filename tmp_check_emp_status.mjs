import mysql from 'mysql2/promise';
const conn = await mysql.createConnection({host:'43.166.250.145',user:'dbo001',password:'BDQN123456',database:'db_zhty202410'});

console.log('=== Employee status breakdown ===');
const [empByStatus] = await conn.execute(`
  SELECT status, COUNT(*) as cnt FROM a3s_employees GROUP BY status
`);
for (const r of empByStatus) console.log(`  ${r.status}: ${r.cnt}`);

console.log('\n=== Active employees ===');
const [active] = await conn.execute(`
  SELECT code, name, hourly_rate, ethnicity FROM a3s_employees 
  WHERE status = '在职' OR status IS NULL OR status = '' 
  ORDER BY code
`);
console.log(`Active: ${active.length}`);
for (const r of active) console.log(`  ${r.code} ${r.name} $${r.hourly_rate}/hr ethnicity=${r.ethnicity}`);

console.log('\n=== Departed employees ===');
const [dept] = await conn.execute(`
  SELECT code, name, hourly_rate, ethnicity FROM a3s_employees 
  WHERE status = '离职'
  ORDER BY code
`);
console.log(`Departed: ${dept.length}`);

console.log('\n=== Old system employee count ===');
const [t1003] = await conn.execute('SELECT COUNT(*) as c FROM T1003');
console.log(`T1003 total: ${t1003[0].c}`);
const [t1003Active] = await conn.execute(`
  SELECT COUNT(*) as c FROM T1003 WHERE P8 IS NULL OR P8 = '' OR P8 = '在职' OR P8 = 'Active'
`);
console.log(`T1003 active (approx): ${t1003Active[0].c}`);

await conn.end();

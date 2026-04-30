import mysql from 'mysql2/promise';
const conn = await mysql.createConnection({host:'43.166.250.145',user:'dbo001',password:'BDQN123456',database:'db_zhty202410'});
const [rows] = await conn.execute('SELECT `code`, name, hourly_rate, id, ethnicity, phone, status FROM a3s_employees ORDER BY LENGTH(`code`), `code`');
console.log('Remaining employees:');
for (const r of rows) {
  console.log(`code=${r.code} name=${r.name} rate=${r.hourly_rate} ethnicity=${r.ethnicity} phone=${r.phone} status=${r.status}`);
}
const [cnt] = await conn.execute('SELECT COUNT(*) as c FROM a3s_employees');
console.log(`Total: ${cnt[0].c}`);
await conn.end();

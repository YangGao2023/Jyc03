import mysql from 'mysql2/promise';
const conn = await mysql.createConnection({host:'43.166.250.145',user:'dbo001',password:'BDQN123456',database:'db_zhty202410'});
const [r] = await conn.execute("DELETE FROM a3s_employees WHERE status='离职'");
console.log('Deleted ' + r.affectedRows + ' departed employees');
const [t] = await conn.execute('SELECT COUNT(*) as c FROM a3s_employees');
console.log('Remaining: ' + t[0].c);
await conn.end();

const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({
    host: '43.166.250.145', port: 3306, user: 'dbo001',
    password: 'BDQN123456', database: 'db_zhty202410',
    waitForConnections: true, connectionLimit: 2
  });
  
  // Check attendance creation dates
  const [creates] = await pool.execute("SELECT DATE(created_at) as d, COUNT(*) as cnt FROM a3s_attendances GROUP BY DATE(created_at) ORDER BY d");
  console.log('=== a3s_attendances created_at distribution ===');
  creates.forEach(c => console.log(c.d, c.cnt));
  
  // Check employees workdays
  console.log('\n=== a3s_employees workdays ===');
  const [emp] = await pool.execute('SELECT code, name, workdays, monthly_salary, hourly_rate FROM a3s_employees ORDER BY code');
  emp.forEach(e => console.log(e.code, e.name, 'workdays:', e.workdays, 'monthly:', e.monthly_salary, 'hourly:', e.hourly_rate));
  
  // Compare T1003.C6 with a3s_employees.workdays
  console.log('\n=== T1003 old system workdays ===');
  const [t1003] = await pool.execute('SELECT C1 as code, C2 as name, C6 as workdays, C13 as salary FROM T1003 WHERE Z1=1 ORDER BY C1');
  t1003.forEach(t => console.log(t.code, t.name, 'workdays:', t.workdays, 'salary:', t.salary));
  
  await pool.end();
})();

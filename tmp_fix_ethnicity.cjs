/**
 * 定向更新 a3s_employees.ethnicity
 * 名称以 A 开头 → 墨西哥，其余 → 华人
 */
const mysql = require('mysql2/promise');
(async () => {
  const conn = await mysql.createConnection({
    host: '43.166.250.145', port: 3306,
    user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410',
  });

  // Update Mexican employees (name starts with A)
  const [mex] = await conn.execute(
    `UPDATE a3s_employees SET ethnicity = '墨西哥' WHERE name LIKE 'A%' AND (ethnicity IS NULL OR ethnicity = '')`
  );
  console.log(`✅ 墨西哥: ${mex.affectedRows} 人`);

  // Update Chinese employees (name doesn't start with A)
  const [cn] = await conn.execute(
    `UPDATE a3s_employees SET ethnicity = '华人' WHERE name NOT LIKE 'A%' AND (ethnicity IS NULL OR ethnicity = '')`
  );
  console.log(`✅ 华人: ${cn.affectedRows} 人`);

  // Verify
  const [rows] = await conn.execute('SELECT code, name, ethnicity FROM a3s_employees ORDER BY code');
  rows.forEach(r => console.log(' ', r.code, r.name, '\u2192', r.ethnicity));

  await conn.end();
})();

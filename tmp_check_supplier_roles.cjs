const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({
    host: '43.166.250.145', port: 3306, user: 'dbo001',
    password: 'BDQN123456', database: 'db_zhty202410',
    waitForConnections: true, connectionLimit: 2
  });

  // Count suppliers (roles contains 供应商)
  const [sup] = await pool.execute(`
    SELECT id, name, roles FROM a3s_clients 
    WHERE roles LIKE '%供应商%'
    ORDER BY name
  `);
  console.log('=== 供应商列表 (' + sup.length + ' 个) ===');
  sup.forEach(r => console.log('  [id:', r.id, ']', r.name, 'roles:', r.roles));

  // Count dual-role (both client and supplier)
  const [dual] = await pool.execute(`
    SELECT COUNT(*) as c FROM a3s_clients 
    WHERE roles LIKE '%客户%' AND roles LIKE '%供应商%'
  `);
  console.log('\n既是客户又是供应商:', dual[0].c);

  // Also check: how many total clients have roles?
  const [roles] = await pool.execute(`
    SELECT roles, COUNT(*) as c FROM a3s_clients 
    WHERE roles IS NOT NULL AND roles != ''
    GROUP BY roles
    ORDER BY c DESC
  `);
  console.log('\n=== 角色分布 ===');
  roles.forEach(r => console.log('  roles:', r.roles, 'count:', r.c));

  // Clients without roles
  const [noRoles] = await pool.execute("SELECT COUNT(*) as c FROM a3s_clients WHERE roles IS NULL OR roles = ''");
  console.log('无角色:', noRoles[0].c);

  await pool.end();
})();

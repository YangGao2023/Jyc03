const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function main() {
  const conn = await mysql.createConnection({
    host: '43.166.250.145', port: 3306,
    user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410',
    multipleStatements: true,
  });

  try {
    const sql = fs.readFileSync(
      path.join(__dirname, 'create_mysql_tables.sql'),
      'utf8'
    );

    // Execute all statements at once
    await conn.query(sql);

    // Verify tables
    const [rows] = await conn.execute("SHOW TABLES LIKE 'a3s_%'");
    console.log(`📊 共创建 ${rows.length} 张 a3s_ 表:`);
    for (const r of rows) {
      console.log(`   - ${Object.values(r)[0]}`);
    }

  } finally { await conn.end(); }
}

main().catch(console.error);

// Check T1111 orders with install_info (C3) populated
const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: '43.166.250.145', port: 3306,
    user: 'dbo001', password: 'BDQN123456',
    database: 'db_zhty202410',
  });
  
  // Count how many T1111 orders have C3 (install_info)
  const [rows] = await conn.execute("SELECT COUNT(*) as total, SUM(CASE WHEN C3 != '' THEN 1 ELSE 0 END) as has_install FROM T1111 WHERE Z1 NOT IN (0)");
  console.log('T1111 orders with C3:', rows[0]);
  
  // Check T1114 appointments with phone/address from T1002
  const [appts] = await conn.execute("SELECT COUNT(*) as total, SUM(CASE WHEN C6 IS NOT NULL AND C6 != '' THEN 1 ELSE 0 END) as has_phone, SUM(CASE WHEN C4 IS NOT NULL AND C4 != '' THEN 1 ELSE 0 END) as has_addr FROM T1002 WHERE P1 IN (SELECT DISTINCT P4 FROM T1114 WHERE Z1=1)");
  console.log('Clients for appointments with phone:', appts[0]);
  
  // Count current a3s_appointments
  const [a3appts] = await conn.execute("SELECT COUNT(*) as total, SUM(CASE WHEN phone IS NOT NULL AND phone != '' THEN 1 ELSE 0 END) as has_phone, SUM(CASE WHEN address IS NOT NULL AND address != '' THEN 1 ELSE 0 END) as has_addr FROM a3s_appointments");
  console.log('a3s_appointments:', a3appts[0]);
  
  // Check cash_entries to see if sync added entries recently
  const [cashCount] = await conn.execute("SELECT COUNT(*) as total, SUM(CASE WHEN type='收入' THEN amount ELSE 0 END) as total_income, SUM(CASE WHEN type='支出' THEN amount ELSE 0 END) as total_exp FROM a3s_cash_entries");
  console.log('a3s_cash_entries:', cashCount[0]);
  
  // Check if hasNewerData would trigger a sync
  const [lastSync] = await conn.execute("SELECT * FROM a3s_sync_state ORDER BY id DESC LIMIT 1");
  console.log('lastSync:', lastSync[0]);
  
  await conn.end();
}
main().catch(console.error);

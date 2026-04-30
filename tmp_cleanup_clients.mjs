import mysql from 'mysql2/promise';
const conn = await mysql.createConnection({host:'43.166.250.145',user:'dbo001',password:'BDQN123456',database:'db_zhty202410'});

// Check cash_entries type values
const [cashTypes] = await conn.execute('SELECT DISTINCT type FROM a3s_cash_entries');
console.log('Cash entry types:', cashTypes.map(r=>r.type));

// Delete client duplicates: keep the one with higher id (more recently created)
const [clDupes] = await conn.execute(`
  SELECT old_id, MIN(id) as keep_id, MAX(id) as delete_id FROM a3s_clients 
  WHERE old_id IS NOT NULL AND old_id > 0 
  GROUP BY old_id HAVING COUNT(*) > 1
`);
console.log(`\nClient duplicate old_id groups: ${clDupes.length}`);

let deleted = 0;
for (const d of clDupes) {
  // Delete the duplicate (lower id for one record per old_id pair)
  const [result] = await conn.execute('DELETE FROM a3s_clients WHERE old_id = ? AND id = ?', [d.old_id, d.delete_id]);
  deleted += result.affectedRows;
}
console.log(`Deleted ${deleted} client duplicates`);

const [clAfter] = await conn.execute('SELECT COUNT(*) as c FROM a3s_clients');
console.log(`Clients: ${clAfter[0].c}`);

// Check employees - can we use a similar approach?
// The old_emp_ records have old_id - check if they duplicate non-prefixed records
const [empCheck] = await conn.execute(`
  SELECT e1.id as old_id_field, e1.code, e1.old_id, e1.name
  FROM a3s_employees e1 WHERE e1.id LIKE 'old_emp_%'
  LIMIT 10`);
console.log('\nSample old_emp_ records:');
for (const r of empCheck) console.log(`  id=${r.old_id_field} code=${r.code} old_id=${r.old_id} name=${r.name}`);

// Check if old_emp_ records have matching non-prefixed by old_id
const [empMatch] = await conn.execute(`
  SELECT COUNT(*) as c FROM a3s_employees e1
  WHERE e1.id LIKE 'old_emp_%'
  AND EXISTS (
    SELECT 1 FROM a3s_employees e2
    WHERE e2.id NOT LIKE 'old_emp_%'
    AND e2.old_id = e1.old_id
  )`);
console.log(`\nOld_emp_ records with matching non-prefixed by old_id: ${empMatch[0].c}`);

const [empNoMatch] = await conn.execute(`
  SELECT COUNT(*) as c FROM a3s_employees e1
  WHERE e1.id LIKE 'old_emp_%'
  AND NOT EXISTS (
    SELECT 1 FROM a3s_employees e2
    WHERE e2.id NOT LIKE 'old_emp_%'
    AND e2.old_id = e1.old_id
  )`);
console.log(`Old_emp_ records WITHOUT matching: ${empNoMatch[0].c}`);

if (empMatch[0].c > 0) {
  const [empDel] = await conn.execute(`
    DELETE e1 FROM a3s_employees e1
    WHERE e1.id LIKE 'old_emp_%'
    AND EXISTS (
      SELECT 1 FROM a3s_employees e2
      WHERE e2.id NOT LIKE 'old_emp_%'
      AND e2.old_id = e1.old_id
    )`);
  console.log(`Deleted ${empDel.affectedRows} old_emp_ duplicates`);
}

const [empAfter] = await conn.execute('SELECT COUNT(*) as c FROM a3s_employees');
const [empOldAfter] = await conn.execute("SELECT COUNT(*) as c FROM a3s_employees WHERE id LIKE 'old_emp_%'");
const [empGoodAfter] = await conn.execute("SELECT COUNT(*) as c FROM a3s_employees WHERE id NOT LIKE 'old_emp_%'");
console.log(`Employees: ${empAfter[0].c} total (old: ${empOldAfter[0].c}, good: ${empGoodAfter[0].c})`);

await conn.end();

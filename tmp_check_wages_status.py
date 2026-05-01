import mysql.connector
conn = mysql.connector.connect(host='43.166.250.145', user='dbo001', password='BDQN123456', database='db_zhty202410')
cursor = conn.cursor()

# Check old system salary tables
cursor.execute("SHOW TABLES LIKE '%工%'")
print('Tables with 工:')
for t in cursor: print(' ', t[0])

cursor.execute("SHOW TABLES LIKE '%WAGE%'")
print('\nTables with WAGE:')
for t in cursor: print(' ', t[0])

cursor.execute("SHOW TABLES LIKE '%0404%'")
print('\nTables with 0404:')
for t in cursor: print(' ', t[0])

# Check F0404
try:
    cursor.execute("SELECT COUNT(*) FROM db_zhty202410.F0404")
    cnt = cursor.fetchone()[0]
    print('\nF0404 count:', cnt)
    cursor.execute('SHOW COLUMNS FROM db_zhty202410.F0404')
    print('F0404 columns:')
    for c in cursor: print(' ', c[0], c[1])
except Exception as e:
    print('F0404 error:', e)

# Check new system payroll/wages
try:
    cursor.execute('SHOW COLUMNS FROM a3s_wages')
    print('\na3s_wages columns:')
    for c in cursor: print(' ', c[0], c[1])
    cursor.execute('SELECT COUNT(*) FROM a3s_wages')
    print('a3s_wages count:', cursor.fetchone()[0])
    cursor.execute('SELECT DISTINCT status FROM a3s_wages')
    print('a3s_wages status values:')
    for r in cursor: print(' ', r[0])
    cursor.execute('SELECT DISTINCT month FROM a3s_wages ORDER BY month DESC LIMIT 6')
    print('Last 6 months:')
    for r in cursor: print(' ', r[0])
except Exception as e:
    print('a3s_wages error:', e)

conn.close()

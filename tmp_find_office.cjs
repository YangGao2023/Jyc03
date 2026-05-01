const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');

// Find sections around the cash office display
// Look for the table that renders cash entries
const functions = [
  'office_transfers', 'showOfficeTransfers', 'officeTransfer',
  'OfficeTransfer', '资金', '转账', '转出',
  'a3s_cash_entries', '办公收支',
  'th', '现金', 'Zelle',
];

// Find the main cash rendering block
const idx = c.indexOf('办公室管理');

// From the cash section header, let me find the table headers
const cashStart = c.indexOf('sub === "cash"');
if (cashStart < 0) { console.log('cash not found'); process.exit(); }

// Get ~10000 chars after this to find the table
const section = c.substring(cashStart, cashStart + 15000);
// Find all <th> or <td> elements inside the cash section
const lines = section.split('\n');
let inCash = false;
let tableFound = false;
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  if (l.includes('sub === "cash"')) inCash = true;
  if (!inCash) continue;
  
  // Show table headers and data cells
  if (l.includes('<th') || l.includes('<td')) {
    console.log('L' + i + ': ' + l.trim());
  }
  
  // Also look for renderCell, cells, or data field references
  if (l.includes('Category') || l.includes('category') || l.includes('method') || l.includes('Method') || l.includes('target_name') || l.includes('对象')) {
    console.log('L' + i + ' [cat/obj]: ' + l.trim());
  }
  
  if (l.includes('table') && !tableFound) {
    console.log('L' + i + ' [table]: ' + l.trim());
    tableFound = true;
  }
}

// Also search for the actual data rendering - look for cash entries map
const entriesMap = section.indexOf('.map(');
if (entriesMap >= 0) {
  console.log('\n=== .map at local offset', entriesMap, '===');
  console.log(section.substring(entriesMap, entriesMap + 1000));
}

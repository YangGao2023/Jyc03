const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');
const cash = c.indexOf('sub === "cash"');
const section = c.substring(cash, cash + 40000);

// Get the full table (from <table to </table>)
const tableStart = section.indexOf('<table', 18200);
const tableEnd = section.indexOf('</table>', tableStart);
console.log('=== FULL TABLE ===');
console.log(section.substring(tableStart, tableEnd + 8));

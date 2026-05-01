const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');
// Find sub === "cash" rendering
const cash = c.indexOf('sub === "cash"');
const section = c.substring(cash, cash + 35000);

// Find where cash rows are rendered as a table
// Search for the table with cash-related rendering
const patterns = [
  'pagedCashEntries', 'cashRows.map', 'cashPage', 
  '{sub === "cash" &&', '<table', 
  ' 办公室余额', '办公收支',
];

// Find all <table> occurrences after sub === "cash"
let pos = 0;
let tableCount = 0;
while (true) {
  const t = section.indexOf('<table', pos);
  if (t < 0) break;
  pos = t + 1;
  tableCount++;
  // Get the context before to identify which section
  const ctx = section.substring(Math.max(0, t - 400), t);
  const after = section.substring(t, t + 200);
  console.log('=== Table', tableCount, 'at local offset', t, '===');
  console.log('Context (end of 100 chars):');
  if (ctx.length > 100) console.log('...' + ctx.substring(ctx.length - 100));
  else console.log(ctx);
  console.log('Table start:', after.substring(0, 150));
  console.log('');
}

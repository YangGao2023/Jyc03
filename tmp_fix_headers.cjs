const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');

// Change income table headers
// "类型" -> "类别" (only the header, not the type badge)
let modified = c.replace(
  '<th className="px-4 py-2 font-semibold text-slate-600">类型</th>',
  '<th className="px-4 py-2 font-semibold text-slate-600">类别</th>'
);

// "客户/对方" -> "对象"
modified = modified.replace(
  '<th className="px-4 py-2 font-semibold text-slate-600">客户/对方</th>',
  '<th className="px-4 py-2 font-semibold text-slate-600">对象</th>'
);

// Also check the cash table - it already has "类别" and "对方", keep those

// Check if the expense table needs similar change - let's find its headers
const expenseTableStart = modified.indexOf('sub === "expense"');
const expenseTableSection = modified.substring(expenseTableStart, expenseTableStart + 5000);
const expenseThs = expenseTableSection.match(/<th[^>]*>[^<]+<\/th>/g);
console.log('=== Expense table headers ===');
if (expenseThs) expenseThs.forEach(h => console.log(' ', h));

// Count how many replacements were made
const typeCount = (modified.match(/<th[^>]*>类型<\/th>/g) || []).length;
const clientCount = (modified.match(/<th[^>]*>客户\/对方<\/th>/g) || []).length;
console.log('\nRemaining "类型" headers:', typeCount);
console.log('Remaining "客户/对方" headers:', clientCount);

fs.writeFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', modified, 'utf-8');
console.log('Done!');

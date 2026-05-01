const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');
const bal = c.indexOf('办公室余额');
console.log('Office balance at global offset', bal);
console.log('Context:', JSON.stringify(c.substring(bal - 50, bal + 200)));
// Find the section this is in
const prevSub = c.lastIndexOf('sub === "', bal);
if (prevSub >= 0) console.log('In section:', c.substring(prevSub, prevSub + 30));

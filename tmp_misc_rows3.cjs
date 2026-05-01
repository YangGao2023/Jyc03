const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');
const idx = c.indexOf('miscIncomeRows');
// Get the const declaration
const defStart = c.lastIndexOf('const', idx);
const semi = c.indexOf(';', idx);
console.log('=== Full miscIncomeRows ===');
console.log(c.substring(defStart, semi + 1));

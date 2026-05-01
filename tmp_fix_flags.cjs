const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/lib/dual-write.ts', 'utf-8');
const idx = c.indexOf('export async function fixOfficeFlags');
const end = c.indexOf('\n}\n', idx + 500);
console.log(c.substring(idx, end + 3));

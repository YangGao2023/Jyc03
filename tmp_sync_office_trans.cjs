const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/lib/dual-write.ts', 'utf-8');

// Find syncOfficeTransfersFromOld
const idx = c.indexOf('syncOfficeTransfersFromOld');
const start = c.lastIndexOf('async function', idx);
const remaining = c.substring(start);
// Find the closing of this function
let depth = 0;
let i = 0;
let braceFound = false;
for (; i < remaining.length; i++) {
  if (remaining[i] === '{') { if (!braceFound) { braceFound = true; depth = 0; } depth++; }
  else if (remaining[i] === '}') { depth--; if (braceFound && depth === 0) break; }
}
console.log('=== syncOfficeTransfersFromOld ===');
console.log(remaining.substring(0, i + 1));

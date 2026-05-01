const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/lib/dual-write.ts', 'utf-8');

// Find syncAppointmentsFromOld
const idx = c.indexOf('syncAppointmentsFromOld');
const start = c.lastIndexOf('async function', idx);
// Find next async function
let remaining = c.substring(start);
const end = remaining.indexOf('\n}\n\n');
console.log(remaining.substring(0, end + 3));

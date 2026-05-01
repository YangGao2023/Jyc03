const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/lib/biz-store.ts', 'utf-8');

// Find mysqlRead function
const readfn = c.indexOf('async function mysqlRead');
console.log('mysqlRead:', c.substring(readfn, readfn + 3000));

// Also check normalizeSnapshot
const norm = c.indexOf('function normalizeSnapshot');
console.log('\nnormalizeSnapshot:', c.substring(norm, norm + 1500));

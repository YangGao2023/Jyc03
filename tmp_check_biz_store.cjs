const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/lib/biz-store.ts', 'utf-8');

// Find readBizStore and how it loads data
const readIdx = c.indexOf('export async function readBizStore');
console.log('=== readBizStore ===');
const fnEnd = readIdx + 5000;
console.log(c.substring(readIdx, Math.min(fnEnd, c.length)));

// Also check fixOfficeFlags
const fixIdx = c.indexOf('fixOfficeFlags');
if (fixIdx >= 0) {
  console.log('\n=== fixOfficeFlags ===');
  const fixEnd = fixIdx + 2000;
  console.log(c.substring(fixIdx, Math.min(fixEnd, c.length)));
}

const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');

// Find the InstallSection function start
const funcStart = c.indexOf('function InstallSection');
if (funcStart < 0) { console.log('Not found'); process.exit(); }

// Find the copy-related function
const copyFrom = c.indexOf('copy_from', funcStart);
const copyFrom2 = c.indexOf('copyFrom', funcStart);
if (copyFrom >= 0) {
  console.log('copy_from found:', c.substring(copyFrom - 100, copyFrom + 200));
}
if (copyFrom2 >= 0) {
  console.log('copyFrom found:', c.substring(copyFrom2 - 100, copyFrom2 + 200));
}

// Also search for "安装内容" or related copy UI
console.log('\n--- Searching for copy mode ---');
['copyMode', '"copy"', 'useState.*copy', '复制模式'].forEach(t => {
  const idx = c.indexOf(t, funcStart);
  if (idx >= 0) console.log(t, ':', c.substring(Math.max(0, idx - 80), idx + 100));
});

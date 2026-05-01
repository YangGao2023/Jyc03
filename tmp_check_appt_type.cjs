const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');

// Find InstallSection to understand copy
const installStart = c.indexOf('function InstallSection');
const installCode = c.substring(installStart, installStart + 5000);
console.log('=== InstallSection handleCopy ===');
const copyIdx = installCode.indexOf('function handleCopy(order');
if (copyIdx >= 0) {
  console.log(installCode.substring(copyIdx, copyIdx + 1000));
} else {
  console.log('handleCopy not found, trying handleCopyAll...');
  const allIdx = installCode.indexOf('function handleCopyAll');
  if (allIdx >= 0) console.log(installCode.substring(allIdx, allIdx + 500));
}

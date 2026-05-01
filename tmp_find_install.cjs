const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');

// Find the install section
const installSection = c.indexOf('function InstallSection');
if (installSection >= 0) {
  console.log('InstallSection found');
  // Find copy functionality
  const copy = c.indexOf('复制', installSection);
  if (copy >= 0) {
    console.log('Copy found at', copy, ':');
    console.log(c.substring(copy - 50, copy + 200));
  }
}

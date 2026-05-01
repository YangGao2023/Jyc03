const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');
const installStart = c.indexOf('function InstallSection');
const code = c.substring(installStart, installStart + 5000);
const fmt = code.indexOf('formatInstallItem');
if (fmt >= 0) {
  // Find the matching function
  const fnStart = code.lastIndexOf('function', fmt) < fmt - 20 ? code.lastIndexOf('const', fmt) : code.lastIndexOf('function', fmt);
  const fnStart2 = code.lastIndexOf('const', fmt);
  console.log('fnStart:', fnStart, 'fnStart2:', fnStart2, 'fmt:', fmt);
  const start = Math.max(0, Math.min(fnStart, fnStart2));
  console.log(code.substring(start, start + 400));
}

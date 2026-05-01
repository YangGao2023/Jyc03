const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');
const installStart = c.indexOf('function InstallSection');
const code = c.substring(installStart, installStart + 5000);
const fmt = code.indexOf('function formatInstallItem');
if (fmt >= 0) {
  const end = code.indexOf('\n  }\n', fmt);
  console.log('formatInstallItem:', code.substring(fmt, end + 5));
}

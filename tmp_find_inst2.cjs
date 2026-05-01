const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');

// Find the install section rendering
const keys = ['"install"', "'install'", 'install'];
for (const k of keys) {
  const i = c.indexOf(k);
  if (i >= 0) {
    console.log('Found at', i, ':', c.substring(Math.max(0, i - 20), Math.min(c.length, i + 150)));
  }
}

// Find where section === install is handled
const i = c.indexOf('section ===');
while (i >= 0) {
  const end = c.indexOf('\n', i + 10);
  console.log(c.substring(i, Math.min(c.length, end)));
  const next = c.indexOf('section ===', end);
  if (next < 0) break;
  i = next;
}

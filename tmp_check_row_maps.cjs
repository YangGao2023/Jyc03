const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/lib/biz-store.ts', 'utf-8');

// Find rowToAppointment
['rowToAppointment', 'rowToOrder'].forEach(fn => {
  const idx = c.indexOf(fn);
  if (idx >= 0) {
    const fnStart = c.lastIndexOf('function', idx);
    const fnEnd = c.indexOf('\n}\n', fnStart);
    console.log(fn + ':', c.substring(fnStart, fnEnd + 3));
    console.log('---');
  }
});

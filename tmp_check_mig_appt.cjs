const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/scripts/migrate_old_to_new.cjs', 'utf-8');

// Find T1114 section
const idx = c.indexOf('T1114');
if (idx >= 0) {
  const start = c.lastIndexOf('\n//', idx);
  const end = idx + 600;
  console.log(c.substring(start, end));
}

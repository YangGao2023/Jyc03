const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');

// Find the finance section with cash sub
const idx = c.indexOf('sub === "cash"');
if (idx < 0) {
  console.log('Not found: sub ==="cash"');
  // Try broader search
  const idx2 = c.indexOf('办公室管理');
  if (idx2 >= 0) console.log('办公室管理 at', idx2);
} else {
  // Show what comes before and after
  console.log('=== BEFORE (200 chars) ===');
  console.log(c.substring(Math.max(0, idx - 200), idx));
  console.log('\n=== AFTER (200 chars) ===');
  console.log(c.substring(idx, idx + 200));
}

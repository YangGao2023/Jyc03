const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');

// Find the measurement appointments section
const apptIdx = c.indexOf('量尺寸');
if (apptIdx < 0) {
  console.log('量尺寸 not found in file');
  // Search for 测量 or appointment keywords
  ['MeasurementAppointment', 'appointment', '量'].forEach(t => {
    let pos = 0;
    let count = 0;
    while ((pos = c.indexOf(t, pos + 1)) >= 0 && count < 5) {
      console.log(t, 'at', pos, ':', c.substring(Math.max(0, pos - 30), pos + 40));
      count++;
    }
  });
  process.exit();
}
console.log('量尺寸 found at', apptIdx);
console.log(c.substring(apptIdx, apptIdx + 300));

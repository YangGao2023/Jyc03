const fs = require('fs');
const c = fs.readFileSync('C:/Users/xgtou/.openclaw-A3/workspace/ai-control-panel/src/app/dashboard/biz/page.tsx', 'utf-8');

// Find the appointment section - look for AppointmentSection or similar function
const apptSection = c.indexOf('function AppointmentsSection');
if (apptSection >= 0) {
  console.log('AppointmentsSection found');
  // Find table/rendering code
  const render = c.indexOf('<table', apptSection);
  if (render >= 0) {
    const tableEnd = c.indexOf('</table>', render);
    console.log('Table:', c.substring(render, tableEnd + 8).substring(0, 2000));
  }
} else {
  // Search for measurement appointment rendering
  const findings = [];
  ['appointment', 'Appointment', '量', '预约'].forEach(t => {
    let pos = 0;
    while ((pos = c.indexOf(t, pos + 1)) >= 0) {
      const ctx = c.substring(Math.max(0, pos - 60), pos + 60);
      if (ctx.includes('phone') || ctx.includes('address') || ctx.includes('电话') || ctx.includes('地址')) {
        findings.push({ pos, ctx: ctx.substring(0, 120) });
      }
    }
  });
  findings.forEach(f => console.log(f.pos, ':', f.ctx));
}

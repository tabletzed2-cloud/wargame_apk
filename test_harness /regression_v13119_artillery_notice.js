const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
const start = src.indexOf('function executeArtilleryStrikeOrder(order)');
const end = src.indexOf('\nfunction ', start + 10);
const fn = src.slice(start, end);
for (const token of ['campaign.shellNotices.push({', 'artilleryShooter.name', 'victims: noticeVictims', "kind: 'direct'", 'renderShellNotices()']) {
  if (!fn.includes(token)) throw new Error(`artillery shell notification integration missing: ${token}`);
}
if (!fn.includes('killed: v.killed')) throw new Error('artillery casualty count must be included');
console.log('v13.119 artillery strike persistent loss notice: PASS');

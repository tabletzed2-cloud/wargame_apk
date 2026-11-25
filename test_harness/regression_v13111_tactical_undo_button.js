const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'js', 'map_actions.js'), 'utf8');
const start = src.indexOf('function mapUndoButtonMarkup()');
const end = src.indexOf('\nfunction ', start + 10);
const fn = src.slice(start, end);
if (start < 0 || !fn.includes('Отменить последнее действие') || !fn.includes('disabled') || !fn.includes('undoLastTacticalAction()')) throw new Error('undo button must remain visible and reflect availability');
if (!src.includes("panel.innerHTML = '<span style=\"color:#aaa;\">👆 Кликните по своему отряду на карте — появятся кнопки действий (стрельба, подавление, гранаты, рукопашная) и подсветка движения.</span>' + mapUndoButtonMarkup();")) throw new Error('undo action must also be available without selecting a squad');
console.log('v13.111 tactical undo button persistent/disabled state: PASS');

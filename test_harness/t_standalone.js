const fs = require('fs');
const { sliceFunction, HTML } = require('./extract');
const { createSandbox, freshAppData } = require('./sandbox');

const FNS = ['renderTemplateSelection', 'addSelectedTemplatesToBattle', 'renderSquadSelector',
  'updateUI', 'resetAP', 'selectSquad', 'ensureAP', 'renderFactionInfo', 'renderCardSelectionForBattle'];
fs.writeFileSync('/tmp/wg_part.js', FNS.map(f => sliceFunction(HTML, f)).join('\n\n'));

const ad = freshAppData();
const s = createSandbox(ad);
s.sandbox.appData.templates = s.evalCtx('SQUAD_TEMPLATES');
s.sandbox.assignUniqueCrewKeys = (sq) => (sq.fighters || []).forEach((f, i) => { f.crewKey = f.crewKey || ('k' + i); });
s.sandbox.getAP = () => 4;
s.sandbox.renderModifiersList = () => {};
s.sandbox.renderVehicleStatus = () => {};
s.sandbox.updateEmbarkPanel = () => {};

s.run('var currentSquad = null, currentSquadIndex = -1, morale = 0, actionPoints = [], currentTurn = 1, ' +
      'hardMode = { enabled: false }, opMoveAnim = { playing: false }, detectionOptions = { auto: false };');

s.run('selectedFaction = "BeVe"; selectedSubFaction = "belgian";');
s.run('resetAP(); renderTemplateSelection();');
const html = s.elements.templateSelection.innerHTML;
console.log('=== список шаблонов:', (html.match(/checkbox/g) || []).length);
const idxs = [...html.matchAll(/value="(\d+)"/g)].slice(0, 2).map(m => m[1]);

s.run(`
  document.querySelectorAll = (sel) => (sel === '.template-check:checked' ? ${JSON.stringify(idxs)}.map(i => ({ value: String(i) })) : []);
  try { addSelectedTemplatesToBattle(); } catch (e) { console.log('EXC add:', e.message); }
  try { renderSquadSelector(); } catch (e) { console.log('EXC roster:', e.message); }
  try { selectSquad(0); } catch (e) { console.log('EXC selectSquad:', e.message); }
`);
console.log('=== squads:', s.evalCtx('appData.squads.map(x => x.name + "[" + x.faction + "]")'));
console.log('=== activeSquadArea:', (s.elements.activeSquadArea || {}).innerHTML ? s.elements.activeSquadArea.innerHTML.slice(0, 250) : 'EMPTY');
console.log('=== alerts:', JSON.stringify(s.alerts));

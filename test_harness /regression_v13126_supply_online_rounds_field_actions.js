const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const hexmaps = fs.readFileSync(path.join(root, 'js', 'hexmaps.js'), 'utf8');
const supplyStart = hexmaps.indexOf('function syncSupplyPointsOnGrid(');
const supplyEnd = hexmaps.indexOf('\nfunction ', supplyStart + 10);
const supplyFn = hexmaps.slice(supplyStart, supplyEnd);
const supplyCtx = {
  SUPPLY_POINT_MARKER: 'ammoPoint',
  supplyPointStateKey: side => side === 'enemy' ? 'autoSupplyKeysEnemy' : 'autoSupplyKeysPlayer',
  supplyPointOriginStateKey: side => side === 'enemy' ? 'supplyPointOriginsEnemy' : 'supplyPointOriginsPlayer',
  isPlatoonHQBattleSquad: s => /Штаб взвода/i.test(s.name || '') && !/снабж/i.test(s.name || ''),
  log: () => {}
};
vm.runInNewContext(supplyFn, supplyCtx);
const map = { grid: { '2,3': { squadIds:[0], enemySquadIds:[], markers:[] }, '5,5': { squadIds:[], enemySquadIds:[], markers:[] } } };
const squad = { name:'Стрелковое отделение', opUnitName:'Взвод Альфа', fighters:[{hp:1}] };
supplyCtx.syncSupplyPointsOnGrid(map, [squad], 'squadIds', 'player');
if (!map.grid['2,3'].markers.includes('ammoPoint')) throw new Error('platoon with no HQ must have supply at its first squad hex');
map.grid['2,3'].squadIds = [];
map.grid['5,5'].squadIds = [0];
supplyCtx.syncSupplyPointsOnGrid(map, [squad], 'squadIds', 'player');
if (!map.grid['2,3'].markers.includes('ammoPoint') || map.grid['5,5'].markers.includes('ammoPoint')) throw new Error('fallback supply origin must remain fixed after squad movement');

const online = fs.readFileSync(path.join(root, 'js', 'online_battles.js'), 'utf8');
const phaseStart = online.indexOf('function onlineAcceptBattlePhase(');
const phaseEnd = online.indexOf('\nfunction ', phaseStart + 10);
const phaseFn = online.slice(phaseStart, phaseEnd);
let clockTicks = 0, pauses = 0, publishedPauses = 0;
const battle = { id:1, activeSide:'enemy', currentTurn:1, phaseRevision:0, tacticalPhasesCompleted:0,
  placement:{attackerSide:'enemy'}, playerSquads:[], enemySquads:[] };
const phaseCtx = {
  Number, Math, Array, JSON,
  onlineBattleIsLive: () => false,
  clearTacticalSuppressionForSide: () => {},
  registerCompletedTacticalPhase: b => (b.tacticalPhasesCompleted = (b.tacticalPhasesCompleted || 0) + 1),
  tacticalPhasesPerRound: () => 2,
  advanceTacticalClock: () => { clockTicks++; },
  getMaxAP: () => 4,
  RPTX_PHASES_PER_WINDOW: () => 10,
  pauseCampaignTacticalBattlesForOrders: b => { pauses++; b.pausedForOrders = true; },
  onlinePublishTacticalBattlePause: () => { publishedPauses++; },
  showTacticalOrdersPauseNotice: () => {},
  saveData: () => {},
  appData: { campaign:{ online:true, activeBattles:[battle] }, squads:[] }
};
vm.runInNewContext(`${phaseFn}; this.acceptPhase = onlineAcceptBattlePhase;`, phaseCtx);
for (let revision=1; revision<=10; revision++) {
  battle.activeSide = 'enemy';
  if (!phaseCtx.acceptPhase(battle, { phaseRevision:revision, activeSide:'defender' }, false)) throw new Error(`online phase ${revision} was rejected`);
}
if (battle.tacticalPhasesCompleted !== 10 || clockTicks !== 5) throw new Error(`online round clock mismatch: phases=${battle.tacticalPhasesCompleted}, ticks=${clockTicks}`);
if (pauses !== 1 || publishedPauses !== 1 || !battle.pausedForOrders) throw new Error('online tactical 5-round window must pause and publish its order barrier');

const mapActions = fs.readFileSync(path.join(root, 'js', 'map_actions.js'), 'utf8');
if (!mapActions.includes("['shootingPanel', 'movementPanel', 'specialPanel', 'fieldVehiclePanel']")) throw new Error('battlefield action panel must include dynamic card and vehicle buttons');
if (!mapActions.includes('Дополнительные действия и способности карт')) throw new Error('card-action section missing from battlefield menu');
console.log('v13.126 supply fallback, online rounds, and battlefield card actions: PASS');

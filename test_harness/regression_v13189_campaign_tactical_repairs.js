'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { sliceFunction } = require('./extract');
const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const placement = fs.readFileSync(path.join(root, 'js/placement.js'), 'utf8');
const opAI = fs.readFileSync(path.join(root, 'js/operational_ai.js'), 'utf8');

function loadFunction(source, name, context) {
  vm.runInContext(sliceFunction(source, name), context);
}

// Enemy AI is explicitly the attacker when it enters an occupied operational hex.
{
  const ctx = { PLACEMENT_DIRS: ['E','NE','NW','W','SW','SE'] };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js/tactical_rules.js'), 'utf8'), ctx);
  loadFunction(placement, 'resolveBattleEntry', ctx);
  const entry = vm.runInContext("resolveBattleEntry([{name:'defender'}],[{name:'attacker'}],'4,4',{entry:{attackerSide:'enemy',entryDir:'NE',source:'offline-ai'}})", ctx);
  assert.deepEqual(JSON.parse(JSON.stringify(entry)), { attackerSide: 'enemy', entryDir: 'NE', source: 'offline-ai' });
}
{
  const ctx = {
    appData: { campaign: { enemyOpUnits: [], opUnits: [] } },
    opDirectionBetween: (c1,r1,c2,r2) => c2 < c1 ? 'W' : 'E',
    placementFallbackDir: () => 'SW'
  };
  vm.createContext(ctx);
  loadFunction(opAI, 'operationalAIBattleEntry', ctx);
  const out = vm.runInContext("operationalAIBattleEntry({col:5,row:4,prevCol:6,prevRow:4,movedThisTurn:true})", ctx);
  assert.deepEqual(JSON.parse(JSON.stringify(out)), { entry: { attackerSide: 'enemy', entryDir: 'E', source: 'offline-ai' } });
}

// AI deployment mutates the battle snapshot; assert that every live combatant gets a map hex.
{
  const grid = {};
  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
    grid[`${col},${row}`] = { type: 'grass', level: 0, markers: [], squadIds: [], enemySquadIds: [] };
  }
  const enemySquads = [
    { name: 'AI infantry', faction: 'A.I.R.F.', fighters: [{ hp: 3 }], detected: false },
    { name: 'AI gun team', faction: 'A.I.R.F.', fighters: [{ hp: 3 }], detected: false }
  ];
  const battle = { id: 9, hexKey: '4,4', placement: { attackerSide: 'enemy', entryDir: 'W', phase: 'placing' },
    tacticalMap: { mapSize: 8, grid, enemySquads }, enemySquads: structuredClone(enemySquads) };
  const ctx = {
    appData: { campaign: { active: true, online: false, enemyOpUnits: [], opUnits: [] } },
    isOfflineCampaignAIEnabled: () => true,
    placementSideAllowed: () => true,
    placementZoneKeys: () => ['0,0'],
    tacticalSquadIsFixedFortification: () => false,
    isArmoredTacticalSquad: () => false,
    getOpHexDistance: (a,b,c,d) => Math.max(Math.abs(a-c),Math.abs(b-d)),
    getFactionCrewWeapons: () => [],
    log: () => {}, console
  };
  vm.createContext(ctx);
  loadFunction(opAI, 'operationalAIPlaceEnemyBattleSquads', ctx);
  ctx.battle = battle;
  const placed = vm.runInContext('operationalAIPlaceEnemyBattleSquads(battle)', ctx);
  assert.equal(placed, 2);
  assert.ok(enemySquads.every((squad, i) => squad.hexPos &&
    Object.values(grid).some(cell => cell.enemySquadIds.includes(i))));
  assert.equal(battle.placement.enemyReady, true);
  const liveMap = { grid: {}, enemySquads: [] };
  const syncContext = { deepCloneGameData: value => structuredClone(value) };
  vm.createContext(syncContext);
  loadFunction(index, 'syncOfflineAIDeploymentToLiveMap', syncContext);
  syncContext.liveMap = liveMap; syncContext.deployedBattle = battle;
  assert.equal(vm.runInContext('syncOfflineAIDeploymentToLiveMap(liveMap, deployedBattle)', syncContext), true);
  assert.ok(Object.values(liveMap.grid).some(cell => cell.enemySquadIds.length));
  assert.equal(liveMap.enemySquads.length, enemySquads.length);
}

// Offline combat participants become visible when deployment finishes; embarked passengers stay hidden.
{
  const battle = { id: 5, placement: { phase: 'done', ambush: false },
    playerSquads: [{ name: 'player', detected: false }],
    enemySquads: [{ name: 'enemy', detected: false }, { name: 'passenger', hidden: true, embarkedSquadIndex: 0 }],
    tacticalMap: { enemySquads: [{ name: 'enemy', detected: false }] } };
  const ctx = { appData: { campaign: { online: false }, currentBattleId: 5,
    squads: [{ name: 'player-live', detected: false }], map: { enemySquads: [{ name: 'enemy-live', detected: false }] } } };
  vm.createContext(ctx);
  loadFunction(placement, 'placementRevealOfflineCombatants', ctx);
  assert.equal(vm.runInContext('placementRevealOfflineCombatants(battle)', Object.assign(ctx, { battle })), true);
  assert.equal(battle.enemySquads[0].detected, true);
  assert.equal(battle.enemySquads[1].hidden, true);
  assert.equal(ctx.appData.map.enemySquads[0].detected, true);

  const scheduling = { appData: { campaign: { online: false } },
    window: { tacticalEnemyAI: { schedulePhase: () => { scheduling.scheduled = (scheduling.scheduled || 0) + 1; return true; } } } };
  vm.createContext(scheduling);
  loadFunction(placement, 'placementScheduleOfflineAI', scheduling);
  scheduling.battle = { cardsChosen: true, placement: { phase: 'done', attackerSide: 'enemy' } };
  assert.equal(vm.runInContext('placementScheduleOfflineAI(battle)', scheduling), true);
  assert.equal(scheduling.scheduled, 1, 'the AI attacker receives its opening tactical phase after player placement/cards');
  scheduling.appData.campaign.online = true;
  assert.equal(vm.runInContext('placementScheduleOfflineAI(battle)', scheduling), false, 'online tactical flow is unchanged');
}

// An assault command pursues enemies in its objective area, not the nearest unrelated contact.
{
  const logs = [];
  const unit = { name: 'assault platoon', col: 5, row: 5, ap: 2 };
  const nearWrong = { name: 'wrong flank', col: 5, row: 4, detected: true };
  const objectiveTarget = { name: 'objective defender', col: 7, row: 5, detected: true };
  const ctx = {
    appData: { campaign: { online: false, enemyOpUnits: [nearWrong, objectiveTarget] } },
    getOpHexDistance: (a,b,c,d) => Math.max(Math.abs(a-c), Math.abs(b-d)),
    opEnemyVisibleToPlayer: enemy => enemy.detected,
    isArmoredUnit: () => false,
    getRouteToTarget: () => [],
    log: text => logs.push(String(text)),
    startTacticalBattle: () => { throw new Error('should not start a battle during this targeting test'); },
    document: { getElementById: () => ({ checked: false }) }
  };
  vm.createContext(ctx);
  loadFunction(index, 'checkEnemyEncounter', ctx);
  assert.equal(vm.runInContext("checkEnemyEncounter(unit,'assault',{targetHex:'7,5'})", Object.assign(ctx, { unit })), true);
  assert.ok(logs.some(text => text.includes('objective defender')));
  assert.ok(!logs.some(text => text.includes('wrong flank')));
}

// A cut player's cable is repaired only after an explicit order; a dangerous approach kills the pair once.
{
  function repairContext(enemyAtStep) {
    const team = { fighters: [{ hp: 3 }, { hp: 3 }] };
    const sender = { name: 'Battalion HQ', col: 0, row: 0, squads: [] };
    const line = { id: 'line-1', fromUnitId: 0, toUnitId: 1, intact: false,
      cutHex: '2,0', path: ['0,0','1,0','2,0'] };
    const logs = [];
    const ctx = {
      appData: { campaign: { currentTurn: 2, opUnits: [sender, { name: 'recipient', col: 2, row: 0 }],
        enemyOpUnits: enemyAtStep ? [{ name: 'Enemy patrol', col: 2, row: 0 }] : [] } },
      hardMode: { phoneLines: [line], phoneLineRepairTasks: [], signalPlatoon: { phones: { assigned: [
        { id: 'assignment-1', unitId: 0, signalTeamId: 'team-1', status: 'active' }
      ] } } },
      ensureSignalPlatoonState: () => {}, phoneLinePathHexKeys: item => item.path,
      isArmoredCommunicationUnit: () => false, signalTeamAlive: () => true,
      getSignalTeam: () => team, signalMergedFighters: () => [], signalInfantryMover: () => ({}),
      getOpMoveCost: () => 1, log: text => logs.push(String(text)), saveData: () => {},
      renderCommunicationPanel: () => {}, redrawOperationalMap: () => {}, alert: () => {},
      Date, Number, Math
    };
    vm.createContext(ctx);
    loadFunction(index, 'requestPhoneLineRepair', ctx);
    loadFunction(index, 'losePhoneLineRepairTeam', ctx);
    loadFunction(index, 'processPhoneLineRepairTasks', ctx);
    return { ctx, line, team, logs };
  }
  const safe = repairContext(false);
  assert.equal(vm.runInContext('requestPhoneLineRepair(0)', safe.ctx), true);
  assert.equal(safe.ctx.hardMode.phoneLineRepairTasks.length, 1);
  assert.equal(safe.line.intact, false, 'no automatic repair on detection of the cut');
  vm.runInContext('processPhoneLineRepairTasks()', safe.ctx);
  assert.equal(safe.line.intact, true, 'explicitly dispatched signalmen restore the line on arrival');

  const risky = repairContext(true);
  assert.equal(vm.runInContext('requestPhoneLineRepair(0)', risky.ctx), true);
  vm.runInContext('processPhoneLineRepairTasks()', risky.ctx);
  const deathMessages = risky.logs.filter(text => text.includes('погибли')).length;
  vm.runInContext('processPhoneLineRepairTasks()', risky.ctx);
  assert.equal(risky.line.intact, false);
  assert.equal(risky.ctx.hardMode.phoneLineRepairTasks.length, 0);
  assert.equal(risky.team.fighters.every(f => f.hp === 0), true);
  assert.equal(risky.logs.filter(text => text.includes('погибли')).length, deathMessages,
    'a lost team does not create repeated death messages on later turn processing');
}

console.log('PASS: AI attacker role/deployment, objective-focused assault, and explicit phone-line repair with one-time casualties.');

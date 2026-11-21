// Offline tactical opponent AI. Uses the shared tactical target evaluator,
// action authorization, AP accounting and existing combat routines.
(function (root) {
  'use strict';

  const MAX_ACTIONS_PER_SQUAD = 3;
  const AI_ACTIONS = ['smallArms', 'ordnance', 'vehicle', 'sniper', 'suppressiveFire', 'dotmg'];
  let phaseRunning = false;
  let phaseToken = 0;

  function liveSquads(side) {
    return side === 'enemy'
      ? ((appData && appData.map && appData.map.enemySquads) || [])
      : ((appData && appData.squads) || []);
  }
  function alive(squad) {
    return !!(squad && !squad.isDestroyed && !squad.isSurrendered && !squad.isRetreated &&
      !squad.isRouting && squad.status !== 'destroyed' && squad.status !== 'surrendered' && squad.status !== 'retreated' &&
      (squad.fighters || []).some(f => f && Number(f.hp) > 0));
  }
  function position(squad, side) {
    if (!squad || !appData || !appData.map || !appData.map.grid) return null;
    const index = liveSquads(side).indexOf(squad);
    if (index < 0) return null;
    return getBattleSquadHex(appData.map.grid, index, side === 'enemy');
  }
  function targetVisible(squad) {
    return !!(squad && squad.detected && squad.hidden !== true && !squad.camouflaged && alive(squad));
  }
  function canEnterMeleeHex(key) {
    const grid = appData && appData.map && appData.map.grid;
    const cell = grid && grid[key];
    if (!cell) return false;
    const occupants = (cell.squadIds || []).map(i => (appData.squads || [])[i]).filter(alive);
    return occupants.length === 1 && targetVisible(occupants[0]) && !occupants[0].armor && !occupants[0].isVehicle;
  }
  function weaponCrewEntries(squad, types) {
    const lib = (typeof getFactionCrewWeapons === 'function') ? getFactionCrewWeapons(squad.faction) || [] : [];
    return (squad.crewInstances || []).map((ci, index) => ({ ci, index, weapon: ci && lib.find(w => w && w.name === ci.weaponName) }))
      .filter(x => x.ci && x.ci.active !== false && x.ci.deployed !== false && x.ci.status !== 'destroyed' &&
        x.ci.status !== 'blinded' && x.weapon && types.includes(x.weapon.type) &&
        (x.ci.fighterIndices || []).some(i => squad.fighters[i] && squad.fighters[i].hp > 0));
  }
  function actionOptions(squad) {
    const out = [];
    const dot = typeof tacticalIsDotSquad === 'function' && tacticalIsDotSquad(squad);
    if (dot) {
      weaponCrewEntries(squad, ['mg']).forEach(x => {
        if (Number(squad.ammoSmall) > 0) out.push({ id: 'dotmg', extra: x.index, reserve: Number(squad.ammoSmall) });
      });
    } else {
      if (!squad.armor && Number(squad.grenades) > 0) {
        out.push({ id: 'grenades', reserve: Number(squad.grenades) });
        out.push({ id: 'satchel', reserve: Number(squad.grenades) });
      }
      if (!squad.armor && Number(squad.atRifleGrenades) > 0) out.push({ id: 'atGrenade', reserve: Number(squad.atRifleGrenades) });
      if (!squad.armor) out.push({ id: 'melee', reserve: 0 });
      if (!squad.armor && Number(squad.ammoSmall) > 0) {
        out.push({ id: 'smallArms', reserve: Number(squad.ammoSmall) });
        out.push({ id: 'suppressiveFire', reserve: Number(squad.ammoSmall) });
      }
      if (weaponCrewEntries(squad, ['at_gun', 'mortar', 'tank_gun']).length && Number(squad.ammoOrdnance) > 0) {
        out.push({ id: 'ordnance', reserve: Number(squad.ammoOrdnance) });
      }
      if (weaponCrewEntries(squad, ['at_gun', 'tank_gun']).length && Number(squad.ammoOrdnance) > 0) {
        out.push({ id: 'vehicle', reserve: Number(squad.ammoOrdnance) });
      }
      if (weaponCrewEntries(squad, ['mortar']).some(x => x.weapon.isMolotov) && Number(squad.ammoOrdnance) > 0) {
        out.push({ id: 'molotovCrew', reserve: Number(squad.ammoOrdnance) });
      }
      if (weaponCrewEntries(squad, ['mortar']).some(x => x.weapon.isAmpulomet) && Number(squad.ammoOrdnance) > 0) {
        out.push({ id: 'ampulomet', reserve: Number(squad.ammoOrdnance) });
      }
      const hasSniper = typeof mapActionHasSniper === 'function' ? mapActionHasSniper(squad) : false;
      if (hasSniper && Number(squad.ammoSmall) > 0) out.push({ id: 'sniper', reserve: Number(squad.ammoSmall) });
    }
    return out;
  }
  function targetPriority(shooter, target, dist, actionId) {
    const initial = Math.max(1, (target.fighters || []).length);
    const remaining = (target.fighters || []).filter(f => f && Number(f.hp) > 0).length;
    const attrition = 1 - remaining / initial;
    const vehicle = !!(target.armor || target.isVehicle);
    const antiArmor = ['vehicle', 'ordnance', 'satchel', 'atGrenade', 'molotovCrew', 'ampulomet'].includes(actionId);
    const headquarters = typeof tacticalIsHeadquartersSquad === 'function' && tacticalIsHeadquartersSquad(target);
    const threatened = typeof tacticalSquadsDistance === 'function'
      ? (tacticalSquadsDistance(target, shooter) ?? 99) : 99;
    // Concentrate fire on dangerous, already damaged and nearby enemies while
    // assigning anti-armour weapons to vehicles.
    return 5 + Math.min(remaining, 10) * 0.25 + attrition * 2 +
      (headquarters ? 1.5 : 0) + (vehicle === antiArmor ? 2 : (vehicle ? -2 : 0)) -
      dist * 0.18 - threatened * 0.04 - Math.max(0, Number(actionId === 'smallArms' || actionId === 'sniper' ? shooter.ammoSmall : shooter.ammoOrdnance) < 4 ? 1 : 0);
  }
  function actionCanReachTarget(shooter, target, action, dist) {
    if (action.id === 'vehicle') return dist <= 8;
    if (action.id === 'ordnance') {
      const usable = weaponCrewEntries(shooter, ['at_gun', 'mortar', 'tank_gun']).filter(x => {
        if (x.weapon.type === 'mortar' && (target.armor || target.isVehicle)) return false;
        const maxRange = typeof getTacticalCrewWeaponRange === 'function'
          ? getTacticalCrewWeaponRange(x.weapon) : Number(x.weapon.effectiveRange || 99);
        const used = typeof getWeaponShotCount === 'function' ? getWeaponShotCount(shooter, x.ci.uniqueKey) : 0;
        const shots = typeof getWeaponMaxShots === 'function' ? getWeaponMaxShots(x.weapon) : 1;
        return dist <= maxRange && used < shots;
      });
      return usable.length > 0;
    }
    if (action.id === 'dotmg') return dist <= 8;
    if (action.id === 'molotovCrew' || action.id === 'ampulomet') {
      const flag = action.id === 'molotovCrew' ? 'isMolotov' : 'isAmpulomet';
      return weaponCrewEntries(shooter, ['mortar'])
        .some(x => x.weapon[flag] && dist <= Number(x.weapon.effectiveRange || 3));
    }
    if (action.id === 'grenades' || action.id === 'satchel') return dist <= 1;
    if (action.id === 'atGrenade') return dist <= 2;
    if (action.id === 'melee') return dist === 0;
    if (action.id === 'sniper') {
      const weapons = typeof getFactionWeapons === 'function' ? getFactionWeapons(shooter.faction) || [] : [];
      return weapons.some(w => w && w.sniper && dist <= Number(w.effectiveRange || 99));
    }
    return dist <= 8;
  }
  function selectShot(squad, shooterIndex) {
    const options = actionOptions(squad);
    const candidates = [];
    options.forEach(action => {
      let available = [];
      try { available = mapActionAvailableTargetsForSide(shooterIndex, action.id, action.extra, 'enemy'); } catch (e) {}
      available.forEach(item => {
        if (!targetVisible(item.squad)) return;
        const distance = Number(item.evaluation && item.evaluation.dist);
        if (!Number.isFinite(distance) || !actionCanReachTarget(squad, item.squad, action, distance)) return;
        if (action.id === 'suppressiveFire' && item.squad.suppressed) return;
        const score = targetPriority(squad, item.squad, distance, action.id) + (action.id === 'smallArms' ? 0.35 : 0);
        let extra = action.extra;
        if (action.id === 'satchel') {
          const armor = item.squad.armor || {};
          const estimate = Number(armor.side ?? armor.front ?? armor.rear) || 10;
          extra = Math.min(Number(squad.grenades) || 1, Math.max(1, Math.ceil(estimate / 7) + 1));
        }
        candidates.push({ ...action, extra, target: item.squad, targetIndex: item.idx, distance, score });
      });
    });
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0] || null;
  }
  function movementPlan(squad, shooterIndex) {
    const map = appData && appData.map;
    const start = position(squad, 'enemy');
    if (!map || !map.grid || !start || typeof getMovementCost !== 'function' || typeof getHexNeighbors !== 'function') return null;
    const ap = getTacticalSideAP(squad, 'enemy');
    if (!(ap > 0) || !tacticalActionAllowed(squad, 'move', true, { side: 'enemy', ai: true, index: shooterIndex, squad })) return null;
    const targetList = (appData.squads || []).map((target, idx) => ({ target, idx, pos: position(target, 'player') }))
      .filter(x => targetVisible(x.target) && x.pos);
    if (!targetList.length) return null;
    const enemyIds = new Set();
    Object.keys(map.grid).forEach(key => (map.grid[key].enemySquadIds || []).forEach(i => { if (i !== shooterIndex && alive((map.enemySquads || [])[i])) enemyIds.add(key); }));
    const playerIds = new Set();
    Object.keys(map.grid).forEach(key => (map.grid[key].squadIds || []).forEach(i => { if (alive((appData.squads || [])[i])) playerIds.add(key); }));
    const best = new Map([[start.key, 0]]), previous = new Map(), queue = [{ key: start.key, cost: 0 }];
    while (queue.length) {
      queue.sort((a, b) => a.cost - b.cost);
      const current = queue.shift();
      if (current.cost !== best.get(current.key)) continue;
      for (const next of getHexNeighbors(current.key)) {
        if (!map.grid[next] || enemyIds.has(next) || (playerIds.has(next) && !canEnterMeleeHex(next))) continue;
        const remaining = Math.max(0, ap - current.cost);
        const cost = getMovementCost(squad, current.key, next, false, remaining);
        if (!Number.isFinite(cost)) continue;
        const total = current.cost + cost;
        if (total > ap || total >= (best.get(next) ?? Infinity)) continue;
        best.set(next, total);
        previous.set(next, current.key);
        queue.push({ key: next, cost: total });
      }
    }
    const battle = typeof getTacticalBattleRecord === 'function' ? getTacticalBattleRecord() : null;
    const aiAttacks = (battle && battle.placement && battle.placement.attackerSide === 'enemy') ||
      (!battle && map.attackerSide === 'enemy');
    let chosen = null;
    best.forEach((spent, key) => {
      if (key === start.key) return;
      const [col, row] = key.split(',').map(Number);
      const targetDistances = targetList.map(x => ({ target: x.target, dist: hexGridDistance(col, row, x.pos.col, x.pos.row) }));
      const nearest = Math.min(...targetDistances.map(x => x.dist));
      const closes = targetDistances.some(x => x.dist < (tacticalSquadsDistance(squad, x.target) ?? Infinity));
      if (!closes) return;
      const cell = map.grid[key] || {};
      const cover = typeof getTacticalCoverMod === 'function' ? getTacticalCoverMod(cell.type) : 0;
      const height = Number(cell.level) || 0;
      const score = -nearest * (aiAttacks ? 1.2 : 1.7) + cover * 0.45 + Math.min(height, 2) * 0.15 - spent * 0.06;
      if (!chosen || score > chosen.score) chosen = { key, score, cost: spent };
    });
    if (!chosen || !previous.has(chosen.key)) return null;
    const path = [];
    for (let key = chosen.key; key !== start.key; key = previous.get(key)) {
      if (!previous.has(key)) return null;
      path.unshift(key);
    }
    return { start: start.key, path, destination: chosen.key, apCost: chosen.cost };
  }
  function moveSquad(squad, shooterIndex, plan) {
    if (!plan || !plan.path.length) return false;
    const map = appData.map;
    const field = 'enemySquadIds';
    const context = { side: 'enemy', ai: true, squad, index: shooterIndex };
    let moved = 0;
    for (const next of plan.path) {
      const from = position(squad, 'enemy');
      if (!from || !getHexNeighbors(from.key).includes(next)) break;
      const cell = map.grid[next];
      if (!cell || ((cell.squadIds || []).some(i => alive((appData.squads || [])[i])) && !canEnterMeleeHex(next)) ||
          (cell.enemySquadIds || []).some(i => i !== shooterIndex && alive((map.enemySquads || [])[i]))) break;
      const cost = getMovementCost(squad, from.key, next, false, getTacticalSideAP(squad, 'enemy'));
      if (!Number.isFinite(cost) || !spendTacticalSideAP(squad, cost, 'move', context)) break;
      const fromCell = map.grid[from.key];
      fromCell.enemySquadIds = (fromCell.enemySquadIds || []).filter(i => i !== shooterIndex);
      if (!Array.isArray(cell.enemySquadIds)) cell.enemySquadIds = [];
      if (!cell.enemySquadIds.includes(shooterIndex)) cell.enemySquadIds.push(shooterIndex);
      squad.hexPos = next.split(',').map(Number);
      squad.movedThisTurn = true;
      moved++;
      try { if (typeof tacticalUpdateVehicleFacingOnMove === 'function') tacticalUpdateVehicleFacingOnMove(squad, from.key, next); } catch (e) {}
      try { if (typeof tacticalBreakCamouflage === 'function') tacticalBreakCamouflage(squad, 'движение'); } catch (e) {}
      let fieldResult = null;
      try { if (typeof tacticalMaybeTriggerFireField === 'function') fieldResult = tacticalMaybeTriggerFireField(squad, 'enemy', from.key, next, map); } catch (e) {}
      try { if (typeof tacticalCheckMaraudingOnEntry === 'function') tacticalCheckMaraudingOnEntry(squad, next, 'enemy', map); } catch (e) {}
      try { if (typeof tacticalMarkTacticalHexOccupied === 'function') tacticalMarkTacticalHexOccupied(next, 'enemy', map); } catch (e) {}
      try { if (typeof tacticalAutoEngageMelee === 'function') tacticalAutoEngageMelee(squad); } catch (e) {}
      if ((fieldResult && fieldResult.maraudingTriggered) || !alive(squad) || tacticalIsMeleeEngaged(squad)) break;
    }
    if (moved) {
      log(`🚶 Тактический ИИ: «${squad.name}» переместился на ${moved} гекс(а), осталось ${getTacticalSideAP(squad, 'enemy')} ОД.`);
      return true;
    }
    return false;
  }
  function takeSquadTurn(squad, index, stats) {
    if (!alive(squad) || !position(squad, 'enemy')) return;
    if (squad.retreatToHQ || squad.isRouting || squad.isRetreated || squad.isSurrendered ||
        (typeof tacticalMaraudingBlocksAction === 'function' && tacticalMaraudingBlocksAction(squad))) return;
    let fired = 0;
    while (fired < MAX_ACTIONS_PER_SQUAD && getTacticalSideAP(squad, 'enemy') > 0 && !tacticalIsMeleeEngaged(squad)) {
      const shot = selectShot(squad, index);
      if (!shot) break;
      const result = runTacticalAIAction(squad, shot.targetIndex, shot.id, shot.extra);
      if (!result || !result.ok) break;
      stats.attacks++;
      fired++;
      if (!result.spentAP) break;
      if (!alive(squad) || tacticalIsMeleeEngaged(squad)) break;
    }
    if (getTacticalSideAP(squad, 'enemy') > 0 && alive(squad) && !tacticalIsMeleeEngaged(squad)) {
      const plan = movementPlan(squad, index);
      if (plan && moveSquad(squad, index, plan)) stats.moves++;
      let followup = 0;
      while (followup < 2 && getTacticalSideAP(squad, 'enemy') > 0 && !tacticalIsMeleeEngaged(squad)) {
        const shot = selectShot(squad, index);
        if (!shot) break;
        const result = runTacticalAIAction(squad, shot.targetIndex, shot.id, shot.extra);
        if (!result || !result.ok || !result.spentAP) break;
        stats.attacks++;
        followup++;
      }
    }
  }
  function runEnemyPhase() {
    if (!appData || !appData.map || !appData.map.grid || (appData.campaign && appData.campaign.online) ||
        getTacticalActiveSide() !== 'enemy') return { skipped: true };
    if (appData.currentBattleId && typeof placementPendingReason === 'function' && placementPendingReason()) {
      log('📍 Тактический ИИ ждёт завершения расстановки.');
      return { skipped: true };
    }
    const stats = { attacks: 0, moves: 0 };
    const squads = (appData.map.enemySquads || []).slice();
    log('🤖 Тактический ИИ начинает фазу противника.');
    squads.forEach((squad, index) => {
      try { takeSquadTurn(squad, index, stats); }
      catch (error) { console.warn('Tactical AI squad turn:', squad && squad.name, error); log(`⚠️ Тактический ИИ: действие «${squad && squad.name || 'отряд'}» не удалось (${error.message || error}).`); }
    });
    log(`🤖 Фаза тактического ИИ завершена: действий огня ${stats.attacks}, перемещений ${stats.moves}.`);
    try { saveData(); } catch (e) {}
    try { updateUI(); redrawMap(); } catch (e) {}
    return stats;
  }
  function scheduleEnemyPhase() {
    if (phaseRunning || !appData || !appData.map || (appData.campaign && appData.campaign.online) ||
        getTacticalActiveSide() !== 'enemy') return false;
    phaseRunning = true;
    const token = ++phaseToken;
    const battleId = appData.currentBattleId;
    const turn = Number(currentTurn) || 1;
    setTimeout(() => {
      if (token !== phaseToken) return;
      if (!appData || !appData.map || appData.currentBattleId !== battleId ||
          getTacticalActiveSide() !== 'enemy' || Number(currentTurn) !== turn ||
          (appData.campaign && appData.campaign.online)) {
        phaseRunning = false;
        return;
      }
      runEnemyPhase();
      phaseRunning = false;
      if (appData && appData.map && getTacticalActiveSide() === 'enemy' &&
          !(getTacticalBattleRecord() || {}).pausedForOrders) {
        nextTurn();
      }
    }, 40);
    return true;
  }
  function isPhaseRunning() { return phaseRunning; }

  root.tacticalEnemyAI = {
    runPhase: runEnemyPhase,
    schedulePhase: scheduleEnemyPhase,
    isPhaseRunning,
    selectShot,
    movementPlan
  };
})(typeof window !== 'undefined' ? window : globalThis);

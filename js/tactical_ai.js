// ⚡ BUILD-МАРКЕР: v13.200
// Offline tactical opponent AI. Uses the shared tactical target evaluator,
// action authorization, AP accounting and existing combat routines.
(function (root) {
  'use strict';

  const MAX_ACTIONS_PER_SQUAD = 3;
  const AI_ACTIONS = ['smallArms', 'ordnance', 'vehicle', 'sniper', 'suppressiveFire', 'dotmg'];
  let phaseRunning = false;
  let phaseToken = 0;
  let activePhasePlan = null;

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
  function disembarkBtrPassengerWhenUseful(carrier) {
    if (!carrier || !/БТР|BTR/i.test(String(carrier.name || '')) || carrier.embarkedSquadIndex == null) return false;
    const map = appData && appData.map;
    const carrierIndex = (map && map.enemySquads || []).indexOf(carrier);
    const passengerIndex = Number(carrier.embarkedSquadIndex);
    const passenger = (map && map.enemySquads || [])[passengerIndex];
    const pos = carrierIndex >= 0 ? position(carrier, 'enemy') : null;
    if (!map || !map.grid || !passenger || !pos || !alive(passenger)) return false;
    const nearbyTarget = (appData.squads || []).some(target => {
      if (!alive(target)) return false;
      const targetPos = position(target, 'player');
      return targetPos && hexGridDistance(pos.col, pos.row, targetPos.col, targetPos.row) <= 3;
    });
    if (!nearbyTarget) return false;
    const cost = typeof getActionCost === 'function' ? getActionCost(carrier, 'load') : 1;
    const ap = getTacticalSideAP(carrier, 'enemy');
    if (!(cost > 0) || ap < cost) return false;
    const cell = map.grid[pos.key];
    if (!cell) return false;
    const context = { side: 'enemy', ai: true, squad: carrier, index: carrierIndex };
    if (typeof spendTacticalSideAP !== 'function' || !spendTacticalSideAP(carrier, cost, 'utility', context)) return false;
    // Mirror the player unload action: passenger lands on the carrier's hex,
    // then takes its own turn when its index is processed by the phase.
    Object.keys(map.grid).forEach(key => {
      const hex = map.grid[key];
      if (hex && Array.isArray(hex.enemySquadIds)) hex.enemySquadIds = hex.enemySquadIds.filter(i => i !== passengerIndex);
    });
    if (!Array.isArray(cell.enemySquadIds)) cell.enemySquadIds = [];
    if (!cell.enemySquadIds.includes(passengerIndex)) cell.enemySquadIds.push(passengerIndex);
    passenger.hexPos = [pos.col, pos.row];
    passenger.hidden = false;
    carrier.embarkedSquadIndex = null;
    delete carrier.embarkedSquadName;
    delete carrier.embarkedSquadOwner;
    log(`🚌 Тактический ИИ высадил десант «${passenger.name}» из ${carrier.name} у противника.`);
    return true;
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
  function squadRole(squad) {
    if (!squad) return 'rifle';
    if (typeof tacticalIsHeadquartersSquad === 'function' && tacticalIsHeadquartersSquad(squad)) return 'headquarters';
    if (typeof tacticalIsDotSquad === 'function' && tacticalIsDotSquad(squad)) return 'fortification';
    if (squad.armor || squad.isVehicle) return 'vehicle';
    const name = String(squad.name || '');
    if (/снайпер/i.test(name) || (typeof mapActionHasSniper === 'function' && mapActionHasSniper(squad))) return 'sniper';
    const weapons = weaponCrewEntries(squad, ['mg', 'mortar', 'at_gun', 'tank_gun']);
    if (weapons.some(x => x.weapon.type === 'mortar')) return 'mortar';
    if (weapons.some(x => x.weapon.type === 'at_gun' || x.weapon.type === 'tank_gun') || /пто|противотанк|орудийн|артиллер/i.test(name)) return 'antiArmor';
    if (weapons.some(x => x.weapon.type === 'mg') || /пулем[её]т|отделение поддержки/i.test(name)) return 'machineGun';
    return 'rifle';
  }
  function battleIsAttacker() {
    const map = appData && appData.map;
    const battle = typeof getTacticalBattleRecord === 'function' ? getTacticalBattleRecord() : null;
    const side = (battle && battle.placement && battle.placement.attackerSide) || (map && map.attackerSide) || 'player';
    return side === 'enemy';
  }
  function stealthPreparationAvailable(squad) {
    const map = appData && appData.map;
    const pos = position(squad, 'enemy');
    const role = squadRole(squad);
    const round = typeof tacticalRoundNumber === 'function' ? Number(tacticalRoundNumber())
      : (typeof currentTurn !== 'undefined' ? Number(currentTurn) || 1 : 1);
    if (!battleIsAttacker() || !['rifle', 'sniper'].includes(role) || !map || !pos || round !== 1 ||
        squad.camouflaged || squad.movedThisTurn || squad.firedThisTurn ||
        (squad.actionsThisTurn && (Number(squad.actionsThisTurn.shots) > 0 || squad.actionsThisTurn.attacks))) return false;
    const terrain = String((map.grid[pos.key] || {}).type || '').toLowerCase();
    if (!['forest', 'shelled_forest', 'rocks', 'bushes', 'rock', 'bush'].includes(terrain)) return false;
    const visibleTargets = (appData.squads || []).some(target => targetVisible(target));
    return !visibleTargets && getTacticalSideAP(squad, 'enemy') >= 2;
  }
  function prepareStealthManeuver(squad, index) {
    if (!stealthPreparationAvailable(squad) || !tacticalActionAllowed(squad, 'utility', true,
        { side: 'enemy', ai: true, squad, index })) return false;
    const pos = position(squad, 'enemy');
    if (!pos || !spendTacticalSideAP(squad, 2, 'utility', { side: 'enemy', ai: true, squad, index })) return false;
    squad.camouflaged = true;
    squad.hidden = false;
    squad.detected = false;
    squad.camouflagedAt = { turn: Number(currentTurn) || 1, hex: pos.key };
    log(`🎭 «${squad.name}» занял скрытую позицию для манёвра и не раскрывает себя до появления цели.`);
    return true;
  }
  function squadStrength(squad) {
    const fighters = (squad && squad.fighters || []).filter(f => f && Number(f.hp) > 0);
    const original = Math.max(fighters.length, Number(squad && squad.tacticalOriginalRosterSize) || 0);
    return original ? fighters.length / original : 1;
  }
  function squadMoraleRatio(squad) {
    const max = Math.max(1, Number(squad && (squad.tacticalMoraleMax || squad.baseMorale)) || 100);
    const value = squad && squad.currentMorale !== undefined && squad.currentMorale !== null
      ? Number(squad.currentMorale) : max;
    return Math.max(0, Number.isFinite(value) ? value : max) / max;
  }
  function chooseDoctrine(squad) {
    const role = squadRole(squad);
    const enemy = (appData && appData.squads || []).filter(alive).map(target => ({ target, pos: position(target, 'player') }))
      .filter(x => x.pos);
    const own = position(squad, 'enemy');
    const nearest = own && enemy.length ? Math.min(...enemy.map(x => hexGridDistance(own.col, own.row, x.pos.col, x.pos.row))) : Infinity;
    const threatened = nearest <= 2;
    // A badly mauled forward unit may break contact and leave by the safest map edge.
    // This is a survival choice, not a free battle victory.
    const moraleAllowsWithdrawal = squadMoraleRatio(squad) >= 0.3 && squadMoraleRatio(squad) <= 0.4;
    const pinnedByStubbornness = typeof tacticalStubbornAtStartingHex === 'function' && tacticalStubbornAtStartingHex(squad);
    if (battleIsAttacker() && !pinnedByStubbornness && role !== 'headquarters' && role !== 'fortification' &&
        (squadStrength(squad) <= 0.25 || moraleAllowsWithdrawal) && threatened) return 'breakthrough';
    if (!battleIsAttacker()) {
      if (threatened && (role !== 'rifle' || squadStrength(squad) < 0.55 || squadMoraleRatio(squad) < 0.45)) return 'fallback';
      if (role === 'headquarters' || role === 'fortification' || role === 'machineGun' || role === 'mortar' || role === 'antiArmor' || role === 'sniper') return 'hold';
      return threatened ? 'counterattack' : 'hold';
    }
    const visibleTargets = (appData.squads || []).some(targetVisible);
    if (squad.camouflaged && !visibleTargets) return 'stealth';
    if (stealthPreparationAvailable(squad)) return 'stealth';
    if (role === 'headquarters' || role === 'fortification' || role === 'machineGun' || role === 'mortar' || role === 'antiArmor' || role === 'sniper') return 'support';
    const attackersNear = ((appData && appData.map && appData.map.enemySquads) || []).filter(other => other !== squad && alive(other))
      .some(other => { const pos = position(other, 'enemy'); return pos && enemy.some(x => hexGridDistance(pos.col, pos.row, x.pos.col, x.pos.row) <= 2); });
    return attackersNear ? 'encircle' : 'assault';
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
        const assignment = activePhasePlan && activePhasePlan.assignments[shooterIndex];
        const sharedFocus = assignment && Number.isInteger(assignment.targetIndex)
          ? assignment.targetIndex : (activePhasePlan && activePhasePlan.focusTargetIndex);
        const focusBonus = Number.isInteger(sharedFocus) && item.idx === sharedFocus ? 1.25 : 0;
        const score = targetPriority(squad, item.squad, distance, action.id) +
          (action.id === 'smallArms' ? 0.35 : 0) + focusBonus;
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
  function phasePlanApproachCells(target, radius, side) {
    const map = appData && appData.map;
    const targetPos = position(target, side);
    if (!map || !map.grid || !targetPos || typeof getHexNeighbors !== 'function') return [];
    const seen = new Set([targetPos.key]);
    let frontier = [targetPos.key];
    for (let step = 0; step < radius; step++) {
      const nextFrontier = [];
      frontier.forEach(key => getHexNeighbors(key).forEach(next => {
        if (map.grid[next] && !seen.has(next)) { seen.add(next); nextFrontier.push(next); }
      }));
      frontier = nextFrontier;
    }
    const enemy = (map.enemySquads || []).map(s => ({ squad: s, pos: position(s, 'enemy') })).filter(x => alive(x.squad) && x.pos);
    const players = (appData.squads || []).map(s => ({ squad: s, pos: position(s, 'player') })).filter(x => alive(x.squad) && x.pos);
    return Array.from(seen).filter(key => key !== targetPos.key).filter(key => {
      const [col, row] = key.split(',').map(Number);
      return hexGridDistance(col, row, targetPos.col, targetPos.row) === radius;
    }).map(key => {
      const cell = map.grid[key] || {};
      const occupiedByEnemy = (cell.enemySquadIds || []).some(i => alive((map.enemySquads || [])[i]));
      const occupiedByPlayer = (cell.squadIds || []).some(i => alive((appData.squads || [])[i]));
      const [col, row] = key.split(',').map(Number);
      const defenders = players.filter(x => x.squad !== target && hexGridDistance(col, row, x.pos.col, x.pos.row) <= 2).length;
      const allies = enemy.filter(x => hexGridDistance(col, row, x.pos.col, x.pos.row) <= 1).length;
      const cover = typeof getTacticalCoverMod === 'function' ? getTacticalCoverMod(cell.type) : 0;
      const height = Math.min(2, Number(cell.level) || 0);
      return { key, col, row, blocked: occupiedByEnemy || occupiedByPlayer,
        terrainScore: cover * 0.55 + height * 0.2 - defenders * 0.72 - allies * 0.3 };
    }).filter(x => !x.blocked);
  }
  function buildPhasePlan(squads) {
    const units = (squads || (appData && appData.map && appData.map.enemySquads) || []).map((squad, index) => ({ squad, index, pos: position(squad, 'enemy'), role: squadRole(squad) }))
      .filter(x => alive(x.squad) && x.pos && !x.squad.retreatToHQ);
    const targets = (appData && appData.squads || []).map((squad, index) => ({ squad, index, pos: position(squad, 'player') }))
      .filter(x => targetVisible(x.squad) && x.pos);
    const attacking = battleIsAttacker();
    const assignments = {};
    const supportRoles = new Set(['headquarters', 'fortification', 'machineGun', 'mortar', 'antiArmor', 'sniper', 'vehicle']);
    let focus = null;
    if (attacking && targets.length) {
      const representative = units.find(x => !supportRoles.has(x.role))?.squad || units[0]?.squad || {};
      focus = targets.map(item => {
        const distance = units.length ? Math.min(...units.map(x => hexGridDistance(x.pos.col, x.pos.row, item.pos.col, item.pos.row))) : 99;
        const score = targetPriority(representative, item.squad, distance, 'smallArms') +
          (item.squad.armor || item.squad.isVehicle ? 0.35 : 0) + (item.squad.suppressed ? 0.25 : 0);
        return { ...item, score };
      }).sort((a, b) => b.score - a.score)[0];
      const mobile = units.filter(x => !supportRoles.has(x.role) && x.role !== 'fortification')
        .sort((a, b) => hexGridDistance(a.pos.col, a.pos.row, focus.pos.col, focus.pos.row) - hexGridDistance(b.pos.col, b.pos.row, focus.pos.col, focus.pos.row));
      const usedGoals = new Set();
      mobile.forEach((unit, index) => {
        const flank = mobile.length > 1 && index >= Math.ceil(mobile.length / 2);
        const doctrine = flank ? 'encircle' : 'assault';
        const unitDistance = hexGridDistance(unit.pos.col, unit.pos.row, focus.pos.col, focus.pos.row);
        const radius = flank && unitDistance > 2 ? 2 : 1;
        let candidates = phasePlanApproachCells(focus.squad, radius, 'player');
        if (!candidates.length && radius > 1) candidates = phasePlanApproachCells(focus.squad, 1, 'player');
        const ranked = candidates.map(candidate => {
          const distance = hexGridDistance(unit.pos.col, unit.pos.row, candidate.col, candidate.row);
          const separation = usedGoals.has(candidate.key) ? 2.5 : 0;
          const laneSeparation = usedGoals.size
            ? Math.min(...Array.from(usedGoals, key => hexGridDistance(candidate.col, candidate.row, ...key.split(',').map(Number)))) : 0;
          const score = flank
            ? candidate.terrainScore * 1.1 - distance * 0.25 + laneSeparation * 0.45 - separation
            : candidate.terrainScore * 0.35 - distance - separation;
          return { ...candidate, score };
        }).sort((a, b) => b.score - a.score);
        const goal = ranked[0] || null;
        if (goal) usedGoals.add(goal.key);
        assignments[unit.index] = { doctrine, targetIndex: focus.index, goalKey: goal && goal.key || null };
      });
      units.filter(x => supportRoles.has(x.role)).forEach(unit => {
        assignments[unit.index] = { doctrine: 'support', targetIndex: focus.index, goalKey: null };
      });
    } else {
      // Defenders hold their sectors. A local danger response may still override
      // this assignment later (fallback or a bounded counterattack).
      units.forEach(unit => { assignments[unit.index] = { doctrine: 'hold', targetIndex: null, goalKey: null }; });
      if (!attacking && targets.length) {
        const mobile = units.filter(x => !supportRoles.has(x.role));
        const allocations = new Map();
        mobile.forEach(unit => {
          const target = targets.map(item => {
            const distance = hexGridDistance(unit.pos.col, unit.pos.row, item.pos.col, item.pos.row);
            return { ...item, distance, score: targetPriority(unit.squad, item.squad, distance, 'smallArms') - (allocations.get(item.index) || 0) * 1.4 };
          }).sort((a, b) => b.score - a.score)[0];
          if (!target) return;
          allocations.set(target.index, (allocations.get(target.index) || 0) + 1);
          const goal = target.distance <= 4
            ? phasePlanApproachCells(target.squad, 2, 'player').sort((a, b) => {
              const da = hexGridDistance(unit.pos.col, unit.pos.row, a.col, a.row) - a.terrainScore * 0.25;
              const db = hexGridDistance(unit.pos.col, unit.pos.row, b.col, b.row) - b.terrainScore * 0.25;
              return da - db;
            })[0] : null;
          assignments[unit.index] = { doctrine: goal && target.distance <= 3 ? 'counterattack' : 'hold',
            targetIndex: target.index, goalKey: goal && goal.key || null };
        });
      }
    }
    const mobileCount = units.filter(x => !supportRoles.has(x.role)).length;
    const plan = { attacking, focusTargetIndex: focus ? focus.index : null,
      focusTargetName: focus && focus.squad.name || null, assignments,
      maneuver: !attacking ? 'defend' : (!focus ? 'probe' : (mobileCount > 1 ? 'assault-and-flank' : 'assault')) };
    activePhasePlan = plan;
    return plan;
  }
  function ensurePhasePlan(squads) {
    const focusIndex = activePhasePlan && activePhasePlan.focusTargetIndex;
    const focusTarget = Number.isInteger(focusIndex) ? (appData.squads || [])[focusIndex] : null;
    const staleAssignment = activePhasePlan && Object.values(activePhasePlan.assignments || {}).some(assignment =>
      Number.isInteger(assignment && assignment.targetIndex) && !targetVisible((appData.squads || [])[assignment.targetIndex]));
    if (!activePhasePlan || activePhasePlan.attacking !== battleIsAttacker() || staleAssignment ||
        (Number.isInteger(focusIndex) && (!focusTarget || !targetVisible(focusTarget)))) return buildPhasePlan(squads);
    return activePhasePlan;
  }
  function applyCoordinatedSuppression(squad, firstTarget) {
    if (!firstTarget || !firstTarget.suppressed || typeof mapActionCanUseCoordinatedBarrage !== 'function' ||
        !mapActionCanUseCoordinatedBarrage(squad) || (typeof tacticalIsDotSquad === 'function' && tacticalIsDotSquad(firstTarget))) return false;
    const firstPos = position(firstTarget, 'player');
    if (!firstPos) return false;
    const second = (appData.squads || []).map((target, idx) => ({ target, idx, pos: position(target, 'player') }))
      .filter(x => x.target !== firstTarget && targetVisible(x.target) && !x.target.suppressed && !x.target.armor && !x.target.isVehicle &&
        !(typeof tacticalIsDotSquad === 'function' && tacticalIsDotSquad(x.target)) && x.pos &&
        hexGridDistance(firstPos.col, firstPos.row, x.pos.col, x.pos.row) <= 1)
      .sort((a, b) => targetPriority(squad, b.target, 1, 'suppressiveFire') - targetPriority(squad, a.target, 1, 'suppressiveFire'))[0];
    if (!second) return false;
    if (typeof markTacticalSuppressed === 'function') markTacticalSuppressed(second.target, 'enemy');
    else {
      second.target.suppressed = true;
      second.target.suppressedTurn = (typeof currentTurn !== 'undefined') ? currentTurn : 1;
      second.target.suppressedBySide = 'enemy';
    }
    try { log(`💫 Карта «Скоординированный заградительный огонь»: «${second.target.name}» подавлен вслед за первой целью.`); } catch (e) {}
    return true;
  }
  function movementPlan(squad, shooterIndex) {
    const map = appData && appData.map;
    const start = position(squad, 'enemy');
    if (!map || !map.grid || !start || typeof getMovementCost !== 'function' || typeof getHexNeighbors !== 'function') return null;
    const ap = getTacticalSideAP(squad, 'enemy');
    if (!(ap > 0) || !tacticalActionAllowed(squad, 'move', true, { side: 'enemy', ai: true, index: shooterIndex, squad })) return null;
    const role = squadRole(squad);
    const localDoctrine = chooseDoctrine(squad);
    const assignment = activePhasePlan && activePhasePlan.assignments[shooterIndex];
    const doctrine = ['fallback', 'breakthrough'].includes(localDoctrine)
      ? localDoctrine : ((assignment && assignment.doctrine) || localDoctrine);
    const allVisibleTargets = (appData.squads || []).map((target, idx) => ({ target, idx, pos: position(target, 'player') }))
      .filter(x => targetVisible(x.target) && x.pos);
    const assignedTarget = assignment && Number.isInteger(assignment.targetIndex)
      ? allVisibleTargets.find(x => x.idx === assignment.targetIndex) : null;
    const targetList = assignedTarget ? [assignedTarget] : allVisibleTargets;
    const allThreats = (appData.squads || []).map(target => ({ target, pos: position(target, 'player') }))
      .filter(x => alive(x.target) && x.pos);
    const exits = (typeof tacticalMapEdgeHexKeys === 'function' ? tacticalMapEdgeHexKeys(map) : []);
    let exitKey = null;
    if (doctrine === 'breakthrough' && exits.length) {
      const exitScores = exits.filter(key => {
        const cell = map.grid[key] || {};
        const blockedByPlayer = (cell.squadIds || []).some(i => alive((appData.squads || [])[i]));
        const blockedByAlly = (cell.enemySquadIds || []).some(i => i !== shooterIndex && alive((map.enemySquads || [])[i]));
        return !blockedByPlayer && !blockedByAlly;
      }).map(key => {
        const [col, row] = key.split(',').map(Number);
        const clearance = allThreats.length ? Math.min(...allThreats.map(x => hexGridDistance(col, row, x.pos.col, x.pos.row))) : 99;
        const distance = hexGridDistance(start.col, start.row, col, row);
        return { key, score: clearance * 1.5 - distance * 0.2 };
      }).sort((a, b) => b.score - a.score);
      exitKey = squad.tacticalAIBreakthroughExit && exitScores.some(x => x.key === squad.tacticalAIBreakthroughExit)
        ? squad.tacticalAIBreakthroughExit : (exitScores[0] && exitScores[0].key);
      if (exitKey) squad.tacticalAIBreakthroughExit = exitKey;
    }
    // Defensive support crews and command units keep their firing position unless
    // immediate danger makes a bounded withdrawal necessary.
    const supportRole = ['headquarters', 'fortification', 'machineGun', 'mortar', 'antiArmor', 'sniper', 'vehicle'].includes(role);
    if (doctrine === 'hold' || doctrine === 'support' || (doctrine === 'counterattack' && supportRole)) return null;
    if (doctrine === 'fallback' && !allThreats.some(x => hexGridDistance(start.col, start.row, x.pos.col, x.pos.row) <= 2)) return null;
    if (doctrine !== 'fallback' && doctrine !== 'breakthrough' && !targetList.length) return null;
    if (doctrine === 'breakthrough' && !exitKey) return null;

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
    const aiAttacks = battleIsAttacker();
    let chosen = null;
    best.forEach((spent, key) => {
      if (key === start.key) return;
      const [col, row] = key.split(',').map(Number);
      const cell = map.grid[key] || {};
      const cover = typeof getTacticalCoverMod === 'function' ? getTacticalCoverMod(cell.type) : 0;
      const height = Math.min(Number(cell.level) || 0, 2);
      let score = 0;
      if (doctrine === 'fallback') {
        const before = allThreats.length ? Math.min(...allThreats.map(x => hexGridDistance(start.col, start.row, x.pos.col, x.pos.row))) : 0;
        const after = allThreats.length ? Math.min(...allThreats.map(x => hexGridDistance(col, row, x.pos.col, x.pos.row))) : 0;
        if (after <= before) return;
        const friendlySupport = ((map.enemySquads || [])).filter(other => other !== squad && alive(other)).filter(other => {
          const pos = position(other, 'enemy'); return pos && hexGridDistance(col, row, pos.col, pos.row) <= 2;
        }).length;
        score = (after - before) * 2 + cover * 0.65 + height * 0.2 + Math.min(friendlySupport, 3) * 0.3 - spent * 0.08;
      } else if (doctrine === 'breakthrough') {
        const [exitCol, exitRow] = exitKey.split(',').map(Number);
        const exitDistance = hexGridDistance(col, row, exitCol, exitRow);
        const clearance = allThreats.length ? Math.min(...allThreats.map(x => hexGridDistance(col, row, x.pos.col, x.pos.row))) : 99;
        score = -exitDistance * 2 + clearance * 0.25 + cover * 0.1 - spent * 0.04;
      } else if (assignment && assignment.goalKey && ['assault', 'encircle', 'counterattack'].includes(doctrine)) {
        const [goalCol, goalRow] = assignment.goalKey.split(',').map(Number);
        const startDistance = hexGridDistance(start.col, start.row, goalCol, goalRow);
        const goalDistance = hexGridDistance(col, row, goalCol, goalRow);
        if (goalDistance >= startDistance) return;
        const nearestThreat = allThreats.length ? Math.min(...allThreats.map(x => hexGridDistance(col, row, x.pos.col, x.pos.row))) : 99;
        if (doctrine === 'counterattack' && nearestThreat < 2) return;
        const exposure = allThreats.filter(x => hexGridDistance(col, row, x.pos.col, x.pos.row) <= 2).length;
        score = -goalDistance * 1.8 - exposure * (doctrine === 'encircle' ? 0.5 : 0.25) + cover * 0.42 + height * 0.16 - spent * 0.06;
      } else {
        const targetDistances = targetList.map(x => ({ target: x.target, dist: hexGridDistance(col, row, x.pos.col, x.pos.row) }));
        const nearest = Math.min(...targetDistances.map(x => x.dist));
        const before = Math.min(...targetList.map(x => hexGridDistance(start.col, start.row, x.pos.col, x.pos.row)));
        if (doctrine === 'counterattack' && (nearest < 2 || nearest >= before)) return;
        if (nearest >= before) return;
        const nearbyDefenders = allThreats.filter(x => hexGridDistance(col, row, x.pos.col, x.pos.row) <= 2).length;
        // Flank/encirclement seeks an approach lane with fewer supporting defenders,
        // while still closing distance and preferring useful terrain.
        const exposurePenalty = nearbyDefenders * (doctrine === 'encircle' ? 0.55 : 0.28);
        score = -nearest * (aiAttacks ? 1.25 : 0.8) - exposurePenalty + cover * (role === 'rifle' ? 0.42 : 0.55) + height * 0.16 - spent * 0.06;
        if (doctrine === 'counterattack' && nearest <= 2) score -= 2;
      }
      if (!chosen || score > chosen.score) chosen = { key, score, cost: spent };
    });
    if (!chosen || !previous.has(chosen.key)) return null;
    const path = [];
    for (let key = chosen.key; key !== start.key; key = previous.get(key)) {
      if (!previous.has(key)) return null;
      path.unshift(key);
    }
    return { start: start.key, path, destination: chosen.key, apCost: chosen.cost, doctrine,
      exitKey: doctrine === 'breakthrough' ? exitKey : null };
  }
  function aiShouldUseVehicleManeuvering(squad) {
    if (!squad || !squad.armor) return false;
    const pos = position(squad, 'enemy');
    if (!pos) return false;
    return (appData.squads || []).some(target => {
      if (!targetVisible(target) || !weaponCrewEntries(target, ['at_gun', 'tank_gun']).length) return false;
      const targetPos = position(target, 'player');
      return targetPos && hexGridDistance(pos.col, pos.row, targetPos.col, targetPos.row) <= 5;
    });
  }
  function deployDefensiveSmoke(squad, index) {
    const pos = position(squad, 'enemy');
    const map = appData && appData.map;
    const turn = typeof currentTurn !== 'undefined' ? Number(currentTurn) || 1 : 1;
    if (!pos || !map || squad.armor || Number(squad.smokeGrenades) < 3 || squad.tacticalAISmokeTurn === turn ||
        typeof tacticalCreateSmokeCloud !== 'function' || typeof tacticalSmokeWindDestination !== 'function' ||
        typeof rollD12 !== 'function' || getTacticalSideAP(squad, 'enemy') < 3) return false;
    const danger = (appData.squads || []).some(target => {
      if (!targetVisible(target)) return false;
      const targetPos = position(target, 'player');
      return targetPos && hexGridDistance(pos.col, pos.row, targetPos.col, targetPos.row) <= 3;
    });
    if (!danger || !tacticalActionAllowed(squad, 'utility', true, { side: 'enemy', ai: true, index, squad })) return false;
    const context = { side: 'enemy', ai: true, index, squad };
    if (!spendTacticalSideAP(squad, 1, 'utility', context)) return false;
    squad.smokeGrenades -= 3;
    const wind = rollD12();
    const center = tacticalSmokeWindDestination(pos.key, wind, map);
    const cloud = tacticalCreateSmokeCloud(center, 'enemy');
    if (!cloud) {
      squad.smokeGrenades += 3;
      squad.tacticalAP = (Number(squad.tacticalAP) || 0) + 1;
      return false;
    }
    squad.tacticalAISmokeTurn = turn;
    log(`💨 «${squad.name}» поставил дымовую завесу при отходе.`);
    return true;
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
      if (typeof tacticalResolveArmoredWeaponContact === 'function') {
        try { tacticalResolveArmoredWeaponContact(squad, 'enemy', next, map); } catch (e) {}
      }
      if (typeof tacticalMarkSquadMoved === 'function') tacticalMarkSquadMoved(squad);
      else squad.movedThisTurn = true;
      moved++;
      try { if (typeof tacticalUpdateVehicleFacingOnMove === 'function') tacticalUpdateVehicleFacingOnMove(squad, from.key, next); } catch (e) {}
      try { if (typeof tacticalBreakCamouflage === 'function') tacticalBreakCamouflage(squad, 'движение'); } catch (e) {}
      let fieldResult = null;
      try { if (typeof tacticalMaybeTriggerFireField === 'function') fieldResult = tacticalMaybeTriggerFireField(squad, 'enemy', from.key, next, map); } catch (e) {}
      try { if (typeof tacticalCheckMaraudingOnEntry === 'function') tacticalCheckMaraudingOnEntry(squad, next, 'enemy', map); } catch (e) {}
      try { if (typeof tacticalMarkTacticalHexOccupied === 'function') tacticalMarkTacticalHexOccupied(next, 'enemy', map); } catch (e) {}
      try { if (typeof tacticalAutoEngageMelee === 'function') tacticalAutoEngageMelee(squad); } catch (e) {}
      if (plan.doctrine === 'breakthrough' && next === plan.exitKey) {
        let exited = false;
        if (typeof tacticalRetreatUnit === 'function') exited = !!tacticalRetreatUnit(squad, 'enemy', shooterIndex, 'breakthrough');
        else {
          squad.isRetreated = true;
          squad.status = 'retreated';
          squad.retreatReason = 'breakthrough';
          const exitField = map.grid[next];
          if (exitField && Array.isArray(exitField.enemySquadIds)) exitField.enemySquadIds = exitField.enemySquadIds.filter(i => i !== shooterIndex);
          exited = true;
        }
        if (exited) {
          squad.tacticalAIBreakthroughExited = true;
          log(`🏃 «${squad.name}» прорвался за край карты и вышел из боя.`);
        }
        break;
      }
      if ((fieldResult && fieldResult.maraudingTriggered) || !alive(squad) || tacticalIsMeleeEngaged(squad)) break;
    }
    if (moved) {
      log(`🚶 Тактический ИИ: «${squad.name}» переместился на ${moved} гекс(а), осталось ${getTacticalSideAP(squad, 'enemy')} ОД.`);
      return true;
    }
    return false;
  }
  function takeSquadTurn(squad, index, stats) {
    const squadPos = position(squad, 'enemy');
    if (!alive(squad) || !squadPos) return;
    disembarkBtrPassengerWhenUseful(squad);
    ensurePhasePlan(appData.map.enemySquads || []);
    if (squad.retreatToHQ || squad.isRouting || squad.isRetreated || squad.isSurrendered ||
        (typeof tacticalMaraudingBlocksAction === 'function' && tacticalMaraudingBlocksAction(squad))) return;
    if (chooseDoctrine(squad) === 'breakthrough' && typeof tacticalMapEdgeHexKeys === 'function' &&
        tacticalMapEdgeHexKeys(appData.map).includes(squadPos.key)) {
      const exited = typeof tacticalRetreatUnit === 'function'
        ? !!tacticalRetreatUnit(squad, 'enemy', index, 'breakthrough') : false;
      if (exited) {
        squad.tacticalAIBreakthroughExited = true;
        log(`🏃 «${squad.name}» прорвался за край карты и вышел из боя.`);
      }
      return;
    }
    if (chooseDoctrine(squad) === 'stealth') {
      prepareStealthManeuver(squad, index);
      return;
    }
    if (squadRole(squad) === 'headquarters' && typeof mapActionUseBinocularsForSide === 'function' &&
        getTacticalSideAP(squad, 'enemy') >= 2) {
      const ownPos = position(squad, 'enemy');
      const hidden = (appData.squads || []).map(target => ({ target, pos: position(target, 'player') }))
        .filter(x => alive(x.target) && x.pos && (x.target.hidden === true || x.target.detected !== true) && !x.target.camouflaged);
      const candidate = hidden.filter(x => ownPos && hexGridDistance(ownPos.col, ownPos.row, x.pos.col, x.pos.row) <= 8)
        .sort((a, b) => hexGridDistance(ownPos.col, ownPos.row, a.pos.col, a.pos.row) - hexGridDistance(ownPos.col, ownPos.row, b.pos.col, b.pos.row))[0];
      if (candidate && mapActionUseBinocularsForSide(index, candidate.pos.key, 'enemy')) stats.recon++;
    }
    let fired = 0;
    while (fired < MAX_ACTIONS_PER_SQUAD && getTacticalSideAP(squad, 'enemy') > 0 && !tacticalIsMeleeEngaged(squad)) {
      const shot = selectShot(squad, index);
      if (!shot) break;
      const result = runTacticalAIAction(squad, shot.targetIndex, shot.id, shot.extra);
      if (!result || !result.ok) break;
      stats.attacks++;
      fired++;
      if (shot.id === 'suppressiveFire') applyCoordinatedSuppression(squad, shot.target);
      if (!result.spentAP) break;
      if (!alive(squad) || tacticalIsMeleeEngaged(squad)) break;
    }
    if (getTacticalSideAP(squad, 'enemy') > 0 && alive(squad) && !tacticalIsMeleeEngaged(squad)) {
      if (aiShouldUseVehicleManeuvering(squad)) squad.tacticalManeuveringThisPhase = true;
      let plan = movementPlan(squad, index);
      if (plan && plan.doctrine === 'fallback' && deployDefensiveSmoke(squad, index)) {
        stats.smoke++;
        plan = movementPlan(squad, index);
      }
      if (plan && moveSquad(squad, index, plan)) stats.moves++;
      let followup = 0;
      while (followup < 2 && getTacticalSideAP(squad, 'enemy') > 0 && !tacticalIsMeleeEngaged(squad)) {
        const shot = selectShot(squad, index);
        if (!shot) break;
        const result = runTacticalAIAction(squad, shot.targetIndex, shot.id, shot.extra);
        if (!result || !result.ok || !result.spentAP) break;
        stats.attacks++;
        if (shot.id === 'suppressiveFire') applyCoordinatedSuppression(squad, shot.target);
        followup++;
      }
    }
  }
  function considerEnemyFlare() {
    if (!appData || !appData.enemyFlareAvailable || Number(appData.enemyFlareTurn) !== (Number(currentTurn) || 1) ||
        typeof enemyFlare !== 'function') return false;
    const night = (appData.modifiers || []).some(m => m && m.active && /ночь/i.test(String(m.name || '')));
    const hasHeadquarters = ((appData.map && appData.map.enemySquads) || []).some(s => alive(s) && squadRole(s) === 'headquarters');
    if (!night || !hasHeadquarters) return false;
    const stealthImportant = ((appData.map && appData.map.enemySquads) || []).some(s => alive(s) && (s.hidden || s.camouflaged));
    if (stealthImportant) return false;
    const enemyPositions = ((appData.map && appData.map.enemySquads) || []).filter(alive).map(s => position(s, 'enemy')).filter(Boolean);
    const unrevealed = (appData.squads || []).some(s => {
      if (!alive(s) || s.detected === true || s.camouflaged) return false;
      const pos = position(s, 'player');
      return !!pos && enemyPositions.some(observer => hexGridDistance(observer.col, observer.row, pos.col, pos.row) <= 8);
    });
    if (!unrevealed) return false;
    try { enemyFlare(); return true; } catch (e) { return false; }
  }
  function runEnemyPhase() {
    if (!appData || !appData.map || !appData.map.grid || (appData.campaign && appData.campaign.online) ||
        getTacticalActiveSide() !== 'enemy') return { skipped: true };
    if (appData.currentBattleId && typeof placementPendingReason === 'function' && placementPendingReason()) {
      log('📍 Тактический ИИ ждёт завершения расстановки.');
      return { skipped: true };
    }
    const stats = { attacks: 0, moves: 0, recon: 0, flares: 0, smoke: 0 };
    if (considerEnemyFlare()) stats.flares++;
    const squads = (appData.map.enemySquads || []).slice();
    const plan = buildPhasePlan(squads);
    log(`🤖 Тактический ИИ начинает фазу: общий план «${plan.maneuver}»${plan.focusTargetName ? `, главная цель — «${plan.focusTargetName}»` : ', обнаруженных целей нет'}.`);
    try {
      squads.forEach((squad, index) => {
        try { takeSquadTurn(squad, index, stats); }
        catch (error) { console.warn('Tactical AI squad turn:', squad && squad.name, error); log(`⚠️ Тактический ИИ: действие «${squad && squad.name || 'отряд'}» не удалось (${error.message || error}).`); }
      });
    } finally {
      activePhasePlan = null;
    }
    log(`🤖 Фаза тактического ИИ завершена: действий огня ${stats.attacks}, перемещений ${stats.moves}, разведывательных действий ${stats.recon}, дымовых завес ${stats.smoke}, осветительных ракет ${stats.flares}.`);
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
    movementPlan,
    buildPhasePlan,
    squadRole,
    chooseDoctrine,
    prepareStealthManeuver,
    deployDefensiveSmoke,
    moveSquad,
    applyCoordinatedSuppression,
    considerEnemyFlare
  };
})(typeof window !== 'undefined' ? window : globalThis);

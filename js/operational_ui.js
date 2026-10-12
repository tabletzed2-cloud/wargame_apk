// ⚡ BUILD-МАРКЕР: v13.089 — сопровождение повторяет приказы отряда, высадка десанта приказом БТР, доступность высадки до посадки.
(function () {
  'use strict';

  const STAGES = ['placement', 'fortifications', 'communications', 'orders'];
  const STAGE_TITLES = {
    placement: 'Этап 1 из 4 · Размещение',
    fortifications: 'Этап 2 из 4 · ДОТы и талреп-якоря',
    communications: 'Этап 3 из 4 · Связь',
    orders: 'Этап 4 из 4 · Приказы'
  };
  const state = {
    menuOpen: false,
    menuPage: 'main',
    draft: null,
    mapPick: null,
    selectedUnitId: null,
    placementSignature: '',
    drag: null,
    canvasDrag: null,
    lastDragAt: 0,
    ordersSig: null,
    commCollapsed: false,
    error: ''
  };

  const esc = value => String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  function campaign() {
    return (typeof appData !== 'undefined' && appData && appData.campaign) ? appData.campaign : null;
  }
  function units() { return (campaign() && Array.isArray(campaign().opUnits)) ? campaign().opUnits : []; }
  function activeMap() {
    const screen = document.getElementById('campaignMapScreen');
    return !!(screen && screen.style.display !== 'none' && campaign() && campaign().active);
  }
  function getStage() {
    const c = campaign();
    return c && STAGES.includes(c.opSetupStage) ? c.opSetupStage : 'placement';
  }
  function setStage(stage) {
    const c = campaign();
    if (!c || !STAGES.includes(stage)) return;
    c.opSetupStage = stage;
    if (typeof placementLocked !== 'undefined') placementLocked = stage === 'orders';
    if (typeof placementUnlockCount !== 'undefined') placementUnlockCount = 0;
    try { saveData(); } catch (e) {}
    renderSetup();
    renderPinnedActions();
  }
  function isOnlineTurn() {
    const c = campaign();
    return !(c && c.online && typeof ONLINE !== 'undefined' && ONLINE && ONLINE.started &&
      typeof onlineMyTurnActive === 'function' && !onlineMyTurnActive());
  }
  function setMapMessage(message, color) {
    const el = document.getElementById('mapInfo');
    if (el) { el.textContent = message || ''; el.style.color = color || '#f1c40f'; }
  }
  function saveAndRefresh() {
    try { if (typeof saveData === 'function') saveData(); } catch (e) {}
    try { if (typeof redrawOperationalMap === 'function') redrawOperationalMap(); } catch (e) {}
    try { if (typeof renderActiveOrders === 'function') renderActiveOrders(); } catch (e) {}
  }
  function findBattalionHq() {
    const list = units();
    let id = (typeof hardMode !== 'undefined' && hardMode) ? hardMode.hqUnitId : null;
    if (id != null && list[id] && !list[id].isDestroyed) return Number(id);
    id = list.findIndex(unit => unit && !unit.isDestroyed &&
      (unit.type === 'battalion_hq' || unit.type === 'hq' ||
       (unit.name && /Штаб.*Батальон/i.test(unit.name))));
    if (id >= 0 && typeof hardMode !== 'undefined' && hardMode) hardMode.hqUnitId = id;
    return id;
  }
  function ensureHardMode() {
    const c = campaign();
    if (!c || typeof hardMode === 'undefined' || !hardMode) return false;
    const wasEnabled = !!hardMode.enabled;
    if (!wasEnabled) {
      hardMode.enabled = true;
      try { if (typeof initHardMode === 'function') initHardMode(); } catch (e) { console.warn('initHardMode:', e); }
      try { if (typeof applyHardModeUI === 'function') applyHardModeUI(); } catch (e) {}
      try { if (typeof updateHardModeButtons === 'function') updateHardModeButtons(); } catch (e) {}
    }
    c.hardMode = true;
    try { if (typeof ensureSignalPlatoonState === 'function') ensureSignalPlatoonState(); } catch (e) {}
    if (!wasEnabled) { try { if (typeof saveData === 'function') saveData(); } catch (e) {} }
    return true;
  }
  function setInitialStage() {
    const c = campaign();
    if (!c) return;
    if (!STAGES.includes(c.opSetupStage)) {
      c.opSetupStage = ((typeof placementLocked !== 'undefined' && placementLocked) || (c.currentTurn || 1) > 1)
        ? 'orders' : 'placement';
    }
    if (typeof placementLocked !== 'undefined') placementLocked = c.opSetupStage === 'orders';
    if (c.opSetupStage === 'communications' || c.opSetupStage === 'orders') ensureHardMode();
  }

  function setDisplay(id, show, displayValue) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = show ? (displayValue || '') : 'none';
  }
  function setButtonByOnclick(needle, show) {
    const buttons = document.querySelectorAll('#opPhaseDeploy button, #opPhaseRare button');
    buttons.forEach(button => {
      const code = button.getAttribute('onclick') || '';
      if (code.indexOf(needle) >= 0) button.style.display = show ? '' : 'none';
    });
  }
  function renderSetup() {
    renderSetupCore();
    syncStageLayout();
  }
  function renderSetupCore() {
    const host = document.getElementById('opSetupWizard');
    if (!host) return;
    const c = campaign();
    if (!c || !c.active || !activeMap()) { host.style.display = 'none'; return; }
    const stage = getStage();
    ['showOrderPanelBtn', 'showCommPanelBtn', 'showSupplyPanelBtn'].forEach(id => setDisplay(id, false));
    const onlineEnemyPanel = document.getElementById('opEnemyPanel');
    if (onlineEnemyPanel && c.online) onlineEnemyPanel.style.display = 'none';
    const oldOrdersPanel = document.getElementById('hardModePanel');
    if (oldOrdersPanel) oldOrdersPanel.style.display = 'none';
    if (stage === 'orders') {
      host.style.display = 'none';
      setDisplay('opPlacementTray', false);
      const deploy = document.getElementById('opPhaseDeploy');
      if (deploy) deploy.style.display = 'none';
      return;
    }
    host.style.display = 'block';

    let copy = '';
    let detail = '';
    if (stage === 'placement') {
      const count = (typeof getUnplacedOpUnits === 'function') ? getUnplacedOpUnits().length : 0;
      copy = 'Перетащите карточки отрядов на гексы своей зелёной зоны. Если перетаскивание неудобно, выберите отряд в списке и щёлкните по гексу. Список остаётся открытым.';
      detail = count ? `Осталось разместить: ${count}.` : 'Все отряды на карте. После проверки переходите к ДОТам и талреп-якорям.';
    } else if (stage === 'fortifications') {
      const needsDots = c.playerFaction === 'BeVe' && typeof initialFortificationHexCount === 'function' && initialFortificationHexCount() > 0;
      const dotsDone = !needsDots || (typeof initialFortificationComplete === 'function' && initialFortificationComplete());
      copy = 'Поставьте ДОТы на выбранные оперативные гексы и при необходимости выдайте талреп-якорь выбранной технике. На этом этапе доступны только эти укрепления.';
      detail = needsDots ? (dotsDone ? 'ДОТы расставлены.' : 'ДОТы ещё не расставлены — откройте «Расставить ДОТы».') : 'ДОТов для начальной расстановки нет; талреп-якорь можно выдать выбранной технике.';
    } else {
      copy = 'Hard Mode включён автоматически. Нажмите закреплённую кнопку «Связь», чтобы при необходимости распределить рации и телефоны. После этого подтвердите готовность перейти к приказам.';
      detail = 'Связь штаба уже настроена; дополнительные рации/телефоны можно распределить сейчас или позже.';
    }
    const progress = STAGES.indexOf(stage) + 1;
    host.innerHTML = `<div class="op-setup-title">${STAGE_TITLES[stage]}</div>` +
      `<div class="op-setup-copy">${copy}</div>` +
      `<div class="op-setup-actions"><span class="op-setup-note">${detail}</span>` +
      `<span class="op-setup-progress">${progress}/4</span></div>`;

    const button = document.getElementById('btnFinishPlacement');
    if (button) {
      button.textContent = stage === 'placement' ? '✅ Размещение завершено' :
        stage === 'fortifications' ? '➡️ Перейти к связи' : '✅ Перейти к приказам';
      button.title = stage === 'placement' ? 'Перейти к этапу ДОТов и талреп-якорей' :
        stage === 'fortifications' ? 'Завершить этап укреплений' : 'Подтвердить готовность к началу приказов';
      button.style.display = 'inline-block';
    }

    const deployGroup = document.getElementById('opPhaseDeploy');
    if (deployGroup) deployGroup.style.display = (typeof placementLocked !== 'undefined' && placementLocked) ? 'none' : 'flex';
    setButtonByOnclick("setOpMapMode('placePlayer')", stage === 'placement');
    setButtonByOnclick("setOpMapMode('view')", stage === 'placement');
    setButtonByOnclick('autoPlaceUnplacedUnits', stage === 'placement');
    setButtonByOnclick('undoLastAction', stage === 'placement');
    setDisplay('btnInitialFortificationSetup', stage === 'fortifications' &&
      c.playerFaction === 'BeVe' && typeof initialFortificationHexCount === 'function' && initialFortificationHexCount() > 0);
    setDisplay('initialFortificationStatus', stage === 'fortifications' &&
      c.playerFaction === 'BeVe' && typeof initialFortificationHexCount === 'function' && initialFortificationHexCount() > 0);
    setDisplay('winchBtn', stage === 'fortifications' && c.playerFaction === 'A.I.R.F.');
    setDisplay('opPlacementTray', stage === 'placement', 'block');
    const rare = document.getElementById('opPhaseRare');
    if (rare) rare.style.display = stage === 'orders' ? 'flex' : 'none';
    const enemyPanel = document.getElementById('opEnemyPanel');
    if (enemyPanel && c.online) enemyPanel.style.display = 'none';
    if (stage === 'communications') ensureHardMode();
    updatePlacementTray();
  }


  // ===== v13.087: passengers, dock, grouped tray, icon drag, pick bar, winch info =====
  function carrierOf(passenger) {
    const list = units();
    const pid = list.indexOf(passenger);
    const byIds = (passenger.btrIds || []).map(id => list[Number(id)]).find(b => b && !b.isDestroyed);
    if (byIds) return byIds;
    return list.find(b => b && (b.embarkedUnit === passenger.name ||
      (b.embarkedUnitId != null && Number(b.embarkedUnitId) === pid))) || null;
  }
  function passengerOf(btr) {
    if (!btr) return null;
    const list = units();
    const bi = list.indexOf(btr);
    const found = list.find(u => u && u.embarkedInBtr && !u.isDestroyed &&
      ((Array.isArray(u.btrIds) && u.btrIds.map(Number).includes(bi)) ||
       (btr.embarkedUnitId != null && Number(btr.embarkedUnitId) === list.indexOf(u)) ||
       (btr.embarkedUnit && btr.embarkedUnit === u.name)));
    return found ? { unit: found, id: list.indexOf(found) } : null;
  }
  function unitHexKey(unit) {
    if (!unit) return '';
    if (unit.col != null && unit.row != null) return `${unit.col},${unit.row}`;
    const carrier = unit.embarkedInBtr ? carrierOf(unit) : null;
    return (carrier && carrier.col != null) ? `${carrier.col},${carrier.row}` : '';
  }

  // Dock: the deploy group (placement buttons, tray) is pinned to the bottom of the viewport.
  function ensureDock() {
    let dock = document.getElementById('opStageDock');
    if (dock) return dock;
    const deploy = document.getElementById('opPhaseDeploy');
    if (!deploy) return null;
    dock = document.createElement('div');
    dock.id = 'opStageDock';
    dock.setAttribute('role', 'region');
    dock.setAttribute('aria-label', 'Кнопки этапа и список отрядов');
    dock.style.display = 'none';
    const winchBox = document.createElement('div');
    winchBox.id = 'winchInfoBox';
    winchBox.hidden = true;
    winchBox.addEventListener('click', onWinchBoxClick);
    dock.appendChild(winchBox);
    dock.appendChild(deploy);
    document.body.appendChild(dock);
    return dock;
  }
  function dockHeight() {
    const dock = document.getElementById('opStageDock');
    return (dock && dock.style.display !== 'none') ? dock.offsetHeight : 0;
  }
  function renderOrdersListIfChanged() {
    if (typeof getAllOrdersList !== 'function' || typeof renderActiveOrders !== 'function') return;
    const sig = getAllOrdersList().map(o => `${o.id}:${o.status}:${(o.series || []).length}`).join('|');
    if (sig === state.ordersSig) return;
    state.ordersSig = sig;
    renderActiveOrders();
  }
  function syncStageLayout() {
    const c = campaign();
    const dock = ensureDock();
    const active = activeMap();
    const stage = getStage();
    const showDock = !!(dock && active && c && stage !== 'orders');
    if (dock) dock.style.display = showDock ? 'block' : 'none';
    const screen = document.getElementById('campaignMapScreen');
    if (screen) screen.style.paddingBottom = showDock ? `${dock.offsetHeight + 12}px` : '';
    document.body.classList.toggle('op-placement-stage', showDock && stage === 'placement');
    document.body.classList.toggle('op-show-place-select', !!(c && c.opMapMode === 'placeEnemy'));
    const commBody = document.getElementById('commPanelBody');
    if (commBody) commBody.style.display = state.commCollapsed ? 'none' : '';
    const commBtn = document.getElementById('commCollapseBtn');
    if (commBtn) commBtn.textContent = state.commCollapsed ? '▾ Развернуть' : '▴ Свернуть';
    // Панель всех отданных приказов (v13.087, пункт 11): видна на этапе приказов
    const list = document.getElementById('activeOrdersList');
    if (list) list.style.display = (active && stage === 'orders') ? 'block' : 'none';
    if (active && stage === 'orders') renderOrdersListIfChanged();
    renderPickBar();
    positionUnitActions();
  }

  // Placement tray grouping (v13.087, пункт 5): rows by battalion structure.
  const ROW_TITLES = { bat: 'Батальон', veh: 'Бронетехника взводов', btr: 'БТР', tank: 'Танки', sau: 'САУ',
    art: 'Артиллерия полка', dots: 'ДОТы', coOther: 'Прочие роты', other: 'Прочее' };
  const ROW_TAIL = ['veh', 'btr', 'tank', 'sau', 'art', 'dots', 'other'];
  const TYPE_RANK = ['battalion_hq', 'company_hq', 'recon_platoon', 'engineer_platoon', 'mortar_battery', 'at_gun', 'hq'];
  function typeRank(u) {
    const i = TYPE_RANK.indexOf(u.type);
    return i >= 0 ? i : TYPE_RANK.length;
  }
  function placementRows(entries) {
    const c = campaign();
    const bat = c && c.battalions && c.battalions.player;
    const bu = (bat && Array.isArray(bat.units)) ? bat.units : [];
    const nameRow = new Map();
    const companies = [];
    const titles = {};
    const put = (name, key) => { if (name && !nameRow.has(String(name))) nameRow.set(String(name), key); };
    bu.forEach(unit => {
      if (!unit) return;
      if (unit.type === 'infantry_company') {
        const key = 'co:' + (unit.name || companies.length);
        if (!titles[key]) { titles[key] = unit.name || 'Рота'; companies.push(key); }
        put(unit.hq && unit.hq.name, key);
        (unit.platoons || []).forEach(pl => {
          put(pl.name, key);
          (pl.squads || []).forEach(sq => put(sq && sq.name, key));
        });
        return;
      }
      let key = null;
      if (['hq', 'mortar_battery', 'at_battery', 'engineer_platoon', 'recon_platoon', 'artillery_support'].includes(unit.type)) key = 'bat';
      else if (unit.type === 'armored_vehicle_platoon') key = 'veh';
      else if (unit.type === 'btr_platoon') key = 'btr';
      else if (unit.type === 'tank_platoon') key = 'tank';
      else if (unit.type === 'sau_battery') key = 'sau';
      else if (unit.type === 'regimental_artillery') key = 'art';
      else if (unit.type === 'dots') key = 'dots';
      if (!key) return;
      put(unit.name, key);
      (unit.squads || []).forEach(sq => put(sq && sq.name, key));
    });
    const rowKeyOf = u => {
      const hit = nameRow.get(String(u.name || ''));
      if (hit) return hit;
      if (['battalion_hq', 'hq', 'recon_platoon', 'engineer_platoon', 'mortar_battery', 'at_gun'].includes(u.type)) return 'bat';
      if (['company_hq', 'infantry_platoon', 'bicycle_platoon', 'motorcycle_platoon'].includes(u.type)) return 'coOther';
      if (u.type === 'vehicle') return 'veh';
      if (u.type === 'btr_platoon') return 'btr';
      if (u.type === 'tank_platoon') return 'tank';
      if (u.type === 'sau_battery') return 'sau';
      if (u.type === 'regimental_artillery') return 'art';
      if (u.type === 'dots') return 'dots';
      return 'other';
    };
    const groups = new Map();
    entries.forEach(entry => {
      const key = rowKeyOf(entry.u);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(entry);
    });
    const order = ['bat', ...companies, 'coOther', ...ROW_TAIL];
    [...groups.keys()].forEach(k => { if (!order.includes(k)) order.push(k); });
    const rows = [];
    order.forEach(key => {
      const items = groups.get(key);
      if (!items || !items.length) return;
      items.sort((a, b) => (typeRank(a.u) - typeRank(b.u)) || (a.i - b.i));
      rows.push({ key, title: key.indexOf('co:') === 0 ? titles[key] : (ROW_TITLES[key] || key), items });
    });
    return rows;
  }
  function placementButton(u, i) {
    const placed = u.col != null && u.row != null;
    const pos = placed ? `(${u.col},${u.row})` : 'не размещён';
    const selected = state.selectedUnitId === i || (campaign() && campaign().selectedOpUnit === u);
    return `<button type="button" class="op-placement-unit${placed ? '' : ' is-unplaced'}${selected ? ' is-selected' : ''}" data-op-place-unit="${i}" aria-label="${esc(u.name)}; ${pos}; перетащите на карту" title="${esc(u.name)}" draggable="false">` +
      `${safeUnitIcon(u)}<span>${esc(u.name || 'Отряд')}</span><small>${esc(pos)}</small><span class="op-drag-handle" data-op-drag-handle aria-hidden="true">⠿</span></button>`;
  }

  // Drag a placed unit by its icon directly on the map (v13.087, пункт 1).
  function canvasPoint(event) {
    const canvas = document.getElementById('opMapCanvas');
    if (!canvas || !campaign()) return null;
    const rect = canvas.getBoundingClientRect();
    const dpr = (typeof canvasBackingScale === 'function') ? canvasBackingScale(canvas) : (window.devicePixelRatio || 1);
    const scaleX = (canvas.width / dpr) / Math.max(1, rect.width);
    const scaleY = (canvas.height / dpr) / Math.max(1, rect.height);
    return {
      inside: event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom,
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY
    };
  }
  function unitIconCenter(unit) {
    const zoom = campaign().opZoomLevel || 1;
    const size = (typeof OP_HEX_SIZE === 'number' ? OP_HEX_SIZE : 40) * zoom;
    let x = unit.col * Math.sqrt(3) * size + (unit.row % 2) * Math.sqrt(3) * size / 2 + Math.sqrt(3) * size / 2;
    let y = unit.row * 1.5 * size + size;
    const group = units().filter(u => u && !u.isDestroyed && u.col === unit.col && u.row === unit.row);
    if (group.length > 1) {
      const index = group.indexOf(unit);
      const spread = Math.max(25 * zoom, (36 * zoom + 4 * zoom) / (2 * Math.sin(Math.PI / group.length)));
      x += Math.cos(index * 2 * Math.PI / group.length) * spread;
      y += Math.sin(index * 2 * Math.PI / group.length) * spread;
    }
    return { x, y, radius: 20 * zoom };
  }
  function hitPlacedUnit(point) {
    let best = null, bestDistance = Infinity;
    units().forEach((u, i) => {
      if (!u || u.isDestroyed || u.hidden || u.embarkedInBtr || u.col == null || u.row == null) return;
      const c = unitIconCenter(u);
      const d = Math.hypot(point.x - c.x, point.y - c.y);
      if (d <= c.radius && d < bestDistance) { best = i; bestDistance = d; }
    });
    return best;
  }
  function installCanvasDrag() {
    const canvas = document.getElementById('opMapCanvas');
    if (!canvas || canvas.__opIconDrag) return;
    canvas.__opIconDrag = true;
    canvas.addEventListener('pointerdown', event => {
      if (event.button > 0 || getStage() !== 'placement' || !activeMap() || !isOnlineTurn()) return;
      const point = canvasPoint(event);
      if (!point || !point.inside) return;
      const id = hitPlacedUnit(point);
      if (id == null) return;
      state.canvasDrag = { id, x: event.clientX, y: event.clientY, moved: false };
      canvas.style.touchAction = 'none';
    });
    document.addEventListener('pointermove', event => {
      const drag = state.canvasDrag;
      if (!drag) return;
      if (!drag.moved) {
        if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) <= 7) return;
        drag.moved = true;
        if (!selectPlacementUnit(drag.id)) { state.canvasDrag = null; canvas.style.touchAction = ''; return; }
        try { if (typeof setOpMapMode === 'function') setOpMapMode('placePlayer'); } catch (e) {}
        const ghost = document.createElement('div');
        ghost.className = 'op-placement-ghost';
        ghost.textContent = (units()[drag.id] && units()[drag.id].name) || 'Отряд';
        ghost.dataset.opPlacementGhost = '1';
        document.body.appendChild(ghost);
      }
      movePlacementGhost(event.clientX, event.clientY);
    }, { passive: true });
    document.addEventListener('pointerup', event => {
      const drag = state.canvasDrag;
      if (!drag) return;
      state.canvasDrag = null;
      canvas.style.touchAction = '';
      removePlacementGhost();
      if (!drag.moved) return;
      state.lastDragAt = Date.now();
      const point = canvasPoint(event);
      if (!point || !point.inside) { setMapMessage('Отпустите отряд над картой, чтобы поставить его на гекс.', '#e67e22'); return; }
      const sel = document.getElementById('opPlaceSelect');
      if (sel) sel.value = String(drag.id);
      if (typeof handleOpMapClick === 'function') handleOpMapClick({ clientX: event.clientX, clientY: event.clientY });
      updatePlacementTray(true);
      renderSetup();
    }, { passive: true });
    document.addEventListener('pointercancel', () => {
      state.canvasDrag = null; canvas.style.touchAction = ''; removePlacementGhost();
    }, { passive: true });
  }

  // Pick bar: while a route or target hex is being chosen the order menu steps aside (v13.087, пункт 8).
  function renderPickBar() {
    let bar = document.getElementById('opPickBar');
    if (!bar) {
      if (!document.body) return;
      bar = document.createElement('div');
      bar.id = 'opPickBar';
      bar.className = 'op-pick-bar';
      bar.setAttribute('role', 'toolbar');
      bar.addEventListener('click', onPickBarClick);
      document.body.appendChild(bar);
    }
    const show = !!(state.menuOpen && state.mapPick && activeMap());
    bar.style.display = show ? 'flex' : 'none';
    if (!show) return;
    const hints = {
      route: 'Маршрут: кликайте по гексам по порядку; повторный клик по последней точке снимает её.',
      sector: 'Контроль гексов: клик добавляет гекс, повторный клик убирает.',
      target: 'Кликните по целевому гексу на карте.',
      ambush: 'Кликните по гексу, где отряд устроит засаду.',
      prep: 'Кликните по гексу, который нужно расчистить.',
      special: 'Кликните по гексу, где отряд выполнит действие.'
    };
    const multi = state.mapPick === 'route' || state.mapPick === 'sector';
    const count = state.draft ? ((state.draft.waypoints || []).length || (state.draft.targetHexes || []).length) : 0;
    bar.innerHTML = `<span class="op-pick-text">🗺️ ${esc(hints[state.mapPick] || 'Выберите гекс на карте.')}${multi ? ` Выбрано: ${count}.` : ''}</span>` +
      (multi ? '<button type="button" data-pick-action="done" class="op-pick-done">✅ Готово</button>' : '') +
      '<button type="button" data-pick-action="cancel">✖ Отмена выбора</button>';
  }
  function onPickBarClick(event) {
    const button = event.target && event.target.closest ? event.target.closest('[data-pick-action]') : null;
    if (!button) return;
    const action = button.getAttribute('data-pick-action');
    const count = state.draft ? ((state.draft.waypoints || []).length || (state.draft.targetHexes || []).length) : 0;
    state.mapPick = null;
    state.error = '';
    if (typeof isPlanningRoute !== 'undefined') isPlanningRoute = false;
    if (action === 'done') setMapMessage(count ? `✅ Выбрано гексов: ${count}. Откройте приказ и отдайте его.` : 'Гексы не выбраны.', count ? '#27ae60' : '#e67e22');
    else setMapMessage('Выбор на карте отменён; уже выбранные гексы сохранены.', '#aaa');
    renderCommandMenu();
    positionUnitActions();
    try { if (typeof redrawOperationalMap === 'function') redrawOperationalMap(); } catch (e) {}
  }

  // Winch (талреп-якорь, v13.087, пункт 6): one per battalion, description on hover/click.
  function winchCandidate(unit) {
    return !!unit && !unit.isDestroyed && (unit.mobility === 'vehicle' || /tank|sau|btr|armored|vehicle/i.test(String(unit.type || '')));
  }
  function renderWinchInfo() {
    const box = document.getElementById('winchInfoBox');
    if (!box) return;
    const holder = units().find(u => u && u.winch && !u.isDestroyed) || null;
    const picked = selectedUnit();
    const selected = picked && picked.unit;
    const canGive = winchCandidate(selected);
    box.innerHTML = `<div class="op-winch-title">🏔️ Талреп-якорь · один на батальон <button type="button" class="op-winch-close" data-winch-action="close" aria-label="Закрыть">×</button></div>` +
      `<p>Техника с якорем поднимается на <b>1 горный гекс</b> за ход (подъём занимает весь ход). Два горных гекса подряд не проходятся.</p>` +
      `<p>Скрытный ход на холм стоит 2 ОД: за ход — минимум 1 гекс.</p>` +
      `<p><b>Рекомендация:</b> выдать объединённому отряду бронетехники (группе машин), чтобы якорь работал на всю колонну. Выдача другому отряду снимает якорь с прежнего.</p>` +
      `<p><b>Как назначить:</b> выберите на карте отряд техники (или объединённую группу), затем нажмите «Выдать выбранной технике».</p>` +
      `<p class="op-winch-holder">Сейчас у: <b>${holder ? esc(holder.name) : 'никого'}</b></p>` +
      `<div class="op-winch-actions"><button type="button" data-winch-action="give"${canGive ? '' : ' disabled'}>✅ Выдать ${selected ? '«' + esc(selected.name) + '»' : 'выбранной технике'}</button>` +
      (canGive || !selected ? '' : '<span class="op-winch-hint">Выбранный отряд — не техника</span>') + '</div>';
  }
  function showWinchInfo() {
    const box = document.getElementById('winchInfoBox');
    if (!box) return;
    box.hidden = false;
    renderWinchInfo();
  }
  function onWinchBoxClick(event) {
    const button = event.target && event.target.closest ? event.target.closest('[data-winch-action]') : null;
    if (!button) return;
    const action = button.getAttribute('data-winch-action');
    if (action === 'close') { const box = document.getElementById('winchInfoBox'); if (box) box.hidden = true; return; }
    if (action === 'give' && typeof window.grantWinchToSelected === 'function') {
      window.grantWinchToSelected();
      renderWinchInfo();
    }
  }

  function allUnitsPlaced() {
    const unplaced = (typeof getUnplacedOpUnits === 'function') ? getUnplacedOpUnits() :
      units().filter(u => u && !u.isDestroyed && u.col == null && !u.embarkedInBtr);
    return !unplaced.length;
  }
  function advanceSetup() {
    const c = campaign();
    if (!c) return;
    const stage = getStage();
    if (stage === 'placement') {
      if (!allUnitsPlaced()) {
        const count = (typeof getUnplacedOpUnits === 'function') ? getUnplacedOpUnits().length : 0;
        setMapMessage(`⚠️ Сначала разместите все отряды: осталось ${count}.`, '#e67e22');
        renderSetup();
        return;
      }
      markChecklist('place');
      setStage('fortifications');
      if (typeof setOpMapMode === 'function') setOpMapMode('view');
      setMapMessage('✅ Размещение подтверждено. Теперь этап ДОТов и талреп-якорей.', '#27ae60');
      return;
    }
    if (stage === 'fortifications') {
      const hasDots = c.playerFaction === 'BeVe' && typeof initialFortificationHexCount === 'function' && initialFortificationHexCount() > 0;
      if (hasDots && !(typeof initialFortificationComplete === 'function' && initialFortificationComplete())) {
        setMapMessage('🪖 Сначала завершите расстановку ДОТов: выберите оперативные гексы и клетки на картах ДОТов.', '#e67e22');
        try { if (typeof renderInitialFortificationStatus === 'function') renderInitialFortificationStatus(); } catch (e) {}
        renderSetup();
        return;
      }
      ensureHardMode();
      setStage('communications');
      setMapMessage('📡 Этап связи. Hard Mode включён автоматически; настройте связь через закреплённую кнопку.', '#3498db');
      return;
    }
    if (stage === 'communications') {
      ensureHardMode();
      const before = (typeof placementLocked !== 'undefined') && placementLocked;
      if (typeof state.originalFinishPlacement === 'function') state.originalFinishPlacement();
      if (typeof placementLocked !== 'undefined' && placementLocked && !before) {
        setStage('orders');
        markChecklist('communication');
        setMapMessage('✅ Этап связи завершён. Теперь выберите отряд на карте и нажмите «Приказ».', '#27ae60');
      } else {
        renderSetup();
      }
      return;
    }
  }
  function markChecklist(id) {
    try {
      const key = 'opOnboardingChecklist_v1';
      const obj = JSON.parse(localStorage.getItem(key) || '{}');
      obj[id] = true;
      localStorage.setItem(key, JSON.stringify(obj));
      if (typeof window.uxGatesRefresh === 'function') window.uxGatesRefresh();
    } catch (e) {}
  }

  function safeUnitIcon(unit) {
    const src = unit && unit.icon ? String(unit.icon) : '';
    return src ? `<img src="${esc(src)}" alt="">` : '<span aria-hidden="true">⚔️</span>';
  }

  function updatePlacementTray(force) {
    const tray = document.getElementById('opPlacementTray');
    if (!tray || getStage() !== 'placement') return;
    const list = units();
    const signature = list.map((u, i) => u ? `${i}:${u.name}:${u.col},${u.row}:${u.isDestroyed}:${u.embarkedInBtr}` : `${i}:_`).join('|');
    if (!force && signature === state.placementSignature) return;
    state.placementSignature = signature;
    const usable = list.map((u, i) => ({ u, i })).filter(x => x.u && !x.u.isDestroyed && !x.u.embarkedInBtr);
    const oldScroll = tray.querySelector('.op-placement-units');
    const scrollTop = oldScroll ? oldScroll.scrollTop : 0;
    const rows = placementRows(usable);
    tray.innerHTML = `<div class="op-placement-title">Перетащите отряд за ⠿ или за иконку на карте (в зелёную зону) · либо выберите карточку и кликните гекс</div>` +
      `<div class="op-placement-units">${rows.map(row => `<div class="op-placement-row">` +
        `<div class="op-placement-row-title">${esc(row.title)} <span>${row.items.length}</span></div>` +
        `<div class="op-placement-row-units">${row.items.map(({ u, i }) => placementButton(u, i)).join('')}</div></div>`).join('')}</div>`;
    const scroller = tray.querySelector('.op-placement-units');
    if (scroller) scroller.scrollTop = scrollTop;
  }
  function updatePlacementSelectionStyles() {
    const tray = document.getElementById('opPlacementTray');
    if (!tray || typeof tray.querySelectorAll !== 'function') return;
    tray.querySelectorAll('[data-op-place-unit]').forEach(button => {
      const selected = Number(button.getAttribute('data-op-place-unit')) === state.selectedUnitId;
      if (button.classList && typeof button.classList.toggle === 'function') button.classList.toggle('is-selected', selected);
      else button.className = String(button.className || '').replace(/\s+is-selected/g, '') + (selected ? ' is-selected' : '');
    });
  }

  function selectPlacementUnit(id) {
    const c = campaign();
    const unit = units()[Number(id)];
    if (!c || !unit || unit.isDestroyed) return false;
    state.selectedUnitId = Number(id);
    c.selectedOpUnit = unit;
    c.selectedPlaceUnitId = Number(id);
    const select = document.getElementById('opPlaceSelect');
    if (select) { select.value = String(id); }
    try { if (typeof updateDismountPanel === 'function') updateDismountPanel(); } catch (e) {}
    try { if (typeof updateBtrPanel === 'function') updateBtrPanel(); } catch (e) {}
    try { if (typeof updateVehiclePanel === 'function') updateVehiclePanel(); } catch (e) {}
    updatePlacementSelectionStyles(); // do not replace the dragged DOM node mid-pointer gesture
    try { if (typeof redrawOperationalMap === 'function') redrawOperationalMap(); } catch (e) {}
    setMapMessage(`Выбран «${unit.name}». Перетащите карточку на гекс или используйте список «Юнит».`, '#f1c40f');
    return true;
  }

  function installPlacementInteractions() {
    const tray = document.getElementById('opPlacementTray');
    const canvas = document.getElementById('opMapCanvas');
    if (!tray || tray.__opPlacementBound) return;
    tray.__opPlacementBound = true;
    tray.addEventListener('click', event => {
      const button = event.target && event.target.closest ? event.target.closest('[data-op-place-unit]') : null;
      if (!button) return;
      if (Date.now() - state.lastDragAt < 350) return;
      const id = Number(button.getAttribute('data-op-place-unit'));
      selectPlacementUnit(id);
      if (getStage() === 'placement' && !state.drag) {
        try { if (typeof setOpMapMode === 'function') setOpMapMode('placePlayer'); } catch (e) {}
      }
    });
    tray.addEventListener('pointerdown', event => {
      const button = event.target && event.target.closest ? event.target.closest('[data-op-place-unit]') : null;
      if (!button || getStage() !== 'placement' || event.button > 0 ||
          (event.pointerType === 'touch' && !event.target.closest('[data-op-drag-handle]'))) return;
      const id = Number(button.getAttribute('data-op-place-unit'));
      if (!selectPlacementUnit(id)) return;
      try { if (typeof setOpMapMode === 'function') setOpMapMode('placePlayer'); } catch (e) {}
      state.drag = { id, x: event.clientX, y: event.clientY, moved: false };
      try { event.preventDefault(); } catch (e) {}
      const ghost = document.createElement('div');
      ghost.className = 'op-placement-ghost';
      ghost.textContent = (units()[id] && units()[id].name) || 'Отряд';
      ghost.dataset.opPlacementGhost = '1';
      document.body.appendChild(ghost);
      movePlacementGhost(event.clientX, event.clientY);
    });
    document.addEventListener('pointermove', event => {
      if (!state.drag) return;
      if (Math.hypot(event.clientX - state.drag.x, event.clientY - state.drag.y) > 7) state.drag.moved = true;
      if (state.drag.moved) movePlacementGhost(event.clientX, event.clientY);
    }, { passive: true });
    document.addEventListener('pointerup', event => {
      const drag = state.drag;
      if (!drag) return;
      state.drag = null;
      removePlacementGhost();
      if (!drag.moved || !canvas || getStage() !== 'placement') return;
      const rect = canvas.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
      state.lastDragAt = Date.now();
      try { if (typeof setOpMapMode === 'function') setOpMapMode('placePlayer'); } catch (e) {}
      const select = document.getElementById('opPlaceSelect');
      if (select) select.value = String(drag.id);
      selectPlacementUnit(drag.id);
      if (typeof handleOpMapClick === 'function') handleOpMapClick({ clientX: event.clientX, clientY: event.clientY });
      updatePlacementTray(true);
    }, { passive: true });
    document.addEventListener('pointercancel', () => { state.drag = null; removePlacementGhost(); }, { passive: true });
  }
  function movePlacementGhost(x, y) {
    const ghost = document.querySelector('[data-op-placement-ghost]');
    if (!ghost) return;
    ghost.style.left = `${Math.round(x + 12)}px`;
    ghost.style.top = `${Math.round(y + 12)}px`;
  }
  function removePlacementGhost() {
    const ghost = document.querySelector('[data-op-placement-ghost]');
    if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
  }

  function formatMinuteInput(minute) {
    let n = Number(minute);
    if (!Number.isFinite(n)) n = 0;
    n = ((Math.round(n / 10) * 10) % 1440 + 1440) % 1440;
    return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
  }
  function parseMinuteInput(value) {
    const parts = String(value || '').split(':');
    if (parts.length !== 2) return null;
    const h = Number(parts[0]), m = Number(parts[1]);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return ((Math.round((h * 60 + m) / 10) * 10) % 1440 + 1440) % 1440;
  }
  function currentTimeValue() {
    const c = campaign();
    const t = c && Number.isFinite(Number(c.currentTime)) ? Number(c.currentTime) : 0;
    return formatMinuteInput(t);
  }
  function contactOptions(selected) {
    const list = [
      ['ignore', 'Игнорировать'],
      ['hold', 'Закрепиться и ждать · огонь с 1 гекса'],
      ['engage', 'Обстрелять'],
      ['assault', 'Штурмовать'],
      ['skirmish', 'Обходить · держать около 2 гексов'],
      ['retreat', 'Отойти на 3 гекса']
    ];
    return list.map(([value, label]) => `<option value="${value}"${selected === value ? ' selected' : ''}>${label}</option>`).join('');
  }
  function contactField(selected) {
    return `<label class="op-cmd-field">При контакте с врагом в радиусе 2 гексов` +
      `<select data-draft-field="behavior">${contactOptions(selected || 'hold')}</select></label>`;
  }
  function timeField(value) {
    return `<label class="op-cmd-field">Время начала` +
      `<input type="time" step="600" data-draft-field="time" value="${esc(value || currentTimeValue())}"></label>`;
  }
  function routeLabel(points) {
    if (!points || !points.length) return 'Маршрут не задан';
    return points.map((p, i) => `${i + 1}. (${p.col},${p.row})`).join(' → ');
  }
  function pointPicker(label, kind) {
    return `<button type="button" class="op-cmd-wide" data-cmd="pick-map" data-pick="${kind}">📍 ${label}</button>`;
  }
  function mapPickHint() {
    if (!state.mapPick) return '';
    const map = { route: 'Кликайте по гексам по порядку; повторный клик по последней точке снимает её.',
      target: 'Кликните по целевому гексу на карте.', sector: 'Кликайте по гексам, которые нужно контролировать; повторный клик удаляет точку.',
      ambush: 'Кликните по гексу, где отряд должен устроить засаду.', prep: 'Кликните по гексу, который нужно расчистить.',
      special: 'Кликните по гексу, где отряд выполнит действие.' };
    return `<div class="op-cmd-note">🗺️ ${map[state.mapPick] || 'Выберите гекс на карте.'}</div>`;
  }
  function enemyOptions(selectedId) {
    const c = campaign();
    return ((c && c.enemyOpUnits) || []).map((enemy, id) => {
      if (!enemy || enemy.isDestroyed || enemy.col == null || enemy.row == null || enemy.hidden) return '';
      if (c.online && typeof onlineEnemyVisible === 'function' && !onlineEnemyVisible(enemy)) return '';
      return `<option value="${id}"${Number(selectedId) === id ? ' selected' : ''}>${esc(enemy.name)} (${enemy.col},${enemy.row})</option>`;
    }).join('');
  }
  // ⚡ v13.088 (пункт 4): сопровождать можно ЛЮБОЙ отряд — пехоту и технику.
  //    Исключаются уничтоженные, скрытые, сидящие в БТР и сам сопровождающий.
  function escortTargetOptions(selectedId, excludeId) {
    const list = units();
    return list.map((unit, id) => {
      if (!unit || unit.isDestroyed || unit.col == null || unit.hidden || unit.embarkedInBtr) return '';
      if (excludeId != null && Number(excludeId) === id) return '';
      const kind = (typeof isVehicleMobilityUnit === 'function' && isVehicleMobilityUnit(unit)) ? 'техника' : 'пехота';
      return `<option value="${id}"${Number(selectedId) === id ? ' selected' : ''}>${esc(unit.name)} · ${kind} (${unit.col},${unit.row})</option>`;
    }).join('');
  }
  function infantryOptions(selectedId) {
    return escortTargetOptions(selectedId, null);
  }

  function btrOptions(passenger, selectedId) {
    const list = units();
    const required = (typeof getUnitBtrRequirement === 'function') ? getUnitBtrRequirement(passenger) : 1;
    return list.map((unit, id) => {
      const isBtr = unit && (unit.type === 'btr_platoon' || /БТР/i.test(String(unit.name || '')));
      if (!isBtr || unit === passenger || unit.isDestroyed || unit.col == null || unit.hidden) return '';
      if (unit.embarkedUnit || unit.embarkedUnitId != null || (Array.isArray(unit.embarkedUnitIds) && unit.embarkedUnitIds.length)) return '';
      const seats = unit.isGroup && unit.groupSize ? unit.groupSize : 1;
      if (seats < required) return '';
      const same = unit.col === passenger.col && unit.row === passenger.row;
      return `<option value="${id}"${Number(selectedId) === id ? ' selected' : ''}>${esc(unit.name)} · ${seats} мест · (${unit.col},${unit.row})${same ? ' · на этом гексе' : ''}</option>`;
    }).join('');
  }
  // ⚡ v13.088 (пункт 3): есть ли у отряда неотработанный приказ «Сесть в БТР»
  //    (отдельный приказ или шаг серии) — тогда «Выйти из БТР» уже доступен.
  function pendingEmbarkOrder(unit) {
    const id = units().indexOf(unit);
    if (id < 0 || typeof getAllOrdersList !== 'function') return null;
    return getAllOrdersList().find(order => {
      if (!order || order.status === 'cancelled' || order.status === 'completed') return false;
      const recipients = order.type === 'company_order'
        ? (Array.isArray(order.subUnitIdsAll) ? order.subUnitIdsAll : order.subUnitIds || [])
        : [order.toUnitId];
      if (!recipients.some(x => Number(x) === Number(id))) return false;
      const type = order.type === 'company_order' ? order.orderType : order.type;
      if (type === 'embark') return true;
      return Array.isArray(order.series) &&
        order.series.some(step => step && step.type === 'embark' && step.status !== 'completed' && step.status !== 'cancelled');
    }) || null;
  }
  // ⚡ v13.089 (пункт 3): кто ещё только садится в эту машину (приказ посадки
  //    отдан, но не выполнен) — таким машинам высадка уже доступна.
  function incomingPassengersOf(carrier) {
    const id = units().indexOf(carrier);
    if (id < 0 || typeof getAllOrdersList !== 'function') return [];
    const out = [];
    getAllOrdersList().forEach(order => {
      if (!order || order.status === 'cancelled' || order.status === 'completed') return;
      const steps = Array.isArray(order.series) && order.series.length ? order.series : [order];
      steps.forEach(step => {
        if (!step || step.status === 'completed' || step.status === 'cancelled') return;
        const type = step.type === 'company_order' ? step.orderType : step.type;
        if (type !== 'embark') return;
        if (Number(step.btrUnitId) !== Number(id)) return;
        const who = Number(order.toUnitId);
        if (Number.isInteger(who) && !out.includes(who)) out.push(who);
      });
    });
    return out;
  }
  function canIssueSpecial(unit, action) {
    if (!unit) return false;
    if (action === 'recon') return !(typeof isStaticOpUnit === 'function' && isStaticOpUnit(unit));
    if (action === 'dig_in' || action === 'prep_positions') return !(typeof isVehicleMobilityUnit === 'function' && isVehicleMobilityUnit(unit)) && !(typeof isStaticOpUnit === 'function' && isStaticOpUnit(unit));
    if (action === 'dismount') return (unit.mobility === 'bicycle' || unit.mobility === 'motorcycle') && !unit.dismounted;
    if (action === 'remount') return !!unit.dismounted;
    if (action === 'embark') return !unit.embarkedInBtr && !unit.hidden && unit.col != null &&
      !/БТР|танк|САУ|ДОТ|Бронеавтомобиль/i.test(String(unit.name || ''));
    if (action === 'disembark') {
      if (unit.embarkedInBtr || pendingEmbarkOrder(unit)) return true;
      if (!(unit.type === 'btr_platoon' || /БТР/i.test(String(unit.name || '')))) return false;
      const aboard = !!unit.embarkedUnit || !!(unit.embarkedUnitIds && unit.embarkedUnitIds.length) ||
        !!(unit.isGroup && unit.vehicleList && unit.vehicleList.some(v => v && v.embarkedUnit));
      // ⚡ v13.089 (пункт 3): десант может ещё только идти к машине — приказ
      //    «доехать и высадить» отдаётся заранее, БТР дождётся посадки.
      return aboard || incomingPassengersOf(unit).length > 0;
    }
    return true;
  }

  function selectedUnit() {
    const c = campaign();
    if (!c) return null;
    // The map's live selection wins over a cached menu id, so changing units
    // after closing/reopening the order menu never issues an order to the old unit.
    const hasSelection = !!c.selectedOpUnit;
    const selectedId = hasSelection ? units().indexOf(c.selectedOpUnit) : -1;
    const id = hasSelection ? selectedId : (state.selectedUnitId != null ? Number(state.selectedUnitId) : -1);
    return { unit: units()[id] || null, id };
  }
  function openCommandMenu() {
    if (!campaign() || !activeMap()) return;
    if (!isOnlineTurn()) { setMapMessage('⏳ Ход оппонента — карта доступна только для просмотра.', '#999'); return; }
    const picked = selectedUnit();
    if (!picked.unit || picked.id < 0) {
      state.menuOpen = false;
      renderCommandMenu();
      setMapMessage('Сначала выберите свой отряд кликом по карте, затем нажмите «Приказ».', '#e67e22');
      return;
    }
    if (picked.unit.isDestroyed || (picked.unit.hidden && !picked.unit.embarkedInBtr) || picked.unit.isInBattle) {
      setMapMessage('Этот отряд сейчас не может получать оперативные приказы.', '#e67e22');
      return;
    }
    state.selectedUnitId = picked.id;
    state.menuOpen = true;
    state.menuPage = 'main';
    state.draft = null;
    state.error = '';
    renderCommandMenu();
  }
  function closeCommandMenu(clearRoute) {
    state.menuOpen = false;
    state.menuPage = 'main';
    state.draft = null;
    state.mapPick = null;
    state.error = '';
    if (clearRoute) clearRoutePreview();
    renderCommandMenu();
    renderPinnedActions(); // ⚡ v13.088 (пункт 8): панель возвращается после приказа/закрытия
  }
  function clearRoutePreview() {
    if (typeof orderWaypoints !== 'undefined') orderWaypoints = [];
    if (typeof isPlanningRoute !== 'undefined') isPlanningRoute = false;
    window.uxOrderRouteUnitId = null;
    try { if (typeof redrawOperationalMap === 'function') redrawOperationalMap(); } catch (e) {}
  }
  function goBack() {
    if (state.mapPick) {
      state.mapPick = null;
      if (state.draft && Array.isArray(state.draft.waypoints)) state.draft.waypoints = [];
      if (state.draft && Array.isArray(state.draft.targetHexes)) state.draft.targetHexes = [];
      clearRoutePreview();
    }
    state.menuPage = 'main';
    state.draft = null;
    state.error = '';
    renderCommandMenu();
  }
  function beginDraft(category, mode) {
    const picked = selectedUnit();
    if (!picked.unit || picked.id < 0) return;
    const specialActions = ['dig_in', 'prep_positions', 'embark', 'disembark', 'dismount', 'remount'];
    const firstSpecial = category === 'special'
      ? (specialActions.find(action => canIssueSpecial(picked.unit, action)) || 'dig_in') : '';
    state.draft = {
      category, mode: mode || '', behavior: category === 'ambush' ? 'ignore' : 'hold',
      time: currentTimeValue(), waypoints: [], targetHex: '', targetHexes: [],
      targetEnemyId: '', targetDistance: 3, escortInfantryId: '', btrUnitId: '',
      specialAction: firstSpecial
    };
    state.menuPage = 'details';
    state.error = '';
    renderCommandMenu();
  }

  function renderMain(unit, id) {
    const passenger = !!unit.embarkedInBtr;
    const artillery = !passenger && unit && (unit.type === 'battalion_hq' || unit.type === 'hq') &&
      typeof canIssueArtilleryStrike === 'function' && canIssueArtilleryStrike();
    const artilleryLeft = campaign() ? 4 - (Number(campaign().artilleryStrikesUsed) || 0) : 0;
    const carried = passenger ? null : passengerOf(unit);
    return `<div class="op-cmd-head"><div><div class="op-cmd-title">${esc(unit.name)}</div>` +
      `<div class="op-cmd-subtitle">${passenger ? 'Десант в БТР · выберите приказ' : 'Выберите тип приказа'}</div></div><button type="button" class="op-cmd-close" data-cmd="close" aria-label="Закрыть">×</button></div>` +
      `<div class="op-cmd-buttons">` +
      `<button type="button" data-cmd="category" data-category="move">🚶 Движение</button>` +
      (passenger ? '' : `<button type="button" data-cmd="category" data-category="fire">🎯 Обстрел</button>`) +
      `<button type="button" data-cmd="category" data-category="special">⚙️ Специальное</button>` +
      (artillery ? `<button type="button" class="op-cmd-wide" data-cmd="artillery">💣 Арт. обстрел · осталось ${Math.max(0, artilleryLeft)}</button>` : '') +
      (carried ? `<button type="button" class="op-cmd-wide" data-cmd="select-passenger" data-id="${carried.id}">👥 Приказы десанту: ${esc(carried.unit.name)}</button>` : '') +
      `</div><div class="op-cmd-note">${passenger
        ? 'Отряд сидит в БТР: сначала он выходит на гекс машины, затем выполняет приказ. Стрельба из машины недоступна.'
        : 'Время по умолчанию — текущее время операции. Приказ поступит по штатной связи штаба батальона.'}</div>`;
  }
  function renderDetails(unit, draft) {
    const head = `<div class="op-cmd-head"><div><div class="op-cmd-title">${esc(unit.name)}</div>` +
      `<div class="op-cmd-subtitle">${draft.category === 'move' ? 'Движение' : ['specific','fire_at_will','armor_priority','sector_fire','ambush','artillery'].includes(draft.category) ? 'Обстрел' : 'Специальное действие'}</div></div>` +
      `<button type="button" data-cmd="close" aria-label="Закрыть">×</button></div>`;
    const back = `<button type="button" data-cmd="back" class="op-cmd-back">← Назад к типам приказа</button>`;
    let body = '';

    if (draft.category === 'move') {
      // ⚡ v13.088 (пункт 4): «Сопровождение» — любому отряду, за любым отрядом.
      body += `<label class="op-cmd-field">Способ движения<select data-draft-field="moveMode">` +
        `<option value="simple"${draft.mode === 'simple' ? ' selected' : ''}>Простое</option>` +
        `<option value="stealth"${draft.mode === 'stealth' ? ' selected' : ''}>Скрытное</option>` +
        `<option value="escort"${draft.mode === 'escort' ? ' selected' : ''}>Сопровождение</option></select></label>`;
      if (draft.mode === 'escort') {
        body += `<label class="op-cmd-field">Кого сопровождать<select data-draft-field="escortInfantryId"><option value="">Выберите отряд</option>${escortTargetOptions(draft.escortInfantryId, units().indexOf(unit))}</select></label>` +
          `<div class="op-cmd-note">Отряд идёт вместе с выбранным и повторяет все его приказы (движение, обстрел, специальные действия).</div>`;
      }
      body += contactField(draft.behavior) + timeField(draft.time) +
        `<div class="op-cmd-note">Маршрут: ${esc(routeLabel(draft.waypoints))}</div>` +
        pointPicker('Выбрать маршрут на карте', 'route') +
        `<button type="button" class="op-cmd-wide" data-cmd="clear-route">Очистить маршрут</button>`;
      if (state.mapPick === 'route') body += mapPickHint();
    } else if (draft.category === 'specific') {
      body += `<label class="op-cmd-field">Конкретная цель<select data-draft-field="targetEnemyId"><option value="">Выберите обнаруженного врага</option>${enemyOptions(draft.targetEnemyId)}</select></label>` +
        `<div class="op-cmd-note">Отряд будет следить за выбранной целью и обстреляет её, когда она окажется в дальности оружия.</div>` +
        contactField(draft.behavior) + timeField(draft.time);
    } else if (draft.category === 'fire_at_will' || draft.category === 'armor_priority') {
      body += `<label class="op-cmd-field">Дальность огня<select data-draft-field="targetDistance">` +
        [1, 2, 3, 4, 5].map(n => `<option value="${n}"${Number(draft.targetDistance) === n ? ' selected' : ''}>${n} гекс${n === 1 ? '' : n < 5 ? 'а' : 'ов'}</option>`).join('') +
        `</select></label><div class="op-cmd-note">${draft.category === 'armor_priority' ? 'ПТО автоматически выбирает ближайшую бронетехнику; если цели нет, приказ ждёт её появления.' : 'Приказ остаётся активным и открывает огонь по обнаруженному противнику.'}</div>` +
        contactField(draft.behavior) + timeField(draft.time);
    } else if (draft.category === 'sector_fire') {
      body += `<div class="op-cmd-note">Контролируемые гексы: ${esc(routeLabel(draft.targetHexes))}</div>` +
        pointPicker('Добавить гекс для контроля', 'sector') +
        `<label class="op-cmd-field">Дальность огня<select data-draft-field="targetDistance">` +
        [1, 2, 3, 4, 5].map(n => `<option value="${n}"${Number(draft.targetDistance) === n ? ' selected' : ''}>${n} гекс.</option>`).join('') + `</select></label>` +
        contactField(draft.behavior) + timeField(draft.time);
      if (state.mapPick === 'sector') body += mapPickHint();
    } else if (draft.category === 'ambush') {
      body += `<div class="op-cmd-note">Засада даёт бонус скрытности и не раскрывается обычной разведкой; при контакте — «Игнорировать».</div>` +
        `<div class="op-cmd-note">Гекс засады: ${esc(draft.targetHex || 'не выбран')}</div>` +
        pointPicker('Выбрать гекс засады', 'ambush') + timeField(draft.time);
      if (state.mapPick === 'ambush') body += mapPickHint();
    } else if (draft.category === 'special') {
      const actions = [
        ['dig_in', '🕳️ Окопаться'], ['recon', '🔍 Разведка'], ['prep_positions', '🪓 Расчистка местности'],
        ['embark', '🚌 Сесть в БТР'],
        // ⚡ v13.089 (пункт 3): машине — «высадить десант», десанту — «выйти из БТР»
        ['disembark', (isBtrUnit(unit) && !unit.embarkedInBtr) ? '🚌 Высадить десант' : '🚶 Выйти из БТР'],
        ['dismount', '🚲 Спешиться'], ['remount', '🚴 Сесть на велосипеды']
      ];
      body += `<label class="op-cmd-field">Действие<select data-draft-field="specialAction">` +
        actions.map(([value, label]) => `<option value="${value}"${draft.specialAction === value ? ' selected' : ''}${canIssueSpecial(unit, value) ? '' : ' disabled'}>${label}</option>`).join('') + `</select></label>`;
      if (unit.embarkedInBtr) {
        body += `<div class="op-cmd-note">Отряд сидит в БТР. Действие выполняется после выхода: сначала он высаживается на гекс машины, затем выполняет выбранное действие.</div>`;
      }
      if (['dig_in', 'recon', 'prep_positions'].includes(draft.specialAction)) {
        const hexKey = draft.targetHex || unitHexKey(unit);
        body += `<div class="op-cmd-note">Гекс выполнения: <b>${esc(hexKey || 'не выбран')}</b>${draft.targetHex ? '' : ' (по умолчанию — текущий гекс)'}. Отряд подойдёт к нему и выполнит действие.</div>` +
          pointPicker('Выбрать гекс на карте', 'special');
      }
      if (draft.specialAction === 'embark') {
        body += `<label class="op-cmd-field">БТР для посадки<select data-draft-field="btrUnitId"><option value="">Выберите БТР</option>${btrOptions(unit, draft.btrUnitId)}</select></label>` +
          `<div class="op-cmd-note">Отряд подойдёт к выбранной машине и сядет в неё, даже если она стоит на другом гексе.</div>`;
      }
      if (draft.specialAction === 'disembark') {
        // ⚡ v13.088/089 (пункт 3): гекс высадки выбирается на карте, приказ уходит БТР
        const hexKey = draft.targetHex || unitHexKey(unit);
        body += `<div class="op-cmd-note">Гекс высадки: <b>${esc(hexKey || 'не выбран')}</b>${draft.targetHex ? '' : ' (по умолчанию — гекс машины)'}. ` +
          `Если этого гекса нет в маршруте БТР, маршрут дополняется им: машина в любом случае доедет до точки высадки.</div>` +
          pointPicker('Выбрать гекс высадки', 'special');
        body += `<div class="op-cmd-note">Приказ получит БТР: доедет до гекса, выпустит отряд и продолжит свои приказы. ` +
          `Высаженный отряд дальше выполняет свою серию приказов.</div>`;
        if (state.mapPick === 'special') body += mapPickHint();
      }
      body += contactField(draft.behavior) + timeField(draft.time);
    } else if (draft.category === 'artillery') {
      body += `<div class="op-cmd-note">Штаб батальона назначит доступный артиллерийский обстрел. Поддержка при старте обязательна; максимум — 4 за кампанию. Приказ сработает не раньше следующего хода.</div>` +
        `<div class="op-cmd-note">Целевой гекс: ${esc(draft.targetHex || 'не выбран')}</div>` +
        pointPicker('Выбрать гекс обстрела', 'target') + timeField(draft.time);
      if (state.mapPick === 'target') body += mapPickHint();
    }

    const submitText = draft.category === 'move' ? '✅ Отдать приказ' :
      draft.category === 'artillery' ? '💣 Назначить обстрел' : '✅ Отдать приказ';
    return head + back + `<div class="op-cmd-form">${body}</div>` +
      (state.error ? `<div class="op-cmd-error">${esc(state.error)}</div>` : '') +
      `<div class="op-cmd-buttons"><button type="button" class="op-cmd-wide" data-cmd="submit">${submitText}</button></div>`;
  }

  function renderCommandMenu() {
    const host = document.getElementById('opCommandMenu');
    if (!host) return;
    if (!state.menuOpen || !activeMap()) { host.style.display = 'none'; host.innerHTML = ''; renderPickBar(); return; }
    const picked = selectedUnit();
    const unit = state.draft && state.draft.category === 'artillery' ?
      (units()[findBattalionHq()] || picked.unit) : picked.unit;
    if (!unit) { host.style.display = 'none'; renderPickBar(); return; }
    // ⚡ v13.087: пока выбирается маршрут или гекс, меню не перекрывает карту
    if (state.mapPick) { host.style.display = 'none'; renderPickBar(); return; }
    host.innerHTML = state.menuPage === 'main' ? renderMain(unit, picked.id) : renderDetails(unit, state.draft || {});
    host.style.display = 'block';
    // ⚡ v13.088 (пункт 8): убираем закреплённую панель на время выбора приказа
    const quick = document.getElementById('opQuickActions');
    if (quick) { quick.classList.add('op-quick-menu-open'); quick.style.display = 'none'; }
    positionUnitActions();
    renderPickBar();
  }
  function unitAnchor() {
    const picked = selectedUnit();
    let unit = picked && picked.unit;
    if (unit && unit.embarkedInBtr) unit = carrierOf(unit) || unit;
    const canvas = document.getElementById('opMapCanvas');
    const viewport = document.getElementById('opMapContainer');
    if (!unit || !canvas || !viewport || unit.col == null || unit.row == null || unit.isDestroyed) return null;
    const zoom = campaign().opZoomLevel || 1;
    const size = (typeof OP_HEX_SIZE === 'number' ? OP_HEX_SIZE : 40) * zoom;
    let x = unit.col * Math.sqrt(3) * size + (unit.row % 2) * Math.sqrt(3) * size / 2 + Math.sqrt(3) * size / 2;
    let y = unit.row * 1.5 * size + size;
    const group = units().filter(u => u && !u.isDestroyed && u.col === unit.col && u.row === unit.row);
    if (group.length > 1) {
      const index = group.indexOf(unit);
      const spread = Math.max(25 * zoom, (36 * zoom + 4 * zoom) / (2 * Math.sin(Math.PI / group.length)));
      x += Math.cos(index * 2 * Math.PI / group.length) * spread;
      y += Math.sin(index * 2 * Math.PI / group.length) * spread;
    }
    const rect = canvas.getBoundingClientRect();
    const scale = (typeof canvasBackingScale === 'function') ? canvasBackingScale(canvas) : 1;
    const px = rect.left + x * rect.width / (canvas.width / scale);
    const py = rect.top + y * rect.height / (canvas.height / scale);
    const map = viewport.getBoundingClientRect();
    if (px < map.left || px > map.right || py < map.top || py > map.bottom) return null;
    return { x: px, y: py, radius: 22 * zoom * rect.width / (canvas.width / scale) };
  }
  function positionUnitActions() {
    const bar = document.getElementById('opQuickActions');
    const menu = document.getElementById('opCommandMenu');
    if (!bar || !activeMap()) return;
    const anchor = getStage() === 'orders' ? unitAnchor() : null;
    bar.classList.toggle('op-unit-anchored', !!anchor);
    const order = bar.querySelector('[data-quick-action="order"]');
    if (order) order.style.display = anchor && isOnlineTurn() ? '' : 'none';
    if (!anchor) {
      const dh = dockHeight();
      bar.style.left = '50%'; bar.style.top = 'auto'; bar.style.bottom = dh ? `${dh + 8}px` : 'max(8px, env(safe-area-inset-bottom))';
      bar.style.transform = 'translateX(-50%)';
      if (menu && menu.style.display === 'block') menu.style.display = 'none';
      return;
    }
    const width = Math.min(bar.offsetWidth || 290, window.innerWidth - 16);
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, anchor.x - width / 2));
    const barHeight = bar.offsetHeight || 45;
    const above = anchor.y - anchor.radius - barHeight - 8;
    const top = above >= 8 ? above : Math.min(window.innerHeight - barHeight - 8, anchor.y + anchor.radius + 8);
    bar.style.left = `${left}px`; bar.style.top = `${top}px`; bar.style.bottom = 'auto';
    bar.style.transform = 'none';
    if (menu && state.menuOpen && !state.mapPick) {
      menu.style.display = 'block';
      const menuWidth = Math.min(menu.offsetWidth || 330, window.innerWidth - 16);
      menu.style.left = `${Math.max(8, Math.min(window.innerWidth - menuWidth - 8, anchor.x - menuWidth / 2))}px`;
      const aboveSpace = Math.max(0, top - 14);
      const belowSpace = Math.max(0, window.innerHeight - top - barHeight - 14);
      const placeAbove = aboveSpace >= Math.min(menu.scrollHeight || 220, 180) || aboveSpace >= belowSpace;
      menu.style.maxHeight = `${Math.max(80, Math.min(560, placeAbove ? aboveSpace : belowSpace))}px`;
      const height = menu.offsetHeight || 220;
      menu.style.top = `${placeAbove ? Math.max(8, top - height - 6) : Math.min(window.innerHeight - height - 8, top + barHeight + 6)}px`;
    }
  }
  function renderPinnedActions() {
    const bar = document.getElementById('opQuickActions');
    const c = campaign();
    if (!bar) return;
    // ⚡ v13.088 (пункт 8): пока открыто меню приказа, панель «Связь / Приказ /
    //    Снабжение» убрана — она не должна перекрывать карту. Вернётся, когда
    //    приказ отдан или меню закрыто.
    const show = !!(c && c.active && activeMap()) && !state.menuOpen;
    bar.style.display = show ? 'flex' : 'none';
    const stage = getStage();
    const comm = bar.querySelector('[data-quick-action="communication"]');
    const order = bar.querySelector('[data-quick-action="order"]');
    const supply = bar.querySelector('[data-quick-action="supply"]');
    if (comm) comm.style.display = ['communications', 'orders'].includes(stage) ? '' : 'none';
    if (order) order.style.display = 'none'; // shown only next to a selected map unit
    if (supply) supply.style.display = stage === 'orders' ? '' : 'none';
    // ⚡ v13.088 (пункт 6): «📦 Объединить технику» — в этой же закреплённой панели.
    //    Видимость держит updateVehiclePanel() (нужна выбранная техника).
    try { if (typeof updateVehiclePanel === 'function' && show) updateVehiclePanel(); } catch (e) {}
    const merge = bar.querySelector('[data-quick-action="merge"]');
    if (merge && !show) merge.style.display = 'none';
    if (show) positionUnitActions();
  }

  function setCategory(category) {
    const picked = selectedUnit();
    if (!picked.unit) return;
    if (category === 'move') beginDraft('move', 'simple');
    else if (category === 'fire') {
      state.menuPage = 'fire';
      state.draft = null;
      renderFireChoices(picked.unit);
    } else if (category === 'special') beginDraft('special', '');
  }
  function renderFireChoices(unit) {
    const host = document.getElementById('opCommandMenu');
    if (!host) return;
    const hq = (unit.type === 'battalion_hq' || unit.type === 'hq') &&
      typeof canIssueArtilleryStrike === 'function' && canIssueArtilleryStrike();
    const hasAntiTank = typeof hasAtGunWeapons === 'function' && hasAtGunWeapons(unit);
    host.innerHTML = `<div class="op-cmd-head"><div><div class="op-cmd-title">${esc(unit.name)}</div><div class="op-cmd-subtitle">Выберите вид огня</div></div><button type="button" data-cmd="close" aria-label="Закрыть">×</button></div>` +
      `<div class="op-cmd-buttons">` +
      `<button type="button" data-cmd="fire-kind" data-kind="specific">🎯 Конкретная цель</button>` +
      `<button type="button" data-cmd="fire-kind" data-kind="fire_at_will">🔥 Огонь по готовности</button>` +
      `<button type="button" data-cmd="fire-kind" data-kind="armor_priority"${hasAntiTank ? '' : ' disabled title="Доступно только отрядам с ПТО"'}>🛡️ Приоритет бронетехники для ПТ</button>` +
      `<button type="button" data-cmd="fire-kind" data-kind="sector_fire">🧭 Контролировать выбранные гексы</button>` +
      `<button type="button" data-cmd="fire-kind" data-kind="ambush">🥷 Засада в гексе</button>` +
      (hq ? `<button type="button" class="op-cmd-wide" data-cmd="artillery">💣 Арт. обстрел</button>` : '') +
      `</div><button type="button" class="op-cmd-back" data-cmd="back">← Назад</button>`;
    host.style.display = 'block';
  }

  function startFireKind(kind) {
    const mapping = {
      specific: 'specific', fire_at_will: 'fire_at_will', armor_priority: 'armor_priority',
      sector_fire: 'sector_fire', ambush: 'ambush'
    };
    if (!mapping[kind]) return;
    beginDraft(mapping[kind], kind);
    if (kind === 'ambush') state.draft.behavior = 'ignore';
  }
  function applyDraftField(field, value) {
    const draft = state.draft;
    if (!draft) return;
    if (field === 'moveMode') draft.mode = value;
    else if (field === 'targetDistance') draft.targetDistance = Math.max(1, Math.min(10, Number(value) || 3));
    else if (field === 'time') draft.time = value;
    else if (field === 'behavior') draft.behavior = value;
    else if (field === 'specialAction') { draft.specialAction = value; draft.btrUnitId = ''; draft.targetHex = ''; }
    else if (field === 'escortInfantryId') draft.escortInfantryId = value;
    else if (field === 'btrUnitId') draft.btrUnitId = value;
    else if (field === 'targetEnemyId') draft.targetEnemyId = value;
  }
  function startMapPick(kind) {
    if (!state.draft) return;
    state.mapPick = kind;
    state.error = '';
    if (kind === 'route') {
      state.draft.waypoints = [];
      if (typeof orderWaypoints !== 'undefined') orderWaypoints = [];
      window.uxOrderRouteUnitId = state.selectedUnitId;
      if (typeof isPlanningRoute !== 'undefined') isPlanningRoute = true;
    }
    if (kind === 'sector') state.draft.targetHexes = state.draft.targetHexes || [];
    renderCommandMenu();
    setMapMessage(kind === 'route' ? '🗺️ Добавляйте маршрутные гексы кликами по карте.' : '🗺️ Выберите целевой гекс на карте.', '#f1c40f');
  }
  function closestMapHex(event) {
    const canvas = document.getElementById('opMapCanvas');
    if (!canvas || !campaign()) return null;
    const rect = canvas.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return null;
    const dpr = (typeof canvasBackingScale === 'function') ? canvasBackingScale(canvas) : (window.devicePixelRatio || 1);
    const scaleX = (canvas.width / dpr) / Math.max(1, rect.width);
    const scaleY = (canvas.height / dpr) / Math.max(1, rect.height);
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;
    const size = (typeof OP_HEX_SIZE === 'number' ? OP_HEX_SIZE : 40) * (campaign().opZoomLevel || 1);
    let best = null, bestDistance = Infinity;
    (campaign().opCenters || []).forEach(center => {
      const distance = Math.hypot(x - center.x, y - center.y);
      if (distance < bestDistance) { bestDistance = distance; best = center; }
    });
    if (!best || bestDistance >= size) return null;
    const [col, row] = best.key.split(',').map(Number);
    if (typeof isHexInPlayableArea === 'function' && !isHexInPlayableArea(campaign().scenario, col, row)) return null;
    return { col, row };
  }
  function handleQuickMapPick(event) {
    if (!state.mapPick || !state.menuOpen) return false;
    if (!isOnlineTurn()) { setMapMessage('⏳ Ход оппонента — подождите.', '#999'); return true; }
    const hex = closestMapHex(event);
    if (!hex) { setMapMessage('Кликните по гексу внутри игровой карты.', '#e67e22'); return true; }
    const draft = state.draft;
    const key = `${hex.col},${hex.row}`;
    if (state.mapPick === 'route') {
      const points = draft.waypoints || (draft.waypoints = []);
      const last = points[points.length - 1];
      if (last && last.col === hex.col && last.row === hex.row) points.pop();
      else if (!points.some(p => p.col === hex.col && p.row === hex.row)) points.push(hex);
      if (typeof orderWaypoints !== 'undefined') orderWaypoints = points.slice();
      window.uxOrderRouteUnitId = state.selectedUnitId;
      if (typeof isPlanningRoute !== 'undefined') isPlanningRoute = true;
      setMapMessage(`📍 Маршрут: ${routeLabel(points)}`, '#f1c40f');
    } else if (state.mapPick === 'sector') {
      const hexes = draft.targetHexes || (draft.targetHexes = []);
      const at = hexes.findIndex(p => p.col === hex.col && p.row === hex.row);
      if (at >= 0) hexes.splice(at, 1); else hexes.push(hex);
      setMapMessage(`🧭 Гексов под контролем: ${hexes.length}.`, '#f1c40f');
    } else {
      draft.targetHex = key;
      state.mapPick = null;
      setMapMessage(`🎯 Выбран гекс (${key}).`, '#f1c40f');
    }
    state.error = '';
    renderCommandMenu();
    try { if (typeof redrawOperationalMap === 'function') redrawOperationalMap(); } catch (e) {}
    return true;
  }

  function parseDraftOptions(draft, unit) {
    const startTime = parseMinuteInput(draft.time || currentTimeValue());
    if (startTime == null) throw new Error('Укажите время в формате ЧЧ:ММ.');
    const behavior = draft.category === 'ambush' ? 'ignore' : (draft.behavior || 'hold');
    const options = {
      behavior,
      waypoints: [],
      targetHex: null,
      targetHexes: [],
      targetDistance: Number(draft.targetDistance) || null,
      targetEnemyId: null,
      btrUnitId: null,
      startHex: (unit.col != null && unit.row != null) ? `${unit.col},${unit.row}` : null,
      startTimeMin: startTime,
      stealth: false,
      escortInfantryId: null,
      ignoreArmor: true,
      contactRadius: 2,
      holdFireDistance: (draft.behavior || 'hold') === 'hold' ? 1 : null,
      retreatDistance: 3
    };
    let type = '';

    if (unit.embarkedInBtr && ['fire_at_will', 'armor_priority', 'sector_fire', 'ambush', 'specific', 'artillery'].includes(draft.category)) {
      throw new Error('Отряд в БТР может только выйти и двигаться или выполнить специальное действие.');
    }
    if (draft.category === 'move') {
      const route = draft.waypoints || [];
      if (draft.mode === 'escort') {
        // ⚡ v13.088 (пункт 4): сопровождение доступно всем юнитам, цель — любой отряд.
        //    Маршрут не нужен: отряд сам подходит к сопровождаемому и повторяет его приказы.
        type = 'escort';
        if (draft.escortInfantryId === '' || draft.escortInfantryId == null) throw new Error('Выберите отряд для сопровождения.');
        const id = Number(draft.escortInfantryId);
        const leader = units()[id];
        if (!Number.isInteger(id) || !leader || leader === unit || leader.isDestroyed) {
          throw new Error('Выберите другой отряд для сопровождения.');
        }
        options.escortInfantryId = id;
        options.waypoints = (leader.col != null && leader.row != null) ? [{ col: leader.col, row: leader.row }] : [];
        options.targetHex = (leader.col != null && leader.row != null) ? `${leader.col},${leader.row}` : null;
      } else {
        if (!route.length) throw new Error('Сначала выберите маршрут на карте.');
        options.waypoints = route.map(p => ({ col: Number(p.col), row: Number(p.row) }));
        options.targetHex = `${route[route.length - 1].col},${route[route.length - 1].row}`;
        if (draft.mode === 'stealth') { type = 'move'; options.stealth = true; }
        else type = 'move';
      }
    } else if (draft.category === 'specific') {
      if (draft.targetEnemyId === '' || draft.targetEnemyId == null) throw new Error('Выберите обнаруженную цель.');
      const targetId = Number(draft.targetEnemyId);
      const target = (campaign().enemyOpUnits || [])[targetId];
      if (!target || target.isDestroyed || target.col == null ||
          (campaign().online && typeof onlineEnemyVisible === 'function' && !onlineEnemyVisible(target))) {
        throw new Error('Выберите обнаруженную цель.');
      }
      type = 'shoot_enemy';
      options.targetEnemyId = targetId;
      options.targetEnemyUnitId = target.id != null ? String(target.id) : null;
      options.targetEnemyName = String(target.name || '');
      options.targetHex = `${target.col},${target.row}`;
    } else if (draft.category === 'fire_at_will') {
      type = 'fire_at_will';
    } else if (draft.category === 'armor_priority') {
      if (typeof hasAtGunWeapons === 'function' && !hasAtGunWeapons(unit)) throw new Error('Приоритет бронетехники доступен только отрядам с ПТО.');
      type = 'shoot_at';
    } else if (draft.category === 'sector_fire') {
      const hexes = draft.targetHexes || [];
      if (!hexes.length) throw new Error('Добавьте хотя бы один гекс для контроля.');
      type = 'sector_fire';
      options.targetHexes = hexes.map(p => `${p.col},${p.row}`);
      options.targetHex = options.targetHexes[0];
    } else if (draft.category === 'ambush') {
      if (!draft.targetHex) throw new Error('Выберите гекс для засады.');
      type = 'ambush';
      options.targetHex = draft.targetHex;
      options.behavior = 'ignore';
      options.stealth = true;
      options.ambushStealthBonus = true;
    } else if (draft.category === 'special') {
      type = draft.specialAction;
      if (!type || !canIssueSpecial(unit, type)) throw new Error('Это действие сейчас недоступно выбранному отряду.');
      if (type === 'dig_in' || type === 'recon' || type === 'prep_positions') {
        // ⚡ v13.087: гекс выполнения выбирается на карте; по умолчанию — текущий
        options.targetHex = draft.targetHex || unitHexKey(unit) || null;
        if (!options.targetHex) throw new Error('Не удалось определить гекс для действия.');
      }
      if (type === 'disembark') {
        // ⚡ v13.088 (пункт 3): гекс высадки; по умолчанию — гекс машины
        options.targetHex = draft.targetHex || unitHexKey(unit) || null;
      }
      if (type === 'embark') {
        if (draft.btrUnitId === '' || draft.btrUnitId == null) throw new Error('Выберите свободный БТР подходящей вместимости.');
        const id = Number(draft.btrUnitId);
        const btr = units()[id];
        const isBtr = btr && (btr.type === 'btr_platoon' || /БТР/i.test(String(btr.name || '')));
        const capacity = btr && ((btr.isGroup && btr.groupSize) ? btr.groupSize : 1);
        const required = (typeof getUnitBtrRequirement === 'function') ? getUnitBtrRequirement(unit) : 1;
        if (!Number.isInteger(id) || !isBtr || btr === unit || btr.isDestroyed || btr.col == null || btr.embarkedUnit || btr.embarkedUnitId != null ||
            (Array.isArray(btr.embarkedUnitIds) && btr.embarkedUnitIds.length) || capacity < required) {
          throw new Error('Выберите свободный БТР подходящей вместимости.');
        }
        options.btrUnitId = id;
        options.targetHex = `${btr.col},${btr.row}`;
      }
      // ⚡ v13.088 (пункт 3): «Выйти из БТР» доступно и отряду с приказом «Сесть в БТР»
      if (type === 'disembark' && !canIssueSpecial(unit, 'disembark')) {
        throw new Error('Выберите десант в БТР, отряд с приказом посадки или сам БТР с десантом.');
      }
    } else {
      throw new Error('Неизвестный тип приказа.');
    }
    options.orderType = type;
    return { type, options };
  }

  function enemyVisibleToPlayer(enemy) {
    if (!enemy || enemy.isDestroyed || enemy.col == null || enemy.row == null) return false;
    const c = campaign();
    return !(c && c.online && typeof onlineEnemyVisible === 'function' && !onlineEnemyVisible(enemy));
  }
  function operationalWeaponRange(unit) {
    if (typeof isMediumArtillery === 'function' && isMediumArtillery(unit)) {
      return (typeof operationalMediumArtilleryRange === 'function') ? operationalMediumArtilleryRange(unit) : 10;
    }
    return 3;
  }
  function executeOperationalTargetOrder(unit, order) {
    if (!unit || !order || unit.isDestroyed) { if (order) order.status = 'cancelled'; return; }
    if (unit.isInBattle || unit.col == null || unit.row == null) return;
    const id = Number(order.targetEnemyId);
    const enemies = campaign().enemyOpUnits || [];
    let enemy = null;
    if (order.targetEnemyUnitId != null) enemy = enemies.find(candidate => candidate && String(candidate.id) === String(order.targetEnemyUnitId)) || null;
    if (!enemy && order.targetEnemyName) enemy = enemies.find(candidate => candidate && String(candidate.name || '') === String(order.targetEnemyName)) || null;
    if (!enemy && order.targetEnemyUnitId == null && !order.targetEnemyName) enemy = enemies[id] || null;
    if (!enemy || enemy.isDestroyed) {
      order.status = 'completed';
      log(`🎯 [${unit.name}] Выбранная цель больше не существует; приказ завершён.`);
      return;
    }
    if (!enemyVisibleToPlayer(enemy)) {
      log(`⏳ [${unit.name}] Цель временно не видна — приказ остаётся активным.`);
      return;
    }
    order.targetHex = `${enemy.col},${enemy.row}`;
    const distance = getOpHexDistance(unit.col, unit.row, enemy.col, enemy.row);
    const range = operationalWeaponRange(unit);
    if (distance > range) {
      log(`⏳ [${unit.name}] Цель «${enemy.name}» вне дальности (${distance}/${range} гексов); приказ ждёт.`);
      return;
    }
    if (unit.firedThisTurn) return;
    const shot = { ...order, type: 'shoot', targetHex: order.targetHex, status: 'active' };
    executeShootOrder(unit, shot);
    if (shot.status === 'completed') {
      order.status = 'completed';
      unit.firedThisTurn = true;
    } else if (shot.status === 'cancelled') {
      order.status = 'cancelled';
    }
  }
  function executeOperationalSectorFireOrder(unit, order) {
    if (!unit || !order || unit.isDestroyed) { if (order) order.status = 'cancelled'; return; }
    if (unit.isInBattle || unit.col == null || unit.row == null || unit.firedThisTurn) return;
    const raw = Array.isArray(order.targetHexes) ? order.targetHexes : [];
    const keys = raw.map(value => {
      if (value && typeof value === 'object') return `${Number(value.col)},${Number(value.row)}`;
      return String(value || '');
    }).filter(value => /^\d+,\d+$/.test(value));
    if (!keys.length && order.targetHex) keys.push(String(order.targetHex));
    if (!keys.length) { order.status = 'cancelled'; return; }
    const distanceLimit = Number(order.targetDistance) || operationalWeaponRange(unit);
    const pool = (campaign().enemyOpUnits || []).filter(enemy => enemyVisibleToPlayer(enemy) &&
      keys.includes(`${enemy.col},${enemy.row}`) &&
      getOpHexDistance(unit.col, unit.row, enemy.col, enemy.row) <= distanceLimit &&
      (!campaign().online || typeof onlineEnemyVisible !== 'function' || onlineEnemyVisible(enemy)));
    if (!pool.length) return; // контроль сохраняется до появления противника
    const target = pool.sort((a, b) => getOpHexDistance(unit.col, unit.row, a.col, a.row) - getOpHexDistance(unit.col, unit.row, b.col, b.row))[0];
    const shot = { ...order, type: 'shoot', targetHex: `${target.col},${target.row}`, status: 'active' };
    executeShootOrder(unit, shot);
    if (shot.status === 'cancelled') order.status = 'cancelled';
    else if (shot.status === 'completed') unit.firedThisTurn = true;
    // Секторный приказ намеренно остаётся активным после выстрела.
  }

  function executeOperationalEmbarkOrder(unit, order) {
    if (!unit || !order || unit.isDestroyed || unit.isInBattle) { if (order) order.status = 'cancelled'; return; }
    const btrId = Number(order.btrUnitId);
    const btr = units()[btrId];
    const isBtr = btr && (btr.type === 'btr_platoon' || /БТР/i.test(String(btr.name || '')));
    const required = (typeof getUnitBtrRequirement === 'function') ? getUnitBtrRequirement(unit) : 1;
    const capacity = btr && ((btr.isGroup && btr.groupSize) ? btr.groupSize : 1);
    const free = !!(isBtr && !btr.isDestroyed && btr.col != null && !btr.embarkedUnit && btr.embarkedUnitId == null &&
      !(Array.isArray(btr.embarkedUnitIds) && btr.embarkedUnitIds.length) && capacity >= required);
    if (!free || unit.embarkedInBtr || unit.col == null || unit.row == null) {
      order.status = 'cancelled';
      log(`❌ [${unit.name}] Посадка в БТР не выполнена: свободный БТР нужной вместимости не найден.`);
      saveAndRefresh();
      return;
    }
    // ⚡ v13.087: отряд подходит к БТР (тратя ОД), затем садится; приказ остаётся активным в пути
    if (unit.col !== btr.col || unit.row !== btr.row) {
      const result = (typeof stepUnitTowardTarget === 'function') ? stepUnitTowardTarget(unit, btr.col, btr.row) : 'no_route';
      if (result === 'no_route' || result === 'blocked') {
        order.status = 'cancelled';
        log(`❌ [${unit.name}] Не может добраться до БТР «${btr.name}» (${btr.col},${btr.row}). Посадка отменена.`);
        saveAndRefresh();
        return;
      }
      if (result === 'battle') { log(`⚔️ [${unit.name}] вступил в бой по пути к БТР.`); saveAndRefresh(); return; }
      if (result !== 'reached') {
        log(`⏳ [${unit.name}] Идёт к БТР «${btr.name}» (${btr.col},${btr.row}). Осталось ОД: ${unit.ap}.`);
        saveAndRefresh();
        return;
      }
    }
    unit.embarkedInBtr = true;
    unit.btrIds = [btrId];
    unit.mobilityBeforeBtr = unit.mobility || 'foot';
    unit.hidden = true;
    unit.embarkedCol = unit.col;
    unit.embarkedRow = unit.row;
    unit.col = null;
    unit.row = null;
    btr.embarkedUnit = unit.name;
    btr.embarkedUnitId = units().indexOf(unit);
    order.status = 'completed';
    log(`🚌 [${unit.name}] сел в ${btr.name}.`);
    saveAndRefresh();
    try { if (typeof updateBtrPanel === 'function') updateBtrPanel(); } catch (e) {}
  }
  // Orders issued to the same recipient during one planning turn share one
  // delivery and execute in sequence, rather than all racing at end-of-turn.
  function seriesStep(type, source) {
    return { type, ...source, type, status: 'pending',
      waypoints: (source.waypoints || []).map(p => ({ ...p })),
      targetHexes: (source.targetHexes || []).slice() };
  }
  function appendTurnOrder(targetId, type, options) {
    const turn = Number(campaign().currentTurn || 1);
    const list = typeof getAllOrdersList === 'function' ? getAllOrdersList() :
      [...(hardMode.messengerQueue || []), ...(hardMode.pendingOrders || []), ...(hardMode.orders || [])];
    const existing = list.find(o => o && Number(o.turnIssued) === turn &&
      ['pending', 'queued', 'delivering', 'active'].includes(o.status) &&
      (o.type === 'company_order'
        ? (o.subUnitIdsAll || o.subUnitIds || []).some(id => Number(id) === targetId)
        : Number(o.toUnitId) === targetId) &&
      !o.relayParentId && o.type !== 'artillery_strike');
    if (!existing) return null;
    if (existing.type === 'company_order' && !(existing.subUnitIds || []).some(id => Number(id) === targetId)) return null;
    if (!Array.isArray(existing.series) || !existing.series.length) {
      const firstType = existing.type === 'company_order' ? existing.orderType : existing.type;
      // Use the actual saved order fields, not defaults from the new draft.
      const saved = { ...existing };
      existing.series = [seriesStep(firstType, saved)];
    }
    existing.series.push(seriesStep(type, options));
    if (existing.type === 'company_order') existing.orderType = 'series';
    else existing.type = 'series';
    // The first step's time determines delivery; later steps wait individually.
    return existing;
  }
  function issueOneOrder(targetId, type, options, mirrored) {
    const list = units();
    const receiver = list[targetId];
    const hqId = findBattalionHq();
    if (!receiver || receiver.isDestroyed) throw new Error('Отряд не найден или уничтожен.');
    const appended = appendTurnOrder(targetId, type, options);
    if (appended) return appended;
    if (hqId < 0 || !list[hqId]) throw new Error('Штаб батальона не найден.');
    let order = null;
    let relay = null;
    try {
      if (typeof hardMode !== 'undefined' && hardMode.enabled && typeof getRelayCompanyForOrder === 'function') {
        relay = getRelayCompanyForOrder(list[hqId], receiver);
      }
    } catch (e) { relay = null; }
    if (relay) {
      const companyId = list.indexOf(relay);
      order = createOrder(hqId, companyId, 'company_order', {
        ...options, subUnitIds: [targetId], orderType: type
      });
    } else {
      order = createOrder(hqId, targetId, type, options);
    }
    if (!order) throw new Error(`Не удалось создать приказ «${type}».`);
    if (mirrored != null) order.escortMirrorInfantryId = mirrored;
    return order;
  }
  function linkedEscortIds(infantryId) {
    const result = new Set();
    units().forEach((unit, id) => {
      if (!unit || unit.isDestroyed || id === infantryId) return;
      if (Number(unit.escortInfantryId) === Number(infantryId)) result.add(id);
    });
    const pending = (typeof getAllOrdersList === 'function') ? getAllOrdersList() :
      ((typeof hardMode !== 'undefined' && hardMode.orders) ? hardMode.orders : []);
    pending.forEach(order => {
      if (!order || order.status === 'cancelled' || order.status === 'completed') return;
      const effectiveType = order.type === 'company_order' ? order.orderType : order.type;
      if (effectiveType !== 'escort' || Number(order.escortInfantryId) !== Number(infantryId)) return;
      const ids = order.type === 'company_order'
        ? (Array.isArray(order.subUnitIdsAll) ? order.subUnitIdsAll : order.subUnitIds || [])
        : [order.toUnitId];
      ids.forEach(id => { if (units()[Number(id)]) result.add(Number(id)); });
    });
    return Array.from(result);
  }
  // ⚡ v13.088 (пункт 4): сопровождение дублирует ВСЕ приказы сопровождаемого —
  //    уже отданные копируются сразу, будущие — в issueDraftOrder (linkedEscortIds).
  function mirrorLeaderOrdersToEscort(escortId, leaderId) {
    if (!Number.isInteger(leaderId) || Number(escortId) === Number(leaderId)) return 0;
    const escort = units()[Number(escortId)];
    if (!escort || escort.isDestroyed) return 0;
    const list = (typeof getAllOrdersList === 'function') ? getAllOrdersList() : [];
    const hqId = findBattalionHq();
    if (hqId < 0 || typeof createOrder !== 'function') return 0;
    let copied = 0;
    list.forEach(order => {
      if (!order || ['cancelled', 'completed'].includes(order.status)) return;
      const effectiveType = order.type === 'company_order' ? order.orderType : order.type;
      if (!effectiveType || ['escort', 'series', 'artillery_strike', 'company_order'].includes(effectiveType)) return;
      const recipients = order.type === 'company_order'
        ? (Array.isArray(order.subUnitIdsAll) ? order.subUnitIdsAll : order.subUnitIds || [])
        : [order.toUnitId];
      if (!recipients.some(id => Number(id) === Number(leaderId))) return;
      // ⚡ v13.089 (пункт 1): повторяем только то, что сопровождающий может выполнить,
      //    иначе он просто продолжает следовать за отрядом.
      if (typeof unitCanExecuteOrderType === 'function' && !unitCanExecuteOrderType(escort, effectiveType)) return;
      const mirrored = { ...order,
        waypoints: (order.waypoints || []).map(p => ({ ...p })),
        targetHexes: (order.targetHexes || []).slice(),
        startHex: (escort.col != null && escort.row != null) ? `${escort.col},${escort.row}` : order.startHex };
      try {
        const copy = createOrder(hqId, Number(escortId), effectiveType, mirrored);
        if (copy) { copy.escortMirrorInfantryId = Number(leaderId); copied++; }
      } catch (e) { console.warn('escort mirror:', e.message); }
    });
    return copied;
  }
  // ⚡ v13.088 (пункт 3): приказ отряду, у которого ещё не отработан приказ
  //    «Сесть в БТР», дописывается в серию посадки: «сесть → выйти на гексе → …».
  function appendToPendingEmbark(unit, type, options) {
    const order = pendingEmbarkOrder(unit);
    if (!order) return null;
    if (!Array.isArray(order.series) || !order.series.length) {
      const firstType = order.type === 'company_order' ? order.orderType : order.type;
      order.series = [seriesStep(firstType, { ...order })];
    }
    order.series.push(seriesStep(type, options));
    if (order.type === 'company_order') order.orderType = 'series';
    else order.type = 'series';
    return order;
  }
  function isBtrUnit(unit) {
    return !!unit && (unit.type === 'btr_platoon' || /БТР/i.test(String(unit.name || '')));
  }
  // ⚡ v13.089 (пункт 3): какая машина везёт (или повезёт) этот отряд.
  function carrierIdForPassenger(unitId) {
    const list = units();
    const passenger = list[Number(unitId)];
    if (!passenger) return -1;
    const carries = (b) => !!b && !b.isDestroyed &&
      (b.embarkedUnit === passenger.name ||
        (b.embarkedUnitId != null && Number(b.embarkedUnitId) === Number(unitId)) ||
        (Array.isArray(b.vehicleList) && b.vehicleList.some(v => v && (v.embarkedUnit === passenger.name ||
          (v.embarkedUnitId != null && Number(v.embarkedUnitId) === Number(unitId))))));
    if (passenger.embarkedInBtr) {
      const byIds = (passenger.btrIds || []).map(id => list[Number(id)]).filter(carries);
      if (byIds.length) return list.indexOf(byIds[0]);
      const found = list.find(carries);
      return found ? list.indexOf(found) : -1;
    }
    // посадка ещё не выполнена — берём БТР из приказа посадки
    const order = pendingEmbarkOrder(passenger);
    if (!order) return -1;
    const steps = Array.isArray(order.series) && order.series.length ? order.series : [order];
    for (const step of steps) {
      const type = step && (step.type === 'company_order' ? step.orderType : step.type);
      if (type !== 'embark') continue;
      const btrId = Number(step.btrUnitId);
      if (Number.isInteger(btrId) && list[btrId] && !list[btrId].isDestroyed) return btrId;
    }
    return -1;
  }
  function issueDraftOrder() {
    const picked = selectedUnit();
    if (!picked.unit || picked.id < 0) throw new Error('Сначала выберите отряд.');
    if (!isOnlineTurn()) throw new Error('Сейчас ход оппонента.');
    if (!ensureHardMode()) throw new Error('Не удалось включить режим приказов.');
    let result = parseDraftOptions(state.draft, picked.unit);
    if (picked.unit.embarkedInBtr && result.type !== 'disembark') {
      // ⚡ v13.087: приказ десанту — сначала выход из БТР, затем действие (серия)
      const base = result.options;
      const steps = [
        seriesStep('disembark', { behavior: 'hold', startTimeMin: base.startTimeMin, startHex: null }),
        seriesStep(result.type, base)
      ];
      result = { type: 'series', options: { ...base, orderType: 'series', series: steps, waypoints: [], targetHex: base.targetHex || null } };
    }
    // ⚡ v13.089 (пункт 3): «Высадить десант» — приказ МАШИНЕ: БТР доезжает до
    //    выбранного гекса, выпускает отряд и дальше живёт своими приказами,
    //    а высаженный отряд продолжает свою серию («сесть → штурмовать …»).
    let issueTargetId = picked.id;
    if (result.type === 'disembark' && !isBtrUnit(picked.unit)) {
      const carrierId = carrierIdForPassenger(picked.id);
      if (carrierId >= 0) {
        result.options.disembarkUnitId = picked.id;
        issueTargetId = carrierId;
      }
    }
    const appendedToEmbark = (issueTargetId === picked.id && result.type !== 'embark' &&
      result.type !== 'disembark' && !picked.unit.embarkedInBtr)
      ? appendToPendingEmbark(picked.unit, result.type, result.options) : null;
    const created = appendedToEmbark
      ? [appendedToEmbark]
      : [issueOneOrder(issueTargetId, result.type, result.options, null)];
    let mirroredNow = 0;
    if (result.type === 'escort' && result.options.escortInfantryId != null) {
      mirroredNow = mirrorLeaderOrdersToEscort(picked.id, Number(result.options.escortInfantryId));
    }
    // ⚡ v13.089 (пункт 1): приказы сопровождающего больше не копируются здесь —
    //    это делает mirrorOrderToEscorts() внутри createOrder (для всех путей
    //    создания приказа и только если сопровождающий может такой приказ выполнить).
    try { if (typeof renderActiveOrders === 'function') renderActiveOrders(); } catch (e) {}
    try { if (typeof saveData === 'function') saveData(); } catch (e) {}
    try { if (typeof redrawOperationalMap === 'function') redrawOperationalMap(); } catch (e) {}
    const status = created[0].status;
    // ⚡ v13.088 (пункт 9): подтверждение — что за приказ, кому, через сколько
    //    ходов доставит посыльный и к какому времени операции он начнётся.
    const label = (typeof getOrderTypeLabel === 'function') ? getOrderTypeLabel(result.type) : result.type;
    const eta = (typeof describeOrderEta === 'function') ? describeOrderEta(created[0]) : '';
    const receiverName = issueTargetId === picked.id ? picked.unit.name : (units()[issueTargetId] || {}).name || picked.unit.name;
    const audience = created.length > 1
      ? `отряду «${receiverName}» и ${created.length - 1} отряду(ам) сопровождения`
      : `отряду «${receiverName}»` + (issueTargetId === picked.id ? '' : ` (высадка десанта «${picked.unit.name}»)`);
    const tail = status === 'delivering' ? ' · доставляется штабом' : status === 'queued' ? ' · ждёт посыльного' : '';
    setMapMessage(`📋 Приказ «${label}» передан ${audience}${tail}${eta ? `. ${eta.charAt(0).toUpperCase() + eta.slice(1)}.` : '.'}`, '#27ae60');
    try { if (typeof log === 'function') log(`📋 Приказ «${label}» для «${picked.unit.name}»${eta ? `: ${eta}` : ''}${mirroredNow ? ` · скопировано приказов сопровождаемого: ${mirroredNow}` : ''}.`); } catch (e) {}
    markChecklist('orders');
    closeCommandMenu(true);
  }
  function submitQuickArtillery() {
    const picked = selectedUnit();
    if (!picked.unit || !(picked.unit.type === 'battalion_hq' || picked.unit.type === 'hq')) throw new Error('Арт. обстрел назначает штаб батальона.');
    if (typeof canIssueArtilleryStrike === 'function' && !canIssueArtilleryStrike()) throw new Error('У батальона нет артиллерийской поддержки.');
    if ((Number(campaign().artilleryStrikesUsed) || 0) >= 4) throw new Error('Лимит артиллерийской поддержки исчерпан: 4 обстрела за кампанию.');
    if (!state.draft.targetHex) throw new Error('Выберите гекс артиллерийского обстрела.');
    const time = parseMinuteInput(state.draft.time || currentTimeValue());
    if (time == null) throw new Error('Укажите время начала.');
    const target = document.getElementById('orderTargetHex');
    const timeEl = document.getElementById('orderStartTime');
    if (target) target.value = state.draft.targetHex;
    if (timeEl) timeEl.value = formatMinuteInput(time);
    submitArtilleryStrikeOrder();
    markChecklist('orders');
    closeCommandMenu(true);
  }

  function onCommandClick(event) {
    const button = event.target && event.target.closest ? event.target.closest('[data-cmd]') : null;
    if (!button) return;
    const action = button.getAttribute('data-cmd');
    if (action === 'close') { closeCommandMenu(true); return; }
    if (action === 'back') { goBack(); return; }
    if (action === 'category') { setCategory(button.getAttribute('data-category')); return; }
    if (action === 'fire-kind') { startFireKind(button.getAttribute('data-kind')); return; }
    if (action === 'artillery') {
      state.menuPage = 'details';
      state.draft = { category: 'artillery', behavior: 'ignore', time: currentTimeValue(), targetHex: '' };
      state.error = '';
      renderCommandMenu();
      return;
    }
    if (action === 'pick-map') { startMapPick(button.getAttribute('data-pick')); return; }
    if (action === 'select-passenger') {
      const pid = Number(button.getAttribute('data-id'));
      const passenger = units()[pid];
      if (!passenger || !campaign()) return;
      campaign().selectedOpUnit = passenger;
      state.selectedUnitId = pid;
      state.menuPage = 'main'; state.draft = null; state.error = '';
      renderCommandMenu();
      positionUnitActions();
      return;
    }
    if (action === 'clear-route') {
      if (state.draft) { state.draft.waypoints = []; state.draft.targetHexes = []; }
      state.mapPick = null; clearRoutePreview(); renderCommandMenu(); return;
    }
    if (action === 'submit') {
      try {
        if (state.draft && state.draft.category === 'artillery') submitQuickArtillery();
        else issueDraftOrder();
      } catch (e) { state.error = e.message || 'Не удалось отдать приказ.'; renderCommandMenu(); }
    }
  }
  function onCommandChange(event) {
    const el = event.target;
    if (!el || !el.getAttribute) return;
    const field = el.getAttribute('data-draft-field');
    if (!field || !state.draft) return;
    applyDraftField(field, el.value);
    if (field === 'moveMode' || field === 'specialAction') renderCommandMenu();
  }
  function onPinnedClick(event) {
    const button = event.target && event.target.closest ? event.target.closest('[data-quick-action]') : null;
    if (!button) return;
    const action = button.getAttribute('data-quick-action');
    if (action === 'communication') {
      ensureHardMode();
      if (typeof showCommunicationPanel === 'function') showCommunicationPanel();
      const panel = document.getElementById('communicationPanel');
      if (panel && panel.style.display === 'block' && typeof panel.scrollIntoView === 'function') panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else if (action === 'order') {
      openCommandMenu();
    } else if (action === 'merge') {
      // ⚡ v13.088 (пункт 6): объединение техники — из закреплённой панели
      if (typeof showGroupDialog === 'function') showGroupDialog();
      else setMapMessage('Объединение техники недоступно.', '#e67e22');
    } else if (action === 'supply') {
      if (typeof showSupplyPanel === 'function') showSupplyPanel();
      const panel = document.getElementById('supplyPanel');
      if (panel && panel.style.display === 'block' && typeof panel.scrollIntoView === 'function') panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function patchFinishPlacement() {
    if (state.finishPatched) return;
    if (typeof window.finishPlacement !== 'function') return;
    state.originalFinishPlacement = window.finishPlacement;
    const wrapper = function () {
      if (activeMap() && getStage() !== 'orders') return advanceSetup();
      return state.originalFinishPlacement.apply(this, arguments);
    };
    wrapper.__opSetupWrapper = true;
    window.finishPlacement = wrapper;
    state.finishPatched = true;
  }
  function patchMapClick() {
    if (typeof window.handleOpMapClick !== 'function' || window.handleOpMapClick.__opCommandWrapper) return;
    const original = window.handleOpMapClick;
    const wrapped = function (event) {
      // ⚡ v13.087: сразу после перетаскивания по иконке клик не обрабатываем
      if (Date.now() - state.lastDragAt < 500) return;
      if (state.mapPick && handleQuickMapPick(event)) return;
      const result = original.apply(this, arguments);
      const c = campaign();
      if (c && c.selectedOpUnit) {
        const nextId = units().indexOf(c.selectedOpUnit);
        state.selectedUnitId = nextId >= 0 ? nextId : null;
        if (nextId >= 0 && state.menuOpen) {
          state.draft = null;
          state.menuPage = 'main';
          state.error = '';
          renderCommandMenu();
        }
      } else {
        state.selectedUnitId = null;
        if (state.menuOpen) closeCommandMenu(true);
      }
      positionUnitActions();
      return result;
    };
    wrapped.__opCommandWrapper = true;
    window.handleOpMapClick = wrapped;
    const canvas = document.getElementById('opMapCanvas');
    if (canvas) canvas.onclick = wrapped;
  }
  function resetOperationalUi() {
    state.menuOpen = false; state.menuPage = 'main'; state.draft = null; state.mapPick = null;
    state.selectedUnitId = null; state.placementSignature = ''; state.error = '';
    clearRoutePreview(); renderCommandMenu();
  }
  function applyCompactMapUi() {
    const c = campaign();
    if (!c) return;
    ['showOrderPanelBtn', 'showCommPanelBtn', 'showSupplyPanelBtn'].forEach(id => setDisplay(id, false));
    const legacy = document.getElementById('hardModePanel');
    if (legacy) legacy.style.display = 'none';
    const enemyPanel = document.getElementById('opEnemyPanel');
    if (enemyPanel && c.online) enemyPanel.style.display = 'none';
    renderSetup();
    renderPinnedActions();
  }
  function patchHardModeToggle() {
    if (state.hardModeTogglePatched || typeof window.toggleHardMode !== 'function') return;
    const original = window.toggleHardMode;
    window.toggleHardMode = function () {
      if (campaign() && ['communications', 'orders'].includes(getStage()) && hardMode && hardMode.enabled) {
        setMapMessage('🎯 Hard Mode обязателен после этапа связи — приказы проходят через штаб батальона.', '#e67e22');
        try { if (typeof applyHardModeUI === 'function') applyHardModeUI(); } catch (e) {}
        return;
      }
      return original.apply(this, arguments);
    };
    state.hardModeTogglePatched = true;
  }
  function patchCampaignResetters() {
    if (!state.confirmBattalionPatched && typeof window.confirmBattalion === 'function') {
      const originalConfirm = window.confirmBattalion;
      window.confirmBattalion = function () {
        resetOperationalUi();
        return originalConfirm.apply(this, arguments);
      };
      state.confirmBattalionPatched = true;
    }
    if (!state.showOperationalMapPatched && typeof window.showOperationalMap === 'function') {
      const originalShow = window.showOperationalMap;
      window.showOperationalMap = function () {
        const result = originalShow.apply(this, arguments);
        state.menuOpen = false; state.draft = null; state.mapPick = null;
        state.selectedUnitId = null; state.placementSignature = '';
        setInitialStage();
        applyCompactMapUi();
        return result;
      };
      state.showOperationalMapPatched = true;
    }
  }
  function install() {
    if (install.done) return;
    install.done = true;
    setInitialStage();
    patchFinishPlacement();
    patchMapClick();
    patchHardModeToggle();
    patchCampaignResetters();
    installPlacementInteractions();
    installCanvasDrag();
    ensureDock();
    const tray = document.getElementById('opPlacementTray');
    const menu = document.getElementById('opCommandMenu');
    const pinned = document.getElementById('opQuickActions');
    if (menu) {
      menu.addEventListener('click', onCommandClick);
      menu.addEventListener('change', onCommandChange);
      menu.addEventListener('input', onCommandChange);
    }
    if (pinned) pinned.addEventListener('click', onPinnedClick);
    const winchButton = document.getElementById('winchBtn');
    if (winchButton) {
      winchButton.addEventListener('mouseenter', () => { if (activeMap()) showWinchInfo(); });
      winchButton.addEventListener('focus', () => { if (activeMap()) showWinchInfo(); });
    }
    window.addEventListener('resize', () => { try { syncStageLayout(); } catch (e) {} });
    const mapViewport = document.getElementById('opMapContainer');
    if (mapViewport) mapViewport.addEventListener('scroll', positionUnitActions, { passive: true });
    window.addEventListener('resize', positionUnitActions);
    window.addEventListener('scroll', positionUnitActions, { passive: true });
    const placeSelect = document.getElementById('opPlaceSelect');
    if (placeSelect) placeSelect.addEventListener('change', () => {
      const id = Number(placeSelect.value);
      if (Number.isFinite(id) && units()[id]) selectPlacementUnit(id);
    });
    if (tray) tray.setAttribute('aria-live', 'polite');
    renderSetup();
    renderPinnedActions();
    setInterval(() => {
      if (!campaign() || !campaign().active) return;
      if (!state.finishPatched) patchFinishPlacement();
      if (!window.handleOpMapClick || !window.handleOpMapClick.__opCommandWrapper) patchMapClick();
      if (!state.hardModeTogglePatched) patchHardModeToggle();
      if (!state.confirmBattalionPatched || !state.showOperationalMapPatched) patchCampaignResetters();
      if (activeMap()) {
        renderSetup();
        renderPinnedActions();
      } else {
        syncStageLayout();
        const bar = document.getElementById('opQuickActions');
        if (bar) bar.style.display = 'none';
        const host = document.getElementById('opCommandMenu');
        if (host) host.style.display = 'none';
      }
    }, 800);
  }

  window.executeOperationalTargetOrder = executeOperationalTargetOrder;
  window.executeOperationalSectorFireOrder = executeOperationalSectorFireOrder;
  window.executeOperationalEmbarkOrder = executeOperationalEmbarkOrder;
  window.opSetupAdvance = advanceSetup;
  window.resetOperationalUi = resetOperationalUi;
  window.opOpenCommandMenu = openCommandMenu;
  window.opCloseCommandMenu = () => closeCommandMenu(true);
  window.opIssueQuickOrder = issueDraftOrder;
  window.opOperationalUiState = state;
  window.toggleCommPanelBody = function () { state.commCollapsed = !state.commCollapsed; syncStageLayout(); };
  window.showWinchInfo = showWinchInfo;
  window.opStageLayoutSync = syncStageLayout;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();

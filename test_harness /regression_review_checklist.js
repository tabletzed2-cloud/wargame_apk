'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { sliceFunction, HTML } = require('./extract');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const hex = read('js/hexmaps.js');
const ui = read('js/operational_ui.js');
const context = vm.createContext({
    ov: { hexEdits: {}, hexEditSources: {} },
    getHexOverlay() { return this.ov; },
    saveHexOverlays() {}, log() {}, showHexEditButton() {}, queueHexEditPrompt() {},
    applyPendingHexEdits() { return 0; }, console
});
// Use a lexical reference, like the actual game's global overlay store.
vm.runInContext('getHexOverlay = () => ov;', context);
for (const name of ['countHexTrenchCells', 'countHexPrepCells', 'hexEditClaimUnitAllowance', 'grantTrenchPoints', 'grantPrepPoints']) {
    vm.runInContext(sliceFunction(hex, name), context);
}
for (const [kind, fn, budget, type] of [
    ['trenches', 'grantTrenchPoints', 'trenchPoints', 'trenches'],
    ['prep', 'grantPrepPoints', 'prepPoints', 'grass']
]) {
    context.ov = { hexEdits: {}, hexEditSources: {} };
    assert.equal(vm.runInContext(`${fn}('0,0', 8, 'unit', false)`, context), 8);
    for (let i = 0; i < 3; i++) {
        context.ov.hexEdits[i] = type;
        context.ov.hexEditSources[i] = kind;
        context.ov[budget]--;
    }
    for (let i = 0; i < 3; i++) {
        assert.equal(vm.runInContext(`${fn}('0,0', 8, 'unit', false)`, context), 5,
            'repeated orders must not refund applied edits');
    }
    assert.equal(vm.runInContext(`${fn}('0,0', 10, 'unit', false)`, context), 7);
    context.ov = { hexEdits: {}, hexEditSources: {} };
    vm.runInContext(`applyPendingHexEdits = () => {
        ov.hexEdits['draft'] = '${type}'; ov.hexEditSources['draft'] = '${kind}'; return 1;
    };`, context);
    assert.equal(vm.runInContext(`${fn}('0,0', 8, 'unit', false)`, context), 7,
        'newly committed draft counts exactly once');
    vm.runInContext('applyPendingHexEdits = () => 0;', context);
}
const host = {};
const c = { active: true, playerFaction: 'BeVe', opSetupStage: 'placement' };
const setup = vm.createContext({ state: {}, document: { getElementById: () => host },
    campaign: () => c, activeMap: () => true, getStage: () => c.opSetupStage,
    getUnplacedOpUnits: () => [], hardMode: { enabled: false },
    renders: 0, layouts: 0,
});
vm.runInContext('function renderSetupCore() { renders++; } function syncStageLayout() { layouts++; }', setup);
vm.runInContext(sliceFunction(ui, 'renderSetup'), setup);
vm.runInContext('renderSetup(); renderSetup();', setup);
assert.equal(setup.renders, 1);
assert.equal(setup.layouts, 2);
c.opSetupStage = 'communications';
vm.runInContext('renderSetup();', setup);
assert.equal(setup.renders, 2);
for (const id of ['btnReturnToCampaign', 'btnFinishBattle', 'btnRetreatBattle']) {
    assert.equal(HTML.split(`id="${id}"`).length - 1, 1, id);
}
assert(!HTML.includes('appData.campaign.hardMode'));
assert(!HTML.includes('setInterval(updateGlobalMenuButton'));
assert(!HTML.includes('id="opLegacyPanelButtons"'));
assert(ui.includes("canvas.style.touchAction = 'none'"));
for (const name of ['handleFighterDeath', 'checkVehicleRadioAfterLoss', 'clearOrderWaypoints', 'updateOrderWaypointsDisplay']) {
    assert.equal([...HTML.matchAll(new RegExp('function ' + name + '\\(', 'g'))].length, 1);
}
console.log('Review checklist: repeated allowances, committed drafts, stable setup rendering, IDs and dead code: PASS');

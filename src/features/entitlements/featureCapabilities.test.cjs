const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename);

const {
  FREE_FEATURES, PLUS_FEATURES, PLUS_FEATURE_ENTRY_KEYS, PLUS_ROUTE_FEATURES, canUseFeature,
} = require('./featureCapabilities.ts');

const now = new Date('2026-10-25T00:00:00Z');
const active = {
  id: 'one', userId: 'A', entitlement: 'premium', source: 'beta',
  startsAt: '2026-09-01T00:00:00Z', expiresAt: null, isActive: true, note: null,
};

test('every Free capability stays available without an entitlement', () => {
  for (const feature of FREE_FEATURES) assert.equal(canUseFeature(feature, null, now), true, feature);
});

test('all six Plus capabilities use the existing active entitlement rule', () => {
  assert.equal(PLUS_FEATURES.size, 6);
  for (const feature of PLUS_FEATURES) {
    assert.equal(canUseFeature(feature, active, now), true, feature);
    assert.equal(canUseFeature(feature, [ { ...active, isActive: false }, active ], now), true, feature);
    assert.equal(canUseFeature(feature, null, now), false, feature);
    assert.equal(canUseFeature(feature, [], now), false, feature);
    assert.equal(canUseFeature(feature, { ...active, expiresAt: '2026-10-25T00:00:00Z' }, now), false, feature);
    assert.equal(canUseFeature(feature, { ...active, startsAt: '2026-10-26T00:00:00Z' }, now), false, feature);
    assert.equal(canUseFeature(feature, { ...active, isActive: false }, now), false, feature);
  }
});

test('every Plus entry maps to one distinct declared capability', () => {
  assert.deepEqual(new Set(Object.values(PLUS_FEATURE_ENTRY_KEYS)), PLUS_FEATURES);
  assert.equal(PLUS_FEATURE_ENTRY_KEYS.togetherTravel, 'travel_recommendation');
  assert.equal(PLUS_FEATURE_ENTRY_KEYS.lifeBriefing, 'life_briefing');
  assert.equal(PLUS_ROUTE_FEATURES['/together-travel'], 'travel_recommendation');
  assert.equal(PLUS_ROUTE_FEATURES['/together-travel-destinations'], 'travel_recommendation');
  assert.equal(PLUS_ROUTE_FEATURES['/life-briefing'], 'life_briefing');
});

test('unknown capability fails closed even with an active entitlement', () => {
  assert.equal(canUseFeature('unknown_feature', active, now), false);
  assert.equal(canUseFeature('', null, now), false);
});

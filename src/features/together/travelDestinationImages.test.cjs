const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(
  fs.readFileSync(filename, 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText, filename);
require.extensions['.webp'] = (module, filename) => { module.exports = filename; };

const {
  TRAVEL_DESTINATION_IMAGES,
  getTravelDestinationImageSource,
  toReactNativeImageSource,
} = require('./travelDestinationImages.ts');
const root = path.resolve(__dirname, '../../..');
const destinationIds = [
  'jeju', 'fukuoka', 'osaka', 'tokyo', 'sapporo', 'okinawa', 'taipei',
  'hongkong', 'danang', 'cebu', 'guam', 'bangkok', 'singapore',
];

test('all 13 destination IDs resolve to their existing local WebP asset', () => {
  assert.deepEqual(Object.keys(TRAVEL_DESTINATION_IMAGES), destinationIds);
  for (const id of destinationIds) {
    const expected = path.join(root, 'assets', 'travel', `${id}.webp`);
    assert(fs.existsSync(expected), `${id} asset missing`);
    assert.equal(TRAVEL_DESTINATION_IMAGES[id].kind, 'local');
    assert.equal(getTravelDestinationImageSource(id), expected);
  }
});

test('missing destination falls back and image source can later be remote', () => {
  assert.equal(getTravelDestinationImageSource('unknown'), null);
  assert.equal(getTravelDestinationImageSource('toString'), null);
  assert.deepEqual(toReactNativeImageSource({ kind: 'remote', uri: 'https://example.com/city.webp' }),
    { uri: 'https://example.com/city.webp' });
});

test('destination screen uses fixed image frames, cover mode, and an icon fallback', () => {
  const screen = fs.readFileSync(path.join(root, 'app', 'together-travel-destinations.tsx'), 'utf8');
  assert.match(screen, /index === 0 \? <DestinationImage destinationId=\{destination\.id\} hero \/>/);
  assert.match(screen, /index === 0 \? null : <DestinationImage destinationId=\{destination\.id\} hero=\{false\} \/>/);
  assert.match(screen, /resizeMode="cover"/);
  assert.match(screen, /heroImageFrame: \{[^\n]*aspectRatio: 16 \/ 9/);
  assert.match(screen, /thumbnailFrame: \{[^\n]*aspectRatio: 1/);
  assert.match(screen, /!failed/);
  assert.match(screen, /map-marker-outline/);
});

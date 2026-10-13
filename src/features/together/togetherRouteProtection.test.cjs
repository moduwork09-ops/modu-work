const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../../..');
const app = path.join(root, 'app');
const layout = fs.readFileSync(path.join(app, '_layout.tsx'), 'utf8');

function guardedRoutes(guard) {
  const group = layout.match(new RegExp(`<Stack\\.Protected guard=\\{${guard}\\}>([\\s\\S]*?)<\\/Stack\\.Protected>`));
  assert.ok(group, `missing protected group: ${guard}`);
  return new Set([...group[1].matchAll(/<Stack\.Screen name="([^"]+)"/g)].map((match) => match[1]));
}

test('all Together screens require a session before mounting', () => {
  const sessionRoutes = guardedRoutes('Boolean\\(session\\)');
  const setupRoutes = guardedRoutes('Boolean\\(session\\) && hasCompletedSetup');
  const togetherRoutes = fs.readdirSync(app)
    .filter((name) => /^together-.*\.tsx$/.test(name))
    .map((name) => name.slice(0, -4));
  assert.ok(togetherRoutes.length > 0);
  for (const route of togetherRoutes) {
    assert.ok(sessionRoutes.has(route) || setupRoutes.has(route), `${route} must be protected`);
  }
  assert.ok(setupRoutes.has('(tabs)'), 'Together tab must remain protected');
});

test('logged-out entry redirects to auth before Together member RPC screens mount', () => {
  const sessionRoutes = guardedRoutes('Boolean\\(session\\)');
  assert.ok(sessionRoutes.has('together-group-detail'));
  assert.ok(sessionRoutes.has('together-share-settings'));
  const entry = fs.readFileSync(path.join(root, 'src/features/tutorial/tutorialStorage.ts'), 'utf8');
  assert.match(entry, /if \(!input\.hasSession\) return '\/auth'/);
  for (const screen of ['together-group-detail.tsx', 'together-share-settings.tsx']) {
    assert.match(fs.readFileSync(path.join(app, screen), 'utf8'), /getTogetherMembers\(/);
  }
});
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(
  fs.readFileSync(filename, 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText, filename);

const { getTogetherGroupManagementAction } = require('./togetherGroupManagement.ts');
const { chooseTogetherHomeSpace } = require('./togetherHomePresentation.ts');
const manageFile = 'app/together-manage.tsx';
const manageSource = ts.createSourceFile(manageFile, read(manageFile), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function findVariable(name) {
  let found;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(manageSource) === name) found = node;
    ts.forEachChild(node, visit);
  }
  visit(manageSource);
  assert(found, `${name} must exist`);
  return found;
}

function evaluateVariable(name, context) {
  const node = findVariable(name);
  const code = ts.transpileModule(
    `const ${node.getText(manageSource)}; exports.result = ${name};`,
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, ...context });
  return exports.result;
}

function baseContext(overrides = {}) {
  const updates = { spaces: [], selected: [], members: [], mutating: [], errors: [], alerts: [] };
  const context = {
    mutationRef: { current: undefined },
    sessionUserIdRef: { current: 'user-A' },
    selectedSpaceIdRef: { current: 'space-A' },
    spacesRef: { current: [{ id: 'space-A' }, { id: 'space-B' }] },
    focusedRef: { current: true },
    generationRef: { current: 4 },
    isCurrentManagementRequest: (focused, generation, user, expectedGeneration, expectedUser) => focused.current && generation.current === expectedGeneration && user.current === expectedUser,
    setIsMutating: value => updates.mutating.push(value),
    setMembers: value => updates.members.push(value),
    setSpaces: value => updates.spaces.push(value.map(space => space.id)),
    setSelectedSpaceId: value => updates.selected.push(value),
    setHasError: value => updates.errors.push(value),
    chooseTogetherHomeSpace,
    deleteTogetherSpace: async () => {},
    leaveTogetherSpace: async () => {},
    getTogetherSpaces: async () => [{ id: 'space-B' }],
    getTogetherMembers: async () => [{ userId: 'user-B', role: 'owner', status: 'active' }],
    Alert: { alert: (...args) => updates.alerts.push(args) },
    ...overrides,
  };
  return { context, updates };
}

async function run() {
  const owner = [{ userId: 'user-A', role: 'owner', status: 'active' }];
  const member = [{ userId: 'user-A', role: 'member', status: 'active' }];
  assert.equal(getTogetherGroupManagementAction(owner, 'user-A'), 'delete');
  assert.equal(getTogetherGroupManagementAction(member, 'user-A'), 'leave');
  assert.equal(getTogetherGroupManagementAction([{ ...owner[0], status: 'left' }], 'user-A'), undefined);
  assert.equal(getTogetherGroupManagementAction(owner, 'user-B'), undefined);

  let resolveDelete;
  let deleteCalls = 0;
  const success = baseContext({ deleteTogetherSpace: () => { deleteCalls += 1; return new Promise(resolve => { resolveDelete = resolve; }); } });
  const performDelete = evaluateVariable('performGroupAction', success.context);
  const first = performDelete('delete', { id: 'space-A' });
  await performDelete('delete', { id: 'space-A' });
  assert.equal(deleteCalls, 1, 'duplicate owner delete is ignored');
  resolveDelete();
  await first;
  assert.deepEqual(success.updates.spaces.at(-1), ['space-B']);
  assert.equal(success.updates.selected.at(-1), 'space-B', 'deleted selection falls back');
  assert.equal(success.updates.members.at(0).length, 0, 'stale members clear before fallback loads');

  let leaveCalls = 0;
  const leave = baseContext({
    leaveTogetherSpace: async () => { leaveCalls += 1; },
    getTogetherSpaces: async () => [{ id: 'space-B' }],
  });
  await evaluateVariable('performGroupAction', leave.context)('leave', { id: 'space-A' });
  assert.equal(leaveCalls, 1);
  assert.deepEqual(leave.updates.spaces.at(-1), ['space-B']);
  assert.equal(leave.updates.selected.at(-1), 'space-B', 'left selection falls back');

  let resolveLeave;
  const duplicateLeave = baseContext({ leaveTogetherSpace: () => new Promise(resolve => { leaveCalls += 1; resolveLeave = resolve; }) });
  const performLeave = evaluateVariable('performGroupAction', duplicateLeave.context);
  const leaveRun = performLeave('leave', { id: 'space-A' });
  await performLeave('leave', { id: 'space-A' });
  assert.equal(leaveCalls, 2, 'duplicate member leave is ignored');
  resolveLeave();
  await leaveRun;

  const lastDelete = baseContext({
    spacesRef: { current: [{ id: 'space-A' }] },
    getTogetherSpaces: async () => [],
  });
  await evaluateVariable('performGroupAction', lastDelete.context)('delete', { id: 'space-A' });
  assert.deepEqual(lastDelete.updates.spaces.at(-1), []);
  assert.equal(lastDelete.updates.selected.at(-1), undefined, 'last group delete enters empty state');

  const failure = baseContext({ deleteTogetherSpace: async () => { throw Error('server failure'); } });
  await evaluateVariable('performGroupAction', failure.context)('delete', { id: 'space-A' });
  assert.equal(failure.updates.spaces.length, 0, 'server failure keeps group list');
  assert.equal(failure.updates.alerts.at(-1)[0], '그룹을 삭제하지 못했어요.');
  const leaveFailure = baseContext({ leaveTogetherSpace: async () => { throw Error('server failure'); } });
  await evaluateVariable('performGroupAction', leaveFailure.context)('leave', { id: 'space-A' });
  assert.equal(leaveFailure.updates.spaces.length, 0);
  assert.equal(leaveFailure.updates.alerts.at(-1)[0], '그룹에서 나가지 못했어요.');

  let resolveStale;
  const stale = baseContext({ leaveTogetherSpace: () => new Promise(resolve => { resolveStale = resolve; }) });
  const staleRun = evaluateVariable('performGroupAction', stale.context)('leave', { id: 'space-A' });
  stale.context.sessionUserIdRef.current = 'user-B';
  resolveStale();
  await staleRun;
  assert.equal(stale.updates.spaces.length, 0, 'session switch blocks stale completion');
  assert.equal(stale.updates.alerts.length, 0);

  for (const [action, expectedTitle, expectedButton] of [
    ['delete', '우리 가족 그룹을 삭제할까요?', '그룹 삭제'],
    ['leave', '우리 가족 그룹에서 나갈까요?', '그룹 나가기'],
  ]) {
    const alerts = [];
    let performed = 0;
    const confirmationOpenRef = { current: false };
    const confirm = evaluateVariable('confirmGroupAction', {
      selectedSpace: { id: 'space-A', name: '우리 가족' }, managementAction: action,
      confirmationOpenRef, mutationRef: { current: undefined },
      performGroupAction: () => { performed += 1; }, Alert: { alert: (...args) => alerts.push(args) },
    });
    confirm(); confirm();
    assert.equal(alerts.length, 1, 'duplicate confirmation tap is ignored');
    assert.equal(alerts[0][0], expectedTitle);
    assert.equal(alerts[0][2][1].text, expectedButton);
    alerts[0][2][0].onPress();
    assert.equal(performed, 0, 'cancel never runs server action');
    assert.equal(confirmationOpenRef.current, false);
  }

  const server = read('src/features/together/togetherServerData.ts');
  assert.match(server, /rpc\('delete_together_space',[\s\S]*?p_space_id: spaceId/);
  assert.match(server, /rpc\('leave_together_space',[\s\S]*?p_space_id: spaceId/);
  const sql = read('supabase/migrations/20260904130000_add_leave_together_space.sql');
  assert.match(sql, /if v_role = 'owner'[\s\S]*?raise exception 'Owner cannot leave together space'/);
  assert.match(sql, /delete from public\.shared_event_participants[\s\S]*?event\.space_id = p_space_id/);
  assert.match(sql, /delete from public\.share_policies[\s\S]*?owner_user_id = v_user_id/);
  assert.match(sql, /delete from public\.together_memberships[\s\S]*?role = 'member'/);
  assert.doesNotMatch(sql, /delete from public\.user_(availability|day_off)_/);
  assert.match(sql, /revoke all privileges on function public\.leave_together_space\(uuid\) from anon/);
  assert.match(sql, /grant execute on function public\.leave_together_space\(uuid\) to authenticated/);

  const calendar = read('app/(tabs)/calendar.tsx');
  assert.match(calendar, /useFocusEffect[\s\S]*?getTogetherSpaces\(\)[\s\S]*?Promise\.all\(spaces\.map\(\(space\) => listSharedEvents\(space\.id\)\)\)[\s\S]*?setSharedEvents\(results\.flat\(\)/);
  const together = read('app/(tabs)/together.tsx');
  assert.match(together, /useFocusEffect[\s\S]*?setMembers\(\[\]\)[\s\S]*?setWeekDays\(\[\]\)[\s\S]*?setAvailabilityState\(\{ kind: 'loading' \}\)[\s\S]*?setRecommendationState\(\{ kind: 'loading' \}\)/);
}

run().then(() => console.log('togetherGroupManagement fixtures passed'));

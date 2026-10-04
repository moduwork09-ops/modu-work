const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const root = path.resolve(__dirname, '../../..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const source = f => ts.createSourceFile(f, read(f), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function nodeNamed(f, name) {
  let found; const s = source(f);
  function visit(n) { if ((ts.isFunctionDeclaration(n) || ts.isVariableDeclaration(n)) && n.name?.getText(s) === name) found = n; ts.forEachChild(n, visit); }
  visit(s); assert(found, name); return { node: found, source: s };
}
function value(f, name, context = {}) {
  const { node, source: s } = nodeNamed(f, name);
  const text = ts.isFunctionDeclaration(node) ? node.getText(s) : 'const ' + node.getText(s) + ';';
  return evaluate(text + '\nexports.result = ' + name + ';', context).result;
}
function evaluate(code, context) {
  const exports = {}; const jsx = (type, props) => ({ type, props });
  const compiled = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(compiled, { exports, require: () => ({ jsx, jsxs: jsx }), ...context }); return exports;
}
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, f);
const availability = require('../together/commonAvailabilityPresentation.ts');
const { toAppointmentPrefill, parseAppointmentPrefill } = require('../together/appointmentRecommendation.ts');
const { isLocalCalendarDate } = require('../together/dayOffProjection.ts');
const descendants = n => n == null ? [] : Array.isArray(n) ? n.flatMap(descendants) : [n, ...descendants(n.props?.children)];
async function run() {
  const pushes = [], router = { push: route => pushes.push(JSON.parse(JSON.stringify(route))) };
  const together = 'app/(tabs)/together.tsx';
  const Card = value(together, 'TodayAvailabilityCard', { ...availability, styles: {}, brandColors: {}, Card: 'Card', AppText: 'Text', Pressable: 'Pressable', View: 'View', MaterialCommunityIcons: 'Icon', PendingCard: 'Pending' });
  const navLock = { current: false }, selectedSpaceIdRef = { current: 'space-A' };
  const identity = { current: { spaceId: 'space-A', localDate: '2026-09-07', userId: 'A' } };
  const gapContext = { router, selectedSpace: { id: 'space-A' }, selectedSpaceIdRef, appointmentNavigationRef: navLock,
    isFocusedRef: { current: true }, availabilityRequestRef: identity, sessionUserIdRef: { current: 'A' }, ...availability };
  const onCreate = value(together, 'createGapAppointment', gapContext);
  const tree = Card({ state: { kind: 'loaded', day: { localDate: '2026-09-07', availabilityStatus: 'ready', intervals: [{ startMinute: 420, endMinute: 790 }, { startMinute: 840, endMinute: 1140 }] } }, onCreate });
  const buttons = descendants(tree).filter(n => n.type === 'Pressable');
  assert.equal(buttons.length, 2); buttons.forEach(n => { navLock.current = false; n.props.onPress(); n.props.onPress(); });
  assert.deepEqual(pushes.map(p => p.params), [
    { spaceId: 'space-A', date: '2026-09-07', startTime: '07:00', endTime: '13:10' },
    { spaceId: 'space-A', date: '2026-09-07', startTime: '14:00', endTime: '19:00' },
  ]);
  navLock.current = false; selectedSpaceIdRef.current = 'space-B';
  buttons[0].props.onPress(); assert.equal(pushes.length, 2, 'stale space CTA ignored');
  selectedSpaceIdRef.current = 'space-A';
  for (const state of [{ kind: 'loading' }, { kind: 'error' }, { kind: 'loaded', day: { availabilityStatus: 'ready', intervals: [] } }]) {
    const empty = Card({ state, onPress() {}, onRetry() {}, onCreate });
    assert(!descendants(empty).some(n => typeof n === 'string' && n.includes('약속 만들기')), 'no create CTA without intervals');
  }
  const recommended = value(together, 'createRecommendedAppointment', { ...gapContext, toAppointmentPrefill });
  const recommendation = { localDate: '2026-09-08', startMinute: 600, endMinute: 720 };
  recommended(recommendation); recommended(recommendation);
  assert.equal(pushes.length, 3, 'recommendation double tap navigates once');
  navLock.current = false; selectedSpaceIdRef.current = 'space-B';
  recommended(recommendation); assert.equal(pushes.length, 3, 'stale recommendation space ignored');
  selectedSpaceIdRef.current = 'space-A';
  assert.deepEqual(pushes.at(-1).params, { spaceId: 'space-A', date: '2026-09-08', startTime: '10:00', endTime: '12:00' });

  const calendar = 'app/(tabs)/calendar.tsx';
  const calendarUi = read(calendar);
  assert.match(calendarUi, /accessibilityLabel="일정 추가" onPress=\{\(\) => setIsScheduleTypeVisible\(true\)\}/, 'date detail opens the single event choice sheet');
  assert.doesNotMatch(calendarUi, /\+ 개인 일정|공동 일정 추가/, 'date detail no longer duplicates event actions');
  assert.match(calendarUi, /scheduleChoiceModal: \{ flexGrow: 0, maxHeight: '40%' \}/, 'event choice stays compact');
  assert.match(calendarUi, /onPress=\{\(\) => addScheduleByType\('untimed'\)\}/, 'personal choice defaults to untimed');
  assert.match(calendarUi, /onPress=\{\(\) => void addSharedSchedule\(\)\}/, 'shared choice retains existing routing');
  assert.match(calendarUi, /onRequestClose=\{\(\) => isScheduleTypeVisible \? setIsScheduleTypeVisible\(false\)/, 'Android back dismisses choice first');
  assert.match(calendarUi, /morePreview.*theme\.primary|theme\.primary.*morePreview/, 'monthly overflow count has primary contrast');
  const { selectMonthlyCalendarItems } = require('./calendarDisplayPresentation.ts');
  const display = { showPersonalEvents: true, showSharedEvents: true, showOvertime: true };
  const longTitle = '길이가 긴 개인 일정 제목도 저장된 원문을 그대로 유지합니다';
  for (const count of [1, 4, 5, 7]) {
    const items = Array.from({ length: count }, (_, index) => ({ id: String(index), category: 'personalEvent', text: index === 0 ? longTitle : `일정 ${index}` }));
    const preview = selectMonthlyCalendarItems(items, display);
    assert.equal(preview.visible.length, Math.min(count, 4), 'monthly item cap remains four');
    assert.equal(preview.remainingCount, Math.max(count - 4, 0), 'overflow count remains exact');
    assert.equal(preview.visible[0].text, longTitle, 'long title survives selection without mutation');
  }
  assert.match(calendarUi, /cellVisualState === 'selected'.*CALENDAR_SELECTION_BACKGROUND/, 'selection tint remains on the cell');
  assert.match(calendarUi, /holiday \? <AppText numberOfLines=\{1\} ellipsizeMode="tail".*holidayName/, 'holiday stays in the date header');
  const editorTitle = value(calendar, 'getPersonalEventEditorTitle');
  assert.equal(editorTitle(null), '개인 일정 추가');
  assert.equal(editorTitle('date-schedule-existing'), '개인 일정 편집');
  let reopenedId = null;
  value(calendar, 'openMemoEditor', {
    setEditingMemoId: id => { reopenedId = id; }, setMemoInput() {}, setMemoColor() {}, setMemoTimeEnabled() {},
    setMemoAllDay() {}, setMemoStartTime() {}, setMemoEndTime() {}, setMemoReminderMinutes() {}, setEditorMode() {}, setIsMemoEditorVisible() {},
    DEFAULT_MEMO_COLOR: '#FFFFFF',
  })({ id: 'date-schedule-existing', text: '교육', color: '#123456', timeEnabled: true, allDay: false, startTime: '18:00', endTime: '19:00' });
  assert.equal(editorTitle(reopenedId), '개인 일정 편집', 'saved event ID restores edit title on re-entry');
  assert.match(calendarUi, /isScheduleTypeVisible \? <ScrollView[\s\S]*?styles\.scheduleChoiceModal[\s\S]*?: <ScrollView key=\{isPersonalEditor \? 'personal-editor-scroll' : editorMode\} ref=\{modalKeyboardScroll\.scrollRef\}/, 'small chooser and editor use distinct scroll views');
  assert.match(calendarUi, /<Modal key=\{isScheduleTypeVisible \? 'schedule-choice' : isPersonalEditor \? 'personal-editor' : 'date-detail'\} transparent=\{!isPersonalEditor\}/, 'personal editor remounts as an independent full-screen modal');
  assert.match(calendarUi, /fullEditorScroll: \{ flex: 1, paddingHorizontal: spacing\.md \}/, 'editor fills the screen from the top');
  assert.doesNotMatch(calendarUi, /accessibilityLabel="일정 제목 입력"[\s\S]{0,100}autoFocus/, 'opening the editor does not automatically open the keyboard');
  assert.match(calendarUi, /maxHeight: '40%'/);
  assert.match(calendarUi, /maxHeight: '88%'/);
  assert.match(calendarUi, /paddingBottom: spacing\.lg \+ insets\.bottom/, 'calendar sheet keeps actions above navigation area');
  assert.match(calendarUi, /onRequestClose=\{\(\) => isScheduleTypeVisible \? setIsScheduleTypeVisible\(false\) : editorMode !== 'list' \? setEditorMode\('list'\)/, 'Android back leaves the chooser/editor in order');
  const calls = [];
  value(calendar, 'addScheduleByType', { openMemoEditor: () => calls.push('editor'), setMemoTimeEnabled: b => calls.push(b), setMemoAllDay: b => calls.push(b), setIsScheduleTypeVisible: b => calls.push(b) })('untimed');
  assert.deepEqual(calls, ['editor', false, false, false]);
  const notices = [], revision = { current: 1 };
  let spaces = [], resolve;
  const context = { creatingSharedRef: { current: false }, pendingSharedNavigationRef: { current: null },
    calendarOwnerRef: { current: 'A' }, memoEditorVisibleRef: { current: true }, sharedEventsRequestRef: revision,
    selectedDay: { date: '2026-09-07' }, session: { user: { id: 'A' } }, setIsScheduleTypeVisible() {},
    setIsMemoEditorVisible(b) { context.memoEditorVisibleRef.current = b; },
    getTogetherSpaces: async () => spaces, chooseTogetherHomeSpace: s => s[0], Alert: { alert: (...args) => notices.push(args) }, router };
  const shared = value(calendar, 'addSharedSchedule', context);
  const finish = value(calendar, 'finishSharedNavigation', context);
  await shared(); assert(notices.at(-1)[1].includes('함께 탭')); assert.equal(pushes.length, 3);
  spaces = [{ id: 'space-A' }]; await shared();
  assert.equal(pushes.length, 3, 'route waits for modal dismissal');
  assert.equal(context.memoEditorVisibleRef.current, false);
  await shared(); assert.equal(pushes.length, 3, 'pending navigation rejects duplicate taps');
  finish(); finish();
  assert.deepEqual(pushes.at(-1).params, { spaceId: 'space-A', date: '2026-09-07' });
  assert.equal(pushes.length, 4, 'dismissal completion navigates once');
  context.memoEditorVisibleRef.current = true;
  context.getTogetherSpaces = () => new Promise(r => resolve = r);
  const delayed = value(calendar, 'addSharedSchedule', context)();
  revision.current++; resolve(spaces); await delayed; finish(); assert.equal(pushes.length, 4, 'stale focus/account request cannot navigate');

  context.getTogetherSpaces = async () => { throw Error('deleted or unavailable space'); };
  await value(calendar, 'addSharedSchedule', context)();
  assert.equal(pushes.length, 4); assert(notices.at(-1)[1].includes('확인하지 못했어요'));
  context.getTogetherSpaces = () => new Promise(r => resolve = r);
  const closeDuringLoad = value(calendar, 'addSharedSchedule', context)();
  context.memoEditorVisibleRef.current = false; resolve(spaces); await closeDuringLoad; finish();
  assert.equal(pushes.length, 4, 'closing details cancels pending creation');

  assert.match(calendarUi, /<View style=\{\[styles\.detailShiftCard,[\s\S]*?<SettingsRow title="데일리 브리핑 보기" description="근무 · 일정 · 틈 · 메모를 한눈에"[\s\S]*?<View style=\{styles\.sectionHeader\}><AppText style=\{\{ fontWeight: '700' \}\}>일정/, 'daily entry sits between shift and schedule');
  assert.match(calendarUi, /onDismiss=\{finishModalNavigation\}/, 'iOS navigates after modal dismissal');
  assert.match(calendarUi, /!isMemoEditorVisible && Platform\.OS !== 'ios'\) finishModalNavigation\(\)/, 'Android navigates after closed-modal render');
  assert.match(calendarUi, /onPress=\{\(\) => openDateDetailsForDay\(\{ date, day, shift \}\)\}/, 'two-week agenda uses the same date detail');
  const dailyPushes = [], dailyDate = { date: '2026-09-07' };
  const dailyContext = {
    pendingDailyNavigationRef: { current: null }, pendingSharedNavigationRef: { current: null },
    memoEditorVisibleRef: { current: true }, sharedEventsRequestRef: { current: 1 },
    calendarOwnerRef: { current: 'A' }, session: { user: { id: 'A' } }, selectedDay: dailyDate,
    setIsMemoEditorVisible(visible) { dailyContext.memoEditorVisibleRef.current = visible; },
    router: { push: route => dailyPushes.push(JSON.parse(JSON.stringify(route))) },
  };
  const openDaily = value(calendar, 'openDailyBriefing', dailyContext);
  const finishDaily = value(calendar, 'finishDailyNavigation', dailyContext);
  openDaily(); openDaily();
  assert.equal(dailyPushes.length, 0, 'daily navigation waits for modal close');
  dailyDate.date = '2026-09-08';
  finishDaily(); finishDaily();
  assert.deepEqual(dailyPushes, [{ pathname: '/daily/[date]', params: { date: '2026-09-07' } }], 'captured date navigates exactly once');
  dailyContext.memoEditorVisibleRef.current = true;
  openDaily(); dailyContext.sharedEventsRequestRef.current++; finishDaily();
  assert.equal(dailyPushes.length, 1, 'stale request cannot navigate');
  dailyContext.memoEditorVisibleRef.current = true;
  openDaily(); dailyContext.calendarOwnerRef.current = 'B'; finishDaily();
  assert.equal(dailyPushes.length, 1, 'account switch cannot navigate');

  for (const zone of ['Asia/Seoul', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
    process.env.TZ = zone;
    for (const date of ['2026-09-01', '2026-12-31']) {
      const { node } = nodeNamed('app/together-event-create.tsx', '[selectedDate, setSelectedDate]');
      const result = evaluate('exports.result = ' + node.initializer.getText(), { prefill: parseAppointmentPrefill(date, undefined, undefined), params: { date }, isLocalCalendarDate, getTodayLocalDate: () => '2000-01-01', useState: v => [v] }).result;
      assert.equal(result[0], date);
    }
  }

  const keyFor = params => value('app/together-event-create.tsx', 'formKey', { params, session: { user: { id: 'A' } } });
  const full = { spaceId: 'space-A', date: '2026-09-07', startTime: '07:00', endTime: '13:10' };
  assert.equal(keyFor(full), keyFor({ ...full }), 'ordinary re-render preserves edited draft');
  assert.equal(keyFor(full), keyFor({ ...full, place: 'extra' }), 'picker return preserves draft');
  assert.notEqual(keyFor(full), keyFor({ ...full, date: '2026-09-08' }), 'new date remounts form');
  assert.notEqual(keyFor(full), keyFor({ ...full, spaceId: 'space-B' }), 'new space clears previous draft');
  assert.notEqual(keyFor(full), keyFor({ spaceId: 'space-A', date: full.date }), 'date-only entry drops previous time params');
  const completePrefill = parseAppointmentPrefill(full.date, full.startTime, full.endTime);
  assert.equal(completePrefill.startTime, '07:00'); assert.equal(completePrefill.endTime, '13:10');

  assert(!read(calendar).includes('날짜를 눌러 일정을 추가할 수 있어요'), 'calendar hint must be removed');
  const selected = [], editorModes = [];
  value(calendar, 'openDateDetailsForDay', {
    setSelectedDate: date => selected.push(date), setSelectedShiftTypeId: () => {},
    setEditorMode: mode => editorModes.push(mode), setIsMemoEditorVisible: () => {},
  })({ date: '2026-09-07', shift: { id: 'day' } });
  assert.deepEqual(selected, ['2026-09-07'], 'date press must still select its date');
  assert.deepEqual(editorModes, ['list'], 'date press must still open schedule details');


  // Execute the real personal save handler for each form mode.
  const personalSaved = [];
  for (const [timeEnabled, allDay] of [[true,false],[true,true],[false,false]]) {
    const personalContext = {
      memoInput:'교육',memoTimeEnabled:timeEnabled,memoAllDay:allDay,memoStartTime:'18:00',memoEndTime:'19:00',
      editingMemoId:'existing',selectedMemos:[{id:'existing',notificationId:'legacy'}],selectedDay:{date:'2026-09-07'},
      memoColor:'#123456',memoReminderMinutes:10,Alert:{alert:()=>{throw Error('unexpected personal validation');}},
      schedule:{saveDateMemo:async(date,memo)=>{personalSaved.push({date,memo});return true;}},setEditorMode:()=>{},
    };
    await value(calendar,'saveSchedule',personalContext)();
    const memo=personalSaved.at(-1).memo;
    assert.equal(memo.timeEnabled,timeEnabled);assert.equal(memo.allDay,allDay);
    assert.equal(memo.startTime,timeEnabled&&!allDay?'18:00':null);
    assert.equal(memo.reminderMinutes,timeEnabled&&!allDay?10:null);
    assert.equal(memo.notificationId,'legacy');assert.equal(memo.id,'existing');assert.equal(memo.color,'#123456');
  }

  const {createSharedEventIsoRange}=require('../together/sharedEventDateTime.ts');
  const sharedFile='app/together-event-create.tsx';
  const registrations=[],sharedAlerts=[];
  const submitContext={
    title:'저녁 약속',spaceId:'space-A',session:{user:{id:'A'}},
    membersState:{status:'loaded',ownerUserId:'A',spaceId:'space-A'},activeMembers:[{userId:'A'},{userId:'B'}],
    selectedDate:'2026-09-07',eventTime:{startTime:'18:00',endTime:'19:00'},loadedDay:undefined,
    isSubmittingRef:{current:false},isFocusedRef:{current:true},requestGenerationRef:{current:1},setIsSubmitting:()=>{},
    memo:'메모',selectedPlace:null,location:'서울',createSharedEventIsoRange,
    Intl:{DateTimeFormat:()=>({resolvedOptions:()=>({timeZone:'Asia/Seoul'})})},
    createSharedEvent:async data=>registrations.push(data),Alert:{alert:(...a)=>sharedAlerts.push(a)},router,
  };
  for(const day of [undefined,{availabilityStatus:'not_synced',timezoneName:'Asia/Seoul'},{availabilityStatus:'ready',timezoneName:'Asia/Seoul',intervals:[]}]){
    submitContext.loadedDay=day;
    await value(sharedFile,'saveSharedEvent',submitContext)();
    assert.equal(registrations.at(-1).startsAt,'2026-09-07T09:00:00.000Z');
    assert.equal(registrations.at(-1).endsAt,'2026-09-07T10:00:00.000Z');
    assert.deepEqual(Array.from(registrations.at(-1).participantUserIds),['A','B']);
  }
  assert.equal(registrations.length,3,'manual time works without available intervals');
  submitContext.eventTime={startTime:'19:00',endTime:'18:00'};
  await value(sharedFile,'saveSharedEvent',submitContext)();assert.equal(registrations.length,3,'invalid range never saves');
  submitContext.eventTime={startTime:'18:00',endTime:'19:00'};
  let finishSave;submitContext.createSharedEvent=()=>new Promise(r=>finishSave=r);
  const submit=value(sharedFile,'saveSharedEvent',submitContext),inFlight=submit();
  await submit();const alertCount=sharedAlerts.length;
  submitContext.requestGenerationRef.current++;finishSave();await inFlight;
  assert.equal(sharedAlerts.length,alertCount,'changed date/focus cannot show stale success');
  let backCount=0;submitContext.router={back:()=>backCount++};submitContext.createSharedEvent=async()=>{};
  await value(sharedFile,'saveSharedEvent',submitContext)();
  const confirm=sharedAlerts.at(-1)[2][0].onPress;submitContext.isFocusedRef.current=false;confirm();
  assert.equal(backCount,0,'late confirmation cannot pop another screen');
  // Availability is advisory and cannot overwrite a manual value or incoming prefill.
  let manualOverwrites=0,dayUpdates=0;
  const availabilityLoader=value(sharedFile,'loadAvailability',{
    useCallback:fn=>fn,requestGenerationRef:{current:0},session:{user:{id:'A'}},spaceId:'space-A',selectedDate:'2026-09-07',
    setAvailabilityState:()=>dayUpdates++,getTogetherCommonAvailability:async()=>[{localDate:'2026-09-07',availabilityStatus:'ready',intervals:[{startMinute:420,endMinute:480}]}],
    setEventTime:()=>manualOverwrites++,setSelectedSlotIndex:()=>{},
  });
  availabilityLoader();await new Promise(setImmediate);assert.equal(manualOverwrites,0);assert.equal(dayUpdates,2);
  console.log('PASS QA: personal timed/all-day/untimed storage, shared manual time with missing/not-synced/empty availability, invalid ranges, advisory prefill, stale save/confirmation.');

  console.log('PASS review hardening: stale params/CTA, modal sequence, no-space/closed-screen, calendar hint removal with date press preserved');
  console.log('PASS PHASE A: two interval CTAs, recommendation, personal handler, date-only shared route/no-space/stale-focus, local dates in 3 timezones');
}
run().catch(e => { console.error(e); process.exitCode = 1; });

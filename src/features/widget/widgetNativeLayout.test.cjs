const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = (relative) => fs.existsSync(path.join(root, relative));

const nativeRoot = 'modules/modu-work-widget/android/src/main/';
const manifest = read(nativeRoot + 'AndroidManifest.xml');
const provider = read(nativeRoot + 'java/expo/modules/moduworkwidget/ModuWorkWidgetProvider.kt');
const moduleSource = read(nativeRoot + 'java/expo/modules/moduworkwidget/ModuWorkWidgetModule.kt');
const policy = read(nativeRoot + 'java/expo/modules/moduworkwidget/WidgetLayoutPolicy.kt');
const renderer = read(nativeRoot + 'java/expo/modules/moduworkwidget/WidgetRenderer.kt');
const strings = read(nativeRoot + 'res/values/strings.xml');
const scheduleContext = read('src/features/shifts/ShiftScheduleContext.tsx');

const receivers = [...manifest.matchAll(/<receiver\b[\s\S]*?<\/receiver>/g)].map(match => match[0]);
assert.equal(receivers.length, 3, 'Picker exposes exactly three provider receivers');
const providerContracts = [
  ['ModuWorkTodayWidgetProvider', 'WidgetMode.TODAY', 'modu_work_widget_today_info', 'modu_work_widget_today_name'],
  ['ModuWorkThreeDayWidgetProvider', 'WidgetMode.THREE_DAY', 'modu_work_widget_three_day_info', 'modu_work_widget_three_day_name'],
  ['ModuWorkWidgetProvider', 'WidgetMode.MONTH', 'modu_work_widget_info', 'modu_work_widget_month_name'],
];
for (const [className, mode, infoName, labelName] of providerContracts) {
  const receiver = receivers.find(value => value.includes(className));
  assert.ok(receiver, className + ' receiver is declared');
  assert.match(receiver, new RegExp('@xml/' + infoName));
  assert.match(receiver, new RegExp('@string/' + labelName));
  assert.match(provider, new RegExp('class ' + className + ' : BaseModuWorkWidgetProvider\\(' + mode.replace('.', '\\.') + '\\)'));
}
assert.match(provider, /WidgetProviderEntry\(ModuWorkTodayWidgetProvider::class\.java, WidgetMode\.TODAY\)/);
assert.match(provider, /WidgetProviderEntry\(ModuWorkThreeDayWidgetProvider::class\.java, WidgetMode\.THREE_DAY\)/);
assert.match(provider, /WidgetProviderEntry\(ModuWorkWidgetProvider::class\.java, WidgetMode\.MONTH\)/);
assert.match(provider, /onAppWidgetOptionsChanged/);
assert.doesNotMatch(policy, /classify\(/, 'resize no longer selects another widget mode');
assert.doesNotMatch(provider, /WidgetLayoutPolicy\.classify/, 'provider identity fixes render mode');
assert.match(provider, /contentHeightDp\(heightDp, mode\)/);
assert.match(provider, /if \(mode == WidgetMode\.MONTH\) View\.VISIBLE else View\.GONE/);
assert.match(provider, /if \(mode != WidgetMode\.MONTH\) return/, 'month navigation actions stay isolated to month provider');
assert.match(provider, /Uri\.parse\("teum:\/\/calendar"\)/);
assert.match(provider, /PendingIntent\.FLAG_UPDATE_CURRENT or PendingIntent\.FLAG_IMMUTABLE/);

assert.match(moduleSource, /ModuWorkWidgetUpdater\.updateAll/);
assert.match(provider, /WidgetProviderRegistry\.entries\.forEach/);
assert.match(provider, /getAppWidgetIds\(ComponentName\(context, entry\.providerClass\)\)/);

const infoCases = [
  ['res/xml/modu_work_widget_today_info.xml', '110dp', '110dp', '2', '2', 'modu_work_widget_preview'],
  ['res/xml/modu_work_widget_three_day_info.xml', '250dp', '110dp', '4', '2', 'modu_work_widget_three_day_preview'],
  ['res/xml/modu_work_widget_info.xml', '300dp', '360dp', '4', '5', 'modu_work_widget_month_preview'],
];
for (const [relative, width, height, cellWidth, cellHeight, preview] of infoCases) {
  assert.ok(exists(nativeRoot + relative), relative + ' exists');
  const info = read(nativeRoot + relative);
  assert.match(info, new RegExp('android:minWidth="' + width + '"'));
  assert.match(info, new RegExp('android:minHeight="' + height + '"'));
  assert.match(info, new RegExp('android:targetCellWidth="' + cellWidth + '"'));
  assert.match(info, new RegExp('android:targetCellHeight="' + cellHeight + '"'));
  assert.match(info, new RegExp(preview));
  assert.match(info, /android:resizeMode="horizontal\|vertical"/);
}
assert.ok(exists(nativeRoot + 'res/layout/modu_work_widget_three_day_preview.xml'));
assert.ok(exists(nativeRoot + 'res/drawable/modu_work_widget_three_day_preview.xml'));
assert.ok(exists(nativeRoot + 'res/layout/modu_work_widget_month_preview.xml'));
assert.ok(exists(nativeRoot + 'res/drawable/modu_work_widget_month_preview.xml'));
assert.match(strings, /오늘 근무/);
assert.match(strings, /3일 근무/);
assert.match(strings, /월간 근무표/);

assert.match(renderer, /mode == WidgetMode\.TODAY/);
assert.match(renderer, /mode == WidgetMode\.THREE_DAY/);
assert.match(renderer, /drawCalendar\(/);
assert.match(renderer, /cell\.optJSONArray\("infoRows"\)\?\.optJSONObject\(0\)/, 'today draws no more than the first information row');
assert.match(renderer, /val labels = listOf\("오늘", "내일", "모레"\)/);
assert.match(renderer, /columnWidth = \(width - outerPadding \* 2f - gap \* 2f\) \/ 3f/, 'three-day columns have equal width');
assert.match(renderer, /ellipsize\(shiftLabel\(shift\), namePaint, right - left - 8f \* density\)/);
assert.match(renderer, /if \(shift\.optString\("kind"\) == "rest"\) return ""/, 'rest/off does not repeat a no-work time row');
assert.doesNotMatch(renderer, /return "근무 없음"/);
assert.match(renderer, /for \(index in 0 until minOf\(42, cells\.length\(\)\)\)/);
assert.match(renderer, /for \(index in 0 until minOf\(2, infoRows\.length\(\)\)\)/);
assert.match(renderer, /paint\.measureText\(value\)/);
assert.match(renderer, /paint\.breakText\(/);
assert.match(renderer, /INFO_TIME_PREFIX/);
assert.match(renderer, /INFO_OVERFLOW_SUFFIX/);
assert.match(renderer, /Character\.isHighSurrogate/);
assert.match(renderer, /Bitmap\.Config\.RGB_565/);

assert.match(scheduleContext, /const snapshot = isHydrated && hasCompletedSetup/);
assert.match(scheduleContext, /createEmptyMonthlyWidgetSnapshot\(\)/);
assert.match(scheduleContext, /ownerUserId/, 'snapshot refresh remains owner scoped');

console.log('widget independent provider/layout contract passed');

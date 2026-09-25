const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), cp = require('node:child_process'), ts = require('typescript');
const root = path.resolve(__dirname, '../../..'), file = 'app/(tabs)/my.tsx';
const code = fs.readFileSync(path.join(root,file),'utf8');
function handler(text,name) {
  const s=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let result;
  function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(s)===name)result=n.initializer.getText(s);ts.forEachChild(n,visit);}visit(s);assert(result);return result;
}
const previous=cp.execFileSync('git',['-c','safe.directory=C:/Dev/modu-work-v1','show','HEAD:'+file],{cwd:root,encoding:'utf8'});
for(const name of ['handleBackup','handleRestore','handleReset']) assert.equal(handler(code,name),handler(previous,name),name+' body must remain unchanged');
const routes=[],alerts=[],calls=[];
const jsx=(type,props)=>({type,props});
const colors={background:'pastel',text:'ink'}, theme={surface:'white',border:'border',accent:'coral'};
const mocks={
 'react':{Fragment:'Fragment',useState:v=>[v,()=>{}]},
 'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'},
 'expo-router':{useRouter:()=>({push:r=>routes.push(JSON.parse(JSON.stringify(r)))})},
 'react-native':{Alert:{alert:(...a)=>alerts.push(a)},Pressable:'Pressable',ScrollView:'ScrollView',View:'View',StyleSheet:{create:s=>s,hairlineWidth:1}},
 'react-native-safe-area-context':{useSafeAreaInsets:()=>({bottom:24})},
};
const exportsValue={};
const requireMock=name=>{
 if(mocks[name])return mocks[name];
 if(name.includes('MaterialCommunityIcons'))return 'Icon';
 if(name.endsWith('/components'))return {AppText:'Text',Screen:'Screen'};
 if(name.endsWith('/constants'))return {calendarShiftColors:{training:colors,annualLeave:colors,rest:colors,offDuty:colors},radius:{xl:20,md:12},spacing:{sm:8,md:16,xs:4,xl:24,xxl:32},useAppTheme:()=>theme};
 if(name.endsWith('/AuthContext'))return {useAuth:()=>({session:{user:{id:'A',email:'hidden@example.com'}}})};
 if(name.endsWith('/ShiftScheduleContext'))return {useShiftSchedule:()=>({reloadPersistedData:async()=>calls.push('reload'),resetAllUserData:async()=>calls.push('reset')})};
 if(name.endsWith('/localDataBackup'))return {createAndShareLocalBackup:async()=>calls.push('backup'),pickLocalBackup:async()=>({backup:true}),restoreLocalBackup:async()=>calls.push('restore')};
 if(name.endsWith('/dayOffProjectionSync'))return {scheduleReplacementDayOffProjectionSync:async()=>calls.push('dayOffSync')};
 if(name.endsWith('/availabilityProjectionSync'))return {scheduleFullAvailabilityProjectionSync:async()=>calls.push('availabilitySync')};
 throw Error(name);
};
vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{exports:exportsValue,require:requireMock});
const descendants=n=>n==null?[]:Array.isArray(n)?n.flatMap(descendants):[n,...descendants(n.props?.children)];
async function run(){
 const tree=exportsValue.default(), all=descendants(tree), rows=all.filter(n=>n.type==='Pressable');
 assert.deepEqual(rows.map(n=>n.props.accessibilityLabel),['내 정보','캘린더 설정','알림 설정','근무유형','근무패턴','근무표 찾기 · 공유','급여 계산','급여 설정','사용 방법','베타 피드백','데이터 백업','데이터 복원','모든 데이터 초기화']);
 assert(!all.includes('hidden@example.com'));
 for(const row of rows){
   assert.equal(row.props.children[0].props.children.type,'Icon','left icon');
   assert.equal(row.props.children.at(-1).props.name,'chevron-right');
   assert.equal(row.props.style({pressed:false})[0].minHeight,74);
 }
 const scroll=all.find(n=>n.type==='ScrollView');assert.equal(scroll.props.contentContainerStyle[1].paddingBottom,56);
 assert.equal(all.filter(n=>n.type==='View'&&Array.isArray(n.props.style)&&n.props.style[0]?.height===1).length,6,'group dividers');
 const last=rows.at(-1);assert.equal(last.props.children[0].props.children.props.color,'coral');
 assert.equal(last.props.children[1].props.children[0].props.style[1].color,'coral');
 rows.slice(0,10).forEach(r=>r.props.onPress());
 assert.deepEqual(routes,['/account','/calendar-settings','/notification-settings','/shift-types','/shift-pattern','/shift-presets','/salary','/salary-settings',{pathname:'/tutorial',params:{mode:'replay'}},'/beta-feedback']);
 for(const r of routes){const p=typeof r==='string'?r:r.pathname;assert(['app'+p+'.tsx','app'+p+'/index.tsx'].some(f=>fs.existsSync(path.join(root,f))),p);}
 rows[10].props.onPress();await new Promise(setImmediate);assert(calls.includes('backup'));
 rows[11].props.onPress();await new Promise(setImmediate);
 const restore=alerts.find(a=>a[0]==='데이터를 복원할까요?');assert(restore);assert(!calls.includes('restore'));
 restore[2].find(b=>b.text==='복원하기').onPress();await new Promise(setImmediate);
 assert.deepEqual(calls.slice(-4),['restore','reload','dayOffSync','availabilitySync']);
 last.props.onPress();const reset=alerts.find(a=>a[0]==='모든 데이터를 초기화할까요?');assert(reset);assert(!calls.includes('reset'));
 assert.equal(reset[2][1].style,'destructive');reset[2][1].onPress();await new Promise(setImmediate);assert.equal(calls.at(-1),'reset');
 console.log('PASS PHASE B: 13 MY rows/order, feedback/replay routes, grouped dividers/left icons/reset emphasis/scroll padding, unchanged backup/restore/reset bodies and confirmation flow');
}
run().catch(e=>{console.error(e);process.exitCode=1;});

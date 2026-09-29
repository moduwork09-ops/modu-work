const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.resolve(__dirname,'../../..');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const calculator=require('./salaryCalculator.ts'),input=require('./salaryInput.ts'),selector=require('../shifts/activeShiftTypes.ts');
const types=['new','orphan','custom-shift-123'].map(id=>({id,name:id,abbreviation:'주',kind:'work',color:'#FFF',textColor:'#000',startTime:'09:00',endTime:'18:00'}));
const schedule={shiftTypes:types,shiftPattern:['new'],patternHistory:[],shiftDateOverrides:{},anchorDate:'2026-09-01',anchorPatternIndex:0};
const initial={version:1,isConfigured:true,baseSalary:1000,salaryVisible:true,shiftAllowanceByShiftTypeId:{orphan:{mode:'per_shift',amount:777}},additionalAllowances:[]};
let settings=null,failed=false,saving=false,saveResult=true,backs=0,saved=[],alerts=[],routes=[];
const controller=()=>({settings,failed,saving,setSettings:fn=>{settings=fn(settings);},save:async value=>{saved.push(value);if(saveResult instanceof Error)throw saveResult;return saveResult;}});
const jsx=(type,props)=>({type,props});
const descendants=n=>n==null?[]:Array.isArray(n)?n.flatMap(descendants):[n,...descendants(n.props?.children)];
function screen(file){
 let state=[],cursor=0;const exports={};
 const requireMock=name=>{
  if(name==='react')return {useMemo:fn=>fn(),useState:value=>{const i=cursor++;if(!(i in state))state[i]=value;return [state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v;}];}};
  if(name==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:'Fragment'};
  if(name==='expo-router')return {useRouter:()=>({back:()=>backs++,push:r=>routes.push(r),replace:r=>routes.push(r)}),useLocalSearchParams:()=>({month:'2026-09'})};
  if(name==='react-native')return {Alert:{alert:(...a)=>alerts.push(a)},Pressable:'Pressable',TextInput:'TextInput',View:'View',ScrollView:'ScrollView',ActivityIndicator:'Spinner',StyleSheet:{create:s=>s}};
  if(name.includes('MaterialCommunityIcons'))return 'Icon';
  if(name.endsWith('/components'))return {AppText:'Text',Card:'Card',PrimaryButton:'Button',Screen:'Screen'};
   if(name.endsWith('/useFocusedInputScroll'))return {useFocusedInputScroll:()=>({scrollRef:{current:null},onScroll(){},onInputFocus(){}})};
  if(name.endsWith('/constants'))return {radius:{md:12,sm:8},spacing:{xs:8,sm:12,md:16,lg:20,xl:24,xxl:32},useAppTheme:()=>({text:'black',border:'gray'})};
  if(name.endsWith('/useSalarySettings'))return {useSalarySettings:controller};
  if(name.endsWith('/salaryShiftIdentity'))return require('./salaryShiftIdentity.ts');
  if(name.endsWith('/mockData'))return {formatShiftTime:type=>type.startTime+' ~ '+type.endTime};
  if(name.endsWith('/salaryInput'))return input;
  if(name.endsWith('/salaryCalculator'))return calculator;
  if(name.endsWith('/ShiftScheduleContext'))return {useShiftSchedule:()=>schedule};
  if(name.endsWith('/activeShiftTypes'))return selector;
  throw Error(name);
 };
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{exports,require:requireMock,Date});
 return ()=>{cursor=0;return descendants(exports.default());};
}
const editor=screen('app/salary-settings.tsx'),summary=screen('app/salary.tsx'),detail=screen('app/salary-detail.tsx');
const tick=()=>new Promise(setImmediate);
const field=(tree,label)=>tree.find(n=>n.type==='TextInput'&&n.props.accessibilityLabel===label);
async function run(){
 assert(!editor().some(n=>n.type==='TextInput'),'no editable defaults before hydration');
 settings=structuredClone(initial);
 let tree=editor();const base=field(tree,'월 기본급');
 for(const invalid of ['-100','NaN','Infinity','1e8','999999999999999999999'])base.props.onChangeText(invalid);
 assert.equal(settings.baseSalary,1000);assert.equal(alerts.length,5);
 for(const valid of ['1','10','100','1000','10000'])field(editor(),'월 기본급').props.onChangeText(valid);
 assert.equal(field(editor(),'월 기본급').props.value,'10000','typing beyond comma boundary works');
 field(editor(),'월 기본급').props.onChangeText('');assert.equal(settings.baseSalary,0);
 field(editor(),'custom-shift-123 1회당 수당').props.onChangeText('200');assert.equal(settings.shiftAllowanceByShiftTypeId['custom-shift-123'].amount,200);
 assert.equal(settings.shiftAllowanceByShiftTypeId.orphan.amount,777);
 assert(!field(editor(),'orphan 1회당 수당'));
 tree=editor();assert.equal(tree.find(n=>n.type==='ScrollView').props.keyboardShouldPersistTaps,'handled');
  assert.equal(typeof tree.find(n=>n.type==='TextInput'&&n.props.placeholder==='수당 이름').props.onFocus,'function','additional allowance fields request keyboard scroll');
 tree.find(n=>n.type==='TextInput'&&n.props.placeholder==='수당 이름').props.onChangeText('추가');
 tree.find(n=>n.type==='TextInput'&&n.props.placeholder==='금액').props.onChangeText('300');
 tree=editor();tree.find(n=>n.type==='Pressable'&&descendants(n).includes('+ 수당 추가')).props.onPress();
 assert.equal(settings.additionalAllowances[0].amount,300);
 saveResult=new Error('disk');editor().find(n=>n.type==='Button'&&n.props.label==='완료').props.onPress();await tick();assert.equal(backs,0);
 saveResult=false;editor().find(n=>n.type==='Button'&&n.props.label==='완료').props.onPress();await tick();assert.equal(backs,0,'stale completion cannot navigate');
 saveResult=true;editor().find(n=>n.type==='Button'&&n.props.label==='완료').props.onPress();await tick();assert.equal(backs,1);assert(saved.at(-1).isConfigured);
 saving=true;assert(editor().filter(n=>n.type==='TextInput').every(n=>n.props.editable===false));saving=false;
 settings=structuredClone(initial);tree=summary();assert(!tree.includes('orphan'));assert(tree.includes('new'));
 assert(detail().some(n=>n==='1,000원'));
 settings={...initial,baseSalary:Infinity};assert(summary().some(n=>n==='금액이 너무 크거나 근무 데이터를 계산할 수 없어요.'));
 settings=null;failed=true;assert(summary().includes('급여 설정을 불러올 수 없어요.'));

 // Pending history stays visible, exact unique recommendations only update the draft,
 // and completed history stays collapsed until the user opens it.
 settings=structuredClone(initial);
 schedule.shiftTypes.push({...types[0],id:'old-match'},{...types[0],id:'old-D',name:'이전 주간'});
 schedule.patternHistory=[{id:'old-match-entry',effectiveFrom:'2026-08-01',pattern:['old-match']},{id:'old-D-entry',effectiveFrom:'2026-08-15',pattern:['old-D']},{id:'new',effectiveFrom:'2026-09-01',pattern:['new']}];
 tree=editor();
 assert(tree.some(n=>n.type==='Pressable'&&n.props.accessibilityLabel==='이전 주간 연결'),'unlinked history remains visible');
 assert(tree.some(n=>n.type==='Pressable'&&n.props.accessibilityLabel==='new 연결'),'unlinked recommended history remains visible before confirmation');
 const savedBeforeRecommendation=saved.length;
 tree.find(n=>n.type==='Pressable'&&n.props.accessibilityLabel==='추천 연결 적용').props.onPress();
 assert.equal(settings.shiftTypeLinks['old-match'],'new','recommendation creates an explicit draft ID link');
 assert.equal(settings.shiftTypeLinks['old-D'],undefined);assert.equal(saved.length,savedBeforeRecommendation,'recommendation does not persist before Complete');
 tree=editor();const completedToggle=tree.find(n=>n.type==='Pressable'&&n.props.accessibilityLabel==='연결 완료된 이전 근무유형 1개 보기');
 assert(completedToggle);assert(!tree.some(n=>n.type==='Pressable'&&n.props.accessibilityLabel==='new 연결'),'completed group is collapsed by default');
 completedToggle.props.onPress();tree=editor();assert(tree.some(n=>n.type==='Pressable'&&n.props.accessibilityLabel==='new 연결'),'completed group can be expanded');
 tree.find(n=>n.type==='Pressable'&&n.props.accessibilityLabel==='new 연결').props.onPress();
 tree=editor();tree.find(n=>n.type==='Pressable'&&n.props.accessibilityLabel==='old-match 연결 custom-shift-123').props.onPress();
 assert.equal(settings.shiftTypeLinks['old-match'],'custom-shift-123','expanded mapping remains individually editable');
 tree=editor();tree.find(n=>n.type==='Pressable'&&n.props.accessibilityLabel==='이전 주간 연결').props.onPress();
 tree=editor();tree.find(n=>n.type==='Pressable'&&n.props.accessibilityLabel==='old-D 연결 new').props.onPress();
 assert.equal(settings.shiftTypeLinks['old-D'],'new');
 assert.equal(settings.shiftAllowanceByShiftTypeId.orphan.amount,777);
 editor().find(n=>n.type==='Button'&&n.props.label==='완료').props.onPress();await tick();
 assert.equal(saved.at(-1).shiftTypeLinks['old-D'],'new');

 console.log('PASS salary screens: invalid/continuous/blank input, custom and hidden mapping, additional allowance, loading/saving, failed/stale/successful save navigation, monthly list, safe error state.');
}
run().catch(e=>{console.error(e);process.exitCode=1;});

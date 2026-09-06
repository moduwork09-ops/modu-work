const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.resolve(__dirname,'../../..'),data=new Map(),cache={};
let owner='A',failWrite=false,exported;
const storage={
 getItem:async k=>data.get(k)??null,setItem:async(k,v)=>data.set(k,v),removeItem:async k=>data.delete(k),
 multiGet:async keys=>keys.map(k=>[k,data.get(k)??null]),
 multiSet:async pairs=>{for(const [k,v]of pairs){data.set(k,v);if(failWrite){failWrite=false;throw Error('partial write');}}},
 multiRemove:async keys=>{for(const k of keys)data.delete(k);},
};
const key=k=>k.replace('modu-work.','modu-work.user.'+owner+'.');
const constants={
 RECENT_COLORS_STORAGE_KEY:'modu-work.recent-colors.v1',PERSONAL_EVENTS_STORAGE_KEY:'modu-work.personal-events.v1',DATE_MEMOS_STORAGE_KEY:'modu-work.date-memos.v1',
 SHIFT_SETTINGS_STORAGE_KEY:'modu-work.shift-settings.v1',SHIFT_DATE_OVERRIDES_STORAGE_KEY:'modu-work.shift-date-overrides.v1',
 SALARY_SETTINGS_STORAGE_KEY:'modu-work.salary-settings.v1',OVERTIME_ENTRIES_STORAGE_KEY:'modu-work.overtime-entries.v1',MONTHLY_MEMOS_STORAGE_KEY:'modu-work.monthly-memos.v1',
 SHIFT_SETTINGS_STORAGE_VERSION:2,PERSONAL_EVENTS_STORAGE_VERSION:1,DATE_MEMOS_STORAGE_VERSION:1,SHIFT_DATE_OVERRIDES_STORAGE_VERSION:1,OVERTIME_STORAGE_VERSION:1,MONTHLY_MEMOS_STORAGE_VERSION:1,
 // These fixtures contain no non-salary records. Keep unrelated feature adapters isolated.
 parsePersistedShiftSettings:()=>null,parsePersonalEvents:()=>[],parsePersistedDateMemos:()=>({}),parseShiftDateOverrides:()=>({}),parseMonthlyMemos:()=>({}),parseBackupOvertimeEntries:()=>[],parseOvertimeEntries:()=>[],
};
function load(file){
 file=path.resolve(root,file);if(cache[file])return cache[file];const exports=cache[file]={};
 const requireMock=name=>{
  if(name==='@react-native-async-storage/async-storage')return storage;
  if(name==='expo-document-picker')return {};
  if(name==='expo-file-system')return {Paths:{cache:'mock'},File:class{constructor(){this.exists=false;this.uri='mock';this.name='backup.json';}create(){}write(s){exported=s;}}};
  if(name==='expo-sharing')return {isAvailableAsync:async()=>true,shareAsync:async()=>{}};
  if(name.endsWith('/userScopedStorage'))return {getCurrentUserScopedStorageKey:async k=>key(k),readUserScopedStorageValue:async k=>data.get(key(k))??null};
  if(file.endsWith('localDataBackup.ts')&&!name.includes('/salary/'))return constants;
  const p=path.resolve(path.dirname(file),name+'.ts');return load(p);
 };
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{exports,require:requireMock,console,Date});
 return exports;
}
const backup=load('src/features/backup/localDataBackup.ts');
const A={shiftTypeLinks:{historical:"current"},version:1,isConfigured:true,baseSalary:3000,salaryVisible:false,shiftAllowanceByShiftTypeId:{historical:{mode:'per_shift',amount:100}},additionalAllowances:[{id:'x',name:'월',amount:200,applyMode:'monthly'}]};
const copy=x=>JSON.parse(JSON.stringify(x));
async function run(){
 const salaryKey=key(constants.SALARY_SETTINGS_STORAGE_KEY),bKey=salaryKey.replace('.A.','.B.');
 data.set(salaryKey,JSON.stringify(A));data.set(bKey,JSON.stringify({...A,baseSalary:9000}));
 await backup.createAndShareLocalBackup();const parsed=backup.parseModuWorkBackup(exported);assert.deepEqual(copy(parsed.salarySettings),A);
 data.set(salaryKey,JSON.stringify({...A,baseSalary:1}));await backup.restoreLocalBackup(parsed);assert.deepEqual(JSON.parse(data.get(salaryKey)),A);
 const before=[...data].sort();failWrite=true;await assert.rejects(backup.restoreLocalBackup({...parsed,salarySettings:{...A,baseSalary:10}}),/partial write/);assert.deepEqual([...data].sort(),before,'rollback restores salary and all fixture keys');
 const old=copy(parsed);delete old.salarySettings;assert(backup.parseModuWorkBackup(JSON.stringify(old)));await backup.restoreLocalBackup(old);assert(!data.has(salaryKey));assert.equal(JSON.parse(data.get(bKey)).baseSalary,9000);
 assert.equal(backup.parseModuWorkBackup(JSON.stringify({...parsed,salarySettings:{...A,baseSalary:-1}})),null);
 console.log('PASS salary backup: real export/parse/restore, historical mapping, missing optional salary, partial-write rollback, other account preserved (non-salary adapters mocked).');
}
run().catch(e=>{console.error(e);process.exitCode=1;});

const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.resolve(__dirname,'../../..');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
let owner='A', state=[],cursor=0,focusCallback,cleanup,queuedFocus;
const reads=[],writes=[];
const same=(a,b)=>a&&b&&a.length===b.length&&a.every((x,i)=>x===b[i]);
const hooks={
 useRef:value=>{const i=cursor++;return state[i]??(state[i]={current:value});},
 useState:value=>{const i=cursor++;if(!(i in state))state[i]=value;return [state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v;}];},
 useCallback:(fn,deps)=>{const i=cursor++;if(!state[i]||!same(state[i].deps,deps))state[i]={fn,deps};return state[i].fn;},
};
const moduleExports={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'src/features/salary/useSalarySettings.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:moduleExports,require:name=>{
 if(name==='react')return hooks;
 if(name==='expo-router')return {useFocusEffect:fn=>{if(fn!==focusCallback){focusCallback=fn;queuedFocus=fn;}}};
 if(name.endsWith('AuthContext'))return {useAuth:()=>({session:owner?{user:{id:owner}}:null})};
 if(name==='./salaryStorage')return {loadSalarySettings:id=>{const d=deferred();reads.push({id,...d});return d.promise;},saveSalarySettings:(id,value)=>{const d=deferred();writes.push({id,value,...d});return d.promise;}};
 throw Error(name);
}});
const render=()=>{cursor=0;return moduleExports.useSalarySettings();};
const focus=()=>{cleanup?.();cleanup=focusCallback();};
const tick=()=>new Promise(setImmediate);
const A={version:1,isConfigured:true,baseSalary:1000,salaryVisible:true,shiftAllowanceByShiftTypeId:{old:{mode:'per_shift',amount:99}},additionalAllowances:[]};
async function run(){
 let h=render();focus();h=render();assert.equal(h.settings,null);assert.equal(await h.save(A),false);assert.equal(writes.length,0,'cannot overwrite before load');
 reads.at(-1).resolve({status:'ready',settings:A});await tick();h=render();assert.equal(h.settings.baseSalary,1000);
 h.setSettings(s=>({...s,baseSalary:2000}));h=render();
 const p=h.save(h.settings);assert.equal(await h.save(h.settings),false,'synchronous double tap lock');assert.equal(writes.length,1);writes.at(-1).resolve();assert.equal(await p,true);h=render();assert.equal(h.saving,false);
 focus();h=render();assert.equal(h.settings,null);reads.at(-1).resolve({status:'error'});await tick();h=render();assert.equal(h.failed,true);assert.equal(h.settings,null,'failed refresh cannot show stale salary');
 focus();reads.at(-1).resolve({status:'ready',settings:A});await tick();h=render();
 const fail=h.save({...A,baseSalary:3000});writes.at(-1).reject(Error('disk'));await assert.rejects(fail,/disk/);h=render();assert.equal(h.settings.baseSalary,1000);assert.equal(h.saving,false);
 const pending=h.save(A);owner='B';h=render();assert.equal(h.settings,null,'owner change masks A immediately');focus();writes.at(-1).resolve();assert.equal(await pending,false,'no navigation after stale completion');
 reads.at(-1).resolve({status:'ready',settings:{...A,baseSalary:9000}});await tick();h=render();assert.equal(h.settings.baseSalary,9000);
 focus();const stale=reads.at(-1);owner='A';render();focus();stale.resolve({status:'ready',settings:{...A,baseSalary:9000}});await tick();h=render();assert.equal(h.settings,null);
 reads.at(-1).resolve({status:'ready',settings:A});await tick();h=render();
 const blurSave=h.save(A);cleanup();writes.at(-1).resolve();assert.equal(await blurSave,false);
 owner=null;h=render();focus();assert.equal(h.settings,null);assert.equal(await h.save(A),false);
 assert(writes.every(w=>w.id==='A'),'old account never written into B');
 console.log('PASS salary lifecycle: loading/save lock, reload failure, disk failure, stale read/save, owner/logout/blur completion guards.');
}
run().catch(e=>{console.error(e);process.exitCode=1;});

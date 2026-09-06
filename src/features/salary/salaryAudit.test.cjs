const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript'), vm = require('node:vm'), cp = require('node:child_process');
const path = require('node:path'), root = path.resolve(__dirname, '../../..');
require.extensions['.ts'] = (m,f) => m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {calculateMonthlySalary:calc,tryCalculateMonthlySalary:tryCalc,formatWon}=require('./salaryCalculator.ts');
const {parseSalaryAmountInput:input}=require('./salaryInput.ts');
const {parseSalarySettings}=require('./salaryTypes.ts');
const {createSalarySettingsStorage}=require('./salaryStorageCore.ts');
const type=id=>({id,name:'같은 이름',abbreviation:'주',kind:'work',color:'#FFFFFF',textColor:'#000000',startTime:'19:00',endTime:'09:00'});
const entry=(date,id)=>({id,effectiveFrom:date,pattern:[id],anchorDate:date,anchorPatternIndex:0,createdAt:date+'T00:00:00Z'});
const schedule={shiftTypes:['old','new','orphan','custom-shift-123'].map(type),shiftPattern:['new'],anchorDate:'2026-09-06',anchorPatternIndex:0,patternHistory:[entry('2026-01-01','old'),entry('2026-09-06','new')],shiftDateOverrides:{'2026-09-07':{date:'2026-09-07',shiftTypeId:'custom-shift-123',createdAt:'2026-09-01T00:00:00Z',updatedAt:'2026-09-01T00:00:00Z'}}};
const settings={version:1,isConfigured:true,baseSalary:1000,salaryVisible:true,shiftAllowanceByShiftTypeId:{old:{mode:'per_shift',amount:10},new:{mode:'per_shift',amount:20},orphan:{mode:'per_shift',amount:999},'custom-shift-123':{mode:'per_shift',amount:30}},additionalAllowances:[{id:'m',name:'월',amount:100,applyMode:'monthly'},{id:'one',name:'이번 달',amount:200,applyMode:'one_time',applicableMonth:'2026-09'}]};
const snapshot=JSON.stringify({schedule,settings});
const september=calc('2026-09',schedule,settings);
assert.deepEqual(september.shiftCounts,{old:5,new:24,'custom-shift-123':1});
assert.equal(september.total,1860); assert.equal(calc('2026-08',schedule,settings).total,1410);
assert.equal(calc('2026-10',schedule,settings).total,1720);
assert.equal(september.shiftDetails.find(d=>d.date==='2026-09-07').amount,30);
assert.equal(september.shiftDetails[0].timeLabel,'19:00 ~ 익일 09:00');
assert.equal(JSON.stringify({schedule,settings}),snapshot);
assert.equal(calc('2026-08',{...schedule,shiftTypes:schedule.shiftTypes.map(t=>({...t,name:'변경됨'}))},settings).total,1410);
assert.equal(calc('2026-09',schedule,{...settings,baseSalary:2000}).total,2860);
assert.equal(calc('2026-09',{...schedule,shiftTypes:[],shiftPattern:[],patternHistory:[],shiftDateOverrides:{}},settings).total,1300);
for(const month of ['2026-00','2026-13','2026-9','bad'])assert.throws(()=>calc(month,schedule,settings));
for(const bad of [-1,NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER+1]) {
 assert.equal(parseSalarySettings(JSON.stringify({...settings,baseSalary:bad})),null);
 assert.equal(tryCalc('2026-09',schedule,{...settings,baseSalary:bad}),null);
 assert(!/NaN|Infinity|undefined/.test(formatWon(bad)));
}
assert.equal(formatWon(-1000),'-1,000원','negative month comparison is valid');
assert.equal(tryCalc('2026-09',schedule,{...settings,baseSalary:Number.MAX_SAFE_INTEGER}),null,'aggregate overflow rejected');
for(const text of ['-500','abc','1e9','Infinity','NaN','1.5','12x34','1,2','9'.repeat(400)])assert.equal(input(text),null,text);
assert.equal(input(''),0);assert.equal(input('  '),0);assert.equal(input('3,000,000'),3000000);assert.equal(input('123'),123);
function dateChecks(){
 for(const [month,days]of [['2024-02',29],['2025-02',28],['2026-12',31],['2027-01',31]]) {
  const r=calc(month,{...schedule,patternHistory:[],shiftDateOverrides:{}},settings);
  assert.equal(Object.values(r.shiftCounts).reduce((a,b)=>a+b,0),days);
  assert(r.shiftDetails.every(d=>d.date.startsWith(month)));
 }
 // Execute the exact month navigation helpers from the current screen.
 const source=ts.createSourceFile('salary.tsx',fs.readFileSync(path.join(root,'app/salary.tsx'),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const helpers=source.statements.filter(n=>ts.isFunctionDeclaration(n)&&['currentMonth','moveMonth'].includes(n.name?.text)).map(n=>n.getText(source)).join('\n');
 const context={Date};vm.createContext(context);vm.runInContext(ts.transpileModule(helpers,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 assert.equal(context.moveMonth('2026-12',1),'2027-01');assert.equal(context.moveMonth('2027-01',-1),'2026-12');assert.equal(context.moveMonth('2024-03',-1),'2024-02');
}
dateChecks();
async function run(){
 const memory=new Map(), adapter={getItem:async k=>memory.get(k)??null,setItem:async(k,v)=>memory.set(k,v),removeItem:async k=>memory.delete(k)};
 const store=createSalarySettingsStorage(adapter,'modu-work.salary-settings.v1');
 await store.save('A',settings);await store.save('B',{...settings,baseSalary:9000});
 assert.deepEqual((await createSalarySettingsStorage(adapter,'modu-work.salary-settings.v1').load('A')).settings,settings,'restart reload');
 await store.save('A',{...settings,baseSalary:2000});assert.equal((await store.load('A')).settings.baseSalary,2000);assert.equal((await store.load('B')).settings.baseSalary,9000);
 assert.equal((await store.load('A')).settings.shiftAllowanceByShiftTypeId.orphan.amount,999,'hidden mapping retained');
 await assert.rejects(store.save('A',{...settings,baseSalary:Infinity}));assert.equal((await store.load('A')).settings.baseSalary,2000);
 await store.remove('A');assert.equal((await store.load('A')).settings.isConfigured,false);assert.equal((await store.load('B')).settings.baseSalary,9000);
 for(const TZ of ['Asia/Seoul','UTC','America/Los_Angeles'])cp.execFileSync(process.execPath,[__filename,'--dates-only'],{env:{...process.env,TZ},stdio:'pipe'});
 console.log('PASS salary audit: ID/history/override/custom, totals, invalid inputs/overflow, restart/edit/account isolation, 3 timezones/month/year/leap boundaries.');
}
if(!process.argv.includes('--dates-only'))run().catch(e=>{console.error(e);process.exitCode=1;});

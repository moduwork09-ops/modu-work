import { strict as assert } from 'node:assert';
import { calculateMonthlySalary, formatWon } from './salaryCalculator';
import { parseSalarySettings, type SalarySettings } from './salaryTypes';
import { createSalarySettingsStorage } from './salaryStorageCore';
import type { ShiftScheduleInput } from '../shifts/shiftSchedule';

const types=[{id:'day',abbreviation:'주',name:'주간',kind:'work' as const,startTime:'09:00',endTime:'18:00',color:'#fff',textColor:'#000'},{id:'night',abbreviation:'야',name:'야간',kind:'work' as const,startTime:'19:00',endTime:'09:00',color:'#000',textColor:'#fff'}];
const schedule:ShiftScheduleInput={shiftTypes:types,shiftPattern:['day','night'],anchorDate:'2026-08-01',anchorPatternIndex:0,patternHistory:[],shiftDateOverrides:{'2026-08-01':{date:'2026-08-01',shiftTypeId:'night',createdAt:'2026-08-01T00:00:00.000Z',updatedAt:'2026-08-01T00:00:00.000Z'},'2026-08-31':{date:'2026-08-31',shiftTypeId:'night',createdAt:'2026-08-31T00:00:00.000Z',updatedAt:'2026-08-31T00:00:00.000Z'}}};
const settings:SalarySettings={version:1,isConfigured:true,baseSalary:1000,shiftAllowanceByShiftTypeId:{night:{mode:'per_shift',amount:100}},additionalAllowances:[{id:'m',name:'월',amount:200,applyMode:'monthly'},{id:'o',name:'일회',amount:300,applyMode:'one_time',applicableMonth:'2026-08'}],salaryVisible:false};
const result=calculateMonthlySalary('2026-08',schedule,settings);
assert.equal(result.baseSalary,1000); assert.equal(result.shiftCounts.night,17); assert.equal(result.shiftAllowanceTotal,1700); assert.equal(result.additionalAllowanceTotal,500); assert.equal(result.total,3200); assert.equal(result.shiftDetails.filter(x=>x.date==='2026-08-31').length,1);
assert.equal(calculateMonthlySalary('2026-09',schedule,settings).additionalAllowanceTotal,200);
assert.equal(formatWon(3842500),'3,842,500원');
assert.deepEqual(parseSalarySettings(JSON.stringify(settings)),settings); assert.equal(parseSalarySettings(''),null); assert.equal(parseSalarySettings('{bad'),null); assert.equal(parseSalarySettings(JSON.stringify({...settings,baseSalary:-1})),null);
const renamed={...schedule,shiftTypes:types.map(x=>x.id==='night'?{...x,name:'새 야간'}:x)}; assert.equal(calculateMonthlySalary('2026-08',renamed,settings).shiftAllowanceTotal,1700);
const deleted={...schedule,shiftTypes:[types[0]],shiftPattern:['day'],shiftDateOverrides:{}}; assert.equal(calculateMonthlySalary('2026-08',deleted,settings).shiftAllowanceTotal,0);
async function runStorageFixtures() {
  const memory=new Map<string,string>(); const store=createSalarySettingsStorage({getItem:async key=>memory.get(key)??null,setItem:async(key,value)=>{memory.set(key,value);},removeItem:async key=>{memory.delete(key);}},'modu-work.salary-settings.v1');
  await store.save('A',settings); assert.equal((await store.load('A')).status,'ready'); assert.equal((await store.load('B')).status,'ready'); assert.equal((await store.load('B')).settings?.isConfigured,false); assert.equal(memory.has('modu-work.user.A.salary-settings.v1'),true); assert.equal(memory.has('modu-work.user.B.salary-settings.v1'),false);
  memory.set('modu-work.user.A.salary-settings.v1','bad'); assert.equal((await store.load('A')).status,'error'); await store.remove('A'); assert.equal((await store.load('A')).settings?.isConfigured,false);
}
void runStorageFixtures().then(()=>console.log('salary fixtures passed'));

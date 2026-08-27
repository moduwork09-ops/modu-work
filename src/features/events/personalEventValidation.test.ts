import { strict as assert } from 'node:assert';
import { parsePersonalEventsValue } from './personalEventValidation';

const legacy = { id: 'e1', title: '기존 일정', date: '2026-08-27', allDay: false, startTime: '09:00', endTime: '10:00', memo: '' };
assert.deepEqual(parsePersonalEventsValue(JSON.stringify({ version: 1, events: [legacy] })), [legacy]);
assert.equal(parsePersonalEventsValue(JSON.stringify({ version: 1, events: [{ ...legacy, color: '#AABBCC' }] }))?.[0].color, '#AABBCC');
assert.equal(parsePersonalEventsValue(JSON.stringify({ version: 1, events: [{ ...legacy, color: 'red' }] })), null);
assert.equal(parsePersonalEventsValue('{bad'), null);
console.log('personalEventValidation fixtures passed');

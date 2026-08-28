import { strict as assert } from 'node:assert';

import {
  MAX_PROFILE_DISPLAY_NAME_LENGTH,
  normalizeProfileDisplayName,
} from './profileDisplayName';

assert.equal(normalizeProfileDisplayName('  새이름  '), '새이름');
assert.equal(normalizeProfileDisplayName(''), null);
assert.equal(normalizeProfileDisplayName('   '), null);
assert.equal(normalizeProfileDisplayName(undefined), null);
assert.equal(normalizeProfileDisplayName('가'.repeat(MAX_PROFILE_DISPLAY_NAME_LENGTH)), '가'.repeat(MAX_PROFILE_DISPLAY_NAME_LENGTH));
assert.equal(normalizeProfileDisplayName('가'.repeat(MAX_PROFILE_DISPLAY_NAME_LENGTH + 1)), null);

console.log('profileDisplayName fixtures passed');

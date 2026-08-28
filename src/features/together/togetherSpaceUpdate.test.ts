import { strict as assert } from 'node:assert';

import {
  MAX_TOGETHER_SPACE_NAME_LENGTH,
  normalizeTogetherSpaceUpdate,
} from './togetherSpaceUpdate';
import { TOGETHER_SPACE_TYPES } from './types';

function runTogetherSpaceUpdateFixtures() {
  assert.deepEqual(normalizeTogetherSpaceUpdate('  우리 가족  ', 'family'), {
    name: '우리 가족',
    type: 'family',
  });
  assert.equal(normalizeTogetherSpaceUpdate('', 'family'), null);
  assert.equal(normalizeTogetherSpaceUpdate('   ', 'family'), null);
  assert.equal(normalizeTogetherSpaceUpdate('가'.repeat(MAX_TOGETHER_SPACE_NAME_LENGTH + 1), 'family'), null);
  assert.equal(normalizeTogetherSpaceUpdate('정상', 'unknown'), null);
  assert.equal(normalizeTogetherSpaceUpdate(undefined, 'family'), null);

  TOGETHER_SPACE_TYPES.forEach((type) => {
    assert.deepEqual(normalizeTogetherSpaceUpdate('그룹', type), { name: '그룹', type });
  });
  assert.equal(normalizeTogetherSpaceUpdate('가'.repeat(MAX_TOGETHER_SPACE_NAME_LENGTH), 'custom')?.name.length, MAX_TOGETHER_SPACE_NAME_LENGTH);
}

runTogetherSpaceUpdateFixtures();
console.log('togetherSpaceUpdate fixtures passed');

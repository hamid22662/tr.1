import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_CSV_BYTES, exceedsApproximateBytes } from '../src/constants/limits.ts';

test('accepts text below the configured byte ceiling', () => {
  assert.equal(exceedsApproximateBytes('a'.repeat(100), MAX_CSV_BYTES), false);
});

test('rejects text above the configured byte ceiling', () => {
  assert.equal(exceedsApproximateBytes('a'.repeat(MAX_CSV_BYTES / 2 + 1), MAX_CSV_BYTES), true);
});

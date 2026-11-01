import assert from 'node:assert/strict';
import test from 'node:test';
import { compareNatural } from '../src/ui/lot-table.ts';

test('lot values sort naturally with numeric and suffix ordering', () => {
  const lots = ['10', '12A', '2', '12'].sort(compareNatural);
  assert.deepEqual(lots, ['2', '10', '12', '12A']);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { compareNatural, matchesPblSearch } from '../src/ui/lot-table.ts';

test('lot values sort naturally with numeric and suffix ordering', () => {
  const lots = ['10', '12A', '2', '12'].sort(compareNatural);
  assert.deepEqual(lots, ['2', '10', '12', '12A']);
});

test('lot search matches one or more terms across phase, block, and lot', () => {
  const row = { phase: '1', block: '5', lot: '12A' };

  assert.equal(matchesPblSearch(row, '1 5 12'), true);
  assert.equal(matchesPblSearch(row, '1/5/12A'), true);
  assert.equal(matchesPblSearch(row, '5 99'), false);
  assert.equal(matchesPblSearch(row, ''), true);
});

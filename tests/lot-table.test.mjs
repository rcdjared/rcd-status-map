import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareNatural,
  formatLotHistoryValue,
  isVisibleHistoryField,
  matchesPblSearch,
} from '../src/ui/lot-table.ts';

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

test('lot history displays status labels instead of stored status keys', () => {
  const statuses = {
    c: { n: 'Completed', c: '#15803d' },
    o: { n: 'Ongoing', c: '#f59e0b' },
  };

  assert.equal(formatLotHistoryValue('status', 'o', statuses), 'Ongoing');
  assert.equal(formatLotHistoryValue('phase', 'o', statuses), 'o');
  assert.equal(formatLotHistoryValue('status', 'Legacy status', statuses), 'Legacy status');
  assert.equal(formatLotHistoryValue('status', null, statuses), '—');
});

test('lot history hides internal project and mark identifiers', () => {
  assert.equal(isVisibleHistoryField('project_id'), false);
  assert.equal(isVisibleHistoryField('mark_id'), false);
  assert.equal(isVisibleHistoryField('status'), true);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { findDuplicateFillGroups, newestMark } from '../src/map/duplicate-marks.ts';
import { canUndoStatusChange } from '../src/map/undo.ts';

function fill(id, spans, updatedAt) {
  return {
    id,
    t: 'f',
    x: 1,
    y: 1,
    s: 'available',
    sp: spans,
    updated_at: updatedAt,
  };
}

test('groups fill marks with identical regions even when span order differs', () => {
  const first = fill('first', [[2, 4, 8], [1, 3, 7]], '2026-01-01T00:00:00Z');
  const duplicate = fill('duplicate', [[1, 3, 7], [2, 4, 8]], '2026-01-02T00:00:00Z');
  const separateLot = fill('separate', [[1, 30, 37], [2, 31, 38]], '2026-01-03T00:00:00Z');

  const groups = findDuplicateFillGroups([first, duplicate, separateLot]);

  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].marks.map((mark) => mark.id), ['first', 'duplicate']);
});

test('keeps the most recently updated mark and uses list order for timestamp ties', () => {
  const older = fill('older', [[1, 2, 4]], '2026-01-01T00:00:00Z');
  const newer = fill('newer', [[1, 2, 4]], '2026-01-02T00:00:00Z');
  const tiedLatest = fill('tied-latest', [[1, 2, 4]], '2026-01-02T00:00:00Z');

  assert.equal(newestMark([older, newer, tiedLatest]).id, 'tied-latest');
});

test('does not group pins or fills without computed regions', () => {
  const pin = { id: 'pin', t: 'p', x: 1, y: 1, s: 'available' };
  const noRegion = { id: 'no-region', t: 'f', x: 1, y: 1, s: 'available' };

  assert.deepEqual(findDuplicateFillGroups([pin, noRegion, noRegion]), []);
});

test('allows status undo only while the current user owns the latest status change', () => {
  assert.equal(canUndoStatusChange('available', 'sold', 'user-a', 'user-a'), true);
  assert.equal(canUndoStatusChange('available', 'sold', 'user-b', 'user-a'), false);
  assert.equal(canUndoStatusChange('sold', 'sold', 'user-a', 'user-a'), false);
  assert.equal(canUndoStatusChange('available', 'sold', null, 'user-a'), false);
});

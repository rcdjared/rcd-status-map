import assert from 'node:assert/strict';
import test from 'node:test';
import { newestMark } from '../src/map/duplicate-marks.ts';
import { canUndoStatusChange } from '../src/map/undo.ts';

test('selects the most recently updated fill and uses list order for timestamp ties', () => {
  const older = { id: 'older', t: 'f', x: 1, y: 1, s: 'available', updated_at: '2026-01-01T00:00:00Z' };
  const newer = { id: 'newer', t: 'f', x: 1, y: 1, s: 'available', updated_at: '2026-01-02T00:00:00Z' };
  const tiedLatest = { id: 'tied-latest', t: 'f', x: 1, y: 1, s: 'available', updated_at: '2026-01-02T00:00:00Z' };

  assert.equal(newestMark([older, newer, tiedLatest]).id, 'tied-latest');
});

test('allows status undo only while the current user owns the latest status change', () => {
  assert.equal(canUndoStatusChange('available', 'sold', 'user-a', 'user-a'), true);
  assert.equal(canUndoStatusChange('available', 'sold', 'user-b', 'user-a'), false);
  assert.equal(canUndoStatusChange('sold', 'sold', 'user-a', 'user-a'), false);
  assert.equal(canUndoStatusChange('available', 'sold', null, 'user-a'), false);
});

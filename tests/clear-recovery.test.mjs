import assert from 'node:assert/strict';
import test from 'node:test';
import {
  loadClearRecoverySnapshot,
  removeClearRecoverySnapshot,
  saveClearRecoverySnapshot,
} from '../src/map/clear-recovery.ts';

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test('stores and loads a clear recovery snapshot by project scope', () => {
  const storage = createStorage();
  const snapshot = {
    scope: 'project-a',
    clearedAt: '2026-11-01T10:00:00.000Z',
    marks: [{ id: 'mark-a', t: 'f', x: 10, y: 20, s: 'complete', sp: [[1, 2, 3]] }],
    lots: [],
  };

  saveClearRecoverySnapshot(storage, snapshot);

  assert.deepEqual(loadClearRecoverySnapshot(storage, 'project-a'), snapshot);
  assert.equal(loadClearRecoverySnapshot(storage, 'project-b'), null);
});

test('allows restoring and removing local snapshots containing unsaved marks', () => {
  const storage = createStorage();
  const snapshot = {
    scope: 'balayan',
    clearedAt: '2026-11-01T10:00:00.000Z',
    marks: [{ t: 'p', x: 10, y: 20, s: 'repair' }],
    lots: [],
  };

  saveClearRecoverySnapshot(storage, snapshot);
  assert.deepEqual(loadClearRecoverySnapshot(storage, 'balayan'), snapshot);

  removeClearRecoverySnapshot(storage, 'balayan');
  assert.equal(loadClearRecoverySnapshot(storage, 'balayan'), null);
});

test('rejects corrupted recovery data instead of treating it as an empty snapshot', () => {
  const storage = createStorage();
  storage.setItem('rrh-clear-recovery-v1-project-a', '{');

  assert.throws(
    () => loadClearRecoverySnapshot(storage, 'project-a'),
    /not valid JSON/
  );
});

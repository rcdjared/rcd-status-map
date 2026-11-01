import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dismissLastEscapeDismissable,
  registerEscapeDismissable,
} from '../src/ui/escape-dismiss.ts';

test('Escape dismisses the most recently activated panel first', async () => {
  const closed = [];
  const first = registerEscapeDismissable({}, () => {
    closed.push('first');
    return true;
  });
  const second = registerEscapeDismissable({}, () => {
    closed.push('second');
    return true;
  });

  first.activate();
  second.activate();

  assert.equal(await dismissLastEscapeDismissable(), true);
  assert.deepEqual(closed, ['second']);
  assert.equal(await dismissLastEscapeDismissable(), true);
  assert.deepEqual(closed, ['second', 'first']);
  assert.equal(await dismissLastEscapeDismissable(), false);
});

test('keeps a panel active when its dismissal is refused', async () => {
  let attempts = 0;
  const panel = registerEscapeDismissable({}, () => {
    attempts += 1;
    return false;
  });
  panel.activate();

  assert.equal(await dismissLastEscapeDismissable(), true);
  assert.equal(await dismissLastEscapeDismissable(), true);
  assert.equal(attempts, 2);

  panel.deactivate();
});

test('skips panels that were removed from the document', async () => {
  let dismissed = false;
  const removedPanel = registerEscapeDismissable({ isConnected: false }, () => {
    dismissed = true;
    return true;
  });
  removedPanel.activate();

  assert.equal(await dismissLastEscapeDismissable(), false);
  assert.equal(dismissed, false);
});

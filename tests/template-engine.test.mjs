import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_DESCRIPTION_TEMPLATES,
  collapseLotList,
  findUnknownPlaceholders,
  renderTemplate,
} from '../src/register/templates.ts';

test('default lot template renders known values without warnings', () => {
  const { text, warnings } = renderTemplate(DEFAULT_DESCRIPTION_TEMPLATES.lot, {
    phase: '1',
    block: 'A',
    lot: '12',
    status: 'Available',
    project: 'Balayan',
  });

  assert.equal(text, 'Lot 12 of Block A, Phase 1 is Available.');
  assert.deepEqual(warnings, []);
});

test('unknown placeholders are reported instead of silently dropped', () => {
  const { text, warnings } = renderTemplate('Lot {lot} is {unknown}.', { lot: '12' });

  assert.equal(text, 'Lot 12 is {unknown}.');
  assert.deepEqual(warnings, ['unknown']);
});

test('summary templates handle date and percent placeholders', () => {
  const { text, warnings } = renderTemplate(DEFAULT_DESCRIPTION_TEMPLATES.summary, {
    project: 'Balayan',
    count: 12,
    total: 20,
    status: 'Available',
    percent: 60,
    date: '2026-11-01',
  });

  assert.equal(
    text,
    'As of 2026-11-01, 12 of 20 lots in Balayan are Available (60%).'
  );
  assert.deepEqual(warnings, []);
});

test('lot lists collapse to compact ranges where possible', () => {
  assert.equal(collapseLotList(['1', '2', '3', '5', '6', '9']), '1-3, 5-6, 9');
  assert.equal(collapseLotList(['1a', '2a', '4a']), '1a-2a, 4a');
  assert.equal(collapseLotList(['foo', 'bar']), 'foo, bar');
});

test('findUnknownPlaceholders ignores valid template keys', () => {
  const warnings = findUnknownPlaceholders('Project {project}; Lot {lot}; Unknown {mystery}');

  assert.deepEqual(warnings, ['mystery']);
});

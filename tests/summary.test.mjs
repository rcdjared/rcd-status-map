import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLotCsv, summarizeLots } from '../src/register/summary.ts';

test('summaries handle empty datasets without dividing by zero', () => {
  const summary = summarizeLots([]);

  assert.equal(summary.total, 0);
  assert.equal(summary.mapped, 0);
  assert.equal(summary.unmapped, 0);
  assert.deepEqual(summary.byStatus, []);
  assert.deepEqual(summary.byPhase, []);
  assert.deepEqual(summary.byBlock, []);
});

test('summarizes status, phase, and block totals for visible lots', () => {
  const rows = [
    { phase: '1', block: 'A', lot: '1', status: 'c', mark_id: 'm-1' },
    { phase: '1', block: 'A', lot: '2', status: 'a', mark_id: null },
    { phase: '2', block: 'B', lot: '3', status: 'c', mark_id: 'm-2' },
    { phase: '2', block: 'C', lot: '4', status: 'o', mark_id: null },
  ];

  const summary = summarizeLots(rows);

  assert.equal(summary.total, 4);
  assert.equal(summary.mapped, 2);
  assert.equal(summary.unmapped, 2);
  assert.deepEqual(
    summary.byStatus.map(({ status, count }) => [status, count]),
    [['c', 2], ['a', 1], ['o', 1]]
  );
  assert.deepEqual(
    summary.byPhase.map(({ label, count }) => [label, count]),
    [['1', 2], ['2', 2]]
  );
  assert.deepEqual(
    summary.byBlock.map(({ label, count }) => [label, count]),
    [['A', 2], ['B', 1], ['C', 1]]
  );
  assert.equal(summary.byStatus[0].percent, 50);
  assert.equal(summary.byStatus[1].percent, 25);
  assert.equal(summary.byStatus[2].percent, 25);
});

test('CSV export escapes formula-injection values and keeps Excel-friendly UTF-8 BOM', () => {
  const csv = buildLotCsv(
    [
      { phase: '1', block: 'A', lot: '=cmd', status: '@bad', mark_id: null },
      { phase: '2', block: 'B', lot: '9', status: 'c', mark_id: 'm-9' },
    ],
    'Balayan'
  );

  assert.match(csv, /^\uFEFF/);
  assert.match(csv, /"'\=cmd"/);
  assert.match(csv, /"'@bad"/);
  assert.match(csv, /"Balayan"/);
});

test('CSV export uses human-readable status names when a status map is available', () => {
  const csv = buildLotCsv(
    [{ phase: '1', block: 'A', lot: '12', status: 'c', mark_id: 'm-1' }],
    'Balayan',
    { c: 'Completed', o: 'Ongoing', a: 'For Award' }
  );

  assert.match(csv, /"Completed"/);
  assert.doesNotMatch(csv, /"c"/);
});

test('CSV export includes a dated project summary and status descriptions', () => {
  const csv = buildLotCsv(
    [
      { phase: '1', block: 'A', lot: '1', status: 'c', mark_id: 'm-1' },
      { phase: '1', block: 'A', lot: '2', status: 'a', mark_id: null },
    ],
    'Balayan',
    { c: 'Completed', a: 'Available' },
    new Date(2026, 10, 1)
  );

  assert.match(csv, /"Export date","2026-11-01"/);
  assert.match(csv, /"Total lots","2"/);
  assert.match(
    csv,
    /"Status","Available","","1","50%","As of 2026-11-01, 1 of 2 lots in Balayan are Available \(50%\)\."/
  );
  assert.match(csv, /"Project","Phase","Block","Lot","Status","Mapped"/);
  assert.match(csv, /"Balayan","1","A","1","Completed","Yes"/);
});

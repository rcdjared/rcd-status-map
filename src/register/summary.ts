import { buildSummaryDescription } from './templates.ts';

export interface LotStatusSummaryBucket {
  status: string;
  label: string;
  count: number;
  percent: number;
}

export interface LotSummaryBucket {
  label: string;
  count: number;
  percent: number;
}

export interface LotSummary {
  total: number;
  mapped: number;
  unmapped: number;
  byStatus: LotStatusSummaryBucket[];
  byPhase: LotSummaryBucket[];
  byBlock: LotSummaryBucket[];
}

export type LotSummaryRow = {
  phase: string;
  block: string;
  lot: string;
  status: string;
  mark_id?: string | null;
};

export type StatusLabelMap = Record<string, string | undefined>;

const roundPercent = (count: number, total: number): number => {
  if (!total) return 0;
  return Number(((count / total) * 100).toFixed(2));
};

const resolveStatusLabel = (status: string, statusLabels?: StatusLabelMap): string => {
  const value = status.trim() || 'Unassigned';
  return statusLabels?.[value]?.trim() || value;
};

const sortSummaryBuckets = <T extends { label: string; count: number }>(entries: T[]): T[] =>
  [...entries].sort((left, right) => {
    if (right.count !== left.count) return right.count - left.count;
    return left.label.localeCompare(right.label, undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  });

export function summarizeLots<T extends LotSummaryRow>(
  rows: T[],
  statusLabels?: StatusLabelMap
): LotSummary {
  const total = rows.length;
  const mapped = rows.filter((row) => Boolean(row.mark_id)).length;
  const unmapped = total - mapped;

  const statusMap = new Map<string, number>();
  const phaseMap = new Map<string, number>();
  const blockMap = new Map<string, number>();

  for (const row of rows) {
    const statusKey = row.status.trim() || 'Unassigned';
    const phase = row.phase.trim() || 'Unassigned';
    const block = row.block.trim() || 'Unassigned';
    const statusLabel = resolveStatusLabel(statusKey, statusLabels);

    statusMap.set(statusLabel, (statusMap.get(statusLabel) ?? 0) + 1);
    phaseMap.set(phase, (phaseMap.get(phase) ?? 0) + 1);
    blockMap.set(block, (blockMap.get(block) ?? 0) + 1);
  }

  const byStatus = sortSummaryBuckets(
    [...statusMap.entries()].map(([label, count]) => ({
      status: label,
      label,
      count,
      percent: roundPercent(count, total),
    }))
  );

  return {
    total,
    mapped,
    unmapped,
    byStatus,
    byPhase: sortSummaryBuckets(
      [...phaseMap.entries()].map(([label, count]) => ({
        label,
        count,
        percent: roundPercent(count, total),
      }))
    ),
    byBlock: sortSummaryBuckets(
      [...blockMap.entries()].map(([label, count]) => ({
        label,
        count,
        percent: roundPercent(count, total),
      }))
    ),
  };
}

export function escapeCsvCell(value: unknown): string {
  const text = String(value ?? '').replace(/\r\n?/g, '\n').replace(/\n/g, ' ');
  const escaped = text.replace(/"/g, '""');
  const safeguarded = /^(=|\+|-|@)/.test(escaped) ? `\'${escaped}` : escaped;
  return `"${safeguarded}"`;
}

export function buildLotCsv(
  rows: LotSummaryRow[],
  projectName: string,
  statusLabels?: StatusLabelMap,
  exportDate: Date = new Date()
): string {
  const summary = summarizeLots(rows, statusLabels);
  const date = [
    exportDate.getFullYear(),
    String(exportDate.getMonth() + 1).padStart(2, '0'),
    String(exportDate.getDate()).padStart(2, '0'),
  ].join('-');
  const summaryRows = [
    ['Summary', 'Item', 'Value', 'Count', 'Percent', 'Description'],
    ['Summary', 'Project', projectName, '', '', ''],
    ['Summary', 'Export date', date, '', '', ''],
    ['Summary', 'Total lots', summary.total, '', '', ''],
    ['Summary', 'Mapped lots', summary.mapped, '', '', ''],
    ['Summary', 'Unmapped lots', summary.unmapped, '', '', ''],
    ...summary.byStatus.map((entry) => [
      'Status',
      entry.status,
      '',
      entry.count,
      `${entry.percent}%`,
      buildSummaryDescription({
        date,
        project: projectName,
        count: entry.count,
        total: summary.total,
        status: entry.status,
        percent: entry.percent,
      }).text,
    ]),
    ['', '', '', '', '', ''],
  ];
  const header = ['Project', 'Phase', 'Block', 'Lot', 'Status', 'Mapped'];
  const csvRows = [
    ...summaryRows,
    header,
    ...rows.map((row) => [
      projectName,
      row.phase,
      row.block,
      row.lot,
      resolveStatusLabel(row.status, statusLabels),
      row.mark_id ? 'Yes' : 'No',
    ]),
  ];
  return `\uFEFF${csvRows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')}\r\n`;
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function exportLotsToXlsx(
  rows: LotSummaryRow[],
  projectName: string,
  fileStem: string,
  statusLabels?: StatusLabelMap
): Promise<void> {
  const XLSX = await import('xlsx');
  const summary = summarizeLots(rows, statusLabels);
  const workbook = XLSX.utils.book_new();

  const lotsSheet = XLSX.utils.json_to_sheet(
    rows.map((row) => ({
      Project: projectName,
      Phase: row.phase,
      Block: row.block,
      Lot: row.lot,
      Status: resolveStatusLabel(row.status, statusLabels),
      Mapped: row.mark_id ? 'Yes' : 'No',
    }))
  );

  const summaryRows = [
    { Section: 'Project', Value: projectName },
    { Section: 'Total lots', Value: summary.total },
    { Section: 'Mapped lots', Value: summary.mapped },
    { Section: 'Unmapped lots', Value: summary.unmapped },
    { Section: '', Value: '' },
    { Section: 'Status', Name: 'All', Count: '', Percent: '' },
    ...summary.byStatus.map((entry) => ({
      Section: 'Status',
      Name: entry.status,
      Count: entry.count,
      Percent: entry.percent,
    })),
    { Section: '', Name: '', Count: '', Percent: '' },
    { Section: 'Phase', Name: 'All', Count: '', Percent: '' },
    ...summary.byPhase.map((entry) => ({
      Section: 'Phase',
      Name: entry.label,
      Count: entry.count,
      Percent: entry.percent,
    })),
    { Section: '', Name: '', Count: '', Percent: '' },
    { Section: 'Block', Name: 'All', Count: '', Percent: '' },
    ...summary.byBlock.map((entry) => ({
      Section: 'Block',
      Name: entry.label,
      Count: entry.count,
      Percent: entry.percent,
    })),
  ];

  const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(workbook, lotsSheet, 'Lots');
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

  const workbookBuffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  downloadBlob(`${fileStem}.xlsx`, new Blob([workbookBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }));
}

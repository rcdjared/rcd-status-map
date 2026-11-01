export type DescriptionTemplateKind = 'lot' | 'summary';

export const DESCRIPTION_TEMPLATE_KEYS = [
  'project',
  'phase',
  'block',
  'lot',
  'pbl',
  'status',
  'count',
  'total',
  'percent',
  'date',
  'lot_list',
] as const;

export type DescriptionTemplateKey = (typeof DESCRIPTION_TEMPLATE_KEYS)[number];

export interface DescriptionTemplateValues {
  project?: string | number | null;
  phase?: string | number | null;
  block?: string | number | null;
  lot?: string | number | null;
  pbl?: string | number | null;
  status?: string | number | null;
  count?: string | number | null;
  total?: string | number | null;
  percent?: string | number | null;
  date?: string | number | Date | null;
  lot_list?: string | number | Array<string | number> | null;
}

export const DEFAULT_DESCRIPTION_TEMPLATES: Record<DescriptionTemplateKind, string> = {
  lot: 'Lot {lot} of Block {block}, Phase {phase} is {status}.',
  summary:
    'As of {date}, {count} of {total} lots in {project} are {status} ({percent}%).',
};

function formatTemplateValue(value: DescriptionTemplateValues[DescriptionTemplateKey]): string {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return collapseLotList(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

export function collapseLotList(values: Array<string | number>): string {
  const sanitized = values
    .map((value) => `${value}`.trim())
    .filter(Boolean);

  if (!sanitized.length) return '';

  const numbered = sanitized.map((value) => {
    const match = /^([0-9]+)([A-Za-z]*)$/.exec(value);
    if (!match) return null;
    return { value: Number(match[1]), suffix: match[2] || '', raw: value };
  });

  if (numbered.some((entry) => entry === null)) {
    return sanitized.join(', ');
  }

  const entries = numbered as Array<{ value: number; suffix: string; raw: string }>;
  entries.sort((left, right) => left.value - right.value || left.suffix.localeCompare(right.suffix));

  const groups: Array<{ start: number; end: number; suffix: string }> = [];
  for (const entry of entries) {
    const last = groups.at(-1);
    if (
      last &&
      last.suffix === entry.suffix &&
      entry.value === last.end + 1
    ) {
      last.end = entry.value;
      continue;
    }

    groups.push({ start: entry.value, end: entry.value, suffix: entry.suffix });
  }

  return groups
    .map(({ start, end, suffix }) => {
      const range = start === end ? `${start}${suffix}` : `${start}${suffix}-${end}${suffix}`;
      return range;
    })
    .join(', ');
}

export function findUnknownPlaceholders(template: string): string[] {
  const matches = [...template.matchAll(/\{([a-z_]+)\}/gi)].map((match) => match[1].toLowerCase());
  return [...new Set(matches.filter((placeholder) => !DESCRIPTION_TEMPLATE_KEYS.includes(placeholder as DescriptionTemplateKey)))];
}

export function renderTemplate(
  template: string,
  values: DescriptionTemplateValues = {}
): { text: string; warnings: string[] } {
  const warnings = findUnknownPlaceholders(template);
  let compiled = template;

  for (const key of DESCRIPTION_TEMPLATE_KEYS) {
    const placeholderPattern = new RegExp(`\\{${key}\\}`, 'gi');
    compiled = compiled.replace(
      placeholderPattern,
      formatTemplateValue(values[key] as DescriptionTemplateValues[DescriptionTemplateKey])
    );
  }

  return { text: compiled, warnings };
}

export function buildLotDescription(row: {
  project?: string | number | null;
  phase?: string | number | null;
  block?: string | number | null;
  lot?: string | number | null;
  status?: string | number | null;
  date?: string | number | Date | null;
}): { text: string; warnings: string[] } {
  const pbl = [row.phase, row.block, row.lot].filter((value) => value !== undefined && value !== null && `${value}`.trim() !== '').join('-');

  return renderTemplate(DEFAULT_DESCRIPTION_TEMPLATES.lot, {
    project: row.project ?? '',
    phase: row.phase ?? '',
    block: row.block ?? '',
    lot: row.lot ?? '',
    pbl,
    status: row.status ?? '',
    date: row.date ?? new Date().toISOString().slice(0, 10),
  });
}

export function buildSummaryDescription(summary: {
  project?: string | number | null;
  count?: string | number | null;
  total?: string | number | null;
  status?: string | number | null;
  percent?: string | number | null;
  date?: string | number | Date | null;
}): { text: string; warnings: string[] } {
  return renderTemplate(DEFAULT_DESCRIPTION_TEMPLATES.summary, {
    project: summary.project ?? '',
    count: summary.count ?? 0,
    total: summary.total ?? 0,
    status: summary.status ?? '',
    percent: summary.percent ?? 0,
    date: summary.date ?? new Date().toISOString().slice(0, 10),
  });
}

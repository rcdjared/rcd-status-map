import type { Mark } from './painting';
import type { Span } from './flood-fill';

export interface DuplicateMarkGroup {
  marks: Mark[];
}

function canonicalSpans(mark: Mark): Span[] | null {
  if (mark.t !== 'f' || !mark.sp?.length) return null;
  return [...mark.sp].sort(
    ([yA, startA, endA], [yB, startB, endB]) =>
      yA - yB || startA - startB || endA - endB
  );
}

function spanHash(spans: Span[]): string {
  let hash = 2166136261;
  for (const [y, start, end] of spans) {
    hash = Math.imul(hash ^ y, 16777619);
    hash = Math.imul(hash ^ start, 16777619);
    hash = Math.imul(hash ^ end, 16777619);
  }
  return `${spans.length}:${hash >>> 0}`;
}

function sameSpans(left: Span[], right: Span[]): boolean {
  return (
    left.length === right.length &&
    left.every(
      ([y, start, end], index) =>
        y === right[index][0] &&
        start === right[index][1] &&
        end === right[index][2]
    )
  );
}

export function findDuplicateFillGroups(marks: Mark[]): DuplicateMarkGroup[] {
  const grouped = new Map<string, { spans: Span[]; marks: Mark[] }[]>();
  for (const mark of marks) {
    const spans = canonicalSpans(mark);
    if (!spans) continue;

    const key = spanHash(spans);
    const candidates = grouped.get(key) || [];
    const group = candidates.find((candidate) => sameSpans(candidate.spans, spans));
    if (group) {
      group.marks.push(mark);
    } else {
      candidates.push({ spans, marks: [mark] });
      grouped.set(key, candidates);
    }
  }
  return [...grouped.values()]
    .flat()
    .filter((group) => group.marks.length > 1)
    .map(({ marks: groupMarks }) => ({ marks: groupMarks }));
}

export function newestMark(marks: Mark[]): Mark {
  if (!marks.length) {
    throw new Error('Cannot select the newest mark from an empty list');
  }

  return marks.reduce((newest, candidate) => {
    const newestTime = Date.parse(newest.updated_at ?? '');
    const candidateTime = Date.parse(candidate.updated_at ?? '');
    if (Number.isFinite(candidateTime) && Number.isFinite(newestTime)) {
      if (candidateTime !== newestTime) return candidateTime > newestTime ? candidate : newest;
      return marks.indexOf(candidate) > marks.indexOf(newest) ? candidate : newest;
    }
    if (Number.isFinite(candidateTime)) return candidate;
    if (Number.isFinite(newestTime)) return newest;
    return marks.indexOf(candidate) > marks.indexOf(newest) ? candidate : newest;
  });
}

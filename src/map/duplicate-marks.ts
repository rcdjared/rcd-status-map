import type { Mark } from './painting';

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

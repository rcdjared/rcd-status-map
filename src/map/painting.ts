import type { Span } from './flood-fill';
import { snap, region } from './flood-fill';

export type MarkType = 'f' | 'p';

export interface Mark {
  id?: string; // Supabase mark UUID if saved
  t: MarkType;
  x: number;
  y: number;
  s: string; // status key (e.g. 'c' | 'o' | 'a')
  sp?: Span[];
}

export interface StatusConfig {
  n: string;
  c: string;
}

export type StatusMap = Record<string, StatusConfig>;

export const DEFAULT_STATUSES: StatusMap = {
  c: { n: 'Completed', c: '#1f9d55' },
  o: { n: 'Ongoing', c: '#f59e0b' },
  a: { n: 'For Award', c: '#2563eb' },
};

/**
 * Checks if a given coordinate (x, y) intersects with a mark.
 * For pin marks: checks Euclidean distance against pin radius R.
 * For fill marks: checks if point falls within any of the horizontal spans.
 */
export function hit(m: Mark, x: number, y: number, pinRadius: number): boolean {
  if (m.t === 'p') {
    return Math.hypot(m.x - x, m.y - y) < pinRadius;
  }
  return m.sp ? m.sp.some(([yy, a, b]) => yy === y && x >= a && x <= b) : false;
}

/**
 * Renders the status legend box onto the given canvas context.
 */
export function drawLegend(
  ctx: CanvasRenderingContext2D,
  legendPos: [number, number],
  statuses: StatusMap,
  counts: Record<string, number>,
  width: number,
  height: number
): void {
  const fs = Math.round(width * 0.0092);
  const x0 = width * legendPos[0];
  const y0 = height * legendPos[1];

  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 3;
  ctx.fillRect(x0, y0, fs * 29, fs * 4.6);
  ctx.strokeRect(x0, y0, fs * 29, fs * 4.6);

  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#222';
  ctx.font = '600 ' + fs + 'px system-ui,sans-serif';

  const dateStr = new Date().toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  ctx.fillText('Status update as of ' + dateStr, x0 + fs * 0.8, y0 + fs * 1.1);

  Object.keys(statuses).forEach((k, i) => {
    const px = x0 + fs * (0.8 + 8.8 * i);
    const py = y0 + fs * 3.3;
    ctx.fillStyle = statuses[k].c;
    ctx.fillRect(px, py - fs * 0.5, fs, fs);
    ctx.fillStyle = '#222';
    ctx.fillText(`${statuses[k].n} (${counts[k] || 0})`, px + fs * 1.4, py);
  });
}

/**
 * Redraws both the fill canvas and the pin canvas with the current marks and legend.
 * Returns the counts for each status.
 */
export function drawMarks(
  fillCtx: CanvasRenderingContext2D,
  pinsCtx: CanvasRenderingContext2D,
  marks: Mark[],
  statuses: StatusMap,
  legendPos: [number, number],
  width: number,
  height: number,
  pinRadius: number
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const k of Object.keys(statuses)) {
    counts[k] = 0;
  }

  fillCtx.clearRect(0, 0, width, height);
  pinsCtx.clearRect(0, 0, width, height);

  for (const m of marks) {
    if (counts[m.s] !== undefined) {
      counts[m.s]++;
    }
    const color = statuses[m.s]?.c || '#000';

    if (m.t === 'f' && m.sp) {
      fillCtx.fillStyle = color;
      for (const [y, a, b] of m.sp) {
        fillCtx.fillRect(a, y, b - a + 1, 1);
      }
    } else {
      pinsCtx.save();
      pinsCtx.shadowColor = '#0007';
      pinsCtx.shadowBlur = pinRadius / 2;
      pinsCtx.beginPath();
      pinsCtx.arc(m.x, m.y, pinRadius, 0, Math.PI * 2);
      pinsCtx.fillStyle = color;
      pinsCtx.fill();
      pinsCtx.restore();
      pinsCtx.lineWidth = pinRadius / 4;
      pinsCtx.strokeStyle = '#fff';
      pinsCtx.stroke();
    }
  }

  drawLegend(pinsCtx, legendPos, statuses, counts, width, height);

  return counts;
}

export type PaintMode = 'fill' | 'pin' | 'erase' | 'lg';

export interface PaintClickResult {
  updatedMarks: Mark[];
  updatedLegend?: [number, number];
  error?: string;
  actionTaken: boolean;
  addedMark?: Mark;
  erasedMark?: Mark;
}

/**
 * Pure logic function for handling a click on the map canvas.
 */
export function handleMapClick(
  mode: PaintMode,
  x: number,
  y: number,
  currentStatus: string,
  marks: Mark[],
  bar: Uint8Array,
  width: number,
  height: number,
  pinRadius: number
): PaintClickResult {
  const snapped = snap(x, y, width, height, bar);
  const q = snapped || [x, y];

  if (mode === 'lg') {
    const updatedLegend: [number, number] = [
      Math.min(x / width, 0.73),
      Math.min(y / height, 0.935),
    ];
    return {
      updatedMarks: marks,
      updatedLegend,
      actionTaken: true,
    };
  }

  if (mode === 'erase') {
    let index = -1;
    for (let i = marks.length - 1; i >= 0; i--) {
      if (hit(marks[i], q[0], q[1], pinRadius)) {
        index = i;
        break;
      }
    }
    if (index < 0) {
      return { updatedMarks: marks, actionTaken: false };
    }
    const erasedMark = marks[index];
    const updatedMarks = [...marks];
    updatedMarks.splice(index, 1);
    return { updatedMarks, erasedMark, actionTaken: true };
  }

  if (mode === 'pin') {
    const newMark: Mark = { t: 'p', x, y, s: currentStatus };
    return {
      updatedMarks: [...marks, newMark],
      addedMark: newMark,
      actionTaken: true,
    };
  }

  // mode === 'fill'
  if (!snapped) {
    return { updatedMarks: marks, actionTaken: false };
  }

  const sp = region(q[0], q[1], width, height, bar);
  if (!sp) {
    return {
      updatedMarks: marks,
      error: "This lot isn’t fully closed – use Pin instead",
      actionTaken: false,
    };
  }

  // Remove any existing fill mark that intersects with the same clicked spot
  let erasedExisting: Mark | undefined;
  const filtered = marks.filter((m) => {
    if (m.t === 'f' && hit(m, q[0], q[1], pinRadius)) {
      erasedExisting = m;
      return false;
    }
    return true;
  });
  const newMark: Mark = { t: 'f', x: q[0], y: q[1], s: currentStatus, sp };

  return {
    updatedMarks: [...filtered, newMark],
    addedMark: newMark,
    erasedMark: erasedExisting,
    actionTaken: true,
  };
}

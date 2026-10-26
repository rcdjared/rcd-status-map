/**
 * Scanline segment: [y, xStart, xEnd] (inclusive)
 */
export type Span = [y: number, a: number, b: number];

/**
 * Maximum pixel count allowed in a flood fill operation.
 * Prevents runaway fills into the background if a lot boundary is not closed.
 */
export const FLOOD_CAP = 700000;

/**
 * Creates a binary barrier map from image pixel data.
 * Luminance threshold: 0.3 * R + 0.59 * G + 0.11 * B < 200 is considered a barrier line (1),
 * otherwise walkable/fillable white space (0).
 */
export function createBarrierMap(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): Uint8Array {
  const bar = new Uint8Array(width * height);
  for (let i = 0, j = 0; j < bar.length; i += 4, j++) {
    bar[j] = data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11 < 200 ? 1 : 0;
  }
  return bar;
}

/**
 * Scanline flood fill algorithm to compute the closed lot region.
 * Returns an array of Spans or null if starting on a barrier or exceeding the pixel cap.
 */
export function floodFill(
  sx: number,
  sy: number,
  width: number,
  height: number,
  bar: Uint8Array,
  cap: number = FLOOD_CAP
): Span[] | null {
  if (bar[sy * width + sx]) return null;

  const seen = new Uint8Array(width * height);
  const st: [number, number][] = [[sx, sy]];
  const sp: Span[] = [];
  let n = 0;

  while (st.length) {
    const [x, y] = st.pop()!;
    const o = y * width;
    if (seen[o + x] || bar[o + x]) continue;

    let a = x;
    let b = x;
    while (a > 0 && !bar[o + a - 1] && !seen[o + a - 1]) a--;
    while (b < width - 1 && !bar[o + b + 1] && !seen[o + b + 1]) b++;

    for (let i = a; i <= b; i++) seen[o + i] = 1;
    n += b - a + 1;
    if (n > cap) return null;
    sp.push([y, a, b]);

    for (const ny of [y - 1, y + 1]) {
      if (ny < 0 || ny >= height) continue;
      let inr = false;
      for (let i = a; i <= b; i++) {
        const k = ny * width + i;
        const ok = !bar[k] && !seen[k];
        if (ok && !inr) {
          st.push([i, ny]);
          inr = true;
        } else if (!ok) {
          inr = false;
        }
      }
    }
  }

  return sp;
}

/**
 * Alias for floodFill to match original codebase naming convention.
 */
export const region = floodFill;

/**
 * Searches in a small radius (up to 4px) around (x, y) for a nearby non-barrier pixel.
 * Useful when the user clicks close to or directly on a lot boundary line.
 */
export function snap(
  x: number,
  y: number,
  width: number,
  height: number,
  bar: Uint8Array
): [number, number] | null {
  for (let r = 0; r <= 4; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const a = x + dx;
        const b = y + dy;
        if (a >= 0 && b >= 0 && a < width && b < height && !bar[b * width + a]) {
          return [a, b];
        }
      }
    }
  }
  return null;
}

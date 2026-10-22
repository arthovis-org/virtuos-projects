import { describe, expect, it } from 'vitest';
import { quadToBox } from './screenSnapshots';

/** Applies a matrix3d (column-major) to a 2D point, with the perspective divide. */
function apply(transform: string, x: number, y: number) {
  const m = transform.slice('matrix3d('.length, -1).split(',').map(Number);
  const at = (i: number) => m[i] ?? 0;
  const w = at(3) * x + at(7) * y + at(15);
  return [(at(0) * x + at(4) * y + at(12)) / w, (at(1) * x + at(5) * y + at(13)) / w];
}

describe('quadToBox', () => {
  it('lays a screen drawn in perspective flat onto its box', () => {
    const quad: [number, number][] = [
      [40, 30],
      [500, 60],
      [480, 330],
      [60, 300],
    ];
    const t = quadToBox(quad, 1920, 1080);
    const box = [
      [0, 0],
      [1920, 0],
      [1920, 1080],
      [0, 1080],
    ];
    quad.forEach(([x, y], i) => {
      const [u, v] = apply(t, x, y);
      expect(u).toBeCloseTo(box[i]?.[0] ?? NaN, 6);
      expect(v).toBeCloseTo(box[i]?.[1] ?? NaN, 6);
    });
  });
});

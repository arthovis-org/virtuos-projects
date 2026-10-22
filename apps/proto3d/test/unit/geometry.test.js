// panelGeometry (geometry.js): the one body shape. Caps are whole (no sliver dropped by the
// triangulator, capsules included), walls and bevel are smooth (auto smooth), caps stay flat, and
// cached builds hand every caller its own copy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { panelGeometry } from '../../src/geometry.js';

const SHAPES = {
  capsule: [1.0, 0.34, 0.05, { radius: 0.17, bevel: 0.008 }],   // a lane tab: radius = half the height
  pill: [0.6, 0.32, 0.02, { radius: 0.16, bevel: 0 }],
  node: [4.6, 3.2, 0.26, { radius: 0.3, bevel: 0.05 }],
  card: [2.9, 1.15, 0.1, { radius: 0.12, bevel: 0.022 }],
};
const group = (geo, i) => geo.groups.find((g) => g.materialIndex === i);

test('the front cap covers the whole rounded rectangle (no sliver missing, capsules included)', () => {
  for (const [name, args] of Object.entries(SHAPES)) {
    const geo = panelGeometry(...args), p = geo.attributes.position.array, caps = group(geo, 0);
    let area = 0;
    for (let v = caps.start; v < caps.start + caps.count; v += 3) {
      const i = v * 3; if (p[i + 2] <= 0) continue;   // front cap only
      area += Math.abs((p[i + 3] - p[i]) * (p[i + 7] - p[i + 1]) - (p[i + 6] - p[i]) * (p[i + 4] - p[i + 1])) / 2;
    }
    const P = geo.userData.panel, r = Math.min(Math.max(0.005, P.radius - P.bevel), P.capW / 2, P.capH / 2);
    const exact = P.capW * P.capH - (4 - Math.PI) * r * r;
    assert.ok(Math.abs(1 - area / exact) < 0.002, `${name}: cap area ${area.toFixed(5)} vs ${exact.toFixed(5)}`);
  }
});

test('walls and bevel are smooth: coincident vertices on a curve share one normal; caps stay exactly flat', () => {
  for (const name of ['node', 'card']) {
    const geo = panelGeometry(...SHAPES[name]), p = geo.attributes.position.array, n = geo.attributes.normal.array;
    const caps = group(geo, 0), wall = group(geo, 1);
    for (let v = caps.start; v < caps.start + caps.count; v++) assert.equal(Math.abs(n[v * 3 + 2]), 1, `${name}: cap normal ${v} is flat`);
    const seen = new Map(); let worst = 0;
    for (let v = wall.start; v < wall.start + wall.count; v++) {
      const k = [0, 1, 2].map((a) => Math.round(p[v * 3 + a] * 1e4)).join();
      const nv = [n[v * 3], n[v * 3 + 1], n[v * 3 + 2]];
      if (seen.has(k)) { const q = seen.get(k); worst = Math.max(worst, Math.acos(Math.min(1, q[0] * nv[0] + q[1] * nv[1] + q[2] * nv[2]))); } else seen.set(k, nv);
    }
    assert.ok(worst < 0.01, `${name}: largest normal jump across a wall seam ${(worst * 180 / Math.PI).toFixed(2)}°`);
  }
});

test('cached builds return separate copies with the edge attribute and the material groups', () => {
  const a = panelGeometry(...SHAPES.card), b = panelGeometry(...SHAPES.card);
  assert.notEqual(a, b); assert.notEqual(a.attributes.position, b.attributes.position);
  for (const g of [a, b]) { assert.ok(g.attributes.aEdge); assert.equal(g.groups.length, 2); assert.equal(g.userData.panel.w, 2.9); }
  a.dispose();
  assert.ok(b.attributes.position.count > 0, 'disposing one copy leaves the other intact');
});

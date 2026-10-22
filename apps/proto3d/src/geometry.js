// geometry.js — the one body shape of the platform: a 2D rounded rectangle extruded a little
// and finished with a tiny bevel that catches the light. Front and back faces are flat and
// crisp, the sides are straight, only the bevel curves. Used for node bodies, device slabs,
// group slabs and frames, board frames, column panels, cards, notes, flags and rims.
//
//   panelGeometry(w, h, depth, { radius, bevel })
//     • `w × h` is the OUTER size (bevel included) so callers reason about the footprint;
//     • `depth` is the total thickness, centred on z = 0 (front face at +depth / 2);
//     • the front / back caps carry UVs that map the cap exactly to 0..1 (a canvas texture on
//       the front face lands corner to corner); the side walls get a neutral UV;
//     • ExtrudeGeometry makes two material groups: 0 = caps, 1 = sides + bevel, so a mesh may
//       use `[faceMaterial, sideMaterial]` (a card with its canvas on the front);
//   • a float attribute `aEdge` marks the same split (caps 0, sides + bevel 1): the panel
//     materials (theme.js) give the edge its own machined finish from it.
import * as THREE from 'three';

/**
 * A rounded rectangle centred on the origin, as an explicit polygon: `segments` points per corner
 * arc, consecutive points closer than 1e-5 merged and no closing duplicate. Near-coincident points
 * (an arc ending a float's width from where the next run starts, a capsule's zero-length sides)
 * made the triangulator drop slivers of the cap — the notch on a pill's lower corner.
 */
export function roundedRectShape(w, h, r, segments = 16) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  const x0 = -w / 2, y0 = -h / 2, x1 = w / 2, y1 = h / 2;
  const corners = [[x1 - r, y0 + r, -Math.PI / 2], [x1 - r, y1 - r, 0], [x0 + r, y1 - r, Math.PI / 2], [x0 + r, y0 + r, Math.PI]];
  const pts = [];
  const push = (x, y) => { const q = pts[pts.length - 1]; if (!q || Math.hypot(q.x - x, q.y - y) > 1e-5) pts.push(new THREE.Vector2(x, y)); };
  for (const [cx, cy, a0] of corners) {
    if (r <= 0) { push(cx, cy); continue; }
    for (let i = 0; i <= segments; i++) { const a = a0 + (i / segments) * (Math.PI / 2); push(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
  }
  if (pts.length > 1 && pts[0].distanceTo(pts[pts.length - 1]) <= 1e-5) pts.pop();
  return new THREE.Shape(pts);
}

/** UV generator: caps map their own bounding box (the front face) to 0..1; walls get a flat, neutral UV. */
function capUVGenerator(capW, capH) {
  return {
    generateTopUV(geometry, vertices, a, b, c) {
      const uv = (i) => new THREE.Vector2(vertices[i * 3] / capW + 0.5, vertices[i * 3 + 1] / capH + 0.5);
      return [uv(a), uv(b), uv(c)];
    },
    generateSideWallUV() {
      const p = new THREE.Vector2(0.5, 0.02);   // one texel row near the bottom edge: a plain colour on every canvas we draw
      return [p, p.clone(), p.clone(), p.clone()];
    },
  };
}

/**
 * Auto smooth for the side walls and bevel (Blender's "Auto Smooth" with the caps marked sharp):
 * ExtrudeGeometry is non-indexed, so computeVertexNormals leaves every facet flat and a close-up
 * shows the bevel and the rounded corners as bands. Here each wall / bevel vertex takes the
 * area-weighted average of the wall / bevel faces that share its position and lie within
 * `crease` of its own face; the caps keep their exact flat normal (smoothing them into the bevel
 * would tilt the rim normals and smear a gradient across the big cap triangles).
 */
function smoothWalls(geo, crease = THREE.MathUtils.degToRad(50)) {
  const pos = geo.attributes.position.array, nor = geo.attributes.normal.array;
  // caps: exactly flat, facing out of their side (degenerate cap triangles leave odd normals otherwise)
  for (const g of geo.groups) if (g.materialIndex === 0) for (let v = g.start; v < g.start + g.count; v++) { nor[v * 3] = 0; nor[v * 3 + 1] = 0; nor[v * 3 + 2] = pos[v * 3 + 2] >= 0 ? 1 : -1; }
  const wall = geo.groups.find((g) => g.materialIndex === 1);
  if (!wall) return;
  const cos = Math.cos(crease), nTri = Math.floor(wall.count / 3);
  const fn = new Float32Array(nTri * 3), fa = new Float32Array(nTri);   // unit face normal, area
  const keys = new Array(wall.count), byKey = new Map();               // position → triangles touching it
  for (let t = 0; t < nTri; t++) {
    const i = (wall.start + t * 3) * 3;
    const ax = pos[i] - pos[i + 3], ay = pos[i + 1] - pos[i + 4], az = pos[i + 2] - pos[i + 5];   // a − b
    const cx = pos[i + 6] - pos[i + 3], cy = pos[i + 7] - pos[i + 4], cz = pos[i + 8] - pos[i + 5]; // c − b
    let nx = cy * az - cz * ay, ny = cz * ax - cx * az, nz = cx * ay - cy * ax;                    // (c − b) × (a − b): three's winding
    const len = Math.hypot(nx, ny, nz);
    if (len > 1e-12) { fn[t * 3] = nx / len; fn[t * 3 + 1] = ny / len; fn[t * 3 + 2] = nz / len; fa[t] = len; }
    for (let k = 0; k < 3; k++) {
      const v = wall.start + t * 3 + k, q = v * 3;
      // one exact integer per position: 0.1 mm grid (1 unit = 10 cm), ±65 units per axis, 17 bits each (< 2^53)
      const h = ((Math.round(pos[q] * 1e3) + 65536) * 131072 + (Math.round(pos[q + 1] * 1e3) + 65536)) * 131072 + (Math.round(pos[q + 2] * 1e3) + 65536);
      keys[v - wall.start] = h;
      const list = byKey.get(h); if (list) list.push(t); else byKey.set(h, [t]);
    }
  }
  for (let v = wall.start; v < wall.start + nTri * 3; v++) {
    const t = Math.floor((v - wall.start) / 3);
    if (!fa[t]) continue;   // a degenerate triangle keeps its normal
    const ox = fn[t * 3], oy = fn[t * 3 + 1], oz = fn[t * 3 + 2];
    let sx = 0, sy = 0, sz = 0;
    for (const u of byKey.get(keys[v - wall.start])) {
      const ux = fn[u * 3], uy = fn[u * 3 + 1], uz = fn[u * 3 + 2];
      if (fa[u] && ux * ox + uy * oy + uz * oz >= cos) { sx += ux * fa[u]; sy += uy * fa[u]; sz += uz * fa[u]; }
    }
    const l = Math.hypot(sx, sy, sz);
    if (l > 1e-12) { nor[v * 3] = sx / l; nor[v * 3 + 1] = sy / l; nor[v * 3 + 2] = sz / l; }
  }
  geo.attributes.normal.needsUpdate = true;
}

/**
 * Extruded, bevelled rounded rectangle. Defaults: radius = 18 % of the short side, bevel 0.02.
 * `geo.userData.panel` keeps the parameters for tests and for rebuilding with a new size.
 */
const CACHE = new Map(), CACHE_MAX = 96;   // built panels by parameters: a board's identical cards, pills and tabs are built once, then cloned
export function panelGeometry(w, h, depth = 0.16, opts = {}) {
  const k = `${w}|${h}|${depth}|${opts.radius}|${opts.bevel}|${opts.bevelSegments}|${opts.curveSegments}`;
  let src = CACHE.get(k);
  if (src) { CACHE.delete(k); CACHE.set(k, src); }   // most recently used last
  else {
    src = buildPanel(w, h, depth, opts);
    CACHE.set(k, src);
    if (CACHE.size > CACHE_MAX) CACHE.delete(CACHE.keys().next().value);
  }
  const geo = src.clone();   // callers own and dispose their copy
  geo.type = 'PanelGeometry'; geo.userData = { panel: { ...src.userData.panel } };
  return geo;
}
function buildPanel(w, h, depth = 0.16, { radius = null, bevel = 0.02, bevelSegments = 5, curveSegments = 16 } = {}) {
  const r = Math.max(0.01, radius ?? Math.min(w, h) * 0.18);
  const b = Math.max(0, Math.min(bevel, r * 0.6, depth * 0.3));
  const capW = Math.max(0.02, w - 2 * b), capH = Math.max(0.02, h - 2 * b);
  const shape = roundedRectShape(capW, capH, Math.max(0.005, r - b), curveSegments);
  const extrudeDepth = Math.max(0.01, depth - 2 * b);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: extrudeDepth, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: 0, bevelSegments, curveSegments,
    UVGenerator: capUVGenerator(capW, capH),
  });
  geo.translate(0, 0, -extrudeDepth / 2);      // the bevels extend ±b beyond the extrusion → centred on z = 0
  geo.computeVertexNormals();
  smoothWalls(geo);
  const edge = new Float32Array(geo.attributes.position.count);
  for (const g of geo.groups) if (g.materialIndex === 1) edge.fill(1, g.start, g.start + g.count);
  geo.setAttribute('aEdge', new THREE.BufferAttribute(edge, 1));
  geo.type = 'PanelGeometry';
  geo.userData.panel = { w, h, depth, radius: r, bevel: b, capW, capH };
  return geo;
}

/** A panel lying flat on the floor (extruded along +Y): `w` along X, `d` along Z, `thickness` tall. Front face up. */
export function slabGeometry(w, d, thickness = 0.12, opts = {}) {
  const geo = panelGeometry(w, d, thickness, opts);
  geo.rotateX(-Math.PI / 2);
  geo.type = 'PanelGeometry';
  return geo;
}

/** A slightly larger back-face shell around a panel: the thin selection / hover outline. */
export function outlineGeometry(w, h, depth, grow = 0.08, opts = {}) {
  const r = (opts.radius ?? Math.min(w, h) * 0.18) + grow / 2;
  return panelGeometry(w + grow, h + grow, depth + grow, { ...opts, radius: r, bevel: Math.min(0.015, grow / 4) });
}

// serialize.js — the world as JSON: components (type id, params, serializable state, transform),
// connections (node uid + port key), groups (member uids, collapsed) and the camera. Also a
// selection-only document (copy / export selection), an undoable import that merges a document
// into the current world (paste / File → Import) and download / file-picker helpers for the menus.
// Autosave, recent projects and version history live in tabs.js over project-store.js (IndexedDB).
import { registry } from './core/registry.js';
import { createInstance } from './instance.js';
import { Group3D } from './groups.js';
import { bumpUidCounter, applyTransformDoc } from './block3d.js';
import { isWiringOn, setWiring } from './wiring.js';
import { RouteNode } from './routing.js';

export const FORMAT_VERSION = 2;
/**
 * Document upgrades: `MIGRATIONS[n]` turns a version-n document into a version-(n + 1) one. When the
 * format changes, bump FORMAT_VERSION and add the step for the old number here; `upgradeDoc` runs
 * every step a document needs, oldest first, on a copy. Version 1 and 2 share one shape (v1's port
 * names are still read through LEGACY_PORTS below), so 1 → 2 only restamps the number.
 */
const MIGRATIONS = {
  1: (doc) => doc,
};
/**
 * A document in today's format: validated, upgraded step by step, never mutated in place. A document
 * without a version counts as version 1. One written by a newer Proto3D is refused rather than half
 * read, because saving it back here would silently drop whatever the newer format added.
 */
export function upgradeDoc(doc) {
  if (!doc || doc.app !== 'proto3d' || !Array.isArray(doc.nodes)) throw new Error('Not a Proto3D document');
  const from = Number.isInteger(doc.version) && doc.version > 0 ? doc.version : 1;
  if (from > FORMAT_VERSION) throw new Error(`This file was made by a newer Proto3D (format v${from}; this one reads up to v${FORMAT_VERSION}). Reload the page to get the latest version.`);
  let out = from === FORMAT_VERSION ? doc : structuredClone(doc);
  for (let v = from; v < FORMAT_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) throw new Error(`No upgrade from format v${v}`);
    out = step(out);
    out.version = v + 1;
  }
  return out;
}
/** Port keys renamed when the project ports got plain names; older documents still reconnect. */
const LEGACY_PORTS = {
  'kanban-board': { in: { addCard: 'addTask', move: 'moveTask' }, out: { cardMoved: 'moved', stats: 'progress', cards: 'tasks' } },
  person: { in: { cards: 'tasks' } },
  'project-dashboard': { in: { stats: 'progress' } },
};
const portKey = (typeId, dir, key) => LEGACY_PORTS[typeId]?.[dir]?.[key] || key;

/* ---------- cable routes ---------- */
/** The waypoints shared by two or more of `conns`, as document records `{ id, p: [x, y, z] }` (a link's `route` refers to them by id). */
export function routeNodesOf(conns, world) {
  const seen = new Map();
  for (const c of conns) for (const n of c.route) if (!seen.has(n) && n.liveConns(world).filter((x) => conns.includes(x)).length > 1) seen.set(n, { id: n.id, p: n.position.toArray().map((v) => +v.toFixed(3)) });
  return [...seen.values()];
}
/** Rebuild a link's route from its record: `[x, y, z]` entries become private nodes, `{ node: id }` entries the shared node of that id (`shared` maps ids; unknown ids are skipped). */
export function applyRoute(conn, route, shared) {
  if (!Array.isArray(route) || !route.length) return;
  const nodes = [];
  for (const e of route) {
    if (Array.isArray(e) && e.length === 3 && e.every(Number.isFinite)) nodes.push(new RouteNode(e));
    else if (e && typeof e === 'object' && shared.has(e.node)) nodes.push(shared.get(e.node));
  }
  if (nodes.length) conn.setRoute(nodes);
}
/** The shared-node map for a document's `routeNodes`. */
const sharedNodes = (doc) => new Map((doc.routeNodes || []).filter((r) => r && Array.isArray(r.p) && r.p.length === 3).map((r) => [r.id, new RouteNode(r.p, r.id)]));

/**
 * `pose` = { position, target } replaces the live camera (the remembered 3D pose while the 2D editing
 * mode is on — the mode itself is never saved). `project` is the tab's metadata (key, status, colour,
 * tags, members, dates; tabs.js), written as `doc.project` so an exported file carries it.
 */
export function serializeWorld(world, { camera, controls, pose = null, name = 'untitled' } = {}) {
  const project = arguments[1]?.project || null;   // read beside the destructuring: the SDK contract pins the signature line above
  const cam = pose ? { position: pose.position, target: pose.target } : camera && controls ? { position: camera.position, target: controls.target } : null;
  return {
    app: 'proto3d', version: FORMAT_VERSION, name, savedAt: new Date().toISOString(),
    ...(project ? { project } : {}),
    nodes: [...world.nodes.map((n) => n.serialize()), ...carriedOf(world).nodes],
    connections: [...world.connections.filter((c) => c.to).map((c) => c.serialize()), ...carriedOf(world).connections],
    ...routeNodesDoc(world.connections.filter((c) => c.to), world),
    groups: world.groups.map((g) => g.serialize()),
    wiring: isWiringOn(),
    camera: cam ? { position: cam.position.toArray().map((v) => +v.toFixed(2)), target: cam.target.toArray().map((v) => +v.toFixed(2)) } : undefined,
  };
}

/**
 * Components whose type this page does not know (an add-on's nodes opened in the core page, a type
 * from a newer Proto3D) are not built, but their records — and the links touching them — ride along
 * on `world.carried` and are written back unchanged, so opening and autosaving a project never
 * deletes them. Opening it where the type exists (the add-on's page) brings them back to life.
 */
const carriedOf = (world) => world.carried || { nodes: [], connections: [] };

const routeNodesDoc = (conns, world) => { const r = routeNodesOf(conns, world); return r.length ? { routeNodes: r } : {}; };

/** A document holding only `nodes` plus the connections and groups entirely among them (copy, Export → Selection). */
export function serializeSelection(world, nodes, { name = 'selection' } = {}) {
  const set = new Set(nodes.filter((n) => n && n.kind !== 'connection' && n.kind !== 'group'));
  const conns = world.connections.filter((c) => c.to && set.has(c.from.owner) && set.has(c.to.owner));
  return {
    app: 'proto3d', version: FORMAT_VERSION, name, savedAt: new Date().toISOString(),
    nodes: [...set].map((n) => n.serialize()),
    connections: conns.map((c) => c.serialize()),
    ...routeNodesDoc(conns, world),
    groups: world.groups.filter((g) => g.members.length && g.members.every((m) => set.has(m))).map((g) => g.serialize()),
    wiring: isWiringOn(),
  };
}

/**
 * An undoable command that merges `doc` into the world: fresh instances (new uids, so a document
 * may be imported twice or pasted next to its source), their internal connections and groups.
 * `place: 'beside'` shifts everything to the right of the existing scene; `'keep'` uses the saved
 * positions. Returns null when the document holds nothing the registry knows.
 */
export function importCommand(world, doc, { place = 'beside', label } = {}) {
  doc = upgradeDoc(doc);
  const byUid = new Map(); const entries = []; const skipped = [];
  for (const n of doc.nodes) {
    const def = registry.get(n.type);
    if (!def) { skipped.push(n.type); continue; }
    const inst = createInstance(def, { title: n.title, params: n.params, state: n.state, enabled: n.enabled, showPorts: n.showPorts });
    applyTransformDoc(inst, n);
    byUid.set(n.uid, inst);
    entries.push({ inst, pos: [...(n.position || [0, 1.6, 0])] });
  }
  if (!entries.length) return null;
  let shiftX = 0;   // how far the imported blocks (and their cable waypoints) move to the right
  if (place === 'beside' && world.nodes.length) {
    let maxX = -Infinity, minX = Infinity;
    for (const n of world.nodes) maxX = Math.max(maxX, n.position.x + n.footprint().w / 2);
    for (const e of entries) minX = Math.min(minX, e.pos[0] - e.inst.footprint().w / 2);
    shiftX = maxX + 4 - minX;
    for (const e of entries) e.pos[0] += shiftX;
  }
  const links = [];
  const shared = sharedNodes(doc);
  for (const n of shared.values()) n.position.x += shiftX;
  const shift = (r) => (Array.isArray(r) ? [r[0] + shiftX, r[1], r[2]] : r);
  for (const c of doc.connections || []) {
    const a = byUid.get(c.from?.node), b = byUid.get(c.to?.node);
    if (a && b) links.push({ a, ak: portKey(a.typeId, 'out', c.from.port), b, bk: portKey(b.typeId, 'in', c.to.port), route: Array.isArray(c.route) ? c.route.map(shift) : null });
  }
  const groups = (doc.groups || []).map((g) => {
    const members = (g.members || []).map((u) => byUid.get(u)).filter(Boolean);
    return members.length ? { group: new Group3D({ title: g.title, members }), collapsed: !!g.collapsed } : null;
  }).filter(Boolean);
  const nodes = entries.map((e) => e.inst);
  return {
    label: label || `Import ${nodes.length} component${nodes.length > 1 ? 's' : ''}`, nodes, skipped,
    do() {
      entries.forEach(({ inst, pos }) => world.addNode(inst, pos));
      for (const l of links) { const from = l.a.getPort(l.ak, 'out'), to = l.b.getPort(l.bk, 'in'); if (from && to && world.canConnect(from, to)) { const c = world.addConnection(from, to); if (c && l.route && !c.route.length) applyRoute(c, l.route, shared); } }
      groups.forEach((g) => { world.addGroup(g.group); if (g.collapsed) g.group.setCollapsed(true, world); });
    },
    undo() {
      groups.forEach((g) => world.removeGroup(g.group));
      entries.forEach(({ inst }) => world.removeNode(inst));   // takes the attached connections with it
    },
  };
}

/**
 * Replace the world's content with a saved document (upgraded to today's format first). Unknown
 * types are not built and are reported in `skipped`; their records are kept on `world.carried` and
 * saved back (see carriedOf).
 */
export function loadWorld(world, doc, { camera, controls } = {}) {
  doc = upgradeDoc(doc);
  world.clear();
  const unknown = new Set(doc.nodes.filter((n) => !registry.get(n.type)).map((n) => n.uid));
  world.carried = {
    nodes: doc.nodes.filter((n) => unknown.has(n.uid)),
    connections: (doc.connections || []).filter((c) => unknown.has(c.from?.node) || unknown.has(c.to?.node)),
  };
  const skipped = [];
  const byUid = new Map();
  let maxSeq = 0;
  for (const n of doc.nodes) {
    const def = registry.get(n.type);
    if (!def) { skipped.push(n.type); continue; }
    const inst = createInstance(def, { uid: n.uid, title: n.title, params: n.params, state: n.state, enabled: n.enabled, showPorts: n.showPorts });
    applyTransformDoc(inst, n);
    world.addNode(inst, n.position || [0, 1.6, 0]);
    byUid.set(inst.uid, inst);
    const m = /^b([0-9a-z]+)/.exec(inst.uid); if (m) maxSeq = Math.max(maxSeq, parseInt(m[1].slice(0, -3) || '0', 36) || 0);
  }
  bumpUidCounter(maxSeq);
  const shared = sharedNodes(doc);
  for (const c of doc.connections || []) {
    const a = byUid.get(c.from?.node), b = byUid.get(c.to?.node);
    if (!a || !b) continue;
    const from = a.getPort(portKey(a.typeId, 'out', c.from.port), 'out'), to = b.getPort(portKey(b.typeId, 'in', c.to.port), 'in');
    if (from && to) { const made = world.addConnection(from, to, { uid: c.uid }); if (made && c.route) applyRoute(made, c.route, shared); }
  }
  for (const g of doc.groups || []) {
    const members = (g.members || []).map((uid) => byUid.get(uid)).filter(Boolean);
    if (!members.length) continue;
    const grp = new Group3D({ uid: g.uid, title: g.title, members });
    world.addGroup(grp);
    if (g.collapsed) grp.setCollapsed(true, world);
  }
  if (doc.camera && camera && controls) {
    camera.position.fromArray(doc.camera.position); controls.target.fromArray(doc.camera.target); controls.update();
  }
  if (typeof doc.wiring === 'boolean') setWiring(doc.wiring);   // a saved world keeps its wiring setting
  world.changed('load');
  return { skipped, nodes: world.nodes.length, connections: world.connections.length, groups: world.groups.length };
}

export function downloadJSON(obj, filename = 'proto3d-world.json') {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
/**
 * Open the file picker and resolve with the parsed JSON (rejects on cancel / parse error).
 * With `{ withName: true }` it resolves `{ doc, name }`, the name being the file name without `.json`.
 */
export function pickJSONFile({ withName = false } = {}) {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'application/json,.json';
    input.addEventListener('change', () => {
      const f = input.files && input.files[0];
      if (!f) return reject(new Error('cancelled'));
      f.text().then((t) => { const doc = JSON.parse(t); resolve(withName ? { doc, name: f.name.replace(/\.json$/i, '') } : doc); }).catch(reject);
    });
    input.click();
  });
}
/** A file name the OS accepts, from a project name. */
export function safeFileName(name, ext = '.json') {
  const base = String(name || 'proto3d').trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').slice(0, 80) || 'proto3d';
  return base.toLowerCase().endsWith(ext) ? base : base + ext;
}


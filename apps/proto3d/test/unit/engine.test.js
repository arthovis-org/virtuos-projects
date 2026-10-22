// The core dataflow engine on the headless world the SDK tests use (no DOM, no Three): evaluation
// order, cycles, multi inputs, "most recent wins", event pulses, bypass, errors and the change
// counter the frame loop's idle mode watches.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defineComponent } from '../../src/core/component.js';
import { passThrough } from '../../src/core/engine.js';
import { createHeadlessWorld } from '../../addons/sdk/testing/headless-engine.js';

const source = defineComponent({ id: 't-source', category: 't', label: 'Source', outputs: [{ key: 'v', type: 'number' }], params: [{ key: 'v', type: 'number', default: 1 }], evaluate: ({ params }) => ({ v: params.v }) });
const double = defineComponent({ id: 't-double', category: 't', label: 'Double', inputs: [{ key: 'x', type: 'number' }], outputs: [{ key: 'y', type: 'number' }], evaluate: ({ inputs }) => ({ y: inputs.x === undefined ? undefined : inputs.x * 2 }) });
const sum = defineComponent({ id: 't-sum', category: 't', label: 'Sum', inputs: [{ key: 'xs', type: 'number', multi: true }], outputs: [{ key: 'total', type: 'number' }], evaluate: ({ inputs }) => ({ total: (inputs.xs || []).reduce((a, b) => a + b, 0) }) });
const toText = defineComponent({ id: 't-text', category: 't', label: 'Text', inputs: [{ key: 'in', type: 'text' }], outputs: [{ key: 'out', type: 'text' }], evaluate: ({ inputs }) => ({ out: inputs.in }) });
const counter = defineComponent({
  id: 't-counter', category: 't', label: 'Counter', inputs: [{ key: 'trigger', type: 'event' }], outputs: [{ key: 'count', type: 'number' }, { key: 'fired', type: 'event' }],
  onEvent(ctx, key) { if (key === 'trigger') { ctx.state.n = (ctx.state.n || 0) + 1; ctx.emit('fired', ctx.state.n); } },
  evaluate: ({ state }) => ({ count: state.n || 0 }),
});
const boom = defineComponent({ id: 't-boom', category: 't', label: 'Boom', outputs: [{ key: 'v', type: 'number' }], evaluate() { throw new Error('kaboom'); } });

test('values flow downstream in one pass, whatever order the nodes were added in', () => {
  const h = createHeadlessWorld();
  const d2 = h.add(double), d1 = h.add(double), s = h.add(source, { v: 3 });   // added back to front
  h.connect(s, 'v', d1, 'x'); h.connect(d1, 'y', d2, 'x');
  h.tick();
  assert.equal(d2.out.y, 12, 'source → double → double settles in the first pass');
  assert.deepEqual(h.engine.order().map((n) => n.typeId), ['t-source', 't-double', 't-double']);
});

test('a cycle does not hang: every node is still ordered and evaluated', () => {
  const h = createHeadlessWorld();
  const a = h.add(double), b = h.add(double), s = h.add(source, { v: 1 });
  h.connect(a, 'y', b, 'x'); h.connect(b, 'y', a, 'x');
  h.connect(s, 'v', a, 'x');
  assert.equal(h.engine.order().length, 3, 'cycle members are appended, not dropped');
  h.tick(3);
  assert.ok(Number.isFinite(a.out.y) && Number.isFinite(b.out.y));
});

test('a multi input collects every link in connection order; a single input takes the most recently changed', () => {
  const h = createHeadlessWorld();
  const a = h.add(source, { v: 2 }), b = h.add(source, { v: 5 }), total = h.add(sum), d = h.add(double);
  h.connect(a, 'v', total, 'xs'); h.connect(b, 'v', total, 'xs');
  h.tick();
  assert.equal(total.out.total, 7);
  assert.deepEqual(total.getPort('xs', 'in').value, [2, 5]);
  h.connect(a, 'v', d, 'x'); h.connect(b, 'v', d, 'x');
  h.tick();
  a.params.v = 10; h.tick();
  assert.equal(d.out.y, 20, 'a changed most recently, so it wins');
  b.params.v = 4; h.tick();
  assert.equal(d.out.y, 8, 'then b');
});

test('numbers are coerced into a text input', () => {
  const h = createHeadlessWorld();
  const s = h.add(source, { v: 42 }), t = h.add(toText);
  h.connect(s, 'v', t, 'in');
  h.tick();
  assert.equal(t.out.out, '42');
});

test('an external pulse runs onEvent once and the emitted pulse reaches the next node in the same pass', () => {
  const h = createHeadlessWorld();
  const c1 = h.add(counter), c2 = h.add(counter);
  h.connect(c1, 'fired', c2, 'trigger');
  h.trigger(c1); h.tick();
  assert.equal(c1.out.count, 1); assert.equal(c2.out.count, 1, 'the chained counter saw the pulse in the same frame');
  h.tick(5);
  assert.equal(c1.out.count, 1, 'a pulse is seen once, not every frame'); assert.equal(c2.out.count, 1);
});

test('a bypassed node hands its first matching input through', () => {
  const h = createHeadlessWorld();
  const s = h.add(source, { v: 3 }), d = h.add(double);
  h.connect(s, 'v', d, 'x');
  d.enabled = false; h.tick();
  assert.equal(d.out.y, 3);
  assert.deepEqual(passThrough(d, { x: 9 }), { y: 9 });
});

test('a throwing evaluate is contained: the error is recorded, onError is called, the rest still runs', () => {
  const h = createHeadlessWorld();
  const seen = []; h.engine.onError = (node, e) => seen.push([node.typeId, e.message]);
  const b = h.add(boom), s = h.add(source, { v: 1 }), d = h.add(double);
  h.connect(s, 'v', d, 'x');
  h.tick();
  assert.equal(b.rt.error, 'kaboom'); assert.deepEqual(seen, [['t-boom', 'kaboom']]);
  assert.equal(d.out.y, 2);
});

test('engine.changes grows only when an output value changes (the idle mode signal)', () => {
  const h = createHeadlessWorld();
  const s = h.add(source, { v: 1 }), d = h.add(double);
  h.connect(s, 'v', d, 'x');
  h.tick();
  const settled = h.engine.changes;
  h.tick(10);
  assert.equal(h.engine.changes, settled, 'a still graph changes nothing frame after frame');
  s.params.v = 2; h.tick();
  assert.ok(h.engine.changes > settled);
});

test('ambient outputs (simulated sensors) change without counting as activity; what they drive downstream still counts', () => {
  const sensor = defineComponent({ id: 't-sensor', category: 't', label: 'Sensor', ambient: ['v'], outputs: [{ key: 'v', type: 'number' }], evaluate: ({ time }) => ({ v: time }) });
  const h = createHeadlessWorld();
  const s = h.add(sensor);
  h.tick();
  const c0 = h.engine.changes;
  h.tick(5);
  assert.equal(h.engine.changes, c0, 'a lone drifting sensor is not activity');
  assert.ok(s.out.v > 0);
  const d = h.add(double); h.connect(s, 'v', d, 'x');
  h.tick(2);
  assert.ok(h.engine.changes > c0, 'a node it drives changes, and that counts');
});

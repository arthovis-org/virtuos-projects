// Document upgrades (serialize.js upgradeDoc): old files open, newer files are refused instead of
// half read, and the stored document is never mutated.
import test from 'node:test';
import assert from 'node:assert/strict';
import { upgradeDoc, FORMAT_VERSION } from '../../src/serialize.js';

const doc = (extra = {}) => ({ app: 'proto3d', name: 'x', nodes: [{ uid: 'b1', type: 'text', params: { text: 'hi' } }], connections: [], groups: [], ...extra });

test('a current document passes through as is', () => {
  const d = doc({ version: FORMAT_VERSION });
  assert.equal(upgradeDoc(d), d);
});

test('an old or unversioned document is upgraded on a copy', () => {
  for (const d of [doc({ version: 1 }), doc()]) {
    const before = JSON.stringify(d);
    const up = upgradeDoc(d);
    assert.equal(up.version, FORMAT_VERSION);
    assert.notEqual(up, d); assert.equal(JSON.stringify(d), before, 'the original is untouched');
    assert.deepEqual(up.nodes, d.nodes);
  }
});

test('a document from a newer Proto3D is refused with a message that says so', () => {
  assert.throws(() => upgradeDoc(doc({ version: FORMAT_VERSION + 1 })), /newer Proto3D/);
});

test('anything that is not a Proto3D document is refused', () => {
  for (const bad of [null, {}, { app: 'other', nodes: [] }, { app: 'proto3d' }]) assert.throws(() => upgradeDoc(bad), /Not a Proto3D document/);
});

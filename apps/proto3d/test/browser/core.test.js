// The core page in Chromium: what only a real page can check. Projects keep components of types
// the page does not know (through autosave and tab switches), files from a newer Proto3D are refused
// without opening a tab, a fresh browser gets the Simple controls, and the frame loop idles when
// nothing happens and wakes on input. Runs with `npm run test:browser` and in the core CI job.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from '../../addons/sdk/testing/browser.js';

let h, page, errors;
test.before(async () => {
  h = await createHarness();
  ({ page, errors } = await h.open('/'));
  await h.waitForCore(page);
});
test.after(async () => { await h?.close(); });

test('a fresh browser starts with the Simple controls', async () => {
  assert.equal(await page.evaluate(() => window.__proto.nav.presetId), 'simple');
});

test('components of an unknown type are kept through load, save and a tab switch', async () => {
  const r = await page.evaluate(async () => {
    const p = window.__proto;
    const doc = {
      app: 'proto3d', version: 2, name: 'mixed',
      nodes: [
        { uid: 'bk1', type: 'text', title: 'Known', params: { text: 'hello' }, position: [0, 1.6, 0] },
        { uid: 'bu1', type: 'zz-widget', title: 'From an add-on', params: { secret: 42, list: [1, 2] }, state: { n: 3 }, position: [4, 1.6, 0] },
      ],
      connections: [{ uid: 'cx1', from: { node: 'bk1', port: 'text' }, to: { node: 'bu1', port: 'in' } }],
      groups: [],
    };
    const tab = p.openDoc(doc, 'mixed');
    const saved = p.serialize();
    // park the tab (detach) and bring it back (attach): the records travel with the scene
    const other = p.tabs.newTab(); p.tabs.activate(tab.id);
    const back = p.serialize();
    await p.tabs.close(other.id, { force: true });
    return { built: p.world.nodes.map((n) => n.typeId), saved, back };
  });
  assert.deepEqual(r.built, ['text'], 'only the known component is built');
  for (const doc of [r.saved, r.back]) {
    const unknown = doc.nodes.find((n) => n.uid === 'bu1');
    assert.ok(unknown, 'the unknown component is written back');
    assert.deepEqual(unknown.params, { secret: 42, list: [1, 2] }); assert.deepEqual(unknown.state, { n: 3 });
    assert.ok(doc.connections.some((c) => c.uid === 'cx1'), 'its link is written back too');
  }
});

test('a file from a newer Proto3D is refused before a tab opens', async () => {
  const r = await page.evaluate(() => {
    const p = window.__proto; const before = p.tabs.tabs.length;
    let message = null;
    try { p.openDoc({ app: 'proto3d', version: 999, nodes: [] }, 'future'); } catch (e) { message = e.message; }
    return { message, opened: p.tabs.tabs.length - before };
  });
  assert.match(r.message || '', /newer Proto3D/);
  assert.equal(r.opened, 0);
});

test('the frame loop idles when nothing happens and wakes on input', async () => {
  // Measured against the loop's own gate, not raw frame rates: a CI machine rendering in software
  // may only manage a few frames a second at full speed, so "awake is faster" proves nothing there.
  await page.evaluate(() => { const p = window.__proto; p.start?.hide?.('test'); if (p.tour?.active) p.tour.finish(); });
  await page.waitForFunction(() => window.__proto.loop.isIdle(), null, { timeout: 15000 });
  const idle = await page.evaluate(async () => { const { loop, engine } = window.__proto; const s0 = loop.skipped, n0 = engine.evaluations; await new Promise((r) => setTimeout(r, 1500)); return { skipped: loop.skipped - s0, frames: engine.evaluations - n0 }; });
  assert.ok(idle.skipped > 0, `idle: the gate skipped ${idle.skipped} frames`);
  assert.ok(idle.frames <= 1.5 * 1000 / 250 + 2, `idle: ${idle.frames} frames in 1.5 s (one per 250 ms expected)`);
  const box = await page.locator('#viewport canvas').first().boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  assert.equal(await page.evaluate(() => window.__proto.loop.isIdle()), false, 'a pointer move wakes the loop');
  const awake = await page.evaluate(async () => { const { loop, engine } = window.__proto; const stop = setInterval(() => loop.wake(), 100); const s0 = loop.skipped, n0 = engine.evaluations; await new Promise((r) => setTimeout(r, 1000)); clearInterval(stop); return { skipped: loop.skipped - s0, frames: engine.evaluations - n0 }; });
  assert.equal(awake.skipped, 0, 'awake: the gate lets every frame through');
  assert.ok(awake.frames > 0, 'awake: frames run');
});

test('no page errors', () => { assert.deepEqual(errors, [], errors.join('\n')); });

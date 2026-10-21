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
  const rate = () => page.evaluate(async () => { const e = window.__proto.engine; const n0 = e.evaluations; await new Promise((r) => setTimeout(r, 1000)); return e.evaluations - n0; });
  await page.evaluate(() => { const p = window.__proto; p.start?.hide?.('test'); if (p.tour?.active) p.tour.finish(); });
  await page.waitForFunction(() => window.__proto.loop.isIdle(), null, { timeout: 15000 });
  const idle = await rate();
  assert.ok(idle <= 8, `idle: ${idle} evaluations a second`);
  const box = await page.locator('#viewport canvas').first().boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  assert.equal(await page.evaluate(() => window.__proto.loop.isIdle()), false, 'a pointer move wakes the loop');
  const awake = await page.evaluate(async () => { const p = window.__proto; const e = p.engine; const n0 = e.evaluations; const stop = setInterval(() => p.loop.wake(), 100); await new Promise((r) => setTimeout(r, 1000)); clearInterval(stop); return e.evaluations - n0; });
  assert.ok(awake > idle * 3, `awake: ${awake} evaluations a second (idle ${idle})`);
});

test('no page errors', () => { assert.deepEqual(errors, [], errors.join('\n')); });

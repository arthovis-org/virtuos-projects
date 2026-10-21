// The project-management model (pm/model.js): the Kanban board, the Timeline, the Dashboard and
// the Person component all read and write through these helpers. Dates are pinned with `today`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBoard, addCard, moveCard, removeCard, boardStats, isBlocked, isOverdue, daysUntil, addDays, pushBurndown, toTasks, flatCards, findCard } from '../../src/pm/model.js';

const TODAY = new Date('2026-03-10T12:00:00Z');
function sample() {
  let b = createBoard({ columns: [{ title: 'To do' }, { title: 'Doing' }, { title: 'Done' }] });
  b = addCard(b, 'To do', { title: 'Design', estimate: 2, due: '2026-03-05' }).board;   // overdue
  b = addCard(b, 'To do', { title: 'Build', estimate: 3, due: '2026-03-20' }).board;
  b = addCard(b, 'Doing', { title: 'Copy', estimate: 1 }).board;
  b = addCard(b, 'Done', { title: 'Brief', estimate: 1, due: '2026-03-01' }).board;     // past due but done: not overdue
  return b;
}

test('dates: days until, adding days, overdue', () => {
  assert.equal(daysUntil('2026-03-12', TODAY), 2);
  assert.equal(daysUntil('2026-03-09', TODAY), -1);
  assert.ok(Number.isNaN(daysUntil('', TODAY)));
  assert.equal(addDays('2026-02-27', 3), '2026-03-02');
  assert.equal(isOverdue({ due: '2026-03-09' }, TODAY), true);
  assert.equal(isOverdue({ due: '2026-03-10' }, TODAY), false);
  assert.equal(isOverdue({}, TODAY), false);
});

test('board stats: totals, done ratio, overdue outside Done, estimates', () => {
  const s = boardStats(sample(), TODAY);
  assert.equal(s.total, 4); assert.equal(s.done, 1); assert.equal(s.doneRatio, 0.25);
  assert.equal(s.overdue, 1, 'only the open overdue card counts');
  assert.equal(s.estimate, 7); assert.equal(s.remaining, 6);
  assert.deepEqual(s.columns.map((c) => c.count), [2, 1, 1]);
});

test('moving a card is immutable and lands where asked', () => {
  const b = sample();
  const r = moveCard(b, 'Design', 'Done');
  assert.ok(r.changed); assert.equal(r.to.title, 'Done');
  assert.equal(findCard(b, 'Design').column.title, 'To do', 'the original board is untouched');
  assert.equal(boardStats(r.board, TODAY).done, 2);
  assert.equal(boardStats(r.board, TODAY).overdue, 0, 'a done card is no longer overdue');
  const top = moveCard(b, 'Build', 'To do', 0);
  assert.deepEqual(top.board.columns[0].cards.map((c) => c.title), ['Build', 'Design']);
  assert.equal(moveCard(b, 'nope', 'Done'), null);
});

test('blocked cards: blocked until the dependency is done; removing the dependency unblocks', () => {
  let b = sample();
  const design = findCard(b, 'Design').card;
  b = addCard(b, 'To do', { title: 'Launch', blockedBy: [design.id] }).board;
  assert.equal(isBlocked(b, findCard(b, 'Launch').card), true);
  assert.equal(boardStats(b, TODAY).blocked, 1);
  const moved = moveCard(b, design.id, 'Done').board;
  assert.equal(isBlocked(moved, findCard(moved, 'Launch').card), false);
  const removed = removeCard(b, design.id).board;
  assert.deepEqual(findCard(removed, 'Launch').card.blockedBy, []);
});

test('burndown adds a point only when the remaining work changes', () => {
  const b = sample();
  let h = pushBurndown([], boardStats(b, TODAY));
  h = pushBurndown(h, boardStats(b, TODAY));
  assert.equal(h.length, 1);
  h = pushBurndown(h, boardStats(moveCard(b, 'Build', 'Done').board, TODAY));
  assert.equal(h.length, 2); assert.equal(h[1].remaining, 3);
  let many = [];
  for (let i = 0; i < 100; i++) many = pushBurndown(many, { remaining: i, estimate: 100, total: 1, done: 0 }, 80);
  assert.equal(many.length, 80, 'capped');
});

test('timeline rows: start from due and estimate, swapped ranges fixed, undated cards skipped', () => {
  const rows = toTasks([
    { id: 'a', title: 'A', due: '2026-03-20', estimate: 3 },
    { id: 'b', title: 'B', start: '2026-03-15', end: '2026-03-12' },
    { id: 'c', title: 'C' },
  ], TODAY);
  assert.deepEqual(rows.map((r) => r.id), ['a', 'b']);
  assert.equal(rows[0].start, '2026-03-17');
  assert.deepEqual([rows[1].start, rows[1].end], ['2026-03-12', '2026-03-15']);
});

test('flat cards carry their column, order and done flag', () => {
  const f = flatCards(sample());
  assert.deepEqual(f.map((c) => [c.title, c.column, c.done]), [['Design', 'To do', false], ['Build', 'To do', false], ['Copy', 'Doing', false], ['Brief', 'Done', true]]);
});

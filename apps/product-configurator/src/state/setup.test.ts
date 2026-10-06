import { describe, expect, it } from 'vitest';
import { getProduct } from '@/catalog';
import {
  closeWindow,
  deskName,
  dropWindow,
  fillBlank,
  isBlankWindow,
  initialSetup,
  initialWindows,
  layoutWindows,
  moveWindow,
  newDesk,
  openWindow,
  screenWeights,
  setWindowZoom,
  starterRoom,
  validZoom,
  withWorkspace,
  workspaceById,
} from './setup';

const product = getProduct('smart-desk');
const finance = workspaceById(product, 'finance')!;
const ids = finance.windows.map((w) => w.id);

describe('windows', () => {
  const windows = initialWindows(finance);

  it('start with every window on its own screen, in order', () => {
    expect(windows.order).toEqual(ids);
    for (const w of finance.windows) expect(windows.placement[w.id]).toBe(w.screen);
  });

  it('move to a screen, going last there', () => {
    const moved = moveWindow(windows, ids[0]!, 'monitor-left');
    expect(moved.placement[ids[0]!]).toBe('monitor-left');
    expect(moved.order.at(-1)).toBe(ids[0]);
  });

  it('close, and reopen by id', () => {
    const closed = closeWindow(windows, ids[1]!);
    expect(closed.closed).toEqual([ids[1]]);
    expect(closed.order).not.toContain(ids[1]);
    const reopened = openWindow(closed, 'main-monitor', { id: ids[1]!, title: '', url: '' });
    expect(reopened.closed).toEqual([]);
    expect(reopened.placement[ids[1]!]).toBe('main-monitor');
  });

  it('open any site with a new id; closing it forgets it', () => {
    const opened = openWindow(windows, 'monitor-right', {
      title: 'Example',
      url: 'https://example.com/',
    });
    const site = opened.opened[0]!;
    expect(site).toMatchObject({ title: 'Example', screen: 'monitor-right' });
    expect(closeWindow(opened, site.id).opened).toEqual([]);
  });

  it('drop next to a window, or swap with it', () => {
    const [a, b] = ids as [string, string];
    const after = dropWindow(windows, a, windows.placement[a]!, {
      screen: windows.placement[b]!,
      action: 'after',
      windowId: b,
    });
    expect(after.order.indexOf(a)).toBe(after.order.indexOf(b) + 1);
    expect(after.placement[a]).toBe(windows.placement[b]);

    const swapped = dropWindow(windows, a, windows.placement[a]!, {
      screen: windows.placement[b]!,
      action: 'swap',
      windowId: b,
    });
    expect(swapped.placement[a]).toBe(windows.placement[b]);
    expect(swapped.placement[b]).toBe(windows.placement[a]);
  });

  it('on a switched-off screen show on the primary one', () => {
    const layout = layoutWindows(
      finance.windows,
      windows.placement,
      windows.order,
      ['main-monitor'],
      'main-monitor',
    );
    expect([...layout.keys()]).toEqual(['main-monitor']);
    expect(layout.get('main-monitor')).toHaveLength(finance.windows.length);
  });

  it('keep their sizes only next to the same windows', () => {
    const sizes = { s: { windows: ['a', 'b'], weights: [3, 1] } };
    expect(screenWeights(sizes, 's', ['a', 'b'])).toEqual([1.5, 0.5]);
    expect(screenWeights(sizes, 's', ['b', 'a'])).toEqual([1, 1]);
  });
});

describe('desks', () => {
  it('get their workspace’s windows when it changes', () => {
    const desk = { ...newDesk(product, 'finance'), windows: initialWindows(undefined) };
    const changed = withWorkspace(product, desk, 'crypto');
    expect(changed.workspaceId).toBe('crypto');
    expect(changed.windows.order).toEqual(
      workspaceById(product, 'crypto')!.windows.map((w) => w.id),
    );
    expect(withWorkspace(product, desk, 'nope')).toBe(desk);
  });

  it('are named after their workspace, numbered when several share it', () => {
    const a = newDesk(product, 'finance');
    const b = newDesk(product, 'finance');
    const c = { ...newDesk(product, 'crypto'), name: 'Trading' };
    const desks = [a, b, c];
    expect(deskName(product, desks, a)).toBe('Finance 1');
    expect(deskName(product, desks, b)).toBe('Finance 2');
    expect(deskName(product, desks, c)).toBe('Trading');
  });

  it('a first room brings the single desk along, then themed desks', () => {
    const setup = initialSetup(product);
    const single = {
      ...setup.single,
      workspaceId: 'soccer',
      motions: { height: 100 },
      windows: closeWindow(initialWindows(workspaceById(product, 'soccer')), 'live-scores'),
    };
    const room = starterRoom(product, single, true);
    expect(room.map((d) => d.workspaceId)).toEqual(['soccer', 'finance', 'crypto', 'nba']);
    expect(room[0]!.motions).toEqual({ height: 100 });
    expect(room[0]!.windows.closed).toEqual(['live-scores']);
    expect(room[0]!.id).not.toBe(single.id);
    // Without its workspace, the single desk becomes a finance desk with finance's windows.
    expect(starterRoom(product, single, false)[0]!.workspaceId).toBe('finance');
    expect(starterRoom(product, single, false)[0]!.windows.closed).toEqual([]);
  });
});

describe('window zoom', () => {
  it('is kept per window, with 100% as no entry', () => {
    let windows = setWindowZoom(initialWindows(finance), 'a', 0.5);
    windows = setWindowZoom(windows, 'b', 'fit');
    expect(windows.zoom).toEqual({ a: 0.5, b: 'fit' });
    expect(setWindowZoom(windows, 'a', 1).zoom).toEqual({ b: 'fit' });
  });

  it('loads only zooms that are zooms', () => {
    expect(validZoom('fit')).toBe('fit');
    expect(validZoom(0.75)).toBe(0.75);
    expect(validZoom(40)).toBe(5);
    expect(validZoom(0.01)).toBe(0.1);
    expect(validZoom(0.333)).toBe(0.33);
    expect(validZoom('big')).toBeNull();
    expect(validZoom(Number.NaN)).toBeNull();
  });
});

describe('splitting a window', () => {
  const first = ids[0]!;
  const blankOf = (w: ReturnType<typeof initialWindows>) => w.opened.find(isBlankWindow);

  it('puts a blank window beside it on its screen, on the other side from the drop', () => {
    const start = initialWindows(finance);
    const screen = start.placement[first]!;
    const left = dropWindow(start, first, screen, {
      screen,
      action: 'split-before',
      windowId: first,
    });
    const blank = blankOf(left)!;
    expect(left.placement[blank.id]).toBe(screen);
    expect(left.order.indexOf(blank.id)).toBe(left.order.indexOf(first) + 1);
    const right = dropWindow(start, first, screen, {
      screen,
      action: 'split-after',
      windowId: first,
    });
    const other = blankOf(right)!;
    expect(right.order.indexOf(other.id)).toBe(right.order.indexOf(first) - 1);
  });

  it('turns the blank into the site picked, where it is', () => {
    const start = initialWindows(finance);
    const screen = start.placement[first]!;
    const split = dropWindow(start, first, screen, {
      screen,
      action: 'split-before',
      windowId: first,
    });
    const blank = blankOf(split)!;
    const filled = fillBlank(split, blank.id, { title: 'Example', url: 'https://example.com/' });
    expect(filled.opened.find((w) => w.id === blank.id)).toMatchObject({
      title: 'Example',
      url: 'https://example.com/',
    });
    expect(filled.order).toEqual(split.order);
  });

  it('reopens a closed workspace window where the blank one was', () => {
    const second = ids[1]!;
    const start = closeWindow(initialWindows(finance), second);
    const screen = start.placement[first]!;
    const split = dropWindow(start, first, screen, {
      screen,
      action: 'split-after',
      windowId: first,
    });
    const blank = blankOf(split)!;
    const at = split.order.indexOf(blank.id);
    const site = finance.windows.find((w) => w.id === second)!;
    const filled = fillBlank(split, blank.id, site);
    expect(filled.closed).not.toContain(second);
    expect(filled.order.indexOf(second)).toBe(at);
    expect(filled.placement[second]).toBe(screen);
    expect(filled.opened.some(isBlankWindow)).toBe(false);
  });
});

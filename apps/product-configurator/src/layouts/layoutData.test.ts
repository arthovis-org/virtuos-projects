import { describe, expect, it } from 'vitest';
import { getProduct } from '@/catalog';
import fixture from '@/test/fixtures/layout-v1.json';
import { isLayoutData, layoutFromSetup, setupFromLayout, type LayoutData } from './layoutData';

const product = getProduct('smart-desk');
const motion = product.motions[0]!;

// Recorded from the app before the set-up model existed: layouts saved online look like this.
const saved = fixture as LayoutData;

describe('saved layouts', () => {
  it('from before still open, with everything in them', () => {
    expect(isLayoutData(saved)).toBe(true);
    const setup = setupFromLayout(product, saved);

    expect(setup.mode).toBe('desks');
    expect(setup.single.workspaceId).toBe('soccer');
    expect(setup.single.selections['material-desk-mat']).toBe('walnut');
    expect(setup.single.motions[motion.id]).toBe(100);
    expect(setup.single.windows.closed).toEqual(['live-scores']);

    expect(setup.room.map((d) => d.workspaceId)).toEqual(['soccer', 'finance', 'crypto', 'nba']);
    const [first, finance, crypto, nba] = setup.room;
    // A desk saved without windows gets its workspace's own.
    expect(first!.windows.order).toEqual(
      product.workspaces.find((w) => w.id === 'soccer')!.windows.map((w) => w.id),
    );
    expect(finance!.motions[motion.id]).toBe(110);
    expect(finance!.selections['toggle-monitor-bottom']).toBe('without');
    expect(finance!.windows.placement['s-p-500']).toBe('monitor-bottom');
    expect(finance!.windows.opened.map((w) => w.url)).toEqual(['https://example.com/']);
    expect(finance!.windows.sizes['main-monitor']?.weights).toEqual([2, 1]);
    expect(crypto!.motions[motion.id]).toBeUndefined();
    expect(nba!.name).toBe('Night games');
    expect(setup.activeDeskId).toBe(crypto!.id);
  });

  it('save and open a set-up unchanged (but for desk ids)', () => {
    const setup = setupFromLayout(product, saved);
    const again = setupFromLayout(product, layoutFromSetup(product, setup));
    const withoutIds = (s: typeof setup) => ({
      ...s,
      room: s.room.map(({ id: _id, ...desk }) => desk),
      activeDeskId: s.room.findIndex((d) => d.id === s.activeDeskId),
    });
    expect(withoutIds(again)).toEqual(withoutIds(setup));
  });

  it('drop desks of workspaces the product no longer has, and windows of another workspace', () => {
    const layout: LayoutData = {
      ...saved,
      room: {
        desks: [
          { workspaceId: 'gone', selections: {} },
          {
            workspaceId: 'nba',
            selections: { 'material-desk-mat': 'unobtainium' },
            windows: { ...saved.room!.desks[1]!.windows!, workspaceId: 'finance' },
          },
        ],
        active: 1,
      },
    };
    const setup = setupFromLayout(product, layout);
    expect(setup.room.map((d) => d.workspaceId)).toEqual(['nba']);
    expect(setup.room[0]!.windows.opened).toEqual([]);
    expect(setup.room[0]!.selections['material-desk-mat']).toBe('american-oak');
    expect(setup.activeDeskId).toBe(setup.room[0]!.id);
  });

  it('saved at the single desk keep the room behind the switch', () => {
    const setup = setupFromLayout(product, { ...saved, mode: 'single' });
    expect(setup.mode).toBe('single');
    expect(setup.room).toHaveLength(4);
  });
});

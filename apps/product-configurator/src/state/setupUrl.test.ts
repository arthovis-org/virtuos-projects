import { describe, expect, it } from 'vitest';
import { getProduct } from '@/catalog';
import { initialSetup, newDesk } from './setup';
import { encodeSetupSearch, setupFromSearch } from './setupUrl';

const product = getProduct('smart-desk');

describe('links', () => {
  it('carry the single desk’s configuration', () => {
    const setup = initialSetup(product, { 'material-desk-mat': 'walnut' });
    const search = encodeSetupSearch(product, setup);
    expect(search).toContain('material-desk-mat:walnut');
    const back = setupFromSearch(search);
    expect(back.mode).toBe('single');
    expect(back.single.selections).toEqual(setup.single.selections);
  });

  it('carry the room: each desk’s workspace, changed options and the desk the visitor is at', () => {
    const base = initialSetup(product);
    const crypto = {
      ...newDesk(product, 'crypto'),
      selections: { ...base.single.selections, 'toggle-side-monitors': 'without' },
    };
    const room = [newDesk(product, 'finance'), crypto];
    const search = encodeSetupSearch(product, {
      ...base,
      mode: 'desks',
      room,
      activeDeskId: crypto.id,
    });
    expect(search).toBe(
      '?product=smart-desk&desks=finance,crypto~toggle-side-monitors:without&desk=2',
    );
    const back = setupFromSearch(search);
    expect(back.mode).toBe('desks');
    expect(back.room.map((d) => d.workspaceId)).toEqual(['finance', 'crypto']);
    expect(back.room[1]!.selections['toggle-side-monitors']).toBe('without');
    expect(back.activeDeskId).toBe(back.room[1]!.id);
  });

  it('open at the overview without a desk, and skip what the product lacks', () => {
    const back = setupFromSearch('?product=smart-desk&desks=nope,nba~bad:value');
    expect(back.room.map((d) => d.workspaceId)).toEqual(['nba']);
    expect(back.activeDeskId).toBeNull();
    expect(back.room[0]!.selections).toEqual(initialSetup(product).single.selections);
  });
});

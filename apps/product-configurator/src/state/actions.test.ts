import { beforeEach, describe, expect, it } from 'vitest';
import { getProduct } from '@/catalog';
import {
  addDesk,
  enterRoom,
  enterWorkspace,
  exitRoom,
  loadSetup,
  removeDesk,
  selectDesk,
  stepDesk,
} from './actions';
import { currentDesk, initialSetup } from './setup';
import { currentSetup, useSetupStore } from './setupStore';
import { encodeSetupSearch } from './setupUrl';
import { useViewStore } from './viewStore';

const product = getProduct('smart-desk');
const motion = product.motions[0]!;
const setup = () => useSetupStore.getState();
const view = () => useViewStore.getState();
const room = () => setup().room;

beforeEach(() => {
  loadSetup(initialSetup(product));
});

describe('the single desk', () => {
  it('is configured from the panel', () => {
    setup().selectOption('material-desk-mat', 'walnut');
    setup().setMotion(setup().single.id, motion, 100);
    expect(setup().single.selections['material-desk-mat']).toBe('walnut');
    expect(setup().single.motions[motion.id]).toBe(100);
  });

  it('heights stay within the motion’s range', () => {
    setup().setMotion(setup().single.id, motion, 500);
    expect(setup().single.motions[motion.id]).toBe(motion.max);
  });

  it('trying a workspace puts its sites on, seated', () => {
    enterWorkspace('crypto');
    expect(setup().single.workspaceId).toBe('crypto');
    expect(view()).toMatchObject({ active: true, seated: true });
  });
});

describe('the room', () => {
  it('carries on at the single desk’s workspace: its first desk, sites on as they were', () => {
    setup().selectOption('material-desk-mat', 'walnut');
    setup().setMotion(setup().single.id, motion, 100);
    enterWorkspace('soccer');
    setup().closeWindow('live-scores');
    enterRoom();

    expect(setup().mode).toBe('desks');
    const first = room()[0]!;
    expect(setup().activeDeskId).toBe(first.id);
    expect(view()).toMatchObject({ active: true, seated: true });
    expect(first).toMatchObject({ workspaceId: 'soccer', motions: { [motion.id]: 100 } });
    expect(first.selections['material-desk-mat']).toBe('walnut');
    expect(first.windows.closed).toEqual(['live-scores']);
    expect(room().length).toBeGreaterThan(1);
  });

  it('opens at the overview when no workspace was open', () => {
    enterRoom();
    expect(setup().activeDeskId).toBeNull();
    expect(view().active).toBe(false);
  });

  it('back at the single desk, its workspace is open again as it was left', () => {
    enterWorkspace('developer');
    view().standUp();
    enterRoom();
    exitRoom();
    expect(setup().single.workspaceId).toBe('developer');
    expect(view()).toMatchObject({ active: true, seated: false });
    // Left with the sites off: they stay off.
    view().close();
    enterRoom();
    exitRoom();
    expect(view().active).toBe(false);
  });

  it('gives every desk its own setup, height and windows', () => {
    enterRoom();
    const a = room()[0]!;
    const b = room()[1]!;
    selectDesk(a.id);
    setup().selectOption('material-desk-mat', 'walnut');
    setup().setMotion(a.id, motion, 110);
    setup().moveWindow(currentDesk(setup())!.windows.order[0]!, 'monitor-bottom');
    selectDesk(b.id);
    setup().closeWindow(currentDesk(setup())!.windows.order[0]!);

    const [deskA, deskB] = room();
    expect(deskA!.selections['material-desk-mat']).toBe('walnut');
    expect(deskB!.selections['material-desk-mat']).toBe('american-oak');
    expect(deskA!.motions[motion.id]).toBe(110);
    expect(deskB!.motions[motion.id]).not.toBe(110);
    expect(deskA!.windows.closed).toEqual([]);
    expect(deskB!.windows.closed).toHaveLength(1);
    // The single desk is untouched.
    expect(setup().single.selections['material-desk-mat']).toBe('american-oak');
  });

  it('moving to a desk sits down at it; stepping goes round', () => {
    enterRoom();
    selectDesk(room()[1]!.id);
    expect(setup().activeDeskId).toBe(room()[1]!.id);
    expect(view()).toMatchObject({ active: true, seated: true });
    stepDesk(-1);
    expect(setup().activeDeskId).toBe(room()[0]!.id);
    stepDesk(-1);
    expect(setup().activeDeskId).toBe(room().at(-1)!.id);
  });

  it('a new desk is sat at; removing the desk one is at moves to its neighbour', () => {
    enterRoom();
    const count = room().length;
    addDesk('space');
    expect(room()).toHaveLength(count + 1);
    const added = room().at(-1)!;
    expect(added.workspaceId).toBe('space');
    expect(setup().activeDeskId).toBe(added.id);
    removeDesk(added.id);
    expect(room()).toHaveLength(count);
    expect(setup().activeDeskId).toBe(room().at(-1)!.id);
  });

  it('never removes the last desk', () => {
    enterRoom();
    for (const desk of [...room()]) removeDesk(desk.id);
    expect(room()).toHaveLength(1);
  });

  it('a desk given another workspace gets that workspace’s windows', () => {
    enterRoom();
    const desk = room()[0]!;
    selectDesk(desk.id);
    setup().closeWindow(desk.windows.order[0]!);
    setup().setDeskWorkspace(desk.id, 'travel');
    expect(room()[0]!.workspaceId).toBe('travel');
    expect(room()[0]!.windows.closed).toEqual([]);
  });

  it('is kept while back at the single desk, and comes back as it was', () => {
    enterRoom();
    selectDesk(room()[2]!.id);
    setup().selectOption('material-desk-mat', 'walnut');
    const before = room();
    exitRoom();
    expect(setup().mode).toBe('single');
    expect(view().active).toBe(false);
    expect(setup().single.selections['material-desk-mat']).toBe('american-oak');
    enterRoom();
    expect(room()).toBe(before);
    expect(currentDesk(setup())?.id).toBe(before[2]!.id);
    expect(view()).toMatchObject({ active: true, seated: false });
  });

  it('two desks can trade places', () => {
    enterRoom();
    const [a, b] = room();
    setup().swapDesks(a!.id, b!.id);
    expect(room().slice(0, 2)).toEqual([b, a]);
  });
});

describe('the set-up as a whole', () => {
  it('a new product starts afresh', () => {
    enterRoom();
    setup().selectProduct('smart-desk');
    expect(setup().mode).toBe('single');
    expect(room()).toEqual([]);
  });

  it('loading one puts the visitor back at its desk, looking around', () => {
    enterRoom();
    const saved = { ...currentSetup(), activeDeskId: room()[1]!.id };
    loadSetup(initialSetup(product));
    loadSetup(saved);
    expect(currentDesk(setup())?.id).toBe(room()[1]!.id);
    expect(view()).toMatchObject({ active: true, seated: false });
  });

  it('the link follows it', () => {
    enterRoom();
    selectDesk(room()[1]!.id);
    expect(encodeSetupSearch(product, currentSetup())).toMatch(/&desks=.*&desk=2$/);
  });
});

describe('a workspace picked at the single desk', () => {
  it('comes along into a new room even with its sites closed', () => {
    enterWorkspace('office');
    view().close();
    enterRoom();
    expect(room()[0]!.workspaceId).toBe('office');
    expect(room().map((d) => d.workspaceId)).toContain('finance');
  });

  it('joins a room that already exists, as the desk the visitor is at', () => {
    enterRoom();
    const before = room().length;
    exitRoom();
    enterWorkspace('travel');
    enterRoom();
    expect(room()).toHaveLength(before + 1);
    expect(room().at(-1)!.workspaceId).toBe('travel');
    expect(setup().activeDeskId).toBe(room().at(-1)!.id);
    // Only once: going back and forth doesn't add it again.
    exitRoom();
    enterRoom();
    expect(room()).toHaveLength(before + 1);
  });

  it('is not added again when the room has a desk with it', () => {
    enterRoom();
    const before = room().length;
    exitRoom();
    enterWorkspace('crypto');
    enterRoom();
    expect(room()).toHaveLength(before);
  });
});

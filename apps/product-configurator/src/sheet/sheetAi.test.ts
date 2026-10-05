import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appendDesks, replaceDesk } from './sheetEdit';
import { deskGroups } from './sheetPlan';
import { useSheetStore } from './sheetStore';
import { rowsFromText } from './sheetTable';

const sheet = () => useSheetStore.getState();
const names = () => deskGroups(sheet().rows).map((d) => d.name);
const start = rowsFromText(`Desk,Theme,Screen,Site,URL,Height
Trading,Crypto,Main,A,https://a.com/,
Studio,Designer,Main,B,https://b.com/,100
Studio,,Left,C,https://c.com/,`);

/** The AI answers with this (in its own format), whatever it is asked. */
function aiAnswers(csv: string) {
  const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ csv }))));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
const sent = (fetchMock: ReturnType<typeof aiAnswers>) =>
  JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string) as {
    current?: string;
  };

beforeEach(() => sheet().replaceRows(start));
afterEach(() => vi.unstubAllGlobals());

describe('the AI only changes what it was asked to', () => {
  it('adds desks, leaving the others as they were (the default)', async () => {
    const fetchMock = aiAnswers(
      'Desk,Theme,Screen,Sites,Height\nRace day,Formula 1,Main,https://f.com/,',
    );
    await sheet().planWithAI('A desk for F1', { kind: 'add' });
    expect(names()).toEqual(['Trading', 'Studio', 'Race day']);
    expect(sheet().rows.slice(0, 3)).toEqual(start);
    // Adding sends nothing of the current desks.
    expect(sent(fetchMock).current).toBeUndefined();
  });

  it('changes one desk in place, under its name', async () => {
    const fetchMock = aiAnswers(
      'Desk,Theme,Screen,Sites,Height\nNew name,Designer,Main,https://x.com/ https://y.com/,',
    );
    await sheet().planWithAI('Add a second site', { kind: 'desk', desk: 'Studio' });
    expect(names()).toEqual(['Trading', 'Studio']);
    expect(sheet().rows[0]).toEqual(start[0]);
    expect(
      sheet()
        .rows.slice(1)
        .map((r) => r.url),
    ).toEqual(['https://x.com/', 'https://y.com/']);
    // Only that desk goes to the AI.
    expect(sent(fetchMock).current).toContain('Studio');
    expect(sent(fetchMock).current).not.toContain('Trading');
  });

  it('starting over replaces every desk, and can be undone', async () => {
    aiAnswers('Desk,Theme,Screen,Sites,Height\nOnly,NBA,Main,https://n.com/,');
    await sheet().planWithAI('NBA', { kind: 'replace' });
    expect(names()).toEqual(['Only']);
    sheet().undo();
    expect(sheet().rows).toEqual(start);
  });
});

describe('sheet operations for the AI', () => {
  it('new desks never merge into ones with the same name', () => {
    const added = rowsFromText(
      'Desk,Screen,URL\nTrading,Main,https://z.com/\n,Left,https://w.com/',
    );
    const rows = appendDesks(start, added);
    expect(deskGroups(rows).map((d) => [d.name, d.rows.length])).toEqual([
      ['Trading', 1],
      ['Studio', 2],
      ['Trading 2', 2],
    ]);
  });

  it('a replaced desk keeps its place, and only the first new desk is used', () => {
    const [, studio] = deskGroups(start);
    const replacement = rowsFromText(
      'Desk,Screen,URL\nX,Main,https://x.com/\nY,Main,https://y.com/',
    );
    const rows = replaceDesk(start, studio!, replacement);
    expect(rows.map((r) => [r.desk, r.url])).toEqual([
      ['Trading', 'https://a.com/'],
      ['Studio', 'https://x.com/'],
    ]);
  });
});

describe('a desk created with AI from the desk bar', () => {
  it('is one desk, with its sites, and its name never clashes with another desk', async () => {
    const { getProduct } = await import('@/catalog');
    const { planOneDesk } = await import('./sheetSources');
    const { addPlannedDesk, enterRoom, loadSetup } = await import('@/state/actions');
    const { initialSetup } = await import('@/state/setup');
    const { useSetupStore } = await import('@/state/setupStore');
    const product = getProduct('smart-desk');
    loadSetup(initialSetup(product));
    enterRoom();

    aiAnswers(
      'Desk,Theme,Screen,Sites,Height\nRace day,Formula 1,Main,@f1/live-timing https://f.com/,\nRace day,Formula 1,Left,https://g.com/,\nExtra,NBA,Main,https://n.com/,',
    );
    const desk = await planOneDesk(product, 'Formula 1 weekends');
    expect(desk).toMatchObject({ name: 'Race day', workspaceId: 'f1' });
    expect(desk.windows.opened.length).toBeGreaterThanOrEqual(2);

    const before = useSetupStore.getState().room.length;
    const first = addPlannedDesk(desk);
    const second = addPlannedDesk(desk);
    const room = useSetupStore.getState().room;
    expect(room).toHaveLength(before + 2);
    expect(room.find((d) => d.id === first)?.name).toBe('Race day');
    expect(room.find((d) => d.id === second)?.name).toBe('Race day 2');
    // Sat down at the new desk.
    expect(useSetupStore.getState().activeDeskId).toBe(second);
  });
});

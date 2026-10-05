import { describe, expect, it } from 'vitest';
import { getProduct } from '@/catalog';
import { deskWindows, initialSetup } from '@/state/setup';
import { planFromRows, rowsFromSetup, setupWithPlan } from './sheetPlan';
import { parseGoogleSheet } from './sheetSources';
import { hasHeader, parseDelimited, rowsFromSheet, rowsFromText, rowsToText } from './sheetTable';

const product = getProduct('smart-desk');
const motion = product.motions[0]!;

describe('sheet text', () => {
  it('reads quoted CSV cells', () => {
    expect(parseDelimited('a,"b, c","say ""hi"""\r\nd,e,f', ',')).toEqual([
      ['a', 'b, c', 'say "hi"'],
      ['d', 'e', 'f'],
    ]);
  });

  it('reads cells pasted from a spreadsheet, with columns found by their header', () => {
    const rows = rowsFromText('URL\tScreen\tDesk\tNotes\nhttps://a.com\tLeft\tOps\tignored');
    expect(rows).toEqual([
      { desk: 'Ops', theme: '', screen: 'Left', site: '', url: 'https://a.com', height: '' },
    ]);
  });

  it('reads rows without a header in the sheet’s column order', () => {
    expect(rowsFromText('Ops,NBA,Main,Scores,https://nba.com,')[0]).toMatchObject({
      desk: 'Ops',
      theme: 'NBA',
      site: 'Scores',
    });
  });

  it('writes CSV and tab-separated text that reads back the same', () => {
    const rows = rowsFromText('Desk,Site,URL\n"Desk, one",Title,https://a.com/?x=1,2');
    expect(rowsFromText(rowsToText(rows, ','))).toEqual(rows);
    expect(rowsFromText(rowsToText(rows, '\t'))).toEqual(rows);
  });

  it('files and sheets need the header row', () => {
    expect(hasHeader('Desk,Screen,URL')).toBe(true);
    expect(() => rowsFromSheet('Student,Class\nA,B')).toThrow(/first row/);
  });
});

describe('Google Sheets links', () => {
  it('are read with their tab', () => {
    expect(
      parseGoogleSheet('https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOp/edit#gid=42'),
    ).toEqual({ id: '1AbCdEfGhIjKlMnOp', gid: '42', published: false });
    expect(
      parseGoogleSheet('https://docs.google.com/spreadsheets/d/e/2PACX-abcdefghij/pub?output=csv'),
    ).toMatchObject({ id: '2PACX-abcdefghij', published: true });
    expect(parseGoogleSheet('https://example.com/spreadsheets/d/123')).toBeNull();
  });
});

describe('building desks from rows', () => {
  const rows = rowsFromText(`Desk,Theme,Screen,Site,URL,Height
Morning,Crypto,Main,Chart,https://a.com/,74
Morning,,Left,News,b.com,
Match,Soccer,Main,Scores,https://c.com/,500
,,Right,Table,https://d.com/,
Match,,Ceiling,Bad,https://e.com/,
Design,Designer,Desk,Board,ftp://x,`);
  const plan = planFromRows(product, rows);

  it('groups rows into desks by name, a blank Desk continuing the one above', () => {
    expect(plan.desks.map((d) => [d.name, d.workspaceId])).toEqual([
      ['Morning', 'crypto'],
      ['Match', 'soccer'],
      ['Design', 'designer'],
    ]);
    expect(plan.desks[1]!.windows.opened.map((w) => w.title)).toEqual(['Scores', 'Table']);
  });

  it('puts each site on its screen, in row order, and switches on only the screens used', () => {
    const morning = plan.desks[0]!;
    expect(morning.windows.opened.map((w) => [w.screen, w.url])).toEqual([
      ['main-monitor', 'https://a.com/'],
      ['monitor-left', 'https://b.com/'],
    ]);
    expect(morning.selections['toggle-side-monitors']).toBe('with');
    expect(morning.selections['toggle-monitor-bottom']).toBe('without');
    // The theme's own windows are not on show.
    expect(morning.windows.closed).toHaveLength(
      product.workspaces.find((w) => w.id === 'crypto')!.windows.length,
    );
  });

  it('keeps heights in range and says what was wrong', () => {
    expect(plan.desks[0]!.motions[motion.id]).toBe(74);
    expect(plan.desks[1]!.motions[motion.id]).toBe(motion.max);
    expect(plan.problems.map((p) => [p.row, p.column, p.level])).toEqual([
      [2, 'height', 'warning'],
      [4, 'screen', 'error'],
      [5, 'url', 'error'],
    ]);
    expect(plan.sites).toBe(4);
  });

  it('a desk without sites keeps its theme’s own', () => {
    const only = planFromRows(product, rowsFromText('Desk,Theme\nQuiet,Study'));
    expect(only.desks[0]!.windows.closed).toEqual([]);
    expect(only.desks[0]!.windows.opened).toEqual([]);
  });

  it('desks built from rows read back as the same rows', () => {
    const setup = setupWithPlan(initialSetup(product), plan);
    const again = planFromRows(product, rowsFromSetup(product, setup));
    const summary = (desks: typeof plan.desks) =>
      desks.map((d) => ({
        name: d.name,
        workspaceId: d.workspaceId,
        height: d.motions[motion.id],
        // What is on screen: the sites from the rows, or the theme's own.
        sites: deskWindows(product, d).map((w) => [
          d.windows.placement[w.id] ?? w.screen,
          w.title,
          w.url,
        ]),
        selections: d.selections,
      }));
    expect(summary(again.desks)).toEqual(summary(plan.desks));
  });
});

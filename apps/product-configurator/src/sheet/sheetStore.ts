/**
 * The command center sheet in the page: its rows while it is being edited, the Google Sheet
 * it was loaded from (remembered in this browser), and building the room from it.
 */
import { create } from 'zustand';
import { getProduct } from '@/catalog';
import { loadSetup } from '@/state/actions';
import { currentSetup } from '@/state/setupStore';
import { deskGroups, planFromRows, rowsFromSetup, setupWithPlan } from './sheetPlan';
import { fetchGoogleSheet, parseGoogleSheet, planWithAI } from './sheetSources';
import { appendDesks, keepDeskFields, replaceDesk } from './sheetEdit';
import { emptyRow, type SheetRow } from './sheetTable';

/**
 * What the AI may change: add new desks (the others untouched), change one desk, change
 * every desk, or replace them all.
 */
export type AiScope =
  { kind: 'add' } | { kind: 'desk'; desk: string } | { kind: 'all' } | { kind: 'replace' };

const LINK_KEY = 'virtuos.sheetLink';

function readLink() {
  try {
    return localStorage.getItem(LINK_KEY) ?? '';
  } catch {
    return '';
  }
}

function writeLink(link: string) {
  try {
    localStorage.setItem(LINK_KEY, link);
  } catch {
    // Private browsing: the link just isn't remembered.
  }
}

const product = () => getProduct(currentSetup().productId);

interface SheetState {
  visible: boolean;
  rows: readonly SheetRow[];
  /** The Google Sheet last loaded, for loading it again after editing it there. */
  googleLink: string;
  /** Opens the sheet on the set-up as it is now. */
  show: () => void;
  hide: () => void;
  setRows: (rows: readonly SheetRow[]) => void;
  /** The rows before the last time the whole sheet was replaced, for undoing it. */
  previous: readonly SheetRow[] | null;
  /** Replaces the whole sheet (a file, a paste, the AI), keeping the old rows for undo. */
  replaceRows: (rows: readonly SheetRow[]) => void;
  undo: () => void;
  /** Asks the free AI; the scope says what it may change. Returns what was done, in words. */
  planWithAI: (workflow: string, scope: AiScope) => Promise<string>;
  /** Rows from the set-up as it is now, replacing the sheet's. */
  fromSetup: () => void;
  /** Loads a Google Sheet's rows into the sheet. */
  loadGoogle: (link: string) => Promise<void>;
  /** Builds the room from the rows; returns the number of desks built. */
  build: () => number;
  /** Builds the room straight from a Google Sheet (a `?sheet=` link). */
  buildFromGoogle: (link: string) => Promise<number>;
}

export const useSheetStore = create<SheetState>()((set, get) => ({
  visible: false,
  rows: [],
  googleLink: readLink(),

  show: () =>
    set({ visible: true, previous: null, rows: rowsFromSetup(product(), currentSetup()) }),
  hide: () => set({ visible: false }),
  setRows: (rows) => set({ rows: rows.length > 0 ? rows : [emptyRow()] }),
  previous: null,
  replaceRows: (rows) => set({ previous: get().rows, rows: rows.length > 0 ? rows : [emptyRow()] }),
  undo: () => {
    const { previous } = get();
    if (previous) set({ rows: previous, previous: null });
  },
  planWithAI: async (workflow, scope) => {
    const rows = get().rows;
    const desks = deskGroups(rows);
    const count = (n: number) => `${n} ${n === 1 ? 'desk' : 'desks'}`;
    // Sites the AI suggested that refuse to be shown inside the page are left out; say which.
    let note = '';
    const ask = async (current?: readonly SheetRow[]) => {
      const planned = await planWithAI(product(), workflow, current);
      const n = planned.blocked.length;
      if (n > 0) {
        const sites = n === 1 ? 'a site' : `${n} sites`;
        note = ` Left out ${sites} that can’t be shown inside the page (${planned.blocked.join(', ')}).`;
      }
      return planned.rows;
    };
    switch (scope.kind) {
      case 'add': {
        const added = await ask();
        get().replaceRows(appendDesks(rows, added));
        const kept = desks.length > 0 ? `; your ${count(desks.length)} stay as they were` : '';
        return `Added ${count(deskGroups(added).length)}${kept}.${note}`;
      }
      case 'desk': {
        const desk = desks.find((d) => d.name.toLowerCase() === scope.desk.toLowerCase());
        if (!desk) throw new Error('That desk is no longer in the sheet');
        const current = desk.rows.flatMap((i) => rows[i] ?? []);
        const changed = await ask(current);
        get().replaceRows(replaceDesk(rows, desk, changed));
        return `Changed ${desk.name}; the other desks stay as they were.${note}`;
      }
      case 'all': {
        const changed = await ask(rows);
        get().replaceRows(keepDeskFields(rows, changed));
        return `Changed your desks: now ${count(deskGroups(changed).length)}.${note}`;
      }
      case 'replace': {
        const planned = await ask();
        get().replaceRows(planned);
        return desks.length > 0
          ? `Replaced your ${count(desks.length)} with ${count(deskGroups(planned).length)}.${note}`
          : `Planned ${count(deskGroups(planned).length)}.${note}`;
      }
    }
  },
  fromSetup: () => get().replaceRows(rowsFromSetup(product(), currentSetup())),

  loadGoogle: async (link) => {
    const ref = parseGoogleSheet(link);
    if (!ref) throw new Error('That is not a Google Sheets link');
    const rows = await fetchGoogleSheet(ref);
    writeLink(link.trim());
    get().replaceRows(rows);
    set({ googleLink: link.trim() });
  },

  build: () => {
    const plan = planFromRows(product(), get().rows);
    if (plan.desks.length === 0) return 0;
    loadSetup(setupWithPlan(currentSetup(), plan));
    return plan.desks.length;
  },

  buildFromGoogle: async (link) => {
    await get().loadGoogle(link);
    return get().build();
  },
}));

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
import { emptyRow, type SheetRow } from './sheetTable';

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
  /** Plans the desks with the free AI, from scratch or by changing the current sheet. */
  planWithAI: (workflow: string, changeCurrent: boolean) => Promise<number>;
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
  planWithAI: async (workflow, changeCurrent) => {
    const rows = await planWithAI(product(), workflow, changeCurrent ? get().rows : undefined);
    get().replaceRows(rows);
    return deskGroups(rows).length;
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

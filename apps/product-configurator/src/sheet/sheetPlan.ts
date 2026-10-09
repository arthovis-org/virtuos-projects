/**
 * The command center sheet and the room of desks, both ways: a set-up as rows (one per site
 * on a screen) and rows built into a room (names, themes, heights, screens and windows).
 */
import type { ProductDefinition, Screen, Workspace, WorkspaceWindow } from '@/catalog/schema';
import { type Selections } from '@/state/derive';
import {
  deskName,
  deskWindows,
  MAX_DESKS,
  newDesk,
  SINGLE_DESK,
  type DeskSetup,
  type Setup,
} from '@/state/setup';
import { AGENT_APP_WINDOWS, AGENT_APPS, agentAppOf } from '@/agents/agentApps';
import { parseAddress } from '@/ui/workspace/siteUrl';
import { emptyRow, isBlank, type SheetColumn, type SheetRow } from './sheetTable';

export interface SheetProblem {
  /** Index in the rows given. */
  row: number;
  column: SheetColumn;
  message: string;
  /** Errors leave the row out; warnings only say what was done instead. */
  level: 'error' | 'warning';
}

export interface SheetPlan {
  /** The desks built; none when no row could be used. */
  desks: DeskSetup[];
  problems: SheetProblem[];
  sites: number;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The screen the sheet's "Main" (or a blank cell) means: the first that is always on. */
export function mainScreen(product: ProductDefinition): Screen | undefined {
  return product.screens.find((s) => !s.toggle) ?? product.screens[0];
}

/** A Screen cell that leaves the screen to the arrangement: blank or "Auto". */
export const isAutoScreen = (name: string) => !name.trim() || same(name, 'auto');

function findScreen(product: ProductDefinition, name: string): Screen | undefined {
  return product.screens.find(
    (s) => same(s.label, name) || same(s.id, name) || same(s.node.replace(/^toggle_/i, ''), name),
  );
}

/**
 * Screens for a desk's sites, by how many there are, so the screens in use fit the work:
 * one site on the main screen; two on the main and desk screens; three with the main screen
 * shared by two; four, one each on every screen; more share screens, the main one first.
 * Screens nobody uses are switched off (`withScreens`).
 */
export function arrangeScreens(product: ProductDefinition, count: number): string[] {
  const main = mainScreen(product)?.id;
  const others = product.screens.filter((s) => s.id !== main);
  // The screen lying on the desk (the smart desk's own), else the last; the rest are sides.
  const desk = (others.find((s) => same(s.label, 'desk')) ?? others.at(-1))?.id;
  const sides = others.filter((s) => s.id !== desk).map((s) => s.id);
  const pick = (ids: (string | undefined)[]) => ids.filter((id): id is string => !!id);
  if (count <= 0) return [];
  if (count === 1) return pick([main]);
  if (count === 2) return pick([main, desk ?? sides[0]]);
  if (count === 3) return pick([main, main, desk ?? sides[0]]);
  const all = pick([main, sides[0], sides[1], desk, ...sides.slice(2)]);
  const extras = pick([main, desk, ...sides]);
  const screens = all.slice(0, count);
  for (let i = 0; screens.length < count && extras.length > 0; i++) {
    const next = extras[i % extras.length];
    if (next) screens.push(next);
  }
  return screens;
}

/**
 * The screen each of a desk's sites goes on: as written, or arranged (`arrangeScreens`) for
 * those left to it. When some are written, the others fill the screens left free, in the
 * arrangement's order, then share the main one. Undefined: a screen the product lacks.
 */
export function screensFor(
  product: ProductDefinition,
  cells: readonly string[],
): (string | undefined)[] {
  const written = cells.map((cell) => (isAutoScreen(cell) ? null : findScreen(product, cell)?.id));
  const auto = written.flatMap((id, i) => (id === null ? [i] : []));
  if (auto.length === 0) return written.map((id) => id ?? undefined);
  const result = written.map((id) => id ?? undefined);
  if (auto.length === cells.length) {
    const arranged = arrangeScreens(product, cells.length);
    return cells.map((_, i) => arranged[i]);
  }
  const used = new Set(written.filter((id): id is string => !!id));
  const free = arrangeScreens(product, product.screens.length).filter((id) => !used.has(id));
  const main = mainScreen(product)?.id;
  auto.forEach((index, n) => {
    result[index] = free[n] ?? main;
  });
  return result;
}

function findWorkspace(product: ProductDefinition, name: string): Workspace | undefined {
  return product.workspaces.find((w) => same(w.label, name) || same(w.id, name));
}

/** Whether a screen is switched on with these selections. */
function screenOn(product: ProductDefinition, screen: Screen, selections: Selections) {
  if (!screen.toggle) return true;
  const group = product.optionGroups.find((g) => g.id === screen.toggle);
  if (group?.type !== 'toggle') return true;
  const option = group.options.find((o) => o.id === selections[group.id]);
  return (option ?? group.options.find((o) => o.id === group.defaultOptionId))?.visible ?? true;
}

/** Selections with exactly the screens in `used` switched on (the other toggles as they are). */
function withScreens(product: ProductDefinition, base: Selections, used: ReadonlySet<string>) {
  const selections: Record<string, string> = { ...base };
  const groups = new Set(product.screens.flatMap((s) => (s.toggle ? [s.toggle] : [])));
  for (const groupId of groups) {
    const group = product.optionGroups.find((g) => g.id === groupId);
    if (group?.type !== 'toggle') continue;
    const wanted = product.screens.some((s) => s.toggle === groupId && used.has(s.id));
    const option = group.options.find((o) => o.visible === wanted);
    if (option) selections[groupId] = option.id;
  }
  return selections;
}

/** A set-up as sheet rows: the room's desks in the room, else the single desk. */
export function rowsFromSetup(product: ProductDefinition, setup: Setup): SheetRow[] {
  const motion = product.motions[0];
  const main = mainScreen(product);
  const desks = setup.mode === 'desks' && setup.room.length > 0 ? setup.room : [setup.single];
  const rows: SheetRow[] = [];
  for (const desk of desks) {
    const workspace = product.workspaces.find((w) => w.id === desk.workspaceId);
    const height = (motion && desk.motions[motion.id]) ?? motion?.initial ?? motion?.modelledValue;
    const base = {
      ...emptyRow(),
      desk: deskName(product, desks, desk),
      theme: workspace?.label ?? '',
      height: height === undefined ? '' : String(Math.round(height)),
    };

    const { placement, order } = desk.windows;
    const rank = (w: WorkspaceWindow) => {
      const at = order.indexOf(w.id);
      return at < 0 ? Infinity : at;
    };
    const sorted = deskWindows(product, desk).sort((a, b) => rank(a) - rank(b));
    // Grouped by screen in the product's screen order, as they tile on each screen; a window
    // whose monitor is switched off shows on the main screen, so that's where it is listed.
    const screenOf = (w: WorkspaceWindow) => {
      const wanted = product.screens.find((s) => s.id === (placement[w.id] ?? w.screen));
      return wanted && screenOn(product, wanted, desk.selections) ? wanted : main;
    };
    const sites = product.screens.flatMap((screen) =>
      sorted.filter((w) => screenOf(w)?.id === screen.id).map((w) => ({ screen, w })),
    );
    if (sites.length === 0) rows.push(base);
    sites.forEach(({ screen, w }, i) =>
      rows.push({
        ...base,
        // The desk's name, theme and height on its first row only, as one would write it.
        ...(i > 0 && { theme: '', height: '' }),
        screen: screen.label,
        // The agent's sources window as the app it is, not the page it reads at the moment.
        ...(w.id === AGENT_APP_WINDOWS.sources.id
          ? { site: AGENT_APP_WINDOWS.sources.title, url: AGENT_APPS.sources }
          : { site: w.title, url: w.url }),
      }),
    );
  }
  return rows;
}

export interface DeskGroup {
  /** The desk's name as written first. */
  name: string;
  /** Indexes of its rows, in order. */
  rows: number[];
}

/**
 * The desks the rows describe, in order of first appearance. Names match whatever their case;
 * a blank Desk cell continues the desk above, and blank rows belong to none.
 */
export function deskGroups(rows: readonly SheetRow[]): DeskGroup[] {
  const desks: DeskGroup[] = [];
  let previous = '';
  rows.forEach((row, index) => {
    if (isBlank(row)) return;
    const name = row.desk.trim() || previous || 'Desk 1';
    previous = name;
    const desk = desks.find((d) => same(d.name, name));
    if (desk) desk.rows.push(index);
    else desks.push({ name, rows: [index] });
  });
  return desks;
}

/** The workspace a desk of the sheet gets: its Theme, else one its name mentions, else the first. */
export function themeOf(
  product: ProductDefinition,
  rows: readonly SheetRow[],
  desk: DeskGroup,
): Workspace | undefined {
  for (const index of desk.rows) {
    const found = findWorkspace(product, rows[index]?.theme ?? '');
    if (found) return found;
  }
  return (
    product.workspaces.find((w) => desk.name.toLowerCase().includes(w.label.toLowerCase())) ??
    product.workspaces[0]
  );
}

/**
 * Rows built into a room of desks, with what was wrong in them.
 * Rows of a desk need not be next to each other; a blank Desk cell continues the desk above.
 */
export function planFromRows(product: ProductDefinition, rows: readonly SheetRow[]): SheetPlan {
  const problems: SheetProblem[] = [];
  const problem = (row: number, column: SheetColumn, message: string) =>
    problems.push({ row, column, message, level: 'error' });
  const warn = (row: number, column: SheetColumn, message: string) =>
    problems.push({ row, column, message, level: 'warning' });

  const desks = deskGroups(rows);
  if (desks.length > MAX_DESKS) {
    for (const extra of desks.slice(MAX_DESKS)) {
      problem(extra.rows[0] ?? 0, 'desk', `A room holds up to ${MAX_DESKS} desks; left out`);
    }
    desks.length = MAX_DESKS;
  }

  const motion = product.motions[0];
  let siteCount = 0;
  let windowCount = 0;

  const built = desks.flatMap((desk): DeskSetup[] => {
    const first = (key: SheetColumn) => {
      const at = desk.rows.find((i) => rows[i]?.[key].trim());
      return at === undefined ? undefined : { row: at, value: (rows[at]?.[key] ?? '').trim() };
    };

    // Themes the product lacks are pointed out; the desk gets one anyway (see `themeOf`).
    for (const index of desk.rows) {
      const value = rows[index]?.theme.trim() ?? '';
      if (value && !findWorkspace(product, value)) {
        warn(
          index,
          'theme',
          `No theme “${value}”. Themes: ${product.workspaces.map((w) => w.label).join(', ')}`,
        );
      }
    }
    const workspace = themeOf(product, rows, desk);
    if (!workspace) return [];

    let height: number | undefined;
    const heightCell = first('height');
    if (heightCell && motion) {
      const value = Number(heightCell.value.replace(',', '.').replace(/[^\d.]/g, ''));
      if (!Number.isFinite(value) || value <= 0) {
        problem(heightCell.row, 'height', `Height should be a number of ${motion.unit}`);
      } else {
        height = Math.min(motion.max, Math.max(motion.min, value));
        if (height !== value) {
          warn(
            heightCell.row,
            'height',
            `Heights go from ${motion.min} to ${motion.max} ${motion.unit}; using ${height}`,
          );
        }
      }
    }

    // Rows with a site, and the screen each goes on (as written, or arranged by their number).
    const hasSite = (row: SheetRow | undefined) => !!row && (!!row.url.trim() || !!row.site.trim());
    const siteRows = desk.rows.filter((i) => hasSite(rows[i]));
    const screenIds = screensFor(
      product,
      siteRows.map((i) => rows[i]?.screen ?? ''),
    );
    const screenOf = new Map(siteRows.map((i, n) => [i, screenIds[n]]));
    const sites: WorkspaceWindow[] = [];
    for (const index of desk.rows) {
      const row = rows[index];
      if (!row || (!row.url.trim() && !row.site.trim())) continue;
      if (!row.url.trim()) {
        problem(index, 'url', 'Needs a web address');
        continue;
      }
      // An agent app (agent:doc and the like): the agent at this desk's, drawn by the configurator.
      const app = agentAppOf(row.url);
      const address = app
        ? { url: AGENT_APPS[app], title: AGENT_APP_WINDOWS[app].title }
        : parseAddress(row.url.replace(/^http:\/\//i, 'https://'));
      if ('error' in address) {
        problem(index, 'url', address.error);
        continue;
      }
      const screen = product.screens.find((sc) => sc.id === screenOf.get(index));
      if (!screen) {
        problem(
          index,
          'screen',
          `No screen “${row.screen.trim()}”. Screens: ${product.screens.map((s) => s.label).join(', ')}`,
        );
        continue;
      }
      // Agent apps keep their own window ids (the agent finds its sources window by it).
      const appId = app && AGENT_APP_WINDOWS[app].id;
      sites.push({
        id: appId && !sites.some((w) => w.id === appId) ? appId : `sheet-${++windowCount}`,
        title: row.site.trim() || address.title,
        url: address.url,
        screen: screen.id,
      });
    }
    siteCount += sites.length;

    // A desk named after its theme needs no name of its own ("Finance", or "Finance 2").
    const label = workspace.label.toLowerCase();
    const lower = desk.name.trim().toLowerCase();
    const themed =
      lower === label ||
      (lower.startsWith(`${label} `) && /^\d+$/.test(lower.slice(label.length + 1)));

    const built = newDesk(product, workspace.id);
    return [
      {
        ...built,
        ...(!themed && { name: desk.name }),
        ...(motion &&
          height !== undefined && { motions: { ...built.motions, [motion.id]: height } }),
        // Screens without a site are switched off; a desk with no sites keeps its theme's own.
        ...(sites.length > 0 && {
          selections: withScreens(product, built.selections, new Set(sites.map((s) => s.screen))),
          windows: {
            placement: Object.fromEntries(sites.map((s) => [s.id, s.screen])),
            order: sites.map((s) => s.id),
            closed: workspace.windows.map((w) => w.id),
            opened: sites,
            sizes: {},
          },
        }),
      },
    ];
  });

  return { desks: built, problems, sites: siteCount };
}

/**
 * The set-up with the plan. At the single desk, a plan of one desk becomes the single desk (it
 * stays one desk); more desks, or a plan made in the room, become the room, at its overview.
 */
export function setupWithPlan(setup: Setup, plan: SheetPlan): Setup {
  const [only] = plan.desks;
  if (setup.mode === 'single' && only && plan.desks.length === 1) {
    return { ...setup, single: { ...only, id: SINGLE_DESK } };
  }
  return { ...setup, mode: 'desks', room: plan.desks, activeDeskId: null };
}

/**
 * A set-up as a link, and back:
 *
 * - the single desk: `?product=<id>&c=<group>:<option>,<group>:<option>`
 * - the room: `?product=<id>&desks=finance,crypto~side-monitors:off+desk-top:walnut&desk=2`,
 *   each desk's workspace and the selections that differ from the defaults; `desk` is the
 *   desk the visitor is at, counted from 1 (none: the overview).
 *
 * Links carry the configuration only; heights, names and windows travel in saved layouts.
 */
import { getProduct } from '@/catalog';
import type { ProductDefinition } from '@/catalog/schema';
import { defaultSelections, sanitizeSelections, type Selections } from './derive';
import { initialSetup, MAX_DESKS, newDesk, type DeskSetup, type Setup } from './setup';

const PRODUCT_PARAM = 'product';
const CONFIG_PARAM = 'c';
const DESKS_PARAM = 'desks';
const AT_PARAM = 'desk';

// Built by hand rather than with URLSearchParams, which escapes `:` and `,` and turns a
// shared link into `%3A`/`%2C` soup. Ids are lowercase letters, digits and dashes, so
// encodeURIComponent leaves them readable; only the separators are literal.
const pair = (groupId: string, optionId: string) =>
  `${encodeURIComponent(groupId)}:${encodeURIComponent(optionId)}`;

function parsePairs(text: string, separator: string): Record<string, string> {
  const selections: Record<string, string> = {};
  for (const entry of text.split(separator)) {
    const [groupId, optionId] = entry.split(':');
    if (groupId && optionId) selections[groupId] = optionId;
  }
  return selections;
}

/** The query string that reproduces the set-up as far as a link can. */
export function encodeSetupSearch(product: ProductDefinition, setup: Setup): string {
  const base = `?${PRODUCT_PARAM}=${encodeURIComponent(product.id)}`;
  if (setup.mode === 'single' || setup.room.length === 0) {
    const pairs = Object.entries(setup.single.selections).map(([g, o]) => pair(g, o));
    return pairs.length > 0 ? `${base}&${CONFIG_PARAM}=${pairs.join(',')}` : base;
  }
  const defaults = defaultSelections(product);
  const desks = setup.room.map((desk) => {
    const changed = Object.entries(desk.selections).filter(([g, o]) => defaults[g] !== o);
    const config = changed.map(([g, o]) => pair(g, o)).join('+');
    return config ? `${desk.workspaceId}~${config}` : desk.workspaceId;
  });
  const at = setup.room.findIndex((d) => d.id === setup.activeDeskId) + 1;
  return `${base}&${DESKS_PARAM}=${desks.join(',')}${at >= 1 ? `&${AT_PARAM}=${at}` : ''}`;
}

/** The set-up a link describes; unknown products, workspaces and options fall back to defaults. */
export function setupFromSearch(search: string): Setup {
  const params = new URLSearchParams(search);
  const product = getProduct(params.get(PRODUCT_PARAM));
  const selections: Selections = parsePairs(params.get(CONFIG_PARAM) ?? '', ',');
  const setup = initialSetup(product, selections);
  const list = params.get(DESKS_PARAM);
  if (list === null) return setup;

  const room: DeskSetup[] = [];
  for (const entry of list.split(',').slice(0, MAX_DESKS)) {
    const [workspaceId = '', config = ''] = entry.split('~');
    if (!product.workspaces.some((w) => w.id === workspaceId)) continue;
    const desk = newDesk(product, workspaceId);
    room.push({ ...desk, selections: sanitizeSelections(product, parsePairs(config, '+')) });
  }
  if (room.length === 0) return setup;
  const at = Number(params.get(AT_PARAM) ?? 0);
  const active = Number.isInteger(at) && at >= 1 ? room[at - 1] : undefined;
  return { ...setup, mode: 'desks', room, activeDeskId: active?.id ?? null };
}

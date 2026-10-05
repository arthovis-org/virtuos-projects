/**
 * Changes to the sheet made desk by desk (as the sheet's editor shows it): the rows stay one
 * per site, so the sheet still reads and writes as a plain table. A desk's name is on all its
 * rows; its theme and height on its first row only.
 */
import { deskGroups, type DeskGroup } from './sheetPlan';
import { emptyRow, isBlank, type SheetRow } from './sheetTable';

type Rows = readonly SheetRow[];

/** Gives every row of a desk the new name (rows that continued it with a blank cell too). */
export function renameDesk(rows: Rows, desk: DeskGroup, name: string): SheetRow[] {
  return rows.map((row, i) => (desk.rows.includes(i) ? { ...row, desk: name } : row));
}

/** Sets a desk's theme or height: on its first row, cleared from the others. */
export function setDeskField(
  rows: Rows,
  desk: DeskGroup,
  key: 'theme' | 'height',
  value: string,
): SheetRow[] {
  const [first] = desk.rows;
  return rows.map((row, i) =>
    i === first ? { ...row, [key]: value } : desk.rows.includes(i) ? { ...row, [key]: '' } : row,
  );
}

/** Adds an empty site on a screen to a desk, after its last row; returns the rows and its index. */
export function addSite(
  rows: Rows,
  desk: DeskGroup,
  screen: string,
): { rows: SheetRow[]; index: number } {
  const last = desk.rows.at(-1) ?? rows.length - 1;
  // A desk whose only row has no site yet uses that row.
  const only = desk.rows.length === 1 ? rows[last] : undefined;
  if (only && !only.url.trim() && !only.site.trim() && !only.screen.trim()) {
    return { rows: rows.map((r, i) => (i === last ? { ...r, screen } : r)), index: last };
  }
  const next = [...rows];
  next.splice(last + 1, 0, { ...emptyRow(), desk: desk.name, screen });
  return { rows: next, index: last + 1 };
}

/**
 * Removes a site. The desk's theme and height move to its next row; a desk's last row stays
 * (emptied), so removing its last site doesn't remove the desk.
 */
export function removeSite(rows: Rows, desk: DeskGroup, index: number): SheetRow[] {
  const row = rows[index];
  if (!row) return [...rows];
  if (desk.rows.length === 1) {
    return rows.map((r, i) => (i === index ? { ...r, screen: '', site: '', url: '' } : r));
  }
  const next = rows.map((r) => ({ ...r }));
  const heir = desk.rows.find((i) => i !== index);
  const target = heir === undefined ? undefined : next[heir];
  if (target && index === desk.rows[0]) {
    target.desk = target.desk || row.desk;
    target.theme = row.theme;
    target.height = row.height;
  }
  next.splice(index, 1);
  return next;
}

export function removeDesk(rows: Rows, desk: DeskGroup): SheetRow[] {
  return rows.filter((_, i) => !desk.rows.includes(i));
}

/** Adds a desk with a free name ("Desk 3"); returns the rows and its name. */
export function addDesk(rows: Rows, names: readonly string[]): { rows: SheetRow[]; name: string } {
  const taken = new Set(names.map((n) => n.toLowerCase()));
  let n = names.length + 1;
  while (taken.has(`desk ${n}`)) n++;
  const name = `Desk ${n}`;
  return {
    rows: [...rows.filter((r) => !isBlank(r)), { ...emptyRow(), desk: name }],
    name,
  };
}

/**
 * Adds desks (the AI's new ones) after the current desks. A new desk whose name is taken gets a
 * number ("Trading 2"), so it never merges into a desk that is already there.
 */
export function appendDesks(rows: Rows, added: Rows): SheetRow[] {
  const taken = new Set(deskGroups(rows).map((d) => d.name.toLowerCase()));
  const renames = new Map<string, string>();
  for (const desk of deskGroups(added)) {
    let name = desk.name;
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${desk.name} ${n}`;
    taken.add(name.toLowerCase());
    renames.set(desk.name.toLowerCase(), name);
  }
  let previous = '';
  const renamed = added
    .filter((r) => !isBlank(r))
    .map((row) => {
      const own = row.desk.trim() || previous;
      previous = own;
      return { ...row, desk: renames.get(own.toLowerCase()) ?? own };
    });
  return [...rows.filter((r) => !isBlank(r)), ...renamed];
}

/**
 * Puts new rows in place of one desk (where it was, under its name): the AI's change to that
 * desk. Only the first desk in `replacement` is used; the other desks are left as they are.
 */
export function replaceDesk(rows: Rows, desk: DeskGroup, replacement: Rows): SheetRow[] {
  const first = deskGroups(replacement)[0];
  if (!first) return [...rows];
  const incoming = first.rows.flatMap((i) => {
    const row = replacement[i];
    return row ? [{ ...row, desk: desk.name }] : [];
  });
  // What the answer leaves out stays as it was: the desk's theme and height.
  const before = rows[desk.rows[0] ?? -1];
  const head = incoming[0];
  if (head && before) {
    head.theme ||= before.theme;
    head.height ||= before.height;
  }
  const at = desk.rows[0] ?? rows.length;
  const kept = rows.filter((_, i) => !desk.rows.includes(i));
  const position = rows.slice(0, at).filter((_, i) => !desk.rows.includes(i)).length;
  return [...kept.slice(0, position), ...incoming, ...kept.slice(position)];
}

/**
 * Desks after the AI changed them all: a desk it kept (same name) keeps its theme and height
 * where the answer left them out.
 */
export function keepDeskFields(rows: Rows, changed: Rows): SheetRow[] {
  const before = new Map(
    deskGroups(rows).map((d) => [d.name.toLowerCase(), rows[d.rows[0] ?? -1]]),
  );
  const next = changed.map((row) => ({ ...row }));
  for (const desk of deskGroups(next)) {
    const head = next[desk.rows[0] ?? -1];
    const old = before.get(desk.name.toLowerCase());
    if (!head || !old) continue;
    head.theme ||= old.theme;
    head.height ||= old.height;
  }
  return next;
}

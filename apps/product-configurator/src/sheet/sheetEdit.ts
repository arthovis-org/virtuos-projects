/**
 * Changes to the sheet made desk by desk (as the sheet's editor shows it): the rows stay one
 * per site, so the sheet still reads and writes as a plain table. A desk's name is on all its
 * rows; its theme and height on its first row only.
 */
import type { DeskGroup } from './sheetPlan';
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

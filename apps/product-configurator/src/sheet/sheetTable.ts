/**
 * The command center sheet as a table: one row per site, saying which desk and which screen
 * it goes on. Rows come from and go to CSV files, cells pasted from Google Sheets or Excel
 * (tab-separated), and Google Sheets links, so a plan can be written anywhere a table can.
 */

export interface SheetRow {
  /** Desk the site is on; rows of the same desk group together. Blank: the row above's. */
  desk: string;
  /** Workspace theme of the desk (Finance, Crypto…): its colour, icon and starter sites. */
  theme: string;
  /** Screen label (Main, Left…). Blank: the main screen. */
  screen: string;
  /** Title of the window. Blank: the site's host name. */
  site: string;
  url: string;
  /** Desk height, in the product's unit. Blank: as it is. */
  height: string;
}

export type SheetColumn = keyof SheetRow;

/** The byte order mark some programs (Excel) put at the start of a UTF-8 file. */
const BOM = String.fromCharCode(0xfeff);

export const COLUMNS: readonly { key: SheetColumn; label: string }[] = [
  { key: 'desk', label: 'Desk' },
  { key: 'theme', label: 'Theme' },
  { key: 'screen', label: 'Screen' },
  { key: 'site', label: 'Site' },
  { key: 'url', label: 'URL' },
  { key: 'height', label: 'Height' },
];

/** Header names each column is recognised by (lowercase, without punctuation). */
const ALIASES: Record<SheetColumn, readonly string[]> = {
  desk: ['desk', 'desk name', 'command center', 'station'],
  theme: ['theme', 'workspace', 'type', 'category'],
  screen: ['screen', 'monitor', 'display'],
  site: ['site', 'title', 'name', 'window', 'tab', 'browser', 'site name'],
  url: ['url', 'link', 'address', 'web address', 'website', 'site url'],
  height: ['height', 'height cm', 'desk height'],
};

export const emptyRow = (): SheetRow => ({
  desk: '',
  theme: '',
  screen: '',
  site: '',
  url: '',
  height: '',
});

export const isBlank = (row: SheetRow) => COLUMNS.every(({ key }) => !row[key].trim());

/** Splits delimited text into cells, with "quoted" cells as in CSV. */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const source = text.startsWith(BOM) ? text.slice(1) : text;
  for (let i = 0; i < source.length; i++) {
    const char = source.charAt(i);
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"' && cell === '') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** The delimiter of pasted or loaded text: tabs from a spreadsheet, else commas or semicolons. */
function delimiterOf(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  if (firstLine.includes('\t')) return '\t';
  const count = (char: string) => firstLine.split(char).length - 1;
  return count(';') > count(',') ? ';' : ',';
}

/** The column each header cell names, or null. */
function headerColumns(cells: readonly string[]): (SheetColumn | null)[] {
  return cells.map((cell) => {
    const name = cell
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    return COLUMNS.find(({ key }) => ALIASES[key].includes(name))?.key ?? null;
  });
}

/** The text starts with a header row naming the sheet's columns. */
export function hasHeader(text: string): boolean {
  const first = parseDelimited(text.split(/\r?\n/, 1)[0] ?? '', delimiterOf(text))[0] ?? [];
  return headerColumns(first).filter(Boolean).length >= 2;
}

/**
 * Rows from a table's text. A header row (two or more known column names, in any order)
 * says which column is which and extra columns are ignored; without one the columns are
 * read in the sheet's own order: Desk, Theme, Screen, Site, URL, Height.
 */
export function rowsFromText(text: string): SheetRow[] {
  const table = parseDelimited(text, delimiterOf(text));
  if (table.length === 0) return [];
  const mapped = headerColumns(table[0] ?? []);
  const hasHeader = mapped.filter(Boolean).length >= 2;
  const columns = hasHeader ? mapped : COLUMNS.map(({ key }) => key);
  return table
    .slice(hasHeader ? 1 : 0)
    .map((cells) => {
      const row = emptyRow();
      columns.forEach((key, i) => {
        if (key && cells[i] !== undefined) row[key] = cells[i].trim();
      });
      return row;
    })
    .filter((row) => !isBlank(row));
}

/** The rows as text with a header: CSV for files, tab-separated for pasting into a sheet. */
export function rowsToText(rows: readonly SheetRow[], delimiter: ',' | '\t'): string {
  const escape = (value: string) =>
    delimiter === '\t'
      ? value.replace(/[\t\r\n]+/g, ' ')
      : /[",\r\n]/.test(value)
        ? `"${value.replace(/"/g, '""')}"`
        : value;
  const lines = [
    COLUMNS.map(({ label }) => label),
    ...rows.map((row) => COLUMNS.map(({ key }) => row[key])),
  ];
  return lines.map((cells) => cells.map(escape).join(delimiter)).join('\r\n');
}

/** Rows from a whole file or sheet, which must start with the header row. */
export function rowsFromSheet(text: string): SheetRow[] {
  if (!hasHeader(text)) {
    throw new Error(
      `The first row should name the columns: ${COLUMNS.map((c) => c.label).join(', ')}`,
    );
  }
  return rowsFromText(text);
}

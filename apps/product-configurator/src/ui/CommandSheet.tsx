import {
  Bot,
  Check,
  Copy,
  Download,
  FileUp,
  Plus,
  RotateCcw,
  Sheet as SheetIcon,
  Table2,
  Trash2,
  X,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type SyntheticEvent,
} from 'react';
import { planFromRows } from '@/sheet/sheetPlan';
import { aiPrompt, canReadGoogleSheets } from '@/sheet/sheetSources';
import { useSheetStore } from '@/sheet/sheetStore';
import {
  COLUMNS,
  emptyRow,
  hasHeader,
  parseDelimited,
  rowsFromSheet,
  rowsFromText,
  rowsToText,
  type SheetColumn,
  type SheetRow,
} from '@/sheet/sheetTable';
import { useProduct } from '@/state/configuratorStore';
import { useDesksStore } from '@/state/desksStore';
import styles from './CommandSheet.module.css';

/** Copies text; false where the browser doesn't allow it. */
async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function download(name: string, text: string) {
  // The byte order mark makes Excel read the file as UTF-8.
  const url = URL.createObjectURL(
    new Blob([String.fromCharCode(0xfeff), text], { type: 'text/csv;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type Panel = 'google' | 'ai' | null;

/**
 * The command center sheet: every desk's sites as a table, one row per site (desk, theme,
 * screen, title, address, height). Edit it here, paste cells from Google Sheets or Excel or
 * an AI assistant's answer, load a CSV file or a Google Sheet, and build the room from it.
 */
export function CommandSheet() {
  const product = useProduct();
  const hasWorkspaces = product.workspaces.length > 1;
  const visible = useSheetStore((s) => s.visible);
  const show = useSheetStore((s) => s.show);

  if (!hasWorkspaces || product.screens.length === 0) return null;
  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        onClick={show}
        aria-label="Command center sheet"
        title="Plan every desk's screens in a spreadsheet"
      >
        <Table2 size={15} strokeWidth={1.75} aria-hidden="true" />
        <span className={styles.triggerLabel}>Sheet</span>
      </button>
      {visible && <SheetDialog />}
    </>
  );
}

function SheetDialog() {
  const product = useProduct();
  const rows = useSheetStore((s) => s.rows);
  const setRows = useSheetStore((s) => s.setRows);
  const hide = useSheetStore((s) => s.hide);
  const fromSetup = useSheetStore((s) => s.fromSetup);
  const build = useSheetStore((s) => s.build);
  const loadGoogle = useSheetStore((s) => s.loadGoogle);
  const savedLink = useSheetStore((s) => s.googleLink);
  const roomOpen = useDesksStore((s) => s.mode === 'desks');
  const [panel, setPanel] = useState<Panel>(null);
  const [link, setLink] = useState(savedLink);
  const [workflow, setWorkflow] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const plan = useMemo(() => planFromRows(product, rows), [product, rows]);
  const problemAt = (row: number, column: SheetColumn) =>
    plan.problems.find((p) => p.row === row && p.column === column);
  const errors = plan.problems.filter((p) => p.level === 'error').length;
  const deskNames = useMemo(
    () => [...new Set(rows.map((r) => r.desk.trim()).filter(Boolean))],
    [rows],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hide]);

  const say = (text: string, error = false) => setMessage({ text, error });

  const update = (index: number, key: SheetColumn, value: string) =>
    setRows(rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)));

  /** Pasting a table into a cell: with a header it replaces the sheet, else it fills from the cell. */
  const onPaste = (event: ClipboardEvent<HTMLElement>, index: number, key: SheetColumn) => {
    const text = event.clipboardData.getData('text/plain');
    if (!/[\t\n]/.test(text.trim())) return;
    event.preventDefault();
    if (hasHeader(text)) {
      const pasted = rowsFromText(text);
      setRows(pasted);
      say(`Pasted ${pasted.length} rows.`);
      return;
    }
    const cells = parseDelimited(text.replace(/\r?\n$/, ''), text.includes('\t') ? '\t' : ',');
    const start = COLUMNS.findIndex((c) => c.key === key);
    const next = [...rows];
    cells.forEach((line, r) => {
      const row: SheetRow = { ...(next[index + r] ?? emptyRow()) };
      line.forEach((value, c) => {
        const column = COLUMNS[start + c];
        if (column) row[column.key] = value.trim();
      });
      next[index + r] = row;
    });
    setRows(next);
    say(`Pasted ${cells.length} ${cells.length === 1 ? 'row' : 'rows'}.`);
  };

  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    setMessage(null);
    try {
      say(await action());
    } catch (error) {
      say(error instanceof Error ? error.message : 'Something went wrong', true);
    } finally {
      setBusy(false);
    }
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    void run(async () => {
      const loaded = rowsFromSheet(await file.text());
      if (loaded.length === 0) throw new Error('That file has no rows');
      setRows(loaded);
      return `Loaded ${loaded.length} rows from ${file.name}.`;
    });
  };

  const onBuild = () => {
    const built = build();
    if (built === 0) {
      say('Nothing to build yet: add a row with a desk and a web address.', true);
      return;
    }
    hide();
  };

  const onLoadGoogle = (event: SyntheticEvent) => {
    event.preventDefault();
    void run(async () => {
      await loadGoogle(link);
      return 'Loaded the Google Sheet. Check it, then build the desks.';
    });
  };

  return (
    <div className={styles.backdrop} onClick={hide}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.head}>
          <div>
            <h2 id="sheet-title" className={styles.title}>
              Command center sheet
            </h2>
            <p className={styles.note}>
              One row per site: which desk and which screen it goes on. Edit it here, paste cells
              from Google Sheets or Excel, or let an AI plan it, then build the desks.
            </p>
          </div>
          <button type="button" className={styles.iconButton} aria-label="Close" onClick={hide}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className={styles.toolbar}>
          <button
            type="button"
            className={styles.tool}
            data-on={panel === 'ai' || undefined}
            onClick={() => setPanel(panel === 'ai' ? null : 'ai')}
          >
            <Bot size={15} aria-hidden="true" /> Plan with AI
          </button>
          {canReadGoogleSheets && (
            <button
              type="button"
              className={styles.tool}
              data-on={panel === 'google' || undefined}
              onClick={() => setPanel(panel === 'google' ? null : 'google')}
            >
              <SheetIcon size={15} aria-hidden="true" /> Google Sheet
            </button>
          )}
          <button type="button" className={styles.tool} onClick={() => fileInput.current?.click()}>
            <FileUp size={15} aria-hidden="true" /> Open CSV
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/plain"
            hidden
            onChange={(event) => {
              onFile(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          <button
            type="button"
            className={styles.tool}
            onClick={() => download('command-centers.csv', rowsToText(rows, ','))}
          >
            <Download size={15} aria-hidden="true" /> Download CSV
          </button>
          <button
            type="button"
            className={styles.tool}
            onClick={() =>
              void run(async () =>
                (await copy(rowsToText(rows, '\t')))
                  ? 'Copied. Paste it into Google Sheets or Excel.'
                  : 'Copying isn’t allowed here; download the CSV instead.',
              )
            }
          >
            <Copy size={15} aria-hidden="true" /> Copy table
          </button>
          <button
            type="button"
            className={styles.tool}
            onClick={() => {
              fromSetup();
              say('The sheet shows your desks as they are now.');
            }}
          >
            <RotateCcw size={15} aria-hidden="true" /> My desks
          </button>
        </div>

        {panel === 'ai' && (
          <div className={styles.panel}>
            <p className={styles.step}>
              <b>1.</b> Say what you do; the prompt explains the sheet, the themes and the screens.
            </p>
            <textarea
              className={styles.textarea}
              rows={3}
              value={workflow}
              onChange={(event) => setWorkflow(event.target.value)}
              placeholder="e.g. I day-trade crypto in the morning, run a design studio in the afternoon and follow the NBA at night."
            />
            <div className={styles.row}>
              <button
                type="button"
                className={styles.secondary}
                onClick={() =>
                  void run(async () =>
                    (await copy(aiPrompt(product, workflow)))
                      ? 'Prompt copied. Paste it into ChatGPT, Claude or Gemini.'
                      : 'Copying isn’t allowed here.',
                  )
                }
              >
                <Copy size={14} aria-hidden="true" /> Copy the prompt
              </button>
            </div>
            <p className={styles.step}>
              <b>2.</b> Paste the AI’s answer (the CSV) here, or into any cell of the sheet.
            </p>
            <textarea
              className={styles.textarea}
              rows={2}
              value=""
              placeholder="Paste the answer…"
              onChange={() => undefined}
              onPaste={(event) => {
                event.preventDefault();
                // Assistants often wrap the CSV in a code block, with some words around it.
                const text = event.clipboardData.getData('text/plain');
                const csv = /```[\w-]*\n([\s\S]*?)```/.exec(text)?.[1] ?? text;
                const start = csv.search(/^.*\bdesk\b.*$/im);
                const table = start > 0 ? csv.slice(start) : csv;
                const pasted = hasHeader(table) ? rowsFromText(table) : [];
                if (pasted.length === 0) {
                  say('No sheet in that answer: it needs the header row Desk,Theme,Screen,…', true);
                } else {
                  setRows(pasted);
                  say(`Read ${pasted.length} rows from the answer.`);
                  setPanel(null);
                }
              }}
            />
          </div>
        )}

        {panel === 'google' && (
          <form className={styles.panel} onSubmit={onLoadGoogle}>
            <p className={styles.step}>
              Plan in a Google Sheet with these columns:{' '}
              <b>{COLUMNS.map((c) => c.label).join(', ')}</b> (or <i>Copy table</i> and paste it
              there to start). Set <b>Share → General access</b> to “Anyone with the link”, then
              paste the link:
            </p>
            <div className={styles.row}>
              <input
                className={styles.input}
                value={link}
                onChange={(event) => setLink(event.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/…"
                aria-label="Google Sheets link"
              />
              <button type="submit" className={styles.primary} disabled={busy || !link.trim()}>
                Load
              </button>
            </div>
            <p className={styles.note}>
              Edited the sheet? Load it again. A link to this page with <code>?sheet=</code> and the
              sheet’s link builds the desks for whoever opens it.
            </p>
          </form>
        )}

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.num} aria-label="Row" />
                {COLUMNS.map((c) => (
                  <th key={c.key} data-col={c.key}>
                    {c.label}
                    {c.key === 'height' && product.motions[0] && (
                      <span className={styles.unit}> ({product.motions[0].unit})</span>
                    )}
                  </th>
                ))}
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>
                  <td className={styles.num}>{index + 1}</td>
                  {COLUMNS.map(({ key, label }) => {
                    const problem = problemAt(index, key);
                    const common = {
                      className: styles.cell,
                      value: row[key],
                      'aria-label': `${label}, row ${index + 1}`,
                      'aria-invalid': problem?.level === 'error' || undefined,
                      'data-problem': problem?.level,
                      title: problem?.message,
                      onPaste: (event: ClipboardEvent<HTMLElement>) => onPaste(event, index, key),
                    };
                    return (
                      <td key={key} data-col={key}>
                        {key === 'theme' ? (
                          <select
                            {...common}
                            onChange={(event) => update(index, key, event.target.value)}
                          >
                            <option value="">{row.desk.trim() ? '–' : ''}</option>
                            {row.theme &&
                              !product.workspaces.some((w) => w.label === row.theme) && (
                                <option value={row.theme}>{row.theme}</option>
                              )}
                            {product.workspaces.map((w) => (
                              <option key={w.id} value={w.label}>
                                {w.label}
                              </option>
                            ))}
                          </select>
                        ) : key === 'screen' ? (
                          <select
                            {...common}
                            onChange={(event) => update(index, key, event.target.value)}
                          >
                            <option value="" />
                            {row.screen && !product.screens.some((s) => s.label === row.screen) && (
                              <option value={row.screen}>{row.screen}</option>
                            )}
                            {product.screens.map((s) => (
                              <option key={s.id} value={s.label}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            {...common}
                            list={key === 'desk' ? 'sheet-desks' : undefined}
                            inputMode={key === 'height' ? 'decimal' : undefined}
                            placeholder={
                              key === 'url' ? 'https://…' : key === 'desk' && index > 0 ? '″' : ''
                            }
                            onChange={(event) => update(index, key, event.target.value)}
                          />
                        )}
                      </td>
                    );
                  })}
                  <td>
                    <button
                      type="button"
                      className={styles.iconButton}
                      aria-label={`Delete row ${index + 1}`}
                      onClick={() => setRows(rows.filter((_, i) => i !== index))}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <datalist id="sheet-desks">
            {deskNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>
        <div className={styles.row}>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => {
              const last = rows[rows.length - 1];
              setRows([...rows, { ...emptyRow(), desk: last?.desk ?? '' }]);
            }}
          >
            <Plus size={14} aria-hidden="true" /> Add row
          </button>
          <span className={styles.hint}>A blank Desk continues the desk above.</span>
        </div>

        {plan.problems.length > 0 && (
          <ul className={styles.problems}>
            {plan.problems.slice(0, 6).map((p, i) => (
              <li key={i} data-level={p.level}>
                Row {p.row + 1}: {p.message}
                {p.level === 'error' && ' (left out)'}
              </li>
            ))}
            {plan.problems.length > 6 && <li>…and {plan.problems.length - 6} more</li>}
          </ul>
        )}
        {message && (
          <p className={message.error ? styles.error : styles.success} role="status">
            {message.text}
          </p>
        )}

        <div className={styles.footer}>
          <span className={styles.summary}>
            {plan.desks.length} {plan.desks.length === 1 ? 'desk' : 'desks'} · {plan.sites}{' '}
            {plan.sites === 1 ? 'site' : 'sites'}
            {errors > 0 && ` · ${errors} ${errors === 1 ? 'row' : 'rows'} left out`}
          </span>
          <button
            type="button"
            className={styles.primary}
            disabled={plan.desks.length === 0}
            onClick={onBuild}
          >
            <Check size={15} aria-hidden="true" />{' '}
            {roomOpen ? 'Rebuild the desks' : 'Build the desks'}
          </button>
        </div>
      </div>
    </div>
  );
}

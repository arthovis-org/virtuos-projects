import {
  Ban,
  ChevronDown,
  Copy,
  Download,
  FileUp,
  Loader2,
  Plus,
  RotateCcw,
  Sheet as SheetIcon,
  Sparkles,
  Table2,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type CSSProperties,
  type SyntheticEvent,
} from 'react';
import type { ProductDefinition } from '@/catalog/schema';
import {
  addDesk,
  addSite,
  removeDesk,
  removeSite,
  renameDesk,
  setDeskField,
} from '@/sheet/sheetEdit';
import {
  deskGroups,
  planFromRows,
  themeOf,
  type DeskGroup,
  type SheetProblem,
} from '@/sheet/sheetPlan';
import { aiPrompt, canPlanWithAI, canReadGoogleSheets } from '@/sheet/sheetSources';
import { useSheetStore, type AiScope } from '@/sheet/sheetStore';
import {
  COLUMNS,
  hasHeader,
  rowsFromSheet,
  rowsFromText,
  rowsToText,
  type SheetColumn,
  type SheetRow,
} from '@/sheet/sheetTable';
import { useProduct, useSetupStore } from '@/state/setupStore';
import { useBlockedSites } from '@/ui/workspace/embeddable';
import { WorkspaceIcon } from '@/ui/WorkspaceIcon';
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

type Panel = 'ai' | 'google' | null;
interface Message {
  text: string;
  error?: boolean;
  undo?: boolean;
}

/**
 * The command center sheet: every desk and the sites on its screens, desk by desk. Plan it
 * with the built-in AI, edit it here, paste a table from a spreadsheet or another AI, open a
 * CSV file or a Google Sheet, and build the room from it. Underneath it is a plain table, one
 * row per site (Desk, Theme, Screen, Site, URL, Height), which is what files and links hold.
 */
export function CommandSheet() {
  const product = useProduct();
  const visible = useSheetStore((s) => s.visible);
  const show = useSheetStore((s) => s.show);

  if (product.workspaces.length < 2 || product.screens.length === 0) return null;
  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        onClick={show}
        aria-label="Command center sheet"
        title="Plan every desk's screens"
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
  const replaceRows = useSheetStore((s) => s.replaceRows);
  const previous = useSheetStore((s) => s.previous);
  const undo = useSheetStore((s) => s.undo);
  const hide = useSheetStore((s) => s.hide);
  const fromSetup = useSheetStore((s) => s.fromSetup);
  const build = useSheetStore((s) => s.build);
  const loadGoogle = useSheetStore((s) => s.loadGoogle);
  const planAI = useSheetStore((s) => s.planWithAI);
  const savedLink = useSheetStore((s) => s.googleLink);
  const roomOpen = useSetupStore((s) => s.mode === 'desks');
  const [panel, setPanel] = useState<Panel>(null);
  const [link, setLink] = useState(savedLink);
  const [busy, setBusy] = useState<'ai' | 'other' | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  // Kept while the AI panel is closed, to change the plan with it later.
  const [workflow, setWorkflow] = useState('');
  // What the AI may change; adding desks unless the visitor picks otherwise.
  const [scope, setScope] = useState<AiScope>({ kind: 'add' });
  const fileInput = useRef<HTMLInputElement>(null);

  const plan = useMemo(() => planFromRows(product, rows), [product, rows]);
  // At the single desk, one desk updates it; more open the room of desks.
  const intoSingle = !roomOpen && plan.desks.length === 1;
  const desks = useMemo(() => deskGroups(rows), [rows]);
  const errors = plan.problems.filter((p) => p.level === 'error').length;
  const key = (name: string) => name.trim().toLowerCase();
  // A single desk is shown open; otherwise the list of desks comes first.
  const isOpen = (desk: DeskGroup) => desks.length === 1 || open.has(key(desk.name));
  const allOpen = desks.length > 0 && desks.every((d) => open.has(key(d.name)));
  const toggle = (desk: DeskGroup) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(key(desk.name))) next.delete(key(desk.name));
      else next.add(key(desk.name));
      return next;
    });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hide]);

  const say = (text: string, extra: Omit<Message, 'text'> = {}) => setMessage({ text, ...extra });

  const run = async (kind: 'ai' | 'other', action: () => Promise<Message | string>) => {
    setBusy(kind);
    setMessage(null);
    try {
      const result = await action();
      setMessage(typeof result === 'string' ? { text: result } : result);
    } catch (error) {
      say(error instanceof Error ? error.message : 'Something went wrong', { error: true });
    } finally {
      setBusy(null);
    }
  };

  /** A table pasted anywhere (from a spreadsheet or an AI's answer) goes into the sheet. */
  const onPaste = (event: ClipboardEvent<HTMLElement>) => {
    const text = event.clipboardData.getData('text/plain');
    if (!/[\t\n]/.test(text.trim())) return;
    event.preventDefault();
    const pasted = rowsFromText(text);
    if (pasted.length === 0) return;
    if (hasHeader(text)) {
      replaceRows(pasted);
      setOpen(new Set());
      say(`Pasted ${deskGroups(pasted).length} desks.`, { undo: true });
    } else {
      // Rows without a header are added, read in the sheet's column order.
      replaceRows([...rows, ...pasted]);
      say(`Added ${pasted.length} rows.`, { undo: true });
    }
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    void run('other', async () => {
      const loaded = rowsFromSheet(await file.text());
      if (loaded.length === 0) throw new Error('That file has no rows');
      replaceRows(loaded);
      setOpen(new Set());
      return { text: `Opened ${file.name}.`, undo: true };
    });
  };

  const onBuild = () => {
    if (build() === 0) {
      say('Nothing to build yet: add a desk with a site.', { error: true });
      return;
    }
    hide();
  };

  const onLoadGoogle = (event: SyntheticEvent) => {
    event.preventDefault();
    void run('other', async () => {
      await loadGoogle(link);
      setOpen(new Set());
      return { text: 'Loaded the Google Sheet. Check it, then build the desks.', undo: true };
    });
  };

  const onAddDesk = () => {
    const added = addDesk(
      rows,
      desks.map((d) => d.name),
    );
    setRows(added.rows);
    setOpen((current) => new Set([...current, key(added.name)]));
  };

  return (
    <div className={styles.backdrop} onClick={hide}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        onClick={(event) => event.stopPropagation()}
        onPaste={onPaste}
      >
        <div className={styles.head}>
          <div>
            <h2 id="sheet-title" className={styles.title}>
              Command center sheet
            </h2>
            <p className={styles.note}>
              Every desk and the sites on its screens. Plan it with AI, edit it here, or paste a
              table from Google Sheets, Excel or another AI, then build the desks.
            </p>
          </div>
          <button type="button" className={styles.iconButton} aria-label="Close" onClick={hide}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className={styles.toolbar}>
          <button
            type="button"
            className={`${styles.tool} ${styles.aiTool}`}
            data-on={panel === 'ai' || undefined}
            onClick={() => setPanel(panel === 'ai' ? null : 'ai')}
          >
            <Sparkles size={15} aria-hidden="true" /> Plan with AI
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
              void run('other', async () =>
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
              setOpen(new Set());
              say('The sheet shows your desks as they are now.', { undo: true });
            }}
          >
            <RotateCcw size={15} aria-hidden="true" /> My desks
          </button>
        </div>

        {panel === 'ai' && (
          <AiPanel
            product={product}
            desks={desks}
            workflow={workflow}
            onWorkflow={setWorkflow}
            scope={desks.length > 0 ? scope : { kind: 'replace' }}
            onScope={setScope}
            busy={busy === 'ai'}
            onPlan={() =>
              void run('ai', async () => {
                const asked: AiScope = desks.length > 0 ? scope : { kind: 'replace' };
                const text = await planAI(workflow, asked);
                // A changed desk stays open to see the change; otherwise the list.
                setOpen(asked.kind === 'desk' ? new Set([key(asked.desk)]) : new Set());
                setPanel(null);
                return { text: `${text} Check, then build the desks.`, undo: true };
              })
            }
            onCopied={(ok) => {
              say(
                ok
                  ? 'Prompt copied. Paste it into ChatGPT, Claude or Gemini, then paste its answer here.'
                  : 'Copying isn’t allowed here.',
              );
            }}
          />
        )}

        {panel === 'google' && (
          <form className={styles.panel} onSubmit={onLoadGoogle}>
            <p className={styles.step}>
              Plan in a Google Sheet with the columns{' '}
              <b>{COLUMNS.map((c) => c.label).join(', ')}</b> (<i>Copy table</i> gives you a start).
              Set <b>Share → General access</b> to “Anyone with the link” and paste the link:
            </p>
            <div className={styles.row}>
              <input
                className={styles.input}
                value={link}
                onChange={(event) => setLink(event.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/…"
                aria-label="Google Sheets link"
              />
              <button
                type="submit"
                className={styles.primary}
                disabled={busy !== null || !link.trim()}
              >
                Load
              </button>
            </div>
            <p className={styles.note}>
              Edited the sheet? Load it again. This page’s address with <code>?sheet=</code> and the
              sheet’s link builds the desks for whoever opens it.
            </p>
          </form>
        )}

        {message && (
          <p className={message.error ? styles.error : styles.success} role="status">
            {message.text}
            {message.undo && previous && (
              <button
                type="button"
                className={styles.linkButton}
                onClick={() => {
                  undo();
                  setMessage(null);
                }}
              >
                <Undo2 size={13} aria-hidden="true" /> Undo
              </button>
            )}
          </p>
        )}

        <div className={styles.desks}>
          {desks.length === 0 && (
            <p className={styles.empty}>No desks yet. Plan them with AI, or add one.</p>
          )}
          {desks.map((desk, index) => (
            <DeskCard
              key={`${index}-${key(desk.name)}`}
              product={product}
              rows={rows}
              desk={desk}
              number={index + 1}
              open={isOpen(desk)}
              problems={plan.problems.filter((p) => desk.rows.includes(p.row))}
              onToggle={() => toggle(desk)}
              onAskAI={() => {
                setScope({ kind: 'desk', desk: desk.name });
                setPanel('ai');
                setMessage(null);
              }}
              onChange={setRows}
              onRenamed={(from, to) =>
                setOpen((current) => {
                  const next = new Set(current);
                  if (next.delete(key(from))) next.add(key(to));
                  return next;
                })
              }
            />
          ))}
        </div>
        <div className={styles.row}>
          <button type="button" className={styles.secondary} onClick={onAddDesk}>
            <Plus size={14} aria-hidden="true" /> Add desk
          </button>
          {canPlanWithAI && (
            <button
              type="button"
              className={styles.secondary}
              onClick={() => {
                setScope({ kind: 'add' });
                setPanel('ai');
                setMessage(null);
                // The panel opens above the desks: start typing there.
                window.setTimeout(() => {
                  const field = document.getElementById('sheet-workflow');
                  field?.scrollIntoView({ block: 'nearest' });
                  field?.focus();
                });
              }}
            >
              <Sparkles size={14} aria-hidden="true" /> Add desk with AI
            </button>
          )}
          {desks.length > 1 && (
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => setOpen(allOpen ? new Set() : new Set(desks.map((d) => key(d.name))))}
            >
              {allOpen ? 'Collapse all' : 'Expand all'}
            </button>
          )}
        </div>

        <div className={styles.footer}>
          <span className={styles.summary}>
            {plan.desks.length} {plan.desks.length === 1 ? 'desk' : 'desks'} · {plan.sites}{' '}
            {plan.sites === 1 ? 'site' : 'sites'}
            {errors > 0 && ` · ${errors} left out`}
          </span>
          <button
            type="button"
            className={styles.primary}
            disabled={plan.desks.length === 0}
            onClick={onBuild}
          >
            {roomOpen ? 'Rebuild the desks' : intoSingle ? 'Apply to my desk' : 'Build the desks'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface AiPanelProps {
  product: ProductDefinition;
  desks: readonly DeskGroup[];
  workflow: string;
  onWorkflow: (workflow: string) => void;
  scope: AiScope;
  onScope: (scope: AiScope) => void;
  busy: boolean;
  onPlan: () => void;
  onCopied: (ok: boolean) => void;
}

const SCOPES: readonly { kind: AiScope['kind']; label: string }[] = [
  { kind: 'add', label: 'Add desks' },
  { kind: 'desk', label: 'Change one desk' },
  { kind: 'all', label: 'Change all desks' },
  { kind: 'replace', label: 'Start over' },
];

/**
 * The built-in AI. What it may change is chosen first and said in words, so a prompt never
 * touches more than the visitor meant: by default it only adds desks.
 */
function AiPanel({
  product,
  desks,
  workflow,
  onWorkflow,
  scope,
  onScope,
  busy,
  onPlan,
  onCopied,
}: AiPanelProps) {
  const count = (n: number) => `${n} ${n === 1 ? 'desk' : 'desks'}`;
  const hasDesks = desks.length > 0;
  // The desk being changed, if it is still in the sheet.
  const target =
    scope.kind === 'desk'
      ? desks.find((d) => d.name.toLowerCase() === scope.desk.toLowerCase())
      : undefined;
  const what = !hasDesks
    ? {
        explain: 'Describe your work and the AI plans a desk for each part of it.',
        placeholder:
          'e.g. I day-trade crypto in the morning, run a design studio in the afternoon and follow the NBA at night.',
        button: 'Plan my desks',
      }
    : scope.kind === 'add'
      ? {
          explain: `Plans new desks from what you describe and adds them after your ${count(desks.length)}. Nothing you already have changes.`,
          placeholder: 'e.g. A desk for following Formula 1 race weekends.',
          button: 'Add desks',
        }
      : scope.kind === 'desk'
        ? {
            explain: target
              ? `Only “${target.name}” changes; your other desks stay as they are.`
              : 'Pick the desk to change.',
            placeholder: 'e.g. Put the news on the left screen and add a calendar.',
            button: target ? `Change ${target.name}` : 'Change the desk',
          }
        : scope.kind === 'all'
          ? {
              explain: `Changes your ${count(desks.length)} as you ask: add, remove or rearrange. Whatever you don't mention stays.`,
              placeholder: 'e.g. Put a news site on the left screen of every desk.',
              button: 'Change all desks',
            }
          : {
              explain: `Replaces all your ${count(desks.length)} with a new plan. You can undo it.`,
              placeholder:
                'e.g. I day-trade crypto in the morning, run a design studio in the afternoon and follow the NBA at night.',
              button: 'Replace my desks',
            };
  const ready = workflow.trim() !== '' && (scope.kind !== 'desk' || !!target || !hasDesks);

  return (
    <form
      className={styles.panel}
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) onPlan();
      }}
    >
      {hasDesks && (
        <div className={styles.scopes} role="radiogroup" aria-label="What the AI may change">
          {SCOPES.map(({ kind, label }) => (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={scope.kind === kind}
              className={styles.scope}
              data-danger={kind === 'replace' || undefined}
              onClick={() =>
                onScope(
                  kind === 'desk' ? { kind, desk: target?.name ?? desks[0]?.name ?? '' } : { kind },
                )
              }
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {hasDesks && scope.kind === 'desk' && (
        <select
          className={styles.input}
          aria-label="Desk to change"
          value={target?.name ?? ''}
          onChange={(event) => onScope({ kind: 'desk', desk: event.target.value })}
        >
          {!target && <option value="">Pick a desk</option>}
          {desks.map((d, i) => (
            <option key={`${i}-${d.name}`} value={d.name}>
              {i + 1}. {d.name}
            </option>
          ))}
        </select>
      )}
      <p className={styles.step} data-danger={(hasDesks && scope.kind === 'replace') || undefined}>
        {what.explain}
      </p>
      <textarea
        id="sheet-workflow"
        className={styles.textarea}
        rows={3}
        maxLength={1500}
        aria-label="What to ask the AI"
        value={workflow}
        onChange={(event) => onWorkflow(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.currentTarget.form?.requestSubmit();
          }
        }}
        placeholder={what.placeholder}
      />
      <div className={styles.row}>
        <button type="submit" className={styles.primary} disabled={busy || !ready}>
          {busy ? (
            <Loader2 size={15} className={styles.spin} aria-hidden="true" />
          ) : (
            <Sparkles size={15} aria-hidden="true" />
          )}
          {busy ? 'Working…' : what.button}
        </button>
      </div>
      <p className={styles.note}>
        {canPlanWithAI && 'A free AI, with a daily limit. '}
        Prefer another AI?{' '}
        <button
          type="button"
          className={styles.linkButton}
          onClick={() => void copy(aiPrompt(product, workflow)).then(onCopied)}
        >
          Copy a prompt for it
        </button>{' '}
        and paste its answer anywhere in the sheet.
      </p>
    </form>
  );
}

interface DeskCardProps {
  product: ProductDefinition;
  rows: readonly SheetRow[];
  desk: DeskGroup;
  number: number;
  open: boolean;
  problems: readonly SheetProblem[];
  onToggle: () => void;
  /** Opens the AI to change this desk only. */
  onAskAI: () => void;
  onChange: (rows: SheetRow[]) => void;
  onRenamed: (from: string, to: string) => void;
}

/** One desk: its name, theme and screens at a glance; opened, its settings and sites. */
function DeskCard({
  product,
  rows,
  desk,
  number,
  open,
  problems,
  onToggle,
  onAskAI,
  onChange,
  onRenamed,
}: DeskCardProps) {
  const workspace = themeOf(product, rows, desk);
  // Rows with a site, or being filled in (a screen chosen).
  const filledIn = (row: SheetRow | undefined) =>
    !!row && [row.url, row.site, row.screen].some((cell) => cell.trim() !== '');
  const sites = desk.rows.filter((i) => filledIn(rows[i]));
  const screenLabel = (name: string) =>
    product.screens.find(
      (s) => s.label.toLowerCase() === name.trim().toLowerCase() || s.id === name.trim(),
    )?.label ?? (name.trim() === '' ? (product.screens[0]?.label ?? '') : name.trim());
  const screens = [...new Set(sites.map((i) => screenLabel(rows[i]?.screen ?? '')))];
  const errors = problems.filter((p) => p.level === 'error').length;
  // Sites that refuse to be shown inside the page: kept, and marked.
  const blocked = useBlockedSites(sites.map((i) => rows[i]?.url ?? ''));
  const warnings = problems.length - errors;
  const problemAt = (row: number, column: SheetColumn) =>
    problems.find((p) => p.row === row && p.column === column);
  const update = (index: number, column: SheetColumn, value: string) => {
    onChange(rows.map((row, i) => (i === index ? { ...row, [column]: value } : row)));
  };

  return (
    <section
      className={styles.desk}
      data-open={open || undefined}
      style={{ '--desk-accent': workspace?.accent ?? 'var(--border-strong)' } as CSSProperties}
      aria-label={desk.name}
    >
      <button type="button" className={styles.deskHead} aria-expanded={open} onClick={onToggle}>
        <span className={styles.deskIcon} aria-hidden="true">
          <WorkspaceIcon name={workspace?.icon} size={18} />
        </span>
        <span className={styles.deskTitle}>
          <span className={styles.deskName}>
            <span className={styles.deskNumber}>{number}</span>
            {desk.name}
          </span>
          <span className={styles.deskMeta}>
            {workspace?.label}
            {' · '}
            {sites.length === 0
              ? 'its theme’s own sites'
              : `${sites.length} ${sites.length === 1 ? 'site' : 'sites'}`}
          </span>
        </span>
        <span className={styles.chips}>
          {screens.map((s) => (
            <span key={s} className={styles.chip}>
              {s}
            </span>
          ))}
          {errors > 0 && (
            <span className={`${styles.chip} ${styles.chipError}`}>{errors} to fix</span>
          )}
          {errors === 0 && warnings > 0 && (
            <span className={`${styles.chip} ${styles.chipWarning}`}>
              {warnings} {warnings === 1 ? 'note' : 'notes'}
            </span>
          )}
          {blocked.size > 0 && (
            <span
              className={`${styles.chip} ${styles.chipBlocked}`}
              title="Sites that don't allow being shown inside another page"
            >
              {blocked.size} blocked
            </span>
          )}
        </span>
        <ChevronDown size={18} className={styles.chevron} aria-hidden="true" />
      </button>

      {open && (
        <div className={styles.deskBody}>
          <div className={styles.fields}>
            <label className={styles.field}>
              <span>Name</span>
              <input
                className={styles.input}
                value={desk.name}
                onChange={(event) => {
                  onChange(renameDesk(rows, desk, event.target.value));
                  onRenamed(desk.name, event.target.value);
                }}
                onBlur={(event) => {
                  if (!event.target.value.trim()) {
                    onChange(renameDesk(rows, desk, `Desk ${number}`));
                    onRenamed(event.target.value, `Desk ${number}`);
                  }
                }}
              />
            </label>
            <label className={styles.field}>
              <span>Theme</span>
              <select
                className={styles.input}
                value={workspace?.id ?? ''}
                onChange={(event) => {
                  const theme = product.workspaces.find((w) => w.id === event.target.value);
                  onChange(setDeskField(rows, desk, 'theme', theme?.label ?? ''));
                }}
              >
                {product.workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label}
                  </option>
                ))}
              </select>
            </label>
            {canPlanWithAI && (
              <button type="button" className={styles.askAI} onClick={onAskAI}>
                <Sparkles size={14} aria-hidden="true" /> Ask AI
              </button>
            )}
            <button
              type="button"
              className={styles.removeDesk}
              onClick={() => onChange(removeDesk(rows, desk))}
            >
              <Trash2 size={14} aria-hidden="true" /> Remove desk
            </button>
          </div>

          {sites.length === 0 ? (
            <p className={styles.empty}>
              No sites yet: this desk shows the {workspace?.label} theme’s own. Add sites to choose
              your own.
            </p>
          ) : (
            <ul className={styles.sites}>
              {sites.map((index) => {
                const row = rows[index];
                if (!row) return null;
                const rowProblems = problems.filter(
                  (p) => p.row === index && (p.column === 'screen' || p.column === 'url'),
                );
                return (
                  <li key={index} className={styles.site}>
                    <select
                      className={styles.input}
                      aria-label="Screen"
                      value={screenLabel(row.screen)}
                      data-problem={problemAt(index, 'screen')?.level}
                      onChange={(event) => update(index, 'screen', event.target.value)}
                    >
                      {!product.screens.some((s) => s.label === screenLabel(row.screen)) && (
                        <option value={row.screen}>{row.screen}</option>
                      )}
                      {product.screens.map((s) => (
                        <option key={s.id} value={s.label}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                    <input
                      className={styles.input}
                      aria-label="Site"
                      value={row.site}
                      placeholder="Title"
                      onChange={(event) => update(index, 'site', event.target.value)}
                    />
                    <input
                      className={styles.input}
                      aria-label="URL"
                      value={row.url}
                      placeholder="https://…"
                      inputMode="url"
                      data-problem={
                        problemAt(index, 'url')?.level ??
                        (blocked.has(row.url.trim()) ? 'blocked' : undefined)
                      }
                      onChange={(event) => update(index, 'url', event.target.value)}
                    />
                    <button
                      type="button"
                      className={styles.iconButton}
                      aria-label={`Remove ${row.site || 'this site'}`}
                      onClick={() => onChange(removeSite(rows, desk, index))}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                    {blocked.has(row.url.trim()) && (
                      <span className={styles.siteBlocked}>
                        <Ban size={12} aria-hidden="true" /> Blocked: this site’s embedding
                        restrictions keep it off the screens; it opens in its own tab instead.
                      </span>
                    )}
                    {rowProblems.map((p) => (
                      <span key={p.column} className={styles.siteProblem} data-level={p.level}>
                        {p.message}
                        {p.level === 'error' && ' (left out)'}
                      </span>
                    ))}
                  </li>
                );
              })}
            </ul>
          )}
          {problems
            .filter((p) => p.column === 'theme' || p.column === 'desk')
            .map((p) => (
              <p key={`${p.row}-${p.column}`} className={styles.siteProblem} data-level={p.level}>
                {p.message}
              </p>
            ))}
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => onChange(addSite(rows, desk, product.screens[0]?.label ?? '').rows)}
          >
            <Plus size={14} aria-hidden="true" /> Add site
          </button>
        </div>
      )}
    </section>
  );
}

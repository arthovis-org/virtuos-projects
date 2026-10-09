import { Fragment, type ReactNode } from 'react';
import styles from './apps.module.css';

/**
 * The markdown agents write, drawn for their screens: headings, lists, tables, paragraphs,
 * **bold**, *italic*, `code`, and colours (#1c1c22) as swatches. Safe: text only, no HTML.
 * Partial text (still being typed) draws as far as it goes.
 */
export function Markdown({ text, caret }: { text: string; caret?: boolean }) {
  const blocks = parseBlocks(text);
  return (
    <div className={styles.markdown}>
      {blocks.map((block, i) => (
        <Fragment key={i}>{renderBlock(block, caret === true && i === blocks.length - 1)}</Fragment>
      ))}
      {caret && blocks.length === 0 && <Caret />}
    </div>
  );
}

const Caret = () => <span className={styles.caret} aria-hidden="true" />;

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'table'; rows: string[][] }
  | { kind: 'paragraph'; text: string };

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    const last = blocks.at(-1);
    if (!trimmed) {
      blocks.push({ kind: 'paragraph', text: '' });
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed);
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1]?.length ?? 2, text: heading[2] ?? '' });
      continue;
    }
    const item = /^(?:([-*•])|(\d+)[.)])\s+(.*)$/.exec(trimmed);
    if (item) {
      const ordered = item[2] !== undefined;
      if (last?.kind === 'list' && last.ordered === ordered) last.items.push(item[3] ?? '');
      else blocks.push({ kind: 'list', ordered, items: [item[3] ?? ''] });
      continue;
    }
    if (trimmed.startsWith('|')) {
      const cells = trimmed
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((c) => c.trim());
      // The row of dashes under the header.
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
      if (last?.kind === 'table') last.rows.push(cells);
      else blocks.push({ kind: 'table', rows: [cells] });
      continue;
    }
    if (last?.kind === 'paragraph' && last.text) last.text += ` ${trimmed}`;
    else blocks.push({ kind: 'paragraph', text: trimmed });
  }
  return blocks.filter((b) => b.kind !== 'paragraph' || b.text);
}

function renderBlock(block: Block, caret: boolean): ReactNode {
  const end = caret ? <Caret /> : null;
  switch (block.kind) {
    case 'heading': {
      const Tag = block.level <= 1 ? 'h2' : block.level === 2 ? 'h3' : 'h4';
      return (
        <Tag className={styles.heading}>
          {inline(block.text)}
          {end}
        </Tag>
      );
    }
    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul';
      return (
        <Tag className={styles.list}>
          {block.items.map((item, i) => (
            <li key={i}>
              {inline(item)}
              {i === block.items.length - 1 && end}
            </li>
          ))}
        </Tag>
      );
    }
    case 'table': {
      const [head, ...rows] = block.rows;
      return (
        <table className={styles.table}>
          {head && (
            <thead>
              <tr>
                {head.map((cell, i) => (
                  <th key={i}>{inline(cell)}</th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, i) => (
                  <td key={i}>
                    {inline(cell)}
                    {r === rows.length - 1 && i === row.length - 1 && end}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    case 'paragraph':
      return (
        <p className={styles.paragraph}>
          {inline(block.text)}
          {end}
        </p>
      );
  }
}

/** Bold, italic, code and colour swatches within a line. */
function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|#[0-9a-fA-F]{6}\b)/g;
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(pattern)) {
    const at = match.index;
    if (at > last) parts.push(text.slice(last, at));
    const token = match[0];
    if (token.startsWith('**')) parts.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith('`')) parts.push(<code key={key++}>{token.slice(1, -1)}</code>);
    else if (token.startsWith('#')) {
      parts.push(
        <span key={key++} className={styles.swatch}>
          <span className={styles.swatchColour} style={{ background: token }} />
          {token.toUpperCase()}
        </span>,
      );
    } else parts.push(<em key={key++}>{token.slice(1, -1)}</em>);
    last = at + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

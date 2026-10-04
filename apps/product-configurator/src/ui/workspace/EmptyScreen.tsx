import { useState, type SyntheticEvent } from 'react';
import type { Screen, WorkspaceWindow } from '@/catalog/schema';
import { useWorkspaceStore } from '@/state/workspaceStore';
import styles from './EmptyScreen.module.css';

/** Sites known to allow being shown inside another page (checked when this was written). */
const SUGGESTED = [
  { title: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Main_Page' },
  { title: 'Excalidraw', url: 'https://excalidraw.com/' },
  { title: 'tldraw', url: 'https://www.tldraw.com/' },
  { title: 'StackEdit', url: 'https://stackedit.io/app' },
  { title: 'Desmos', url: 'https://www.desmos.com/calculator' },
  {
    title: 'Map',
    url: 'https://www.openstreetmap.org/export/embed.html?bbox=-0.16,51.49,-0.07,51.53&layer=mapnik',
  },
] as const;

interface EmptyScreenProps {
  screen: Screen;
  /** Workspace windows the visitor closed, offered to reopen here. */
  closed: readonly WorkspaceWindow[];
}

/** Reads a typed address as an https link, or explains why it can't be used. */
function parseAddress(value: string): { url: string; title: string } | { error: string } {
  const text = value.trim();
  if (!text) return { error: 'Type a web address' };
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z\d+.-]*:/i.test(text) ? text : `https://${text}`);
  } catch {
    return { error: 'That is not a web address' };
  }
  if (url.protocol !== 'https:') return { error: 'Only https:// addresses can be shown' };
  return { url: url.href, title: url.hostname.replace(/^www\./, '') };
}

/**
 * What an empty screen shows: a way to put something on it. Closed windows can be reopened,
 * a few sites that allow embedding are one click away, and any https address can be typed.
 */
export function EmptyScreen({ screen, closed }: EmptyScreenProps) {
  const openWindow = useWorkspaceStore((s) => s.openWindow);
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    const site = parseAddress(address);
    if ('error' in site) {
      setError(site.error);
      return;
    }
    openWindow(screen.id, site);
  };

  return (
    <div className={styles.empty}>
      <p className={styles.heading}>{screen.label} screen</p>
      <p className={styles.hint}>Drag a window here, or open a site:</p>

      <form className={styles.form} onSubmit={submit}>
        <input
          className={styles.input}
          type="text"
          inputMode="url"
          placeholder="example.com"
          aria-label={`Web address to open on the ${screen.label} screen`}
          value={address}
          onChange={(event) => {
            setAddress(event.target.value);
            setError(null);
          }}
        />
        <button type="submit" className={styles.open}>
          Open
        </button>
      </form>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {closed.length > 0 && (
        <div className={styles.group}>
          <span className={styles.groupLabel}>Reopen</span>
          <div className={styles.chips}>
            {closed.map((w) => (
              <button
                key={w.id}
                type="button"
                className={styles.chip}
                onClick={() => openWindow(screen.id, w)}
              >
                {w.title}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className={styles.group}>
        <span className={styles.groupLabel}>Suggestions</span>
        <div className={styles.chips}>
          {SUGGESTED.map((site) => (
            <button
              key={site.url}
              type="button"
              className={styles.chip}
              onClick={() => openWindow(screen.id, site)}
            >
              {site.title}
            </button>
          ))}
        </div>
      </div>
      <p className={styles.note}>
        Some sites refuse to be shown inside another page and stay blank.
      </p>
    </div>
  );
}

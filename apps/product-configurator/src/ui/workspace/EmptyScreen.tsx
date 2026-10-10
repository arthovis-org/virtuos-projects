import { useState, type SyntheticEvent } from 'react';
import type { Screen, WorkspaceWindow } from '@/catalog/schema';
import { workspaceById } from '@/state/setup';
import { useCurrentWindows, useProduct, useSetupStore } from '@/state/setupStore';
import styles from './EmptyScreen.module.css';
import { parseAddress, PROJECT_MANAGEMENT, TOOLS } from './siteUrl';
import { WorkspaceIcon } from '@/ui/WorkspaceIcon';

interface EmptyScreenProps {
  screen: Screen;
  /** Workspace windows the visitor closed, offered to reopen here. */
  closed: readonly WorkspaceWindow[];
  /** A blank window this picker is in: picking turns it into the site (else a new window). */
  blankId?: string | undefined;
}

interface SiteGroup {
  label: string;
  icon?: string | undefined;
  sites: { title: string; url: string }[];
}

/**
 * What an empty screen shows: a way to put something on it. Closed windows can be reopened,
 * the sites of every workspace (this one first), project management sites and a few tools are
 * one click away, and any https address can be typed.
 */
export function EmptyScreen({ screen, closed, blankId }: EmptyScreenProps) {
  const product = useProduct();
  const { workspaceId, opened } = useCurrentWindows();
  const openWindow = useSetupStore((s) => s.openWindow);
  const fillBlank = useSetupStore((s) => s.fillBlank);
  const open = (site: { id?: string; title: string; url: string }) => {
    if (blankId) fillBlank(blankId, site);
    else openWindow(screen.id, site);
  };

  // Every workspace's sites, each once, leaving out this workspace's own (on a screen, or
  // offered to reopen above) and the sites the visitor opened.
  const current = workspaceById(product, workspaceId);
  const taken = new Set([
    ...(current?.windows ?? []).map((w) => w.url),
    ...opened.map((w) => w.url),
  ]);
  const groups: SiteGroup[] = [];
  const ordered = [
    ...product.workspaces.filter((w) => w.id === current?.id),
    ...product.workspaces.filter((w) => w.id !== current?.id),
  ];
  for (const workspace of ordered) {
    const sites = workspace.windows.filter((w) => !taken.has(w.url));
    for (const site of sites) taken.add(site.url);
    if (sites.length > 0) groups.push({ label: workspace.label, icon: workspace.icon, sites });
  }
  const projects = PROJECT_MANAGEMENT.filter((site) => !taken.has(site.url));
  if (projects.length > 0) {
    groups.push({ label: 'Project management', icon: 'briefcase', sites: [...projects] });
  }
  const tools = TOOLS.filter((site) => !taken.has(site.url));
  if (tools.length > 0) groups.push({ label: 'Tools', sites: [...tools] });

  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    const site = parseAddress(address);
    if ('error' in site) {
      setError(site.error);
      return;
    }
    open(site);
  };

  return (
    <div className={styles.empty}>
      <p className={styles.heading}>{blankId ? 'New window' : `${screen.label} screen`}</p>
      <p className={styles.hint}>
        {blankId ? 'Open a site in this window:' : 'Drag a window here, or open a site:'}
      </p>

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
              <button key={w.id} type="button" className={styles.chip} onClick={() => open(w)}>
                {w.title}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className={styles.suggestions}>
        {groups.map((group) => (
          <div key={group.label} className={styles.group}>
            <span className={styles.groupLabel}>
              {group.icon && (
                <WorkspaceIcon name={group.icon} size={16} className={styles.groupIcon} />
              )}
              {group.label}
            </span>
            <div className={styles.chips}>
              {group.sites.map((site) => (
                <button
                  key={site.url}
                  type="button"
                  className={styles.chip}
                  onClick={() => open({ title: site.title, url: site.url })}
                >
                  {site.title}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className={styles.note}>
        Some sites refuse to be shown inside another page and stay blank.
      </p>
    </div>
  );
}

/** The site picker in a blank window: the empty screen's, for that window. */
export function BlankWindowPicker({ screenId, blankId }: { screenId: string; blankId: string }) {
  const product = useProduct();
  const { workspaceId, closed } = useCurrentWindows();
  const screen = product.screens.find((s) => s.id === screenId);
  if (!screen) return null;
  const closedWindows = (workspaceById(product, workspaceId)?.windows ?? []).filter((w) =>
    closed.includes(w.id),
  );
  return <EmptyScreen screen={screen} closed={closedWindows} blankId={blankId} />;
}

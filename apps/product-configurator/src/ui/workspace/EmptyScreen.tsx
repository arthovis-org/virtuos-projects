import { useState, type CSSProperties, type SyntheticEvent } from 'react';
import { ArrowLeft, ChevronRight, History, Search } from 'lucide-react';
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

interface Site {
  id?: string;
  title: string;
  url: string;
}

/** A folder of sites: a workspace's, project management's or the tools. */
interface Folder {
  key: string;
  label: string;
  icon: string;
  accent: string;
  sites: Site[];
}

/** A site's host, shown under its name (without www.). */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** The folder's colour for its icon and its sites' initials. */
const accentStyle = (accent: string) => ({ '--accent': accent }) as CSSProperties;

/** A site to open: its initial on its folder's colour, its name and its address. */
function SiteTile({ site, accent, onOpen }: { site: Site; accent: string; onOpen: () => void }) {
  const initial = site.title.trim().charAt(0).toUpperCase() || '?';
  return (
    <button
      type="button"
      className={styles.site}
      style={accentStyle(accent)}
      onClick={onOpen}
      title={`${site.title} · ${hostOf(site.url)}`}
    >
      <span className={styles.badge} aria-hidden="true">
        {initial}
      </span>
      <span className={styles.siteText}>
        <span className={styles.siteName}>{site.title}</span>
        <span className={styles.siteHost}>{hostOf(site.url)}</span>
      </span>
    </button>
  );
}

/**
 * What an empty screen (or a new window) shows: a way to put something on it. Recently closed
 * windows can be reopened; sites are in folders (project management, each workspace, tools),
 * one tap to open a folder and one to open a site; typing filters every folder's sites, and any
 * https address can be opened. Light, and sized from the screen, for every screen's shape.
 */
export function EmptyScreen({ screen, closed, blankId }: EmptyScreenProps) {
  const product = useProduct();
  const { workspaceId, opened } = useCurrentWindows();
  const openWindow = useSetupStore((s) => s.openWindow);
  const fillBlank = useSetupStore((s) => s.fillBlank);
  const open = (site: Site) => {
    if (blankId) fillBlank(blankId, site);
    else openWindow(screen.id, site);
  };

  // Every workspace's sites, each once, leaving out this workspace's own (on a screen, or
  // offered to reopen) and the sites the visitor opened. Project management sites are always
  // offered, in a folder of their own (even when one is open already: a second one beside it
  // is a way to work), so no workspace's folder repeats them.
  const current = workspaceById(product, workspaceId);
  const taken = new Set<string>([
    ...(current?.windows ?? []).map((w) => w.url),
    ...opened.map((w) => w.url),
    ...PROJECT_MANAGEMENT.map((site) => site.url),
  ]);
  const folders: Folder[] = [
    {
      key: 'project-management',
      label: 'Project management',
      icon: 'square-kanban',
      accent: '#2563eb',
      sites: [...PROJECT_MANAGEMENT],
    },
  ];
  const ordered = [
    ...product.workspaces.filter((w) => w.id === current?.id),
    ...product.workspaces.filter((w) => w.id !== current?.id),
  ];
  for (const workspace of ordered) {
    const sites = workspace.windows.filter((w) => !taken.has(w.url));
    for (const site of sites) taken.add(site.url);
    if (sites.length > 0) {
      folders.push({
        key: workspace.id,
        label: workspace.label,
        icon: workspace.icon ?? 'monitor',
        accent: workspace.accent ?? '#64748b',
        sites,
      });
    }
  }
  const tools = TOOLS.filter((site) => !taken.has(site.url));
  if (tools.length > 0) {
    folders.push({ key: 'tools', label: 'Tools', icon: 'wrench', accent: '#475569', sites: tools });
  }

  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  const folder = folders.find((f) => f.key === openFolder);

  // Typing filters every folder's sites by name or address.
  const query = address.trim().toLowerCase();
  const matches = query
    ? folders.flatMap((f) =>
        f.sites
          .filter((s) => s.title.toLowerCase().includes(query) || hostOf(s.url).includes(query))
          .map((site) => ({ site, accent: f.accent })),
      )
    : [];

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
      <div className={styles.inner}>
        {/* A blank window's title bar names it already. */}
        <header className={styles.top}>
          {!blankId && <h2 className={styles.heading}>{screen.label} screen</h2>}
          <p className={styles.hint}>
            {blankId ? 'Open a site in this window' : 'Drag a window here, or open a site'}
          </p>
        </header>

        <form className={styles.form} onSubmit={submit}>
          <label className={styles.field}>
            <Search className={styles.fieldIcon} size="1.1em" strokeWidth={2} aria-hidden="true" />
            <input
              className={styles.input}
              type="text"
              inputMode="url"
              placeholder="Search sites or type an address"
              aria-label={`Search sites or type a web address to open on the ${screen.label} screen`}
              value={address}
              onChange={(event) => {
                setAddress(event.target.value);
                setError(null);
              }}
            />
          </label>
          <button type="submit" className={styles.open}>
            Open
          </button>
        </form>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        {query ? (
          <section className={styles.section} aria-label="Matching sites">
            <h3 className={styles.sectionLabel}>
              {matches.length > 0
                ? 'Matching sites'
                : 'No site by that name: Open goes to the address'}
            </h3>
            <div className={styles.sites}>
              {matches.map(({ site, accent }) => (
                <SiteTile key={site.url} site={site} accent={accent} onOpen={() => open(site)} />
              ))}
            </div>
          </section>
        ) : folder ? (
          <section className={styles.section} aria-label={folder.label}>
            <div className={styles.folderBar}>
              <button type="button" className={styles.back} onClick={() => setOpenFolder(null)}>
                <ArrowLeft size="1.05em" strokeWidth={2} aria-hidden="true" />
                All folders
              </button>
              <span className={styles.folderTitle} style={accentStyle(folder.accent)}>
                <span className={styles.folderIcon} aria-hidden="true">
                  <WorkspaceIcon name={folder.icon} size={16} />
                </span>
                {folder.label}
              </span>
            </div>
            <div className={styles.sites}>
              {folder.sites.map((site) => (
                <SiteTile
                  key={site.url}
                  site={site}
                  accent={folder.accent}
                  onOpen={() => open({ title: site.title, url: site.url })}
                />
              ))}
            </div>
          </section>
        ) : (
          <>
            {closed.length > 0 && (
              <section className={styles.section} aria-label="Recently closed">
                <h3 className={styles.sectionLabel}>
                  <History size="1.1em" strokeWidth={2} aria-hidden="true" />
                  Recently closed
                </h3>
                <div className={styles.chips}>
                  {closed.map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      className={styles.chip}
                      onClick={() => open(w)}
                    >
                      {w.title}
                    </button>
                  ))}
                </div>
              </section>
            )}
            <section className={styles.section} aria-label="Folders">
              <h3 className={styles.sectionLabel}>Folders</h3>
              <div className={styles.folders}>
                {folders.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    className={styles.folder}
                    style={accentStyle(f.accent)}
                    onClick={() => setOpenFolder(f.key)}
                    aria-label={`${f.label}: ${f.sites.length} ${f.sites.length === 1 ? 'site' : 'sites'}`}
                  >
                    <span className={styles.folderIcon} aria-hidden="true">
                      <WorkspaceIcon name={f.icon} size={18} />
                    </span>
                    <span className={styles.folderText}>
                      <span className={styles.folderName}>{f.label}</span>
                      <span className={styles.folderCount}>
                        {f.sites.length} {f.sites.length === 1 ? 'site' : 'sites'}
                      </span>
                    </span>
                    <ChevronRight
                      className={styles.folderArrow}
                      size="1em"
                      strokeWidth={2}
                      aria-hidden="true"
                    />
                  </button>
                ))}
              </div>
            </section>
          </>
        )}

        <p className={styles.note}>
          Some sites refuse to be shown inside another page and stay blank.
        </p>
      </div>
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

/**
 * A window's address as loaded: `{host}` becomes the page's host name, for embeds that must
 * be told which site shows them (Twitch's `parent=`).
 */
export function siteUrl(url: string): string {
  return url.replace(/\{host\}|%7Bhost%7D/gi, window.location.hostname || 'localhost');
}

/** Sites whose name isn't their host's spelling, by host (without www.). */
const SITE_NAMES: Record<string, string> = { 'tinygnomes.com': 'TinyGnomes' };

const siteName = (hostname: string) => SITE_NAMES[hostname.replace(/^www\./, '')];

/**
 * A window's title as shown: the site's own name in place of its host or a lowercase spelling
 * of it (windows opened before the name was known keep their saved title).
 */
export function windowTitle(title: string, url: string): string {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return title;
  }
  const name = siteName(hostname);
  if (!name) return title;
  const plain = title.toLowerCase();
  return plain === name.toLowerCase() || plain === hostname.replace(/^www\./, '') ? name : title;
}

/** Reads a typed address as an https link, or explains why it can't be used. */
export function parseAddress(value: string): { url: string; title: string } | { error: string } {
  const text = value.trim();
  if (!text) return { error: 'Type a web address' };
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z\d+.-]*:/i.test(text) ? text : `https://${text}`);
  } catch {
    return { error: 'That is not a web address' };
  }
  if (url.protocol !== 'https:') return { error: 'Only https:// addresses can be shown' };
  return { url: url.href, title: siteName(url.hostname) ?? url.hostname.replace(/^www\./, '') };
}

/**
 * Project management sites, offered in their own group. Not known to allow being shown inside
 * another page (unlike TOOLS): the desktop app shows them anyway.
 */
export const PROJECT_MANAGEMENT = [
  { title: 'TinyGnomes', url: 'https://www.tinygnomes.com/quilt.fcgi#dashboard' },
] as const;

/**
 * General tools known to allow being shown inside another page (checked when this was
 * written), after the sites of the product's workspaces.
 */
export const TOOLS = [
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

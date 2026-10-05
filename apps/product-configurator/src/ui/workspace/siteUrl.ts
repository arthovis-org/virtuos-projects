/**
 * A window's address as loaded: `{host}` becomes the page's host name, for embeds that must
 * be told which site shows them (Twitch's `parent=`).
 */
export function siteUrl(url: string): string {
  return url.replace(/\{host\}|%7Bhost%7D/gi, window.location.hostname || 'localhost');
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
  return { url: url.href, title: url.hostname.replace(/^www\./, '') };
}

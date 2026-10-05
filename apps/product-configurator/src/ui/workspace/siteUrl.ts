/**
 * A window's address as loaded: `{host}` becomes the page's host name, for embeds that must
 * be told which site shows them (Twitch's `parent=`).
 */
export function siteUrl(url: string): string {
  return url.replace(/\{host\}|%7Bhost%7D/gi, window.location.hostname || 'localhost');
}

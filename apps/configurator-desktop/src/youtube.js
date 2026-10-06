/**
 * YouTube on the screens. youtube.com itself is shown (its own page, logins and
 * recommendations), but its video player crashes inside a frame in this Electron: the frame's
 * page dies a few seconds into a video and the screen turns grey. YouTube's embed player,
 * made for frames, plays fine. So a video opened on a screen plays in the embed player:
 * clicks on videos are caught in the page (`watchVideosEmbedded`), and frames loading a video
 * page directly are redirected (`embedFor` in frames.js), with a way back to YouTube.
 *
 * The embed player wants to know which site shows it (error 153 without a referrer), and the
 * app's own page has an app:// address: YouTube is told the public website's (`REFERRER`).
 */

/** The public website, as which the app's screens introduce themselves to YouTube. */
const REFERRER = 'https://arthovis-org.github.io/';

/** The embed player's address for a YouTube video link, or null for any other link. */
function embedFor(link) {
  let url;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m)\./, '');
  let id = null;
  if (host === 'youtube.com' && url.pathname === '/watch') id = url.searchParams.get('v');
  else if (host === 'youtube.com') id = /^\/(?:shorts|live)\/([\w-]{6,})/.exec(url.pathname)?.[1] ?? null;
  else if (host === 'youtu.be') id = /^\/([\w-]{6,})/.exec(url.pathname)?.[1] ?? null;
  if (!id || !/^[\w-]+$/.test(id)) return null;
  const embed = new URL(`https://www.youtube.com/embed/${id}`);
  embed.searchParams.set('autoplay', '1');
  const list = url.searchParams.get('list');
  if (list) embed.searchParams.set('list', list);
  const start = url.searchParams.get('t') ?? url.searchParams.get('start');
  if (start && /^\d+s?$/.test(start)) embed.searchParams.set('start', start.replace('s', ''));
  return embed.toString();
}

/**
 * Run inside a youtube.com page on a screen: a click on a video opens it in the embed player
 * (before YouTube's own page switches to its video page, which would crash).
 */
function catchVideoClicks(toEmbed) {
  if (window.__virtuosVideos) return;
  window.__virtuosVideos = true;
  window.addEventListener(
    'click',
    (event) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      const embed = link && toEmbed(link.href);
      if (!embed) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      window.location.assign(embed);
    },
    true,
  );
}

/** Run inside the embed player on a screen: a button back to YouTube, when it came from there. */
function addBackButton() {
  if (document.getElementById('virtuos-back') || window.history.length < 2) return;
  const button = document.createElement('button');
  button.id = 'virtuos-back';
  button.type = 'button';
  button.textContent = '← YouTube';
  button.style.cssText =
    'position:fixed;top:10px;left:10px;z-index:2147483647;padding:6px 12px;border:0;' +
    'border-radius:999px;background:rgba(0,0,0,.7);color:#fff;font:600 13px/1.2 Roboto,Arial,sans-serif;' +
    'cursor:pointer';
  button.addEventListener('click', () => window.history.back());
  document.body.append(button);
}

/** Watches the frames of a window and sets up YouTube's pages in them as above. */
function watchVideosEmbedded(webContents) {
  const { webFrameMain } = require('electron');
  webContents.on('did-frame-finish-load', (_event, isMainFrame, processId, routingId) => {
    if (isMainFrame) return;
    let frame;
    try {
      frame = webFrameMain.fromId(processId, routingId);
    } catch {
      return;
    }
    if (!frame) return;
    let url;
    try {
      url = new URL(frame.url);
    } catch {
      return;
    }
    if (!/(^|\.)youtube\.com$/.test(url.hostname)) return;
    const script = url.pathname.startsWith('/embed/')
      ? `(${addBackButton.toString()})()`
      : `(${catchVideoClicks.toString()})(${embedFor.toString()})`;
    frame.executeJavaScript(script).catch(() => undefined);
  });
}

module.exports = { REFERRER, embedFor, watchVideosEmbedded };

/**
 * The embeddable version of a link, for sites that refuse to be shown inside another page but
 * offer an official embed of the same thing: a YouTube video becomes YouTube's embed player, a
 * Google Doc its preview, a Spotify playlist Spotify's player, and so on. Screens show the
 * embed; "open in a new tab" still opens the link as given.
 */

export interface EmbedVersion {
  /** The address to show on a screen. */
  url: string;
  /** What it is, for the sheet: "YouTube's player". */
  via: string;
}

type Rule = (url: URL) => EmbedVersion | null;

const host = (url: URL) => url.hostname.toLowerCase().replace(/^(www\.|m\.|mobile\.)/, '');
const parts = (url: URL) => url.pathname.split('/').filter(Boolean);

/** "1h2m3s", "90s" or "90" as seconds. */
function seconds(value: string | null): number | null {
  if (!value) return null;
  if (/^\d+$/.test(value)) return Number(value);
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
  if (!match?.[0]) return null;
  return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
}

const youtubeVideo = (id: string, start: number | null): EmbedVersion => ({
  url: `https://www.youtube-nocookie.com/embed/${id}${start ? `?start=${start}` : ''}`,
  via: 'YouTube’s player',
});

const RULES: Rule[] = [
  // YouTube: videos, shorts, live, playlists and channels' uploads.
  (url) => {
    const h = host(url);
    const p = parts(url);
    const start = seconds(url.searchParams.get('t') ?? url.searchParams.get('start'));
    if (h === 'youtu.be' && p[0]) return youtubeVideo(p[0], start);
    if (h !== 'youtube.com' && h !== 'music.youtube.com') return null;
    if (p[0] === 'embed') return null;
    const video = url.searchParams.get('v');
    if (p[0] === 'watch' && video) return youtubeVideo(video, start);
    if ((p[0] === 'shorts' || p[0] === 'live') && p[1]) return youtubeVideo(p[1], start);
    const list = url.searchParams.get('list');
    if (p[0] === 'playlist' && list) {
      return {
        url: `https://www.youtube-nocookie.com/embed/videoseries?list=${list}`,
        via: 'YouTube’s player',
      };
    }
    // A channel by id: its uploads playlist is the id with UU for UC.
    if (p[0] === 'channel' && p[1]?.startsWith('UC')) {
      return {
        url: `https://www.youtube-nocookie.com/embed/videoseries?list=UU${p[1].slice(2)}`,
        via: 'YouTube’s player (the channel’s uploads)',
      };
    }
    return null;
  },
  // Vimeo
  (url) => {
    const p = parts(url);
    if (host(url) !== 'vimeo.com' || !/^\d+$/.test(p[0] ?? '')) return null;
    return { url: `https://player.vimeo.com/video/${p[0]}`, via: 'Vimeo’s player' };
  },
  // Google Docs, Sheets, Slides and Drive files (shared ones).
  (url) => {
    const h = host(url);
    const p = parts(url);
    if (h === 'docs.google.com' && p[1] === 'd' && p[2] && p[2] !== 'e') {
      const id = p[2];
      if (p[0] === 'document') {
        return {
          url: `https://docs.google.com/document/d/${id}/preview`,
          via: 'Google Docs preview',
        };
      }
      if (p[0] === 'spreadsheets') {
        const gid = /gid=(\d+)/.exec(url.hash + url.search)?.[1];
        return {
          url: `https://docs.google.com/spreadsheets/d/${id}/preview${gid ? `#gid=${gid}` : ''}`,
          via: 'Google Sheets preview',
        };
      }
      if (p[0] === 'presentation') {
        return {
          url: `https://docs.google.com/presentation/d/${id}/embed`,
          via: 'Google Slides player',
        };
      }
      if (p[0] === 'forms') {
        return {
          url: `https://docs.google.com/forms/d/${id}/viewform?embedded=true`,
          via: 'Google Forms embed',
        };
      }
    }
    if (h === 'drive.google.com' && p[0] === 'file' && p[1] === 'd' && p[2]) {
      return {
        url: `https://drive.google.com/file/d/${p[2]}/preview`,
        via: 'Google Drive preview',
      };
    }
    return null;
  },
  // Google Maps: a place, a search or a spot, as Maps' embed (no key needed).
  (url) => {
    const h = host(url);
    const p = parts(url);
    const maps = (h === 'google.com' && p[0] === 'maps') || h === 'maps.google.com';
    if (!maps || p.includes('embed') || url.searchParams.get('output') === 'embed') return null;
    const at = /@(-?\d+\.\d+),(-?\d+\.\d+),(\d+(?:\.\d+)?)z/.exec(url.pathname);
    const place = p[1] === 'place' || p[1] === 'search' ? p[2] : undefined;
    const query =
      url.searchParams.get('q') ?? (place ? decodeURIComponent(place).replace(/\+/g, ' ') : null);
    const q = query ?? (at ? `${at[1]},${at[2]}` : null);
    if (!q) return null;
    const zoom = at ? `&z=${Math.round(Number(at[3]))}` : '';
    return {
      url: `https://www.google.com/maps?q=${encodeURIComponent(q)}${zoom}&output=embed`,
      via: 'Google Maps embed',
    };
  },
  // Spotify: tracks, albums, playlists, artists, podcasts.
  (url) => {
    const p = parts(url).filter((s) => !s.startsWith('intl-'));
    const kinds = ['track', 'album', 'playlist', 'artist', 'episode', 'show'];
    if (host(url) !== 'open.spotify.com' || p[0] === 'embed') return null;
    if (!p[0] || !kinds.includes(p[0]) || !p[1]) return null;
    return { url: `https://open.spotify.com/embed/${p[0]}/${p[1]}`, via: 'Spotify’s player' };
  },
  // Figma files, designs, prototypes and boards.
  (url) => {
    const p = parts(url);
    if (host(url) !== 'figma.com' || !['file', 'design', 'proto', 'board'].includes(p[0] ?? '')) {
      return null;
    }
    return {
      url: `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(url.href)}`,
      via: 'Figma’s embed',
    };
  },
  // X / Twitter posts.
  (url) => {
    const h = host(url);
    const p = parts(url);
    if ((h !== 'x.com' && h !== 'twitter.com') || p[1] !== 'status' || !/^\d+$/.test(p[2] ?? '')) {
      return null;
    }
    return {
      url: `https://platform.twitter.com/embed/Tweet.html?id=${p[2]}`,
      via: 'X’s post embed',
    };
  },
  // Twitch channels and videos ({host} is filled in with this site's host: Twitch asks).
  (url) => {
    const p = parts(url);
    if (host(url) !== 'twitch.tv' || !p[0]) return null;
    if (p[0] === 'videos' && p[1]) {
      return {
        url: `https://player.twitch.tv/?video=${p[1]}&parent={host}`,
        via: 'Twitch’s player',
      };
    }
    if (p.length === 1 && /^\w+$/.test(p[0])) {
      return {
        url: `https://player.twitch.tv/?channel=${p[0]}&parent={host}`,
        via: 'Twitch’s player',
      };
    }
    return null;
  },
  // Reddit posts.
  (url) => {
    const h = host(url);
    const p = parts(url);
    if ((h !== 'reddit.com' && h !== 'old.reddit.com') || p[0] !== 'r' || p[2] !== 'comments') {
      return null;
    }
    return { url: `https://embed.reddit.com${url.pathname}`, via: 'Reddit’s post embed' };
  },
  // SoundCloud tracks and sets.
  (url) => {
    if (host(url) !== 'soundcloud.com' || parts(url).length < 2) return null;
    return {
      url: `https://w.soundcloud.com/player/?url=${encodeURIComponent(url.href)}`,
      via: 'SoundCloud’s player',
    };
  },
  // CodePen pens.
  (url) => {
    const p = parts(url);
    if (host(url) !== 'codepen.io' || p[1] !== 'pen' || !p[2]) return null;
    return {
      url: `https://codepen.io/${p[0]}/embed/${p[2]}?default-tab=result`,
      via: 'CodePen’s embed',
    };
  },
  // Loom videos.
  (url) => {
    const p = parts(url);
    if (host(url) !== 'loom.com' || p[0] !== 'share' || !p[1]) return null;
    return { url: `https://www.loom.com/embed/${p[1]}`, via: 'Loom’s player' };
  },
  // TradingView symbols and charts, as its chart widget.
  (url) => {
    const p = parts(url);
    if (host(url) !== 'tradingview.com') return null;
    let symbol = url.searchParams.get('symbol');
    if (p[0] === 'symbols' && p[1]) symbol = p[1].replace('-', ':');
    if (!symbol) return null;
    return {
      url: `https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(symbol)}&interval=D&theme=light&style=1&locale=en`,
      via: 'TradingView’s chart widget',
    };
  },
  // OpenStreetMap: the map at #map=zoom/lat/lon, as its embed.
  (url) => {
    if (host(url) !== 'openstreetmap.org' || parts(url)[0] === 'export') return null;
    const at = /map=(\d+)\/(-?[\d.]+)\/(-?[\d.]+)/.exec(url.hash);
    if (!at) return null;
    const [zoom, lat, lon] = [Number(at[1]), Number(at[2]), Number(at[3])];
    // About three map tiles across, either way.
    const half = 540 / 2 ** zoom / 2;
    const bbox = [lon - half, lat - half / 2, lon + half, lat + half / 2]
      .map((n) => n.toFixed(4))
      .join(',');
    return {
      url: `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`,
      via: 'OpenStreetMap’s embed',
    };
  },
];

/** The embeddable version of a link, or null when it has none (or already is one). */
export function embedVersion(link: string): EmbedVersion | null {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  for (const rule of RULES) {
    const version = rule(url);
    if (version) return version;
  }
  return null;
}

/** The address a screen shows for a link: its embeddable version, if it has one. */
export const screenUrl = (link: string) => embedVersion(link)?.url ?? link;

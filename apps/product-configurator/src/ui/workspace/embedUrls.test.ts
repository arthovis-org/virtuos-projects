import { describe, expect, it } from 'vitest';
import { embedVersion, screenUrl } from './embedUrls';

/** Links and the embeddable version a screen shows for each. */
export const SAMPLES: [string, string][] = [
  [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
  ],
  [
    'https://youtu.be/dQw4w9WgXcQ?t=90',
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=90',
  ],
  [
    'https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s',
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=90',
  ],
  [
    'https://www.youtube.com/shorts/abcDEF12345',
    'https://www.youtube-nocookie.com/embed/abcDEF12345',
  ],
  [
    'https://www.youtube.com/playlist?list=PL590L5WQmH8fJ54F369BLDSqIwcs-TCfs',
    'https://www.youtube-nocookie.com/embed/videoseries?list=PL590L5WQmH8fJ54F369BLDSqIwcs-TCfs',
  ],
  [
    'https://www.youtube.com/channel/UCsBjURrPoezykLs9EqgamOA',
    'https://www.youtube-nocookie.com/embed/videoseries?list=UUsBjURrPoezykLs9EqgamOA',
  ],
  ['https://vimeo.com/76979871', 'https://player.vimeo.com/video/76979871'],
  [
    'https://docs.google.com/document/d/1AbCdEfGhIjKlMn/edit?usp=sharing',
    'https://docs.google.com/document/d/1AbCdEfGhIjKlMn/preview',
  ],
  [
    'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMn/edit#gid=42',
    'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMn/preview#gid=42',
  ],
  [
    'https://docs.google.com/presentation/d/1AbCdEfGhIjKlMn/edit',
    'https://docs.google.com/presentation/d/1AbCdEfGhIjKlMn/embed',
  ],
  [
    'https://drive.google.com/file/d/1AbCdEfGhIjKlMn/view',
    'https://drive.google.com/file/d/1AbCdEfGhIjKlMn/preview',
  ],
  [
    'https://www.google.com/maps/place/Eiffel+Tower/@48.8584,2.2945,17z',
    'https://www.google.com/maps?q=Eiffel%20Tower&z=17&output=embed',
  ],
  [
    'https://open.spotify.com/intl-de/playlist/37i9dQZF1DXcBWIGoYBM5M',
    'https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M',
  ],
  [
    'https://www.figma.com/design/abc123/My-file',
    'https://www.figma.com/embed?embed_host=share&url=https%3A%2F%2Fwww.figma.com%2Fdesign%2Fabc123%2FMy-file',
  ],
  [
    'https://x.com/NASA/status/1234567890123456789',
    'https://platform.twitter.com/embed/Tweet.html?id=1234567890123456789',
  ],
  ['https://www.twitch.tv/shroud', 'https://player.twitch.tv/?channel=shroud&parent={host}'],
  [
    'https://www.reddit.com/r/nba/comments/abc123/some_title/',
    'https://embed.reddit.com/r/nba/comments/abc123/some_title/',
  ],
  ['https://codepen.io/team/pen/abcXYZ', 'https://codepen.io/team/embed/abcXYZ?default-tab=result'],
  ['https://www.loom.com/share/0123456789abcdef', 'https://www.loom.com/embed/0123456789abcdef'],
  [
    'https://www.tradingview.com/symbols/NASDAQ-AAPL/',
    'https://s.tradingview.com/widgetembed/?symbol=NASDAQ%3AAAPL&interval=D&theme=light&style=1&locale=en',
  ],
];

describe('embeddable versions of links', () => {
  it.each(SAMPLES)('%s', (link, shown) => {
    expect(embedVersion(link)?.url).toBe(shown);
  });

  it('leave alone links that have none, or already are one', () => {
    for (const link of [
      'https://www.youtube.com/@nba',
      'https://www.youtube-nocookie.com/embed/abc',
      'https://www.notion.so/acme/Roadmap-0123abcd',
      'https://excalidraw.com/',
      'not a link',
    ]) {
      expect(embedVersion(link)).toBeNull();
      expect(screenUrl(link)).toBe(link);
    }
  });

  it('say what they are', () => {
    expect(embedVersion('https://youtu.be/dQw4w9WgXcQ')?.via).toBe('YouTube’s player');
  });

  it('map OpenStreetMap views to its embed around the same spot', () => {
    const url = embedVersion('https://www.openstreetmap.org/#map=12/51.5/-0.12')?.url ?? '';
    expect(url).toMatch(/^https:\/\/www\.openstreetmap\.org\/export\/embed\.html\?bbox=/);
    expect(url).toContain('marker=51.5,-0.12');
  });
});

import { describe, expect, it } from 'vitest';
import { parseAddress, windowTitle } from './siteUrl';

const TINYGNOMES = 'https://www.tinygnomes.com/quilt.fcgi#dashboard';

describe('site names', () => {
  it('names a typed address by the site’s own name when it has one', () => {
    expect(parseAddress('tinygnomes.com')).toMatchObject({ title: 'TinyGnomes' });
    expect(parseAddress('example.com')).toMatchObject({ title: 'example.com' });
  });

  it('shows the site’s name for a window saved with its host or a lowercase spelling', () => {
    expect(windowTitle('tinygnomes', TINYGNOMES)).toBe('TinyGnomes');
    expect(windowTitle('tinygnomes.com', TINYGNOMES)).toBe('TinyGnomes');
    expect(windowTitle('Sprint board', TINYGNOMES)).toBe('Sprint board');
    expect(windowTitle('example.com', 'https://example.com/')).toBe('example.com');
    expect(windowTitle('Notes', 'agent:notes')).toBe('Notes');
  });
});

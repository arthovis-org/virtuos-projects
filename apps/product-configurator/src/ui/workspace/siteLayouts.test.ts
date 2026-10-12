import { describe, expect, it } from 'vitest';
import { onHosts } from './siteLayouts';

describe('sites with adapted layouts', () => {
  it('knows a site by its host and subdomains only', () => {
    const hosts = ['tinygnomes.com'];
    expect(onHosts('https://www.tinygnomes.com/quilt.fcgi#dashboard', hosts)).toBe(true);
    expect(onHosts('https://tinygnomes.com/', hosts)).toBe(true);
    expect(onHosts('https://nottinygnomes.com/', hosts)).toBe(false);
    expect(onHosts('https://example.com/?tinygnomes.com', hosts)).toBe(false);
    expect(onHosts('agent:notes', hosts)).toBe(false);
    expect(onHosts('', hosts)).toBe(false);
  });
});

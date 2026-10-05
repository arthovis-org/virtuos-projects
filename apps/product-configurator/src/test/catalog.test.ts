import { describe, expect, it } from 'vitest';
import { getProduct } from '@/catalog';

describe('catalog', () => {
  it('loads the smart desk with its screens and workspaces', () => {
    const product = getProduct('smart-desk');
    expect(product.screens.map((s) => s.label)).toEqual(['Main', 'Left', 'Right', 'Desk']);
    expect(product.screens.find((s) => s.label === 'Left')?.toggle).toBe('toggle-side-monitors');
    expect(product.screens.find((s) => s.label === 'Main')?.toggle).toBeUndefined();
    expect(product.workspaces.length).toBe(12);
  });
});

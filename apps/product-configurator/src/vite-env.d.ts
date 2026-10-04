/// <reference types="vite/client" />

/** Generated from the `products/` folder by `scripts/vite-plugin-catalog.ts`. */
declare module 'virtual:catalog' {
  /** Product definitions, validated by `src/catalog`. */
  export const products: readonly unknown[];
  /** Problems found per product folder. */
  export const issues: Readonly<Record<string, readonly string[]>>;
}

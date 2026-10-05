/// <reference types="vite/client" />

/** Generated from the `products/` folder by `scripts/vite-plugin-catalog.ts`. */
declare module 'virtual:catalog' {
  /** Product definitions, validated by `src/catalog`. */
  export const products: readonly unknown[];
  /** Problems found per product folder. */
  export const issues: Readonly<Record<string, readonly string[]>>;
}

interface ImportMetaEnv {
  /** The feedback Worker's address (services/feedback-worker); no Feedback button without it. */
  readonly VITE_FEEDBACK_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

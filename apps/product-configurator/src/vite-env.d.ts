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
  /** The layouts Worker's address (services/layouts-worker); no Layouts button without it. */
  readonly VITE_LAYOUTS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** The version, shared with the desktop app (vite.config.ts). */
declare const __VERSION__: string;
/** The commit the site was built from, short; '' when unknown (vite.config.ts). */
declare const __BUILD__: string;

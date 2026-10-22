import type { WebGLRenderer } from 'three';

/** What the performance panel reads from the 3D view: its renderer, while there is one. */
export const perfProbe = { renderer: null as WebGLRenderer | null };

import type { Object3D } from 'three';

/**
 * Each desk's group in the scene, by desk id (registered while it is shown): where things that
 * travel between desks (agents' hand-offs) start and land.
 */
export const deskObjects = new Map<string, Object3D>();

/** The person (and chair) at each desk, by desk id: clicking them picks their desk. */
export const occupantObjects = new Map<string, Object3D>();

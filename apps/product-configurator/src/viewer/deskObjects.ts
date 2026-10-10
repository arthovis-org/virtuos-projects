import type { Box3, Object3D } from 'three';

/**
 * Each desk's group in the scene, by desk id (registered while it is shown): where things that
 * travel between desks (agents' hand-offs) start and land.
 */
export const deskObjects = new Map<string, Object3D>();

/** The person (and chair) at each desk, by desk id: clicking them picks their desk. */
export const occupantObjects = new Map<string, Object3D>();

/**
 * The single desk's bounds as it stands now (its top follows the desk's height), by desk id:
 * the orbit camera follows the desk up and down.
 */
export const deskBoxes = new Map<string, Box3>();

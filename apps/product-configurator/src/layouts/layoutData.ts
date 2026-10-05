/**
 * A saved layout: a set-up as stored online, to bring it back on any device. The single desk
 * and the room of desks, each desk's workspace, name, configuration, height and windows, and
 * the desk the visitor was at. Desk ids are not saved: a loaded room gets new ones.
 *
 * This is a stored format: layouts saved by earlier versions must keep opening, so it only
 * ever gains optional fields (or a new `version` read alongside the old one).
 */
import type { ProductDefinition } from '@/catalog/schema';
import type { Selections } from '@/state/derive';
import { sanitizeSelections } from '@/state/derive';
import {
  initialWindows,
  newDesk,
  SINGLE_DESK,
  workspaceById,
  type DeskSetup,
  type DeskWindows,
  type Setup,
} from '@/state/setup';

/** Windows as saved: with the workspace they were arranged for. */
export type LayoutWindows = DeskWindows & { workspaceId: string | null };

export interface LayoutDesk {
  workspaceId: string;
  /** The desk's own name; the workspace's when missing. */
  name?: string;
  selections: Selections;
  /** Height, in the product's unit; the default when missing. */
  height?: number;
  /** Windows on the desk's screens; the workspace's own when missing. */
  windows?: LayoutWindows;
}

export interface LayoutData {
  version: 1;
  /** The mode the visitor was in; the other one comes back too, behind the switch. */
  mode: 'single' | 'desks';
  /** The single desk; its workspace is the one its windows name. */
  single: Omit<LayoutDesk, 'workspaceId'>;
  room: {
    desks: LayoutDesk[];
    /** Desk the visitor was at, or null for the overview. */
    active: number | null;
  } | null;
}

/** A set-up as a layout. */
export function layoutFromSetup(product: ProductDefinition, setup: Setup): LayoutData {
  const motion = product.motions[0];
  /** A desk as saved, but for its workspace (the single desk's is the one its windows name). */
  const saved = (desk: DeskSetup): Omit<LayoutDesk, 'workspaceId'> => {
    const height = motion ? desk.motions[motion.id] : undefined;
    return {
      ...(desk.name && { name: desk.name }),
      selections: desk.selections,
      ...(height !== undefined && { height }),
      windows: { workspaceId: desk.workspaceId, ...desk.windows },
    };
  };
  const active = setup.room.findIndex((d) => d.id === setup.activeDeskId);
  return {
    version: 1,
    mode: setup.mode === 'desks' && setup.room.length > 0 ? 'desks' : 'single',
    single: saved(setup.single),
    room:
      setup.room.length === 0
        ? null
        : {
            desks: setup.room.map((desk) => ({ workspaceId: desk.workspaceId, ...saved(desk) })),
            active: active < 0 ? null : active,
          },
  };
}

/**
 * The set-up a layout describes, for this product. Desks whose workspace the product no
 * longer has are left out, unknown options fall back to defaults, and windows arranged for
 * another workspace give way to the desk's workspace's own.
 */
export function setupFromLayout(product: ProductDefinition, layout: LayoutData): Setup {
  const motion = product.motions[0];
  const restore = (entry: LayoutDesk, id?: string): DeskSetup => {
    const desk = newDesk(product, entry.workspaceId, id);
    const workspace = workspaceById(product, desk.workspaceId);
    const windows = entry.windows;
    return {
      ...desk,
      ...(entry.name && { name: entry.name }),
      selections: sanitizeSelections(product, entry.selections),
      motions:
        motion && typeof entry.height === 'number'
          ? { ...desk.motions, [motion.id]: entry.height }
          : desk.motions,
      windows:
        windows && (windows.workspaceId ?? workspace?.id) === desk.workspaceId
          ? {
              placement: windows.placement,
              order: windows.order,
              closed: windows.closed,
              opened: windows.opened,
              sizes: windows.sizes,
            }
          : initialWindows(workspace),
    };
  };

  const single = restore(
    { workspaceId: layout.single.windows?.workspaceId ?? '', ...layout.single },
    SINGLE_DESK,
  );
  const room: DeskSetup[] = [];
  let activeDeskId: string | null = null;
  (layout.room?.desks ?? []).forEach((entry, i) => {
    if (!product.workspaces.some((w) => w.id === entry.workspaceId)) return;
    const desk = restore(entry);
    room.push(desk);
    if (i === layout.room?.active) activeDeskId = desk.id;
  });
  return {
    productId: product.id,
    mode: layout.mode === 'desks' && room.length > 0 ? 'desks' : 'single',
    single,
    room,
    activeDeskId,
  };
}

/** A loaded layout's data, checked enough to apply safely (unknown things are dropped later). */
export function isLayoutData(value: unknown): value is LayoutData {
  const data = value as Partial<LayoutData> | null;
  return (
    !!data &&
    data.version === 1 &&
    (data.mode === 'single' || data.mode === 'desks') &&
    !!data.single &&
    typeof data.single === 'object' &&
    (data.room === null || (typeof data.room === 'object' && Array.isArray(data.room.desks)))
  );
}

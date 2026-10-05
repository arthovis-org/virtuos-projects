/**
 * A saved layout: everything needed to bring a visitor's set-up back, on any device. The
 * single desk (its configuration, height and windows) and the room of desks (each desk's
 * workspace, configuration, height and windows, and the desk the visitor was at), whichever
 * mode they were in. Desk ids are not saved: a loaded room gets new ones.
 */
import { getProduct } from '@/catalog';
import { useConfiguratorStore } from '@/state/configuratorStore';
import type { Selections } from '@/state/derive';
import { useDesksStore } from '@/state/desksStore';
import { motionKey, SINGLE_DESK_KEY, useMotionStore } from '@/state/motionStore';
import { SINGLE_DESK, useWorkspaceStore, type DeskWindows } from '@/state/workspaceStore';

export interface LayoutDesk {
  workspaceId: string;
  selections: Selections;
  /** Height, in the product's unit; the default when missing. */
  height?: number;
  /** Windows on the desk's screens; the workspace's own when missing. */
  windows?: DeskWindows;
}

export interface LayoutData {
  version: 1;
  /** The mode the visitor was in; the other one comes back too, behind the switch. */
  mode: 'single' | 'desks';
  single: Omit<LayoutDesk, 'workspaceId'>;
  room: {
    desks: LayoutDesk[];
    /** Desk the visitor was at, or null for the overview. */
    active: number | null;
  } | null;
}

/** The visitor's set-up as it is now. */
export function captureLayout(): LayoutData {
  const product = getProduct(useConfiguratorStore.getState().productId);
  const configured = useConfiguratorStore.getState().selections;
  const desks = useDesksStore.getState();
  const windows = useWorkspaceStore.getState().exportWindows();
  const heights = useMotionStore.getState().targets;
  const motion = product.motions[0];
  const heightOf = (deskKey: string) =>
    motion ? heights[motionKey(deskKey, motion.id)] : undefined;

  // In the room the panel holds the active desk's selections; the single desk's are kept aside.
  const inRoom = desks.mode === 'desks';
  const roomDesks = inRoom ? desks.desks : (desks.parked?.desks ?? []);
  const activeId = inRoom ? desks.activeDeskId : (desks.parked?.activeDeskId ?? null);
  const active = roomDesks.findIndex((d) => d.id === activeId);

  const withOptional = <T extends object>(
    base: T,
    extra: { height: number | undefined; windows: DeskWindows | undefined },
  ) => ({
    ...base,
    ...(extra.height !== undefined && { height: extra.height }),
    ...(extra.windows !== undefined && { windows: extra.windows }),
  });

  return {
    version: 1,
    mode: inRoom ? 'desks' : 'single',
    single: withOptional(
      { selections: inRoom ? (desks.singleSelections ?? configured) : configured },
      { height: heightOf(SINGLE_DESK_KEY), windows: windows[SINGLE_DESK] },
    ),
    room:
      roomDesks.length === 0
        ? null
        : {
            desks: roomDesks.map((desk) =>
              withOptional(
                { workspaceId: desk.workspaceId, selections: desk.selections },
                { height: heightOf(desk.id), windows: windows[desk.id] },
              ),
            ),
            active: active < 0 ? null : active,
          },
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

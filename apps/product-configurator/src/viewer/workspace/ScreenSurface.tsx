import { Fragment, useLayoutEffect, useRef } from 'react';
import type { WorkspaceWindow } from '@/catalog/schema';
import { currentDesk, screenWeights, SINGLE_DESK } from '@/state/setup';
import { useSetupStore } from '@/state/setupStore';
import { useViewStore, type ScreenSurfaceInfo, type WindowDrag } from '@/state/viewStore';
import { deskDropAttribute } from '@/ui/workspace/deskDrag';
import { Divider } from '@/ui/workspace/Divider';
import { EmptyScreen } from '@/ui/workspace/EmptyScreen';
import { WindowFrame } from '@/ui/workspace/WindowFrame';
import { posterId } from '@/state/posterStore';
import { cssProjection } from './cssProjection';
import { quadToBox, stillWhileMoving, useSnapshotStore } from './screenSnapshots';
import styles from './ScreenSurface.module.css';

interface ScreenSurfaceProps {
  surface: ScreenSurfaceInfo;
  windows: readonly WorkspaceWindow[];
  /** Closed workspace windows, which an empty screen offers to reopen. */
  closed: readonly WorkspaceWindow[];
}

/**
 * The live content of one screen: a DOM element the viewer lays exactly over the display
 * surface every frame (see `cssProjection`), so it rises with the desk. Every screen uses the
 * same pixel density, so text is the same physical size everywhere and a portrait screen gets
 * the narrow layout a real one would. While the view moves, a recent picture of the screen
 * stands in for its pages (see `screenSnapshots`).
 */
export function ScreenSurface({ surface, windows, closed }: ScreenSurfaceProps) {
  const { screen, widthPx, heightPx } = surface;
  const ref = useRef<HTMLDivElement>(null);
  const portrait = heightPx > widthPx;
  const sizes = useSetupStore((s) => currentDesk(s)?.windows.sizes);
  const ids = windows.map((w) => w.id);
  // In the room, the live screens belong to a desk that others can be dragged onto.
  const deskId = useSetupStore((s) => currentDesk(s)?.id ?? SINGLE_DESK);
  const weights = screenWeights(sizes ?? {}, screen.id, ids);
  const drop = useViewStore((s) => (s.drag?.over?.screen === screen.id ? s.drag.over : null));
  const dropLabel = useViewStore((s) => (s.drag ? dropDescription(s.drag, windows) : ''));
  const dropAction = useViewStore((s) => s.drag?.over?.action);
  const shot = useSnapshotStore((s) => s.shots[posterId(deskId, screen.id)]);
  const part = useSnapshotStore((s) => s.parts[posterId(deskId, screen.id)]);
  // While the view moves, a busy site's screen shows its picture instead (TinyGnomes).
  const still = stillWhileMoving(windows.map((w) => w.url));

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    cssProjection.surfaces.set(screen.id, element);
    cssProjection.invalidate?.();
    return () => {
      cssProjection.surfaces.delete(screen.id);
    };
  }, [screen.id]);

  return (
    <div
      ref={ref}
      className={styles.screen}
      data-portrait={portrait || undefined}
      data-shot={(shot || part) && still ? '' : undefined}
      {...(deskId !== SINGLE_DESK && deskDropAttribute(deskId))}
      style={{ width: widthPx, height: heightPx }}
      aria-label={`${screen.label} screen`}
    >
      {windows.length === 0 ? (
        <EmptyScreen screen={screen} closed={closed} />
      ) : (
        windows.map((window, i) => (
          <Fragment key={window.id}>
            {i > 0 && <Divider screenId={screen.id} windows={ids} index={i} stacked={portrait} />}
            <WindowFrame window={window} screenId={screen.id} grow={weights[i] ?? 1} />
          </Fragment>
        ))
      )}
      {/* The whole screen's picture, and over it a sharper close-up of part of it. */}
      {still &&
        [shot, part].map(
          (picture, i) =>
            picture && (
              <img
                key={i}
                className={styles.motionShot}
                src={picture.url}
                alt=""
                draggable={false}
                style={{
                  width: picture.width,
                  height: picture.height,
                  transform: quadToBox(picture.corners, widthPx, heightPx),
                }}
              />
            ),
        )}
      {drop && (
        <div
          className={styles.dropPreview}
          style={{
            left: drop.rect.x,
            top: drop.rect.y,
            width: drop.rect.width,
            height: drop.rect.height,
          }}
          aria-hidden="true"
        >
          <span className={styles.dropLabel}>
            <span className={styles.dropIcon}>{dropIcon(dropAction)}</span>
            {dropLabel}
          </span>
        </div>
      )}
    </div>
  );
}

/** A sign for what dropping does: swap, side by side, a new window beside it, move here. */
function dropIcon(action: string | undefined) {
  switch (action) {
    case 'swap':
      return '⇄';
    case 'before':
    case 'after':
      return '◧';
    case 'split-before':
    case 'split-after':
      return '⊞';
    default:
      return '→';
  }
}

/** What the drop preview says, e.g. "Swap with Notes". */
function dropDescription(drag: WindowDrag, windows: readonly WorkspaceWindow[]) {
  const target = drag.over;
  if (!target) return '';
  const other = windows.find((w) => w.id === target.windowId)?.title;
  switch (target.action) {
    case 'swap':
      return `Swap with ${other ?? 'this window'}`;
    case 'before':
    case 'after':
      return `Next to ${other ?? 'this window'}`;
    case 'split-before':
    case 'split-after':
      return `${drag.title} here, a new window beside it`;
    default:
      return `Move ${drag.title} here`;
  }
}

import type { KeyboardEvent, PointerEvent } from 'react';
import { currentDesk, screenWeights } from '@/state/setup';
import { useSetupStore } from '@/state/setupStore';
import { useViewStore } from '@/state/viewStore';
import styles from './Divider.module.css';

interface DividerProps {
  screenId: string;
  /** All windows on the screen, in tiling order. */
  windows: readonly string[];
  /** Index of the window after the divider; the one before it is `index - 1`. */
  index: number;
  /** Windows stacked on a portrait screen: the divider is horizontal and moves up and down. */
  stacked: boolean;
}

/** Smallest share of the pair a window can be dragged down to. */
const MIN_SHARE = 0.15;
/** Share moved by one arrow key press. */
const KEY_STEP = 0.05;

/**
 * The line between two windows on one screen. Dragging it shares the space between them
 * differently; a double click makes them equal again.
 */
export function Divider({ screenId, windows, index, stacked }: DividerProps) {
  const first = windows[index - 1] ?? '';
  const second = windows[index] ?? '';
  const resizeWindows = useSetupStore((s) => s.resizeWindows);

  // The screen's current weights; the two windows keep their combined share.
  const pair = () => {
    const sizes = currentDesk(useSetupStore.getState())?.windows.sizes ?? {};
    const weights = screenWeights(sizes, screenId, windows);
    const a = weights[index - 1] ?? 1;
    const b = weights[index] ?? 1;
    return { weights, a, total: a + b };
  };
  const setShare = (share: number) => {
    const { weights, total } = pair();
    const clamped = Math.min(1 - MIN_SHARE, Math.max(MIN_SHARE, share));
    weights[index - 1] = total * clamped;
    weights[index] = total * (1 - clamped);
    resizeWindows(screenId, windows, weights);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const screen = event.currentTarget.parentElement;
    const a = screen?.querySelector<HTMLElement>(`[data-window-id="${first}"]`);
    const b = screen?.querySelector<HTMLElement>(`[data-window-id="${second}"]`);
    if (!a || !b) return;
    // The span the two windows share, in the screen's pixels (unaffected by the 3D view).
    const start = stacked ? a.offsetTop : a.offsetLeft;
    const end = stacked ? b.offsetTop + b.offsetHeight : b.offsetLeft + b.offsetWidth;
    const sizeA = stacked ? a.offsetHeight : a.offsetWidth;
    const sizeB = stacked ? b.offsetHeight : b.offsetWidth;
    const gap = end - start - sizeA - sizeB;

    const move = (e: globalThis.PointerEvent) => {
      const point = useViewStore.getState().locateOnScreen?.(screenId, e.clientX, e.clientY);
      if (!point) return;
      const at = (stacked ? point.y : point.x) - start - gap / 2;
      setShare(at / (sizeA + sizeB));
    };
    const up = () => {
      document.body.classList.remove('ws-dragging', stacked ? 'ws-resizing-rows' : 'ws-resizing');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    // Iframes would swallow the pointer while it crosses them.
    document.body.classList.add('ws-dragging', stacked ? 'ws-resizing-rows' : 'ws-resizing');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const back = stacked ? 'ArrowUp' : 'ArrowLeft';
    const forward = stacked ? 'ArrowDown' : 'ArrowRight';
    if (event.key !== back && event.key !== forward) return;
    event.preventDefault();
    const { a, total } = pair();
    setShare(a / total + (event.key === forward ? KEY_STEP : -KEY_STEP));
  };

  return (
    <div
      className={styles.divider}
      data-stacked={stacked || undefined}
      role="separator"
      aria-orientation={stacked ? 'horizontal' : 'vertical'}
      aria-label="Resize windows"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onDoubleClick={() => setShare(0.5)}
      onKeyDown={onKeyDown}
    />
  );
}

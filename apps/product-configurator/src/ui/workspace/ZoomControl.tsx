import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { clampZoom, FIT_WIDTH, type WindowZoom } from '@/state/setup';
import styles from './ZoomControl.module.css';

interface ZoomControlProps {
  /** The window's title, for the controls' labels. */
  title: string;
  zoom: WindowZoom;
  /** The scale the page is shown at (a fitted page's too). */
  factor: number;
  onZoom: (zoom: WindowZoom) => void;
  /** The scale shown while the percentage is dragged; null when the drag ends. */
  onPreview: (factor: number | null) => void;
}

/** Movement that makes a press on the percentage a drag, not a click. */
const DRAG_THRESHOLD = 4;

/**
 * A window's page zoom in its title bar: the percentage the page is shown at, and "Fit desktop
 * width". Drag the percentage sideways to zoom (a point per pixel, right is in), click it to
 * type one, or use the arrow keys (Shift for ten points) and Home for 100%. Any of these
 * leaves Fit.
 */
export function ZoomControl({ title, zoom, factor, onZoom, onPreview }: ZoomControlProps) {
  const [editing, setEditing] = useState(false);
  const [dragged, setDragged] = useState<number | null>(null);
  const press = useRef<{ x: number; start: number; dragging: boolean } | null>(null);
  const percent = Math.round((dragged ?? factor) * 100);
  const fit = zoom === 'fit';

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    // Not the title bar's window drag, nor a text selection.
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    press.current = { x: event.clientX, start: Math.round(factor * 100), dragging: false };
  };
  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const at = press.current;
    if (!at) return;
    const dx = event.clientX - at.x;
    if (!at.dragging && Math.abs(dx) <= DRAG_THRESHOLD) return;
    at.dragging = true;
    const next = clampZoom((at.start + dx) / 100);
    setDragged(next);
    onPreview(next);
  };
  const onPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const at = press.current;
    press.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!at) return;
    if (at.dragging) {
      if (dragged !== null) onZoom(dragged);
    } else {
      setEditing(true);
    }
    setDragged(null);
    onPreview(null);
  };
  const onPointerCancel = () => {
    press.current = null;
    setDragged(null);
    onPreview(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = event.shiftKey ? 10 : 1;
    const change: Record<string, number> = {
      ArrowRight: step,
      ArrowUp: step,
      ArrowLeft: -step,
      ArrowDown: -step,
    };
    if (event.key === 'Home') {
      event.preventDefault();
      onZoom(1);
    } else if (event.key in change) {
      event.preventDefault();
      onZoom(clampZoom((Math.round(factor * 100) + (change[event.key] ?? 0)) / 100));
    }
  };

  return (
    <div className={styles.zoom}>
      {editing ? (
        <PercentInput
          title={title}
          percent={Math.round(factor * 100)}
          onDone={(value) => {
            setEditing(false);
            if (value !== null) onZoom(clampZoom(value / 100));
          }}
        />
      ) : (
        <button
          type="button"
          className={styles.percent}
          aria-label={`Zoom of ${title}: ${percent}%. Drag sideways or use the arrow keys to change it, or press to type one.`}
          title="Drag sideways to zoom · click to type · Home for 100%"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onKeyDown={onKeyDown}
          // Enter or Space (a click with no pointer) types a percentage, as a click does.
          onClick={(event) => {
            if (event.detail === 0) setEditing(true);
          }}
        >
          {percent}%
        </button>
      )}
      <button
        type="button"
        className={styles.fit}
        aria-pressed={fit}
        aria-label={`Fit desktop width (${FIT_WIDTH}px) in ${title}`}
        title={
          fit
            ? `The page as a ${FIT_WIDTH}px wide browser shows it. Click for 100%.`
            : `Fit desktop width: the page as a ${FIT_WIDTH}px wide browser shows it`
        }
        onClick={() => onZoom(fit ? 1 : 'fit')}
      >
        Fit
      </button>
    </div>
  );
}

/** Typing a percentage: Enter or leaving it sets it, Escape keeps the old one. */
function PercentInput({
  title,
  percent,
  onDone,
}: {
  title: string;
  percent: number;
  onDone: (value: number | null) => void;
}) {
  const cancelled = useRef(false);
  const commit = (text: string) => {
    if (cancelled.current) return onDone(null);
    const value = Number.parseFloat(text.replace('%', '').trim());
    onDone(Number.isFinite(value) && value > 0 ? value : null);
  };
  return (
    <input
      className={styles.input}
      aria-label={`Zoom of ${title}, in percent`}
      defaultValue={String(percent)}
      inputMode="decimal"
      // It opens because the visitor asked to type.
      autoFocus
      onFocus={(event) => event.currentTarget.select()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          cancelled.current = true;
          event.currentTarget.blur();
        }
      }}
      onBlur={(event) => commit(event.currentTarget.value)}
    />
  );
}

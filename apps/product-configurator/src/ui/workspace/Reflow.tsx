import { useState } from 'react';
import { desktopReflow, type ReflowResult } from '@/desktop';
import { clampZoom, type WindowZoom } from '@/state/setup';
import styles from './Reflow.module.css';

/** A site frame's name: how the desktop app finds the page to reflow. */
export const frameName = (windowId: string) => `vr-${windowId}`;

/** Whether reflow can be offered (the desktop app; not on the website). */
export const canReflow = !!desktopReflow;

interface ReflowState {
  sections: { label: string; width: number }[];
  shown: number | null;
  busy: boolean;
  message: string | null;
  /** The zoom before a column was fitted, to go back to with the full page. */
  zoomBefore: WindowZoom | null;
}

/**
 * Reflow (experimental, desktop app): a site laid out in columns, one column at a time across
 * the window, like its mobile version. `button` goes in the title bar, `tabs` over the page.
 */
export function useReflow(windowId: string, zoom: WindowZoom, setZoom: (zoom: WindowZoom) => void) {
  const [state, setState] = useState<ReflowState>({
    sections: [],
    shown: null,
    busy: false,
    message: null,
    zoomBefore: null,
  });
  const active = state.sections.length > 0 || state.message !== null;

  const run = async (command: Parameters<NonNullable<typeof desktopReflow>>[1]) => {
    if (!desktopReflow) return null;
    setState((s) => ({ ...s, busy: true }));
    const result: ReflowResult | null = await desktopReflow(frameName(windowId), command).catch(
      () => null,
    );
    setState((s) => ({ ...s, busy: false }));
    return result;
  };

  const analyse = async () => {
    const result = await run({ action: 'analyse' });
    const sections = result?.sections ?? [];
    setState((s) => ({
      ...s,
      sections,
      shown: result?.shown ?? null,
      message:
        result?.error ??
        (sections.length < 2 ? 'No columns found: this page already fits one column.' : null),
    }));
  };

  const show = async (index: number | null) => {
    if (index === null) {
      await run({ action: 'reset' });
      if (state.zoomBefore !== null) setZoom(state.zoomBefore);
      setState((s) => ({ ...s, shown: null, zoomBefore: null }));
      return;
    }
    const result = await run({ action: 'show', index });
    // Still wider than the window (a column with a fixed width): zoom out just enough.
    const overflow = result?.overflow ?? 1;
    const before = state.zoomBefore ?? zoom;
    if (overflow > 1.02) setZoom(clampZoom(1 / overflow));
    else if (state.zoomBefore !== null) setZoom(state.zoomBefore);
    setState((s) => ({ ...s, shown: result?.shown ?? index, zoomBefore: before }));
  };

  const close = async () => {
    if (state.shown !== null) await show(null);
    setState((s) => ({ ...s, sections: [], message: null }));
  };

  const button = canReflow ? (
    <button
      type="button"
      className={styles.button}
      data-active={active || undefined}
      disabled={state.busy}
      onClick={() => void (active ? close() : analyse())}
      title="Reflow (experimental): show the page's columns one at a time, like a phone layout"
      aria-pressed={active}
    >
      Reflow
    </button>
  ) : null;

  const tabs = active ? (
    <div className={styles.tabs} role="tablist" aria-label="Page columns">
      {state.message ? (
        <span className={styles.message}>{state.message}</span>
      ) : (
        <>
          <button
            type="button"
            role="tab"
            aria-selected={state.shown === null}
            className={styles.tab}
            onClick={() => void show(null)}
          >
            Full page
          </button>
          {state.sections.map((section, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={state.shown === i}
              className={styles.tab}
              disabled={state.busy}
              onClick={() => void show(i)}
            >
              {section.label}
            </button>
          ))}
        </>
      )}
    </div>
  ) : null;

  return { button, tabs };
}

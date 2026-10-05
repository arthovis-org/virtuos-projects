import type { KeyboardEvent } from 'react';
import type { Motion } from '@/catalog/schema';
import { motionKey, useMotionStore } from '@/state/motionStore';
import styles from './MotionControl.module.css';

interface MotionControlProps {
  motion: Motion;
}

/** Decimal places needed to show values on the motion's step grid (1 -> 0, 0.5 -> 1). */
function decimalsFor(step: number) {
  return Math.max(0, Math.ceil(-Math.log10(step) - 1e-9));
}

/**
 * A desk-controller style widget: hold ▲/▼ to move, drag the slider to send it to a value,
 * or pick a preset. The readout follows the animated value, like the display on a real
 * desk controller.
 */
export function MotionControl({ motion }: MotionControlProps) {
  // Until the viewer has measured the model, a motion without `initial` has no value yet.
  // The desk the visitor is at (each desk of unlimited desks mode has its own height).
  const current = useMotionStore((state) => state.current[motionKey(state.deskKey, motion.id)]);
  const target = useMotionStore(
    (state) => state.targets[motionKey(state.deskKey, motion.id)] ?? current,
  );
  const setTarget = useMotionStore((state) => state.setTarget);
  const stop = useMotionStore((state) => state.stop);
  const setPeek = useMotionStore((state) => state.setPeek);

  const decimals = decimalsFor(motion.step);
  const format = (value: number | undefined) =>
    value === undefined ? '–' : value.toFixed(decimals);
  const ready = current !== undefined;

  const holdProps = (direction: 1 | -1) => ({
    onPointerDown: () => setTarget(motion, direction > 0 ? motion.max : motion.min),
    onPointerUp: () => stop(motion.id),
    onPointerLeave: () => stop(motion.id),
    onPointerCancel: () => stop(motion.id),
    onKeyDown: (event: KeyboardEvent) => {
      if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) {
        event.preventDefault();
        setTarget(motion, direction > 0 ? motion.max : motion.min);
      }
    },
    onKeyUp: (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') stop(motion.id);
    },
  });

  return (
    // On the controls, the viewer shows the desk from the side (see HeightInset).
    <div
      className={styles.control}
      onPointerEnter={() => setPeek(true)}
      onPointerLeave={() => setPeek(false)}
      onFocus={() => setPeek(true)}
      onBlur={() => setPeek(false)}
    >
      <div className={styles.pad}>
        <button
          type="button"
          className={styles.hold}
          disabled={!ready}
          aria-label={`Hold to raise ${motion.label.toLowerCase()}`}
          {...holdProps(1)}
        >
          ▲
        </button>
        <output className={styles.readout} aria-live="off">
          {format(current)}
          <span className={styles.unit}>{motion.unit}</span>
        </output>
        <button
          type="button"
          className={styles.hold}
          disabled={!ready}
          aria-label={`Hold to lower ${motion.label.toLowerCase()}`}
          {...holdProps(-1)}
        >
          ▼
        </button>
      </div>

      <input
        type="range"
        className={styles.slider}
        min={motion.min}
        max={motion.max}
        step={motion.step}
        value={target ?? motion.min}
        disabled={!ready}
        aria-label={motion.label}
        aria-valuetext={`${format(target)} ${motion.unit}`}
        onChange={(event) => setTarget(motion, Number(event.target.value))}
      />
      <div className={styles.range} aria-hidden="true">
        <span>
          {format(motion.min)} {motion.unit}
        </span>
        <span>
          {format(motion.max)} {motion.unit}
        </span>
      </div>

      {motion.presets.length > 0 && (
        <div className={styles.presets}>
          {motion.presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={styles.preset}
              disabled={!ready}
              aria-pressed={
                target !== undefined && Math.abs(target - preset.value) < motion.step / 2
              }
              onClick={() => setTarget(motion, preset.value)}
            >
              {preset.label}
              <span className={styles.presetValue}>{format(preset.value)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

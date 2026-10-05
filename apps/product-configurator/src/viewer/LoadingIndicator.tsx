import { Html, useProgress } from '@react-three/drei';
import { useEffect, useState } from 'react';
import styles from './LoadingIndicator.module.css';

/** Suspense fallback rendered inside the canvas while the glTF downloads. */
export function LoadingIndicator() {
  // Loads start while other components render (a texture of a decal, say), and drei reports
  // progress right then; taking it a moment later keeps React from updating this component
  // in the middle of another's render.
  const [progress, setProgress] = useState(() => useProgress.getState().progress);
  useEffect(() => {
    let live = true;
    const unsubscribe = useProgress.subscribe((state) =>
      queueMicrotask(() => {
        if (live) setProgress(state.progress);
      }),
    );
    return () => {
      live = false;
      unsubscribe();
    };
  }, []);
  return (
    <Html center>
      <div className={styles.indicator} role="status" aria-live="polite">
        <span className={styles.spinner} />
        <span>Loading model {Math.round(progress)}%</span>
      </div>
    </Html>
  );
}

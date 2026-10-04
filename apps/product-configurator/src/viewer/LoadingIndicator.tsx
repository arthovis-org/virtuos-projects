import { Html, useProgress } from '@react-three/drei';
import styles from './LoadingIndicator.module.css';

/** Suspense fallback rendered inside the canvas while the glTF downloads. */
export function LoadingIndicator() {
  const { progress } = useProgress();
  return (
    <Html center>
      <div className={styles.indicator} role="status" aria-live="polite">
        <span className={styles.spinner} />
        <span>Loading model {Math.round(progress)}%</span>
      </div>
    </Html>
  );
}

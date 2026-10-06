import { useEffect, useState } from 'react';
import { desktopUpdates } from '@/desktop';
import styles from './UpdateNotice.module.css';

/**
 * In the desktop app: once an update has downloaded, a notice to restart for it now, or later
 * (it installs when the app is next closed anyway).
 */
export function UpdateNotice() {
  const [version, setVersion] = useState<string | null>(null);
  const [later, setLater] = useState(false);

  useEffect(() => {
    if (!desktopUpdates) return;
    let live = true;
    void desktopUpdates.ready().then((ready) => {
      if (live && ready) setVersion(ready);
    });
    const stop = desktopUpdates.onReady((ready) => {
      setVersion(ready);
      setLater(false);
    });
    return () => {
      live = false;
      stop();
    };
  }, []);

  if (!desktopUpdates || !version || later) return null;
  return (
    <div className={styles.notice} role="status">
      <div className={styles.text}>
        <strong>Version {version} is ready</strong>
        <span>Restart the app to use it, or it installs when you next close the app.</span>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.later} onClick={() => setLater(true)}>
          Later
        </button>
        <button
          type="button"
          className={styles.restart}
          onClick={() => void desktopUpdates?.restart()}
        >
          Restart now
        </button>
      </div>
    </div>
  );
}

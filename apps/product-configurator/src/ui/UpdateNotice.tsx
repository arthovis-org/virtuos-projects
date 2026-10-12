import { useEffect, useState } from 'react';
import { desktopUpdates, type UpdateStatus } from '@/desktop';
import styles from './UpdateNotice.module.css';

/** How long the check's outcome stays up when there's nothing to install, in milliseconds. */
const OUTCOME_MS = { current: 2500, failed: 4000 };

const LABELS: Record<NonNullable<UpdateStatus>, string> = {
  checking: 'Checking for updates…',
  downloading: 'Downloading an update…',
  current: 'Up to date',
  failed: 'Couldn’t check for updates',
};

/**
 * In the desktop app: while the launch's update check runs, a small label saying so (then
 * that the app is up to date, or that an update downloads). Once an update has downloaded, a
 * notice to restart for it now, or later (it installs when the app is next closed anyway).
 */
export function UpdateNotice() {
  const [version, setVersion] = useState<string | null>(null);
  const [later, setLater] = useState(false);
  const [status, setStatus] = useState<UpdateStatus>(null);

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
    void desktopUpdates.status?.().then((s) => {
      if (live) setStatus(s);
    });
    const stopStatus = desktopUpdates.onStatus?.(setStatus);
    return () => {
      live = false;
      stop();
      stopStatus?.();
    };
  }, []);

  // The outcome is shown for a moment, then the label goes.
  useEffect(() => {
    if (status !== 'current' && status !== 'failed') return;
    const timer = window.setTimeout(() => setStatus(null), OUTCOME_MS[status]);
    return () => window.clearTimeout(timer);
  }, [status]);

  if (!desktopUpdates) return null;
  if (!version || later) {
    if (!status) return null;
    const busy = status === 'checking' || status === 'downloading';
    return (
      <div className={styles.check} role="status" aria-live="polite">
        {busy ? (
          <span className={styles.spinner} aria-hidden="true" />
        ) : (
          <span className={styles.mark} aria-hidden="true">
            {status === 'current' ? '✓' : '!'}
          </span>
        )}
        {LABELS[status]}
      </div>
    );
  }
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

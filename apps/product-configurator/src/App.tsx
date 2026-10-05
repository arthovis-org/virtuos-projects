import { lazy, Suspense, useEffect, useState } from 'react';
import { useLayoutsStore } from '@/layouts/layoutsStore';
import { syncAddressBar } from '@/state/shareLink';
import { ConfiguratorPanel } from '@/ui/ConfiguratorPanel';
import { Header } from '@/ui/Header';
import { SheetBar } from '@/ui/SheetBar';
import styles from './App.module.css';

// Three.js is most of the bundle; loading the viewer lazily lets the panel render first.
const Scene = lazy(() => import('@/viewer/Scene').then((module) => ({ default: module.Scene })));

/** The layout link has been opened (once per page). */
let openedLink = false;

export function App() {
  // The stores start from `?product=…&c=…` (or `&desks=…`); keep the address bar in sync so
  // the current URL is always shareable.
  useEffect(() => syncAddressBar(), []);
  // A layout's link (?layout=<id>) opens that layout, once (React's development checks run
  // effects twice, which built the room twice).
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('layout');
    if (!id || openedLink) return;
    openedLink = true;
    useLayoutsStore
      .getState()
      .open(id)
      .catch((error: unknown) => {
        console.warn('[configurator] could not open layout', id, error);
        window.alert(
          `This layout could not be opened: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      });
  }, []);
  // On a phone the panel is a bottom sheet, closed at first so the desk has the screen.
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className={styles.app}>
      <Header />
      <main className={styles.viewer}>
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </main>
      <aside className={styles.panel} data-open={sheetOpen || undefined}>
        <SheetBar open={sheetOpen} onToggle={() => setSheetOpen((open) => !open)} />
        <div className={styles.sheet}>
          <ConfiguratorPanel />
        </div>
      </aside>
    </div>
  );
}

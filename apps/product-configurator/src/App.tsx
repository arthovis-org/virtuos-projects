import { lazy, Suspense, useEffect, useState } from 'react';
import { syncAddressBar } from '@/state/shareLink';
import { ConfiguratorPanel } from '@/ui/ConfiguratorPanel';
import { Header } from '@/ui/Header';
import { SheetBar } from '@/ui/SheetBar';
import styles from './App.module.css';

// Three.js is most of the bundle; loading the viewer lazily lets the panel render first.
const Scene = lazy(() => import('@/viewer/Scene').then((module) => ({ default: module.Scene })));

export function App() {
  // The stores start from `?product=…&c=…` (or `&desks=…`); keep the address bar in sync so
  // the current URL is always shareable.
  useEffect(() => syncAddressBar(), []);
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

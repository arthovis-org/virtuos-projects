import { lazy, Suspense, useEffect } from 'react';
import { useConfiguratorStore } from '@/state/configuratorStore';
import { ConfiguratorPanel } from '@/ui/ConfiguratorPanel';
import { Header } from '@/ui/Header';
import styles from './App.module.css';

// Three.js is most of the bundle; loading the viewer lazily lets the panel render first.
const Scene = lazy(() => import('@/viewer/Scene').then((module) => ({ default: module.Scene })));

export function App() {
  const serialize = useConfiguratorStore((state) => state.serialize);

  // The store starts from `?product=…&c=…`; keep the address bar in sync so the
  // current URL is always shareable.
  useEffect(
    () =>
      useConfiguratorStore.subscribe(() => {
        window.history.replaceState(null, '', `${window.location.pathname}${serialize()}`);
      }),
    [serialize],
  );

  return (
    <div className={styles.app}>
      <Header />
      <main className={styles.viewer}>
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </main>
      <aside className={styles.panel}>
        <ConfiguratorPanel />
      </aside>
    </div>
  );
}

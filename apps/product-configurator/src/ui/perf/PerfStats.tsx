import { useEffect, useState, type ReactNode } from 'react';
import { desktopMetrics, onDesktopTogglePerf, type ProcessMetric } from '@/desktop';
import { frameCounts } from '@/ui/workspace/framePool';
import { useSnapshotStore } from '@/viewer/workspace/screenSnapshots';
import { perfProbe } from './perfProbe';
import styles from './PerfStats.module.css';

/** Remembered in this browser: the panel is a developer's, not a visitor's. */
const STORAGE_KEY = 'virtuos:perf-stats';
/** How long frames are measured over, and slow tasks counted over (ms). */
const FRAME_WINDOW = 2000;
const TASK_WINDOW = 10_000;

interface Stats {
  fps: number;
  frameMs: number;
  worstMs: number;
  slowTasks: number;
  renders: number;
  draws: number;
  triangles: number;
  heapMb: number | null;
  heapLimitMb: number | null;
  live: number;
  parked: number;
  pictures: number;
}

interface AppStats {
  cpu: number;
  memoryMb: number;
  processes: number;
  gpuMb: number;
  renderers: number;
}

const readOn = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
};

const saveOn = (on: boolean) => {
  try {
    if (on) localStorage.setItem(STORAGE_KEY, 'on');
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private mode: on for this visit only.
  }
};

/**
 * Performance figures in the bottom right corner, for development: frames a second and their
 * times, slow tasks, the 3D view's work, the page's memory, the windows (live and parked) and
 * the screens' pictures, and in the desktop app its processes' CPU and memory (each site runs
 * in one of its own). Ctrl+Shift+P shows and hides it; it stays as it was left.
 */
export function PerfStats() {
  const [on, setOn] = useState(readOn);

  useEffect(() => {
    const toggle = () =>
      setOn((was) => {
        saveOn(!was);
        return !was;
      });
    // In the desktop app it comes from the app, which sees the keys wherever the focus is.
    if (onDesktopTogglePerf) return onDesktopTogglePerf(toggle);
    const key = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  if (!on) return null;
  return (
    <Panel
      onClose={() => {
        saveOn(false);
        setOn(false);
      }}
    />
  );
}

function Panel({ onClose }: { onClose: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [app, setApp] = useState<AppStats | null>(null);

  useEffect(() => {
    // Every frame's time, and every slow task's end.
    const frames: { at: number; ms: number }[] = [];
    const tasks: number[] = [];
    let last = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      frames.push({ at: now, ms: now - last });
      last = now;
      raf = requestAnimationFrame(tick);
    });
    let observer: PerformanceObserver | null = null;
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) tasks.push(entry.startTime + entry.duration);
      });
      observer.observe({ type: 'longtask', buffered: false });
    } catch {
      // No long task timing here.
    }
    let rendersBefore = perfProbe.renderer?.info.render.frame ?? 0;
    let readAt = performance.now();

    const read = () => {
      const now = performance.now();
      while (frames.length > 0 && (frames[0]?.at ?? now) < now - FRAME_WINDOW) frames.shift();
      while (tasks.length > 0 && (tasks[0] ?? now) < now - TASK_WINDOW) tasks.shift();
      const times = frames.map((f) => f.ms).sort((a, b) => a - b);
      const median = times[Math.floor(times.length / 2)] ?? 0;
      const info = perfProbe.renderer?.info;
      const rendered = info?.render.frame ?? 0;
      const renders = ((rendered - rendersBefore) * 1000) / Math.max(1, now - readAt);
      rendersBefore = rendered;
      readAt = now;
      const memory = (
        performance as Performance & {
          memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
        }
      ).memory;
      const shots = useSnapshotStore.getState().shots;
      const { live, parked } = frameCounts();
      setStats({
        fps: (frames.length * 1000) / FRAME_WINDOW,
        frameMs: median,
        worstMs: times[times.length - 1] ?? 0,
        slowTasks: tasks.length,
        renders,
        draws: info?.render.calls ?? 0,
        triangles: info?.render.triangles ?? 0,
        heapMb: memory ? memory.usedJSHeapSize / 2 ** 20 : null,
        heapLimitMb: memory ? memory.jsHeapSizeLimit / 2 ** 20 : null,
        live,
        parked,
        pictures: Object.values(shots).reduce((n, layers) => n + layers.length, 0),
      });
    };
    const timer = window.setInterval(read, 500);

    // The desktop app's processes, once a second (its CPU is measured between two readings).
    const readApp = async () => {
      const metrics = await desktopMetrics?.().catch(() => null);
      if (metrics) setApp(appStats(metrics));
    };
    const appTimer = desktopMetrics ? window.setInterval(() => void readApp(), 1000) : 0;
    void readApp();

    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
      window.clearInterval(timer);
      window.clearInterval(appTimer);
    };
  }, []);

  return (
    <aside className={styles.panel} aria-label="Performance">
      <header className={styles.head}>
        <span>Performance</span>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Hide">
          ×
        </button>
      </header>
      {stats && (
        <dl className={styles.rows}>
          <Row label="FPS" warn={stats.fps < 50}>
            {Math.round(stats.fps)} · {stats.frameMs.toFixed(1)} ms, worst{' '}
            {Math.round(stats.worstMs)}
          </Row>
          <Row label="Slow tasks" warn={stats.slowTasks > 0}>
            {stats.slowTasks} in 10 s
          </Row>
          <Row label="3D">
            {Math.round(stats.renders)} passes/s · {stats.draws} draws ·{' '}
            {formatCount(stats.triangles)} tris
          </Row>
          {stats.heapMb !== null && (
            <Row label="Page memory">
              {Math.round(stats.heapMb)} MB of {Math.round(stats.heapLimitMb ?? 0)}
            </Row>
          )}
          <Row label="Windows">
            {stats.live} live · {stats.parked} parked · {stats.pictures} pictures
          </Row>
          {app && (
            <>
              <Row label="App CPU" warn={app.cpu > 150}>
                {Math.round(app.cpu)}% of a core · {app.processes} processes
              </Row>
              <Row label="App memory">
                {formatMb(app.memoryMb)} · GPU {formatMb(app.gpuMb)} · {app.renderers} renderers
              </Row>
            </>
          )}
        </dl>
      )}
      <p className={styles.hint}>Ctrl+Shift+P to hide</p>
    </aside>
  );
}

function Row({
  label,
  warn = false,
  children,
}: {
  label: string;
  warn?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={styles.row} data-warn={warn || undefined}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function appStats(metrics: ProcessMetric[]): AppStats {
  let cpu = 0;
  let memory = 0;
  let gpu = 0;
  let renderers = 0;
  for (const process of metrics) {
    cpu += process.cpu;
    memory += process.memory;
    if (process.type === 'GPU') gpu += process.memory;
    if (process.type === 'Tab') renderers++;
  }
  return {
    cpu,
    memoryMb: memory / 1024,
    processes: metrics.length,
    gpuMb: gpu / 1024,
    renderers,
  };
}

const formatMb = (mb: number) =>
  mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;

const formatCount = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n);

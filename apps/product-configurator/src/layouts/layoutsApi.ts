/**
 * Talks to the layouts Worker (services/layouts-worker), and keeps the list of layouts this
 * browser saved, with their private edit keys, in local storage.
 */
import { isLayoutData, type LayoutData } from './layoutData';

/** The layouts Worker; without it there is no Layouts button. */
export const LAYOUTS_URL = import.meta.env.VITE_LAYOUTS_URL?.replace(/\/$/, '');

export interface SavedLayout {
  id: string;
  name: string;
  data: LayoutData;
  updatedAt: number;
}

/** A layout this browser saved; its key allows changing and deleting it. */
export interface MyLayout {
  id: string;
  name: string;
  key: string;
  updatedAt: number;
}

async function call<T>(path: string, init: RequestInit = {}, key?: string): Promise<T> {
  if (!LAYOUTS_URL) throw new Error('Layouts are not set up on this site');
  const response = await fetch(`${LAYOUTS_URL}/layouts${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(key && { Authorization: `Bearer ${key}` }),
    },
  });
  if (response.status === 204) return undefined as T;
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(body.error ?? 'Something went wrong; try again');
  return body as T;
}

export async function createLayout(name: string, product: string, data: LayoutData) {
  return call<{ id: string; key: string; updatedAt: number }>('', {
    method: 'POST',
    body: JSON.stringify({ name, product, data }),
  });
}

export async function fetchLayout(id: string): Promise<SavedLayout & { product: string }> {
  const layout = await call<SavedLayout & { product: string }>(`/${encodeURIComponent(id)}`);
  if (!isLayoutData(layout.data)) throw new Error('This layout is from a newer version');
  return layout;
}

export async function updateLayout(
  id: string,
  key: string,
  change: { name?: string; data?: LayoutData },
) {
  return call<{ id: string; updatedAt: number }>(
    `/${encodeURIComponent(id)}`,
    { method: 'PUT', body: JSON.stringify(change) },
    key,
  );
}

export async function deleteLayout(id: string, key: string) {
  await call<undefined>(`/${encodeURIComponent(id)}`, { method: 'DELETE' }, key);
}

/** The link that opens a layout. */
export const layoutLink = (id: string) =>
  `${window.location.origin}${window.location.pathname}?layout=${encodeURIComponent(id)}`;

const STORAGE_KEY = 'virtuos.layouts';

/** This browser's layouts, newest first; empty when storage is unavailable. */
export function readMyLayouts(): MyLayout[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    // Whatever is stored may be anything; keep only entries that look like layouts.
    return Array.isArray(parsed)
      ? (parsed as unknown[]).filter(
          (l): l is MyLayout =>
            !!l &&
            typeof (l as MyLayout).id === 'string' &&
            typeof (l as MyLayout).key === 'string',
        )
      : [];
  } catch {
    return [];
  }
}

export function writeMyLayouts(layouts: readonly MyLayout[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts));
  } catch {
    // Private browsing or storage full: the layout is still saved online, just not listed here.
  }
}

import { useEffect, useState } from 'react';
import { desktopSiteStyles } from '@/desktop';

/** Whether `url` is on one of `hosts` (a host or its subdomains). */
export function onHosts(url: string, hosts: readonly string[]): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return hosts.some((h) => host === h || host.endsWith(`.${h}`));
}

/**
 * The desktop app's adapted layouts for some desktop-only sites (TinyGnomes) and its switch
 * between them and the sites as they are: offered while one of `urls` is such a site. Null
 * outside the app, or with none of them open.
 */
export function useSiteLayouts(urls: readonly string[]) {
  const [state, setState] = useState<{ enabled: boolean; hosts: string[] } | null>(null);
  useEffect(() => {
    if (!desktopSiteStyles) return;
    let current = true;
    void desktopSiteStyles.state().then((s) => {
      if (current) setState(s);
    });
    return () => {
      current = false;
    };
  }, []);

  if (!desktopSiteStyles || !state || !urls.some((url) => onHosts(url, state.hosts))) return null;
  const styles = desktopSiteStyles;
  return {
    adapted: state.enabled,
    setAdapted: (on: boolean) => {
      setState((s) => s && { ...s, enabled: on });
      void styles.set(on).then((enabled) => setState((s) => s && { ...s, enabled }));
    },
  };
}

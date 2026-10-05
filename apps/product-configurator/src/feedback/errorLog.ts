/**
 * The last few errors on the page, sent along with feedback: a visitor reporting "it went
 * blank" rarely knows what broke, and this usually says.
 */
const MAX = 10;
const errors: string[] = [];

const remember = (text: string) => {
  errors.push(`${new Date().toISOString().slice(11, 19)} ${text}`);
  if (errors.length > MAX) errors.shift();
};

/** Starts listening; call once, early. */
export function installErrorLog() {
  window.addEventListener('error', (event) => {
    remember(`${event.message} (${event.filename.split('/').pop() ?? ''}:${event.lineno})`);
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason: unknown = event.reason;
    remember(`Unhandled: ${reason instanceof Error ? reason.message : String(reason)}`);
  });
}

export const recentErrors = (): readonly string[] => [...errors];

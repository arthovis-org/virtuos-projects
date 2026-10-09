/**
 * The agent apps' addresses (`agent:` windows, drawn by the configurator itself), on their own
 * so the sheet can read and write them like any site's address.
 */

/** The agent apps, as window addresses. */
export const AGENT_APPS = {
  doc: 'agent:doc',
  board: 'agent:board',
  log: 'agent:log',
  sources: 'agent:sources',
} as const;
export type AgentApp = keyof typeof AGENT_APPS;

/** Each app's window: its id on a desk, and the title it shows. */
export const AGENT_APP_WINDOWS: Record<AgentApp, { id: string; title: string }> = {
  doc: { id: 'agent-doc', title: 'Work' },
  board: { id: 'agent-board', title: 'Plan' },
  sources: { id: 'agent-source', title: 'Sources' },
  log: { id: 'agent-log', title: 'Activity' },
};

/** An agent app's window, or none (a site). */
export function agentAppOf(url: string): AgentApp | null {
  const text = url.trim().toLowerCase();
  if (!text.startsWith('agent:')) return null;
  const app = text.slice('agent:'.length);
  return app in AGENT_APPS ? (app as AgentApp) : null;
}

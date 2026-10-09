/**
 * Agents' desks: the room a team works in, and what their screens show. Each agent desk's
 * screens hold its agent apps (`agent:` windows, drawn by the configurator itself): the work
 * being written on the main screen, the plan on the desk screen, the activity log on one side
 * and, on the other, the sources the agent reads (real sites, opened as it reads them).
 */
import type { ProductDefinition, WorkspaceWindow } from '@/catalog/schema';
import { getProduct } from '@/catalog';
import { mainScreen } from '@/sheet/sheetPlan';
import { loadSetup } from '@/state/actions';
import { newDesk, workspaceById, type DeskWindows } from '@/state/setup';
import { currentSetup, useSetupStore } from '@/state/setupStore';
import { useAgentStore } from './agentStore';
import type { TeamPreset } from './teams';
import type { AgentProfile, Source } from './types';

/** The agent apps, as window addresses. */
export const AGENT_APPS = {
  doc: 'agent:doc',
  board: 'agent:board',
  log: 'agent:log',
  sources: 'agent:sources',
} as const;
export type AgentApp = keyof typeof AGENT_APPS;

/** An agent app's window, or none (a site). */
export function agentAppOf(url: string): AgentApp | null {
  if (!url.startsWith('agent:')) return null;
  const app = url.slice('agent:'.length);
  return app in AGENT_APPS ? (app as AgentApp) : null;
}

/** The screens an agent desk uses for what: main, the one lying on the desk, and the sides. */
export function agentScreens(product: ProductDefinition) {
  const main = mainScreen(product)?.id ?? product.screens[0]?.id ?? '';
  const others = product.screens.filter((s) => s.id !== main);
  const byLabel = (label: string) =>
    others.find((s) => s.label.toLowerCase() === label.toLowerCase())?.id;
  const flat = byLabel('desk') ?? others.at(-1)?.id ?? main;
  const left = byLabel('left') ?? others.find((s) => s.id !== flat)?.id ?? main;
  const right = byLabel('right') ?? others.find((s) => s.id !== flat && s.id !== left)?.id ?? left;
  return { main, flat, left, right };
}

const SOURCE_WINDOW = 'agent-source';

/** Agent desks' height (cm): seated work, not as low as the Sit preset. */
export const AGENT_DESK_HEIGHT = 85;

/** An agent desk's windows: its apps on its screens, the workspace's own sites closed. */
export function agentWindows(product: ProductDefinition, workspaceId: string): DeskWindows {
  const screens = agentScreens(product);
  const apps: WorkspaceWindow[] = [
    { id: 'agent-doc', title: 'Work', url: AGENT_APPS.doc, screen: screens.main },
    { id: 'agent-board', title: 'Plan', url: AGENT_APPS.board, screen: screens.flat },
    { id: SOURCE_WINDOW, title: 'Sources', url: AGENT_APPS.sources, screen: screens.left },
    { id: 'agent-log', title: 'Activity', url: AGENT_APPS.log, screen: screens.right },
  ];
  const workspace = workspaceById(product, workspaceId);
  return {
    placement: Object.fromEntries(apps.map((w) => [w.id, w.screen])),
    order: apps.map((w) => w.id),
    closed: (workspace?.windows ?? []).map((w) => w.id),
    opened: apps,
    sizes: {},
  };
}

/**
 * Shows a source the agent reads in its sources window (the real page, replacing the last).
 */
export function showSource(deskId: string, source: Source) {
  useSetupStore.getState().updateDeskWindows(deskId, (windows) => ({
    ...windows,
    opened: windows.opened.map((w) =>
      w.id === SOURCE_WINDOW ? { ...w, title: source.title, url: source.url } : w,
    ),
  }));
}

/** The desk's sources window back to its waiting state. */
export function clearSource(deskId: string) {
  useSetupStore.getState().updateDeskWindows(deskId, (windows) => ({
    ...windows,
    opened: windows.opened.map((w) =>
      w.id === SOURCE_WINDOW ? { ...w, title: 'Sources', url: AGENT_APPS.sources } : w,
    ),
  }));
}

/**
 * Brings a team into the room: one desk per agent (named after them, in their workspace's
 * colours, at AGENT_DESK_HEIGHT, their screens showing their apps), replacing the room's desks.
 */
export function createTeam(preset: TeamPreset) {
  const setup = currentSetup();
  const product = getProduct(setup.productId);
  // A height the agents work at seated (below where they stand up), in the product's range.
  const motion = product.motions[0];
  const sit = motion && Math.min(motion.max, Math.max(motion.min, AGENT_DESK_HEIGHT));
  const agents: Record<string, AgentProfile> = {};
  const room = preset.members.map(({ workspace, ...agent }) => {
    const desk = newDesk(product, workspace);
    agents[desk.id] = agent;
    return {
      ...desk,
      name: agent.name,
      ...(motion && sit !== undefined && { motions: { ...desk.motions, [motion.id]: sit } }),
      windows: agentWindows(product, desk.workspaceId),
    };
  });
  loadSetup({ ...setup, mode: 'desks', room, activeDeskId: null });
  useAgentStore.getState().setAgents(agents);
  useAgentStore.getState().setMission(null);
}

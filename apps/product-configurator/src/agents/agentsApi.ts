/**
 * The layouts Worker's /agents route (services/layouts-worker/src/agents.js): plans a team's
 * tasks and does each step with the free AI.
 */
import { LAYOUTS_URL } from '@/layouts/layoutsApi';
import type { AgentProfile, Source, StepKind } from './types';

export const agentsAvailable = !!LAYOUTS_URL;

export interface PlannedTask {
  id: string;
  agent: string;
  title: string;
  brief: string;
  dependsOn: string[];
  steps: { kind: StepKind; title: string; search?: string }[];
}

export interface StepResult {
  note: string;
  content: string;
  sources: Source[];
}

/** An error worth retrying after a pause: the free AI's per-minute limit. */
export class BusyError extends Error {}

async function call<T>(body: object, signal?: AbortSignal): Promise<T> {
  if (!LAYOUTS_URL) throw new Error('The AI is not set up on this site');
  const response = await fetch(`${LAYOUTS_URL}/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: signal ?? null,
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (response.status === 429) throw new BusyError(data.error ?? 'The AI is busy');
  if (!response.ok) throw new Error(data.error ?? `The AI could not answer (${response.status})`);
  return data;
}

const team = (agents: readonly AgentProfile[]) =>
  agents.map(({ id, name, role }) => ({ id, name, role }));

export function planTeam(
  goal: string,
  agents: readonly AgentProfile[],
  signal?: AbortSignal,
): Promise<{ summary: string; tasks: PlannedTask[] }> {
  return call({ action: 'plan', goal, team: team(agents) }, signal);
}

export function workStep(
  input: {
    goal: string;
    agent: AgentProfile;
    task: { title: string; brief: string };
    step: { kind: StepKind; title: string; search?: string };
    done?: string;
    context?: { from: string; title: string; content: string }[];
  },
  signal?: AbortSignal,
): Promise<StepResult> {
  const { agent, ...rest } = input;
  return call({ action: 'step', ...rest, agent: team([agent])[0] }, signal);
}

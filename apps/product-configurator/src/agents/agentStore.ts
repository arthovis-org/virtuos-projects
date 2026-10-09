import { create } from 'zustand';
import type {
  Activity,
  AgentProfile,
  AgentStep,
  AgentTask,
  Handoff,
  LogEntry,
  Mission,
} from './types';

/** Characters a second a step's work appears at, at normal speed. */
export const TYPING_RATE = 45;

interface AgentState {
  /** Who works at each desk, by desk id. */
  agents: Readonly<Record<string, AgentProfile>>;
  mission: Mission | null;
  log: readonly LogEntry[];
  handoffs: readonly Handoff[];
  /** How fast the team works: 1, 2 or 4 (typing, reading and waits). */
  speed: number;
  setAgents: (agents: Record<string, AgentProfile>) => void;
  setSpeed: (speed: number) => void;
  /** Changes the mission (nothing when there is none). */
  updateMission: (change: (mission: Mission) => Mission) => void;
  updateTask: (taskId: string, change: (task: AgentTask) => AgentTask) => void;
  updateStep: (taskId: string, index: number, change: (step: AgentStep) => AgentStep) => void;
  setMission: (mission: Mission | null) => void;
  addLog: (agentId: string, text: string) => void;
  addHandoff: (handoff: Omit<Handoff, 'id' | 'at'>) => void;
}

let handoffCount = 0;

export const useAgentStore = create<AgentState>()((set) => ({
  agents: {},
  mission: null,
  log: [],
  handoffs: [],
  speed: 1,
  setAgents: (agents) => set({ agents }),
  setSpeed: (speed) => set({ speed }),
  setMission: (mission) => set({ mission, log: [], handoffs: [] }),
  updateMission: (change) =>
    set((state) => (state.mission ? { mission: change(state.mission) } : {})),
  updateTask: (taskId, change) =>
    set((state) =>
      state.mission
        ? {
            mission: {
              ...state.mission,
              tasks: state.mission.tasks.map((t) => (t.id === taskId ? change(t) : t)),
            },
          }
        : {},
    ),
  updateStep: (taskId, index, change) =>
    set((state) =>
      state.mission
        ? {
            mission: {
              ...state.mission,
              tasks: state.mission.tasks.map((t) =>
                t.id === taskId
                  ? { ...t, steps: t.steps.map((s, i) => (i === index ? change(s) : s)) }
                  : t,
              ),
            },
          }
        : {},
    ),
  addLog: (agentId, text) =>
    set((state) => ({ log: [...state.log.slice(-199), { at: Date.now(), agentId, text }] })),
  addHandoff: (handoff) =>
    set((state) => ({
      handoffs: [
        ...state.handoffs.slice(-19),
        { ...handoff, id: `handoff-${++handoffCount}`, at: performance.now() },
      ],
    })),
}));

/** The desk an agent works at. */
export function deskOfAgent(agents: Readonly<Record<string, AgentProfile>>, agentId: string) {
  return Object.entries(agents).find(([, a]) => a.id === agentId)?.[0];
}

/** The agent's task in the mission, if it has one. */
export function taskOf(mission: Mission | null, agentId: string | undefined) {
  return agentId ? mission?.tasks.find((t) => t.agentId === agentId) : undefined;
}

/** The step a task is on: the first not done (or the last). */
export function currentStep(task: AgentTask | undefined): {
  step: AgentStep | undefined;
  index: number;
} {
  if (!task) return { step: undefined, index: -1 };
  const index = task.steps.findIndex((s) => s.phase !== 'done');
  const at = index < 0 ? task.steps.length - 1 : index;
  return { step: task.steps[at], index: at };
}

/** How many characters of a step's work have appeared by `now` (performance clock). */
export function typedLength(step: AgentStep, now: number): number {
  const content = step.content ?? '';
  if (step.phase === 'done') return content.length;
  if (step.phase !== 'typing' || step.typingSince === undefined) return 0;
  const rate = step.typingRate ?? TYPING_RATE;
  return Math.min(content.length, Math.floor(((now - step.typingSince) / 1000) * rate));
}

/** A task's progress, 0..1: done steps, and the share typed of the one being typed. */
export function taskProgress(task: AgentTask | undefined, now: number): number {
  if (!task || task.steps.length === 0) return 0;
  if (task.status === 'done') return 1;
  let done = 0;
  for (const step of task.steps) {
    if (step.phase === 'done') done += 1;
    else if (step.phase === 'typing' && step.content) {
      done += 0.4 + 0.6 * (typedLength(step, now) / step.content.length);
    } else if (step.phase === 'reading') done += 0.3;
    else if (step.phase === 'thinking') done += 0.15;
  }
  return Math.min(1, done / task.steps.length);
}

/** What the person at an agent's desk does now (see `Activity`). */
export function activityOf(task: AgentTask | undefined): Activity {
  if (!task) return 'idle';
  if (task.status === 'done') return 'done';
  if (task.status === 'waiting') return 'waiting';
  if (task.status === 'failed') return 'idle';
  const { step } = currentStep(task);
  switch (step?.phase) {
    case 'thinking':
      return 'thinking';
    case 'reading':
      return 'reading';
    case 'typing':
      return 'typing';
    default:
      return 'thinking';
  }
}

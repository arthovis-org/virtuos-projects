/**
 * Runs a mission: the team's plan, then each task step by step, tasks starting as soon as the
 * tasks they need are done (agents work in parallel), results handed from desk to desk.
 *
 * A step: the agent thinks (waits for the AI), reads its sources (they open on its screen),
 * then types its work out at a typing pace, so a viewer can follow along whatever the AI's
 * speed. The AI comes from a backend: live (the Worker, `liveBackend`) or a recorded run
 * played back (`recordedBackend`), which runs the same way, for demos that must go exactly so.
 */
import { BusyError, planTeam, workStep, type PlannedTask, type StepResult } from './agentsApi';
import { clearSource, showSource } from './agentDesk';
import { deskOfAgent, TYPING_RATE, useAgentStore } from './agentStore';
import type { AgentProfile, AgentTask, Mission } from './types';

/** Where a mission's AI comes from. */
export interface Backend {
  plan: (
    goal: string,
    agents: readonly AgentProfile[],
    signal: AbortSignal,
  ) => Promise<{ summary: string; tasks: PlannedTask[] }>;
  step: (
    input: Parameters<typeof workStep>[0] & { taskId: string; index: number },
    signal: AbortSignal,
  ) => Promise<StepResult>;
}

/** A finished run, to play back later: its plan and every step's result. */
export interface RecordedRun {
  goal: string;
  summary: string;
  tasks: PlannedTask[];
  /** By `${taskId}/${step index}`. */
  steps: Record<string, StepResult>;
}

export const liveBackend: Backend = {
  plan: (goal, agents, signal) => planTeam(goal, agents, signal),
  // Its task and step numbers are only for recorded runs; the Worker ignores them.
  step: (input, signal) => workStep(input, signal),
};

/** Plays a recorded run back (the AI's answers after a short, believable wait). */
export function recordedBackend(run: RecordedRun): Backend {
  return {
    plan: async (_goal, _agents, signal) => {
      await pause(1200 / speedOf(), signal);
      return { summary: run.summary, tasks: run.tasks };
    },
    step: async ({ taskId, index }, signal) => {
      await pause((900 + Math.random() * 900) / speedOf(), signal);
      const result = run.steps[`${taskId}/${index}`];
      if (!result) throw new Error(`The recording has no step ${index + 1} of task ${taskId}`);
      return result;
    },
  };
}

/** How long a source is read before writing about it, and the least an AI wait is shown. */
const READ_MS = 3500;
const MIN_THINK_MS = 1500;
/** AI calls running at once: the free AI allows a few a minute. */
const MAX_CALLS = 2;

let controller: AbortController | null = null;
let lastRun: RecordedRun | null = null;

/** A run read from a file, if it is one (its plan and step results). */
export function readRecordedRun(value: unknown): RecordedRun | null {
  const run = value as Partial<RecordedRun> | null;
  if (
    !run ||
    typeof run.goal !== 'string' ||
    typeof run.summary !== 'string' ||
    !Array.isArray(run.tasks) ||
    !run.steps ||
    typeof run.steps !== 'object'
  ) {
    return null;
  }
  return run as RecordedRun;
}

/** The last run that finished, to save and play back. */
export const lastRecordedRun = () => lastRun;

const store = () => useAgentStore.getState();
const speedOf = () => store().speed;

function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Stopped', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Stopped', 'AbortError'));
      },
      { once: true },
    );
  });
}

/** At most MAX_CALLS AI calls at once; the rest wait their turn. */
let running = 0;
const waiting: (() => void)[] = [];
async function inTurn<T>(work: () => Promise<T>): Promise<T> {
  if (running >= MAX_CALLS) await new Promise<void>((resolve) => waiting.push(resolve));
  running++;
  try {
    return await work();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

/** An AI call, retried after a pause when the free AI is busy (its per-minute limit). */
async function withRetry<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await inTurn(work);
    } catch (error) {
      if (!(error instanceof BusyError) || attempt >= 3 || signal.aborted) throw error;
      await pause(8000 * (attempt + 1), signal);
    }
  }
}

const isStopped = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

/** Gives the team a goal: plans it and works it. One mission at a time; a new one stops the last. */
export async function startMission(goal: string, backend: Backend = liveBackend) {
  stopMission();
  const own = new AbortController();
  controller = own;
  const { signal } = own;
  const agents = Object.values(store().agents);
  const mission: Mission = {
    id: `mission-${Date.now().toString(36)}`,
    goal,
    summary: '',
    status: 'planning',
    tasks: [],
  };
  store().setMission(mission);
  for (const deskId of Object.keys(store().agents)) clearSource(deskId);
  const recording: RecordedRun = { goal, summary: '', tasks: [], steps: {} };

  try {
    for (const agent of agents) store().addLog(agent.id, `Planning "${goal}" with the team`);
    const plan = await withRetry(() => backend.plan(goal, agents, signal), signal);
    recording.summary = plan.summary;
    recording.tasks = plan.tasks;
    const tasks: AgentTask[] = plan.tasks.map((t) => ({
      id: t.id,
      agentId: t.agent,
      title: t.title,
      brief: t.brief,
      dependsOn: t.dependsOn,
      status: 'waiting',
      steps: t.steps.map((s) => ({ ...s, phase: 'pending' })),
    }));
    store().updateMission((m) => ({ ...m, summary: plan.summary, status: 'running', tasks }));

    // Every task starts once the tasks it needs are done; all run side by side.
    const finished = new Map<string, Promise<void>>();
    const run = (task: AgentTask): Promise<void> => {
      const existing = finished.get(task.id);
      if (existing) return existing;
      const promise = (async () => {
        const needs = tasks.filter((t) => task.dependsOn.includes(t.id));
        await Promise.all(needs.map(run));
        await runTask(task.id, goal, backend, recording, signal);
      })();
      finished.set(task.id, promise);
      return promise;
    };
    const results = await Promise.allSettled(tasks.map(run));
    if (signal.aborted) return;
    const failed = results.some((r) => r.status === 'rejected');
    store().updateMission((m) => ({ ...m, status: failed ? 'failed' : 'done' }));
    if (!failed) lastRun = recording;
  } catch (error) {
    if (isStopped(error)) return;
    store().updateMission((m) => ({
      ...m,
      status: 'failed',
      error: error instanceof Error ? error.message : 'The team could not plan this',
    }));
  } finally {
    if (controller === own) controller = null;
  }
}

/** Stops the mission now; work done so far stays on the screens. */
export function stopMission() {
  if (!controller) return;
  controller.abort();
  controller = null;
  store().updateMission((m) =>
    m.status === 'running' || m.status === 'planning' ? { ...m, status: 'stopped' } : m,
  );
}

async function runTask(
  taskId: string,
  goal: string,
  backend: Backend,
  recording: RecordedRun,
  signal: AbortSignal,
) {
  const s = store();
  const task = s.mission?.tasks.find((t) => t.id === taskId);
  const agent = Object.values(s.agents).find((a) => a.id === task?.agentId);
  const deskId = agent && deskOfAgent(s.agents, agent.id);
  if (!task || !agent || !deskId) return;

  // What teammates delivered that this task builds on (handed over as it starts).
  const mission = s.mission;
  const context = (mission?.tasks ?? [])
    .filter((t) => task.dependsOn.includes(t.id))
    .map((t) => {
      const from = Object.values(s.agents).find((a) => a.id === t.agentId);
      return {
        from: from?.name ?? 'A teammate',
        title: t.title,
        content: t.steps.map((st) => st.content ?? '').join('\n\n'),
      };
    });

  s.updateTask(taskId, (t) => ({ ...t, status: 'working' }));
  s.addLog(agent.id, `Started: ${task.title}`);

  try {
    const done: string[] = [];
    for (const [index, step] of task.steps.entries()) {
      if (signal.aborted) return;
      store().updateStep(taskId, index, (st) => ({ ...st, phase: 'thinking', note: step.title }));
      store().addLog(agent.id, `${verb(step.kind)}: ${step.title}`);
      const startedAt = performance.now();
      const result = await withRetry(
        () =>
          backend.step(
            {
              taskId,
              index,
              goal,
              agent,
              task: { title: task.title, brief: task.brief },
              step: {
                kind: step.kind,
                title: step.title,
                ...(step.search && { search: step.search }),
              },
              done: done.join('\n\n').slice(-1800),
              context,
            },
            signal,
          ),
        signal,
      );
      recording.steps[`${taskId}/${index}`] = result;
      // A believable moment of thought even when the AI answers at once.
      const thought = performance.now() - startedAt;
      if (thought < MIN_THINK_MS / speedOf())
        await pause(MIN_THINK_MS / speedOf() - thought, signal);

      // Reading: the sources open on the agent's screen.
      const source = result.sources[0];
      if (source) {
        showSource(deskId, source);
        store().updateStep(taskId, index, (st) => ({
          ...st,
          phase: 'reading',
          note: `Reading ${source.title}`,
          sources: result.sources,
        }));
        store().addLog(agent.id, `Reading: ${source.title} (Wikipedia)`);
        await pause(READ_MS / speedOf(), signal);
      }

      // Writing: the work appears at a typing pace.
      const rate = TYPING_RATE * speedOf();
      store().updateStep(taskId, index, (st) => ({
        ...st,
        phase: 'typing',
        note: result.note,
        content: result.content,
        sources: result.sources,
        typingSince: performance.now(),
        typingRate: rate,
      }));
      await pause((result.content.length / rate) * 1000 + 300, signal);
      store().updateStep(taskId, index, (st) => ({ ...st, phase: 'done' }));
      done.push(`## ${step.title}\n${result.content}`);
    }
    store().updateTask(taskId, (t) => ({ ...t, status: 'done' }));
    store().addLog(agent.id, `Done: ${task.title}`);
    handOff(taskId, agent, deskId);
  } catch (error) {
    if (isStopped(error)) throw error;
    const message = error instanceof Error ? error.message : 'Something went wrong';
    store().updateTask(taskId, (t) => ({ ...t, status: 'failed', error: message }));
    store().addLog(agent.id, `Stopped: ${message}`);
    throw error;
  }
}

/** A finished task's result flies to each teammate whose task needs it. */
function handOff(taskId: string, agent: AgentProfile, fromDesk: string) {
  const s = store();
  // One after another, so their cards don't cover each other.
  let delay = 0;
  for (const next of s.mission?.tasks ?? []) {
    if (!next.dependsOn.includes(taskId)) continue;
    const toDesk = deskOfAgent(s.agents, next.agentId);
    const to = Object.values(s.agents).find((a) => a.id === next.agentId);
    if (!toDesk || toDesk === fromDesk) continue;
    s.addHandoff(
      {
        fromDesk,
        toDesk,
        color: agent.color,
        title: s.mission?.tasks.find((t) => t.id === taskId)?.title ?? 'Results',
        fromName: agent.name,
        toName: to?.name ?? 'a teammate',
      },
      delay,
    );
    delay += 700;
    s.addLog(agent.id, `Handed the results to ${to?.name ?? 'a teammate'}`);
  }
}

function verb(kind: AgentTask['steps'][number]['kind']) {
  return {
    research: 'Researching',
    write: 'Writing',
    design: 'Designing',
    analyze: 'Analysing',
    review: 'Reviewing',
  }[kind];
}

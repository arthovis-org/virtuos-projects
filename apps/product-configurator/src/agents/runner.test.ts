import { beforeEach, describe, expect, it } from 'vitest';
import { getProduct } from '@/catalog';
import { loadSetup } from '@/state/actions';
import { initialSetup } from '@/state/setup';
import { useSetupStore } from '@/state/setupStore';
import { AGENT_APPS, agentAppOf, createTeam } from './agentDesk';
import { activityOf, deskOfAgent, taskProgress, useAgentStore } from './agentStore';
import { lastRecordedRun, recordedBackend, startMission, type Backend } from './runner';
import { TEAMS } from './teams';
import { PRODUCT_LAUNCH_DEMO } from './scenarios/productLaunch';

const product = getProduct('smart-desk');
const team = TEAMS[0]!;
const agents = () => useAgentStore.getState();

/** A quick AI: Ava researches, Mia designs, Leo writes once both are done. */
const backend: Backend = {
  plan: () =>
    Promise.resolve({
      summary: 'Research and design, then copy.',
      tasks: [
        {
          id: 't1',
          agent: 'ava',
          title: 'Market research',
          brief: 'Map the market.',
          dependsOn: [],
          steps: [{ kind: 'research', title: 'Desks', search: 'standing desk' }],
        },
        {
          id: 't2',
          agent: 'mia',
          title: 'Visual direction',
          brief: 'Pick colours.',
          dependsOn: [],
          steps: [{ kind: 'design', title: 'Palette' }],
        },
        {
          id: 't3',
          agent: 'leo',
          title: 'Launch copy',
          brief: 'Write the headline.',
          dependsOn: ['t1', 't2'],
          steps: [{ kind: 'write', title: 'Headline' }],
        },
      ],
    }),
  step: ({ step, context }) =>
    Promise.resolve({
      note: step.title,
      content: `## ${step.title}\nFrom ${context?.length ? context.map((c) => c.from).join(', ') : 'nobody'}.`,
      sources:
        step.kind === 'research'
          ? [{ title: 'Standing desk', url: 'https://en.wikipedia.org/wiki/Standing_desk' }]
          : [],
    }),
};

beforeEach(() => {
  loadSetup(initialSetup(product));
  createTeam(team);
  // Fast: waits and typing a hundred times quicker.
  agents().setSpeed(100);
});

describe('an AI team', () => {
  it('gets a desk each, at the default height, its screens showing the agent apps', () => {
    const room = useSetupStore.getState().room;
    expect(room.map((d) => d.name)).toEqual(team.members.map((m) => m.name));
    const motion = product.motions[0]!;
    for (const desk of room) {
      // As any new desk: the product's own starting height.
      expect(desk.motions[motion.id]).toBe(motion.initial);
      expect(desk.windows.opened.map((w) => agentAppOf(w.url))).toEqual([
        'doc',
        'board',
        'sources',
        'log',
      ]);
    }
    expect(Object.keys(agents().agents)).toEqual(room.map((d) => d.id));
  });

  it('works a goal: tasks wait for what they need, results are handed on', async () => {
    await startMission('Launch the desk', backend);
    const mission = agents().mission!;
    expect(mission.status).toBe('done');
    expect(mission.tasks.every((t) => t.status === 'done')).toBe(true);
    // Leo started after Ava and Mia finished: their names are in his context.
    const leo = mission.tasks.find((t) => t.agentId === 'leo')!;
    expect(leo.steps[0]!.content).toContain('Ava');
    expect(leo.steps[0]!.content).toContain('Mia');
    // Two hand-offs, to Leo's desk.
    const leoDesk = deskOfAgent(agents().agents, 'leo');
    expect(agents().handoffs.map((h) => h.toDesk)).toEqual([leoDesk, leoDesk]);
    // Ava's source opened on her screen.
    const avaDesk = useSetupStore
      .getState()
      .room.find((d) => d.id === deskOfAgent(agents().agents, 'ava'))!;
    expect(
      avaDesk.windows.opened.some((w) => w.url.includes('wikipedia.org/wiki/Standing_desk')),
    ).toBe(true);
    expect(taskProgress(leo, performance.now())).toBe(1);
    expect(activityOf(leo)).toBe('done');
  });

  it('records a run that plays back the same', async () => {
    await startMission('Launch the desk', backend);
    const run = lastRecordedRun()!;
    expect(Object.keys(run.steps)).toEqual(expect.arrayContaining(['t1/0', 't2/0', 't3/0']));
    const first = agents().mission!.tasks.map((t) => t.steps.map((s) => s.content));
    await startMission('Launch the desk', {
      ...recordedBackend(run),
      // No pauses in the test.
      plan: () => Promise.resolve({ summary: run.summary, tasks: run.tasks }),
      step: ({ taskId, index }) => Promise.resolve(run.steps[`${taskId}/${index}`]!),
    });
    expect(agents().mission!.tasks.map((t) => t.steps.map((s) => s.content))).toEqual(first);
  });

  it('says why when the AI cannot plan', async () => {
    await startMission('Launch the desk', {
      ...backend,
      plan: () => Promise.reject(new Error('The AI could not answer')),
    });
    expect(agents().mission).toMatchObject({ status: 'failed', error: 'The AI could not answer' });
  });

  it('knows its apps by address', () => {
    expect(agentAppOf(AGENT_APPS.doc)).toBe('doc');
    expect(agentAppOf('https://example.com')).toBeNull();
    expect(agentAppOf('agent:nope')).toBeNull();
  });

  it('plays the demo run through, every step as written', async () => {
    await startMission(PRODUCT_LAUNCH_DEMO.goal, recordedBackend(PRODUCT_LAUNCH_DEMO));
    const mission = agents().mission!;
    expect(mission.status).toBe('done');
    // Every agent of the team has a task, and every step shows what the demo wrote.
    expect(new Set(mission.tasks.map((t) => t.agentId))).toEqual(
      new Set(team.members.map((m) => m.id)),
    );
    for (const task of mission.tasks) {
      task.steps.forEach((step, i) => {
        expect(step.content).toBe(PRODUCT_LAUNCH_DEMO.steps[`${task.id}/${i}`]!.content);
      });
    }
  });
});

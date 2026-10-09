import { useEffect, useState, type CSSProperties } from 'react';
import { enterRoom, selectDesk } from '@/state/actions';
import { useSetupStore } from '@/state/setupStore';
import { agentsAvailable } from './agentsApi';
import { createTeam } from './agentDesk';
import { activityOf, taskOf, taskProgress, useAgentStore } from './agentStore';
import { Avatar } from './apps/AgentApps';
import { Markdown } from './apps/Markdown';
import { startMission, stopMission } from './runner';
import { TEAMS } from './teams';
import type { Activity, Mission } from './types';
import styles from './TeamPanel.module.css';

const ACTIVITY: Record<Activity, string> = {
  idle: 'Ready',
  thinking: 'Thinking',
  reading: 'Reading',
  typing: 'Writing',
  waiting: 'Waiting',
  done: 'Done',
};

/**
 * The AI team, at the top of the options: bring a team into the room, give it a goal, follow
 * each agent, and read what they made.
 */
export function TeamPanel() {
  const agents = useAgentStore((s) => s.agents);
  const desksMode = useSetupStore((s) => s.mode === 'desks');
  const room = useSetupStore((s) => s.room);
  // The team works in the room; its desks must still be there.
  const members = Object.entries(agents).filter(([deskId]) => room.some((d) => d.id === deskId));

  if (!agentsAvailable) return null;
  if (members.length === 0 || !desksMode)
    return <TeamOffer inRoom={desksMode} hasTeam={members.length > 0} />;
  return <Team members={members} />;
}

function TeamOffer({ inRoom, hasTeam }: { inRoom: boolean; hasTeam: boolean }) {
  const preset = TEAMS[0];
  if (!preset) return null;
  return (
    <section className={styles.offer} aria-label="AI team">
      <p className={styles.eyebrow}>AI agents</p>
      <h2 className={styles.title}>A team of AI agents at the desks</h2>
      <p className={styles.note}>
        Give them a goal: they split it into tasks, research, write and design, and you watch every
        step on their screens. {preset.members.map((m) => m.name).join(', ')}:{' '}
        {preset.description.toLowerCase()}
      </p>
      {hasTeam && !inRoom ? (
        <button type="button" className={styles.primary} onClick={enterRoom}>
          Back to the team →
        </button>
      ) : (
        <button type="button" className={styles.primary} onClick={() => createTeam(preset)}>
          Bring in the {preset.label.toLowerCase()} →
        </button>
      )}
      {inRoom && <p className={styles.fine}>It takes the room's place: one desk per agent.</p>}
    </section>
  );
}

function Team({
  members,
}: {
  members: [string, ReturnType<typeof useAgentStore.getState>['agents'][string]][];
}) {
  const mission = useAgentStore((s) => s.mission);
  const speed = useAgentStore((s) => s.speed);
  const setSpeed = useAgentStore((s) => s.setSpeed);
  const activeDeskId = useSetupStore((s) => s.activeDeskId);
  const [goal, setGoal] = useState(() => mission?.goal ?? TEAMS[0]?.exampleGoal ?? '');
  const [results, setResults] = useState(false);
  const working = mission?.status === 'planning' || mission?.status === 'running';
  const now = useTicker(working);

  return (
    <section className={styles.team} aria-label="AI team">
      <div className={styles.headRow}>
        <p className={styles.eyebrow}>AI team</p>
        <div className={styles.speed} role="radiogroup" aria-label="Speed">
          {[1, 2, 4].map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={speed === s}
              onClick={() => setSpeed(s)}
              title={s === 1 ? 'Real pace' : `${s} times faster`}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>
      <form
        className={styles.goalForm}
        onSubmit={(event) => {
          event.preventDefault();
          if (goal.trim() && !working) void startMission(goal.trim());
        }}
      >
        <label className={styles.goalLabel} htmlFor="team-goal">
          The team's goal
        </label>
        <textarea
          id="team-goal"
          className={styles.goal}
          rows={2}
          value={goal}
          maxLength={600}
          disabled={working}
          onChange={(event) => setGoal(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <div className={styles.actions}>
          {working ? (
            <button type="button" className={styles.secondary} onClick={stopMission}>
              Stop
            </button>
          ) : (
            <button type="submit" className={styles.primary} disabled={!goal.trim()}>
              {mission ? 'Start again' : 'Start'}
            </button>
          )}
          {mission?.status === 'done' && (
            <button type="button" className={styles.secondary} onClick={() => setResults(true)}>
              Read the results
            </button>
          )}
        </div>
      </form>

      <MissionStatus mission={mission} />

      <ul className={styles.members}>
        {members.map(([deskId, agent]) => {
          const task = taskOf(mission, agent.id);
          const activity = mission?.status === 'planning' ? 'thinking' : activityOf(task);
          const step = task?.steps.find((s) => s.phase !== 'done' && s.phase !== 'pending');
          return (
            <li key={deskId}>
              <button
                type="button"
                className={styles.member}
                data-selected={deskId === activeDeskId || undefined}
                style={{ '--agent': agent.color } as CSSProperties}
                onClick={() => selectDesk(deskId)}
              >
                <Avatar agent={agent} size="s" />
                <span className={styles.memberText}>
                  <span className={styles.memberName}>
                    {agent.name} <span className={styles.role}>{agent.role}</span>
                  </span>
                  <span className={styles.memberTask}>
                    <span className={styles.activity} data-activity={activity}>
                      {ACTIVITY[activity]}
                    </span>
                    {step?.note ?? task?.title ?? ''}
                  </span>
                  <span className={styles.bar}>
                    <span style={{ width: `${Math.round(taskProgress(task, now) * 100)}%` }} />
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {results && mission && <Results mission={mission} onClose={() => setResults(false)} />}
    </section>
  );
}

function MissionStatus({ mission }: { mission: Mission | null }) {
  if (!mission) {
    return (
      <p className={styles.note}>Each agent gets a task; the work appears on their screens.</p>
    );
  }
  if (mission.status === 'planning') return <p className={styles.note}>The team is planning…</p>;
  if (mission.status === 'failed') {
    return (
      <p className={styles.error} role="alert">
        {mission.error ?? 'Some of the work could not be done.'} Try again in a moment.
      </p>
    );
  }
  if (mission.status === 'stopped')
    return <p className={styles.note}>Stopped. The work so far stays.</p>;
  return <p className={styles.note}>{mission.summary}</p>;
}

/** Re-renders a few times a second while `active` (progress bars). */
function useTicker(active: boolean) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(performance.now()), 250);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

/** Everything the team made, agent by agent, to read and copy. */
function Results({ mission, onClose }: { mission: Mission; onClose: () => void }) {
  const agents = useAgentStore((s) => s.agents);
  const [copied, setCopied] = useState(false);
  const byAgent = (id: string) => Object.values(agents).find((a) => a.id === id);
  const text = [
    `# ${mission.goal}`,
    mission.summary,
    ...mission.tasks.map((task) => {
      const agent = byAgent(task.agentId);
      return [
        `## ${task.title} (${agent?.name ?? ''}, ${agent?.role ?? ''})`,
        ...task.steps.map((s) => `### ${s.title}\n${s.content ?? ''}`),
      ].join('\n\n');
    }),
  ].join('\n\n');

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="The team's results"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.dialogHead}>
          <div>
            <p className={styles.eyebrow}>The team's results</p>
            <h2 className={styles.title}>{mission.goal}</h2>
          </div>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => {
                void navigator.clipboard.writeText(text).then(() => setCopied(true));
              }}
            >
              {copied ? 'Copied' : 'Copy all'}
            </button>
            <button type="button" className={styles.primary} onClick={onClose}>
              Done
            </button>
          </div>
        </div>
        <div className={styles.dialogBody}>
          <p className={styles.note}>{mission.summary}</p>
          {mission.tasks.map((task) => {
            const agent = byAgent(task.agentId);
            return (
              <article
                key={task.id}
                className={styles.result}
                style={{ '--agent': agent?.color ?? '#888888' } as CSSProperties}
              >
                <header className={styles.resultHead}>
                  {agent && <Avatar agent={agent} size="s" />}
                  <div>
                    <h3 className={styles.resultTitle}>{task.title}</h3>
                    <p className={styles.role}>
                      {agent?.name} · {agent?.role}
                    </p>
                  </div>
                </header>
                {task.steps.map((step, i) => (
                  <section key={i} className={styles.resultStep}>
                    <h4 className={styles.resultStepTitle}>{step.title}</h4>
                    <div className={styles.resultText}>
                      <Markdown text={step.content ?? ''} />
                    </div>
                  </section>
                ))}
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}

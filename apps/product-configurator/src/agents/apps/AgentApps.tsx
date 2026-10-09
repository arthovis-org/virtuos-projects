import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import {
  activityOf,
  currentStep,
  taskOf,
  taskProgress,
  typedLength,
  useAgentStore,
} from '../agentStore';
import type { AgentApp } from '../agentDesk';
import type { Activity, AgentProfile, AgentStep, AgentTask } from '../types';
import { Markdown } from './Markdown';
import styles from './apps.module.css';

/**
 * The agent apps on an agent desk's screens (windows with an `agent:` address): its work
 * being written, its plan, its activity, and where its sources open. Drawn by the configurator,
 * so they never fail to load. `compact`: on the poster of a desk the visitor is not at.
 */
export function AgentAppView({
  app,
  deskId,
  compact = false,
}: {
  app: AgentApp;
  deskId: string;
  compact?: boolean;
}) {
  const agent = useAgentStore((s) => s.agents[deskId]);
  if (!agent) {
    return (
      <div className={styles.app}>
        <p className={styles.empty}>No agent at this desk.</p>
      </div>
    );
  }
  const style = { '--agent': agent.color } as CSSProperties;
  return (
    <div className={styles.app} style={style} data-compact={compact || undefined}>
      {app === 'doc' && <DocApp agent={agent} />}
      {app === 'board' && <BoardApp agent={agent} />}
      {app === 'log' && <LogApp agent={agent} />}
      {app === 'sources' && <SourcesApp agent={agent} />}
    </div>
  );
}

/** Re-renders every frame while `active` (text being typed, a progress bar filling). */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const tick = () => {
      setNow(performance.now());
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active]);
  return now;
}

const ACTIVITY_LABEL: Record<Activity, string> = {
  idle: 'Ready',
  thinking: 'Thinking',
  reading: 'Reading',
  typing: 'Writing',
  waiting: 'Waiting for teammates',
  done: 'Done',
};

export function Avatar({ agent, size = 'm' }: { agent: AgentProfile; size?: 's' | 'm' | 'l' }) {
  return (
    <span
      className={styles.avatar}
      data-size={size}
      style={{ '--agent': agent.color } as CSSProperties}
      aria-hidden="true"
    >
      {agent.name.slice(0, 1)}
    </span>
  );
}

function Header({
  agent,
  task,
  activity,
}: {
  agent: AgentProfile;
  task?: AgentTask;
  activity: Activity;
}) {
  return (
    <header className={styles.header}>
      <Avatar agent={agent} />
      <div className={styles.who}>
        <span className={styles.name}>{agent.name}</span>
        <span className={styles.role}>{agent.role}</span>
      </div>
      {task && <span className={styles.taskTitle}>{task.title}</span>}
      <span className={styles.status} data-activity={activity}>
        {activity !== 'done' && activity !== 'idle' && <span className={styles.pulse} />}
        {ACTIVITY_LABEL[activity]}
      </span>
    </header>
  );
}

/** The agent's work: every step's content, the current one typing out with a cursor. */
function DocApp({ agent }: { agent: AgentProfile }) {
  const task = useAgentStore((s) => taskOf(s.mission, agent.id));
  const planning = useAgentStore((s) => s.mission?.status === 'planning');
  const activity = activityOf(task);
  const typing = task?.steps.some((s) => s.phase === 'typing') ?? false;
  const now = useNow(typing);
  const body = useRef<HTMLDivElement>(null);

  // Following the text as it is typed.
  useLayoutEffect(() => {
    const element = body.current;
    if (element && typing) element.scrollTop = element.scrollHeight;
  });

  const { step: current } = currentStep(task);
  return (
    <>
      <Header agent={agent} {...(task && { task })} activity={planning ? 'thinking' : activity} />
      <div ref={body} className={styles.docBody}>
        {!task ? (
          <Idle agent={agent} planning={planning} />
        ) : (
          <>
            <p className={styles.brief}>{task.brief}</p>
            {task.steps.map((step, i) => (
              <StepSection key={i} step={step} now={now} />
            ))}
            {current && (current.phase === 'thinking' || current.phase === 'reading') && (
              <p className={styles.thinking}>
                <span className={styles.dots}>
                  <i />
                  <i />
                  <i />
                </span>
                {current.phase === 'reading' ? current.note : `Working on: ${current.title}`}
              </p>
            )}
            {task.status === 'waiting' && (
              <p className={styles.thinking}>Waiting for teammates' results to start…</p>
            )}
          </>
        )}
      </div>
    </>
  );
}

function StepSection({ step, now }: { step: AgentStep; now: number }) {
  if (!step.content || (step.phase !== 'typing' && step.phase !== 'done')) return null;
  const shown = step.content.slice(0, typedLength(step, now));
  return (
    <section className={styles.step}>
      <h3 className={styles.stepTitle}>
        <span className={styles.stepKind}>{step.kind}</span>
        {step.title}
      </h3>
      <Markdown text={shown} caret={step.phase === 'typing'} />
      {step.phase === 'done' && step.sources && step.sources.length > 0 && (
        <p className={styles.sources}>
          Sources: {step.sources.map((s) => s.title).join(' · ')} (Wikipedia)
        </p>
      )}
    </section>
  );
}

function Idle({ agent, planning }: { agent: AgentProfile; planning: boolean }) {
  return (
    <div className={styles.idle}>
      <Avatar agent={agent} size="l" />
      <p className={styles.idleTitle}>
        {planning ? 'The team is planning…' : `${agent.name} is ready`}
      </p>
      <p className={styles.idleText}>
        {planning
          ? 'Splitting the goal into tasks for each agent.'
          : `${agent.role}. Give the team a goal in the panel and ${agent.name} gets to work.`}
      </p>
    </div>
  );
}

/** The plan: the goal, this agent's steps and progress, and how the team is doing. */
function BoardApp({ agent }: { agent: AgentProfile }) {
  const mission = useAgentStore((s) => s.mission);
  const agents = useAgentStore((s) => s.agents);
  const task = taskOf(mission, agent.id);
  const busy = mission?.status === 'running';
  const now = useNow(busy);
  const team = Object.values(agents);
  return (
    <>
      <Header agent={agent} {...(task && { task })} activity={activityOf(task)} />
      <div className={styles.board}>
        <div className={styles.boardMain}>
          <p className={styles.goalLabel}>Team goal</p>
          <p className={styles.goal}>{mission?.goal ?? 'No goal yet'}</p>
          {task ? (
            <>
              <Progress value={taskProgress(task, now)} />
              <ol className={styles.steps}>
                {task.steps.map((step, i) => (
                  <li key={i} className={styles.stepRow} data-phase={step.phase}>
                    <span className={styles.stepIcon} aria-hidden="true" />
                    <span className={styles.stepName}>{step.title}</span>
                    <span className={styles.stepPhase}>{phaseLabel(step)}</span>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className={styles.muted}>{mission?.summary ?? 'The plan appears here.'}</p>
          )}
        </div>
        <div className={styles.team}>
          <p className={styles.goalLabel}>Team</p>
          {team.map((member) => {
            const memberTask = taskOf(mission, member.id);
            return (
              <div
                key={member.id}
                className={styles.member}
                data-self={member.id === agent.id || undefined}
              >
                <Avatar agent={member} size="s" />
                <div className={styles.memberText}>
                  <span className={styles.memberName}>
                    {member.name} <span className={styles.role}>{member.role}</span>
                  </span>
                  <span className={styles.memberTask}>
                    {memberTask
                      ? `${ACTIVITY_LABEL[activityOf(memberTask)]} · ${memberTask.title}`
                      : 'Ready'}
                  </span>
                  <Progress value={taskProgress(memberTask, now)} thin colour={member.color} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function phaseLabel(step: AgentStep) {
  return {
    pending: '',
    thinking: 'Thinking…',
    reading: 'Reading…',
    typing: 'Writing…',
    done: 'Done',
    failed: 'Failed',
  }[step.phase];
}

function Progress({ value, thin, colour }: { value: number; thin?: boolean; colour?: string }) {
  return (
    <div className={styles.progress} data-thin={thin === true || undefined}>
      <div
        className={styles.progressBar}
        style={{ width: `${Math.round(value * 100)}%`, ...(colour && { background: colour }) }}
      />
    </div>
  );
}

/** What the agent did, newest last. */
function LogApp({ agent }: { agent: AgentProfile }) {
  const log = useAgentStore((s) => s.log);
  const entries = log.filter((e) => e.agentId === agent.id).slice(-40);
  const list = useRef<HTMLOListElement>(null);
  useLayoutEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [entries.length]);
  return (
    <>
      <header className={styles.sideHeader}>
        <Avatar agent={agent} size="s" />
        Activity
      </header>
      {entries.length === 0 ? (
        <p className={styles.empty}>What {agent.name} does appears here.</p>
      ) : (
        <ol ref={list} className={styles.log}>
          {entries.map((entry, i) => (
            <li key={i} className={styles.logEntry}>
              <time className={styles.logTime}>
                {new Date(entry.at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </time>
              {entry.text}
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

/** Where the pages the agent reads open (each replaces this as it is read). */
function SourcesApp({ agent }: { agent: AgentProfile }) {
  return (
    <>
      <header className={styles.sideHeader}>
        <Avatar agent={agent} size="s" />
        Sources
      </header>
      <div className={styles.idle}>
        <span className={styles.bookIcon} aria-hidden="true" />
        <p className={styles.idleText}>Pages {agent.name} reads open here.</p>
      </div>
    </>
  );
}

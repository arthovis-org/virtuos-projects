import { useEffect, useState, type CSSProperties } from 'react';
import { activityOf, currentStep, taskOf, taskProgress, useAgentStore } from './agentStore';
import type { Activity, AgentProfile } from './types';
import styles from './AgentTag.module.css';

const LABEL: Record<Activity, string> = {
  idle: 'Ready',
  thinking: 'Thinking',
  reading: 'Reading',
  typing: 'Writing',
  waiting: 'Waiting',
  done: 'Done',
};

/**
 * What the tag over an agent's desk shows: the agent with their progress around them, and what
 * they are doing now (in the room, at a glance, for every desk).
 */
export function AgentTag({ agent }: { agent: AgentProfile }) {
  const task = useAgentStore((s) => taskOf(s.mission, agent.id));
  const planning = useAgentStore((s) => s.mission?.status === 'planning');
  const activity: Activity = planning ? 'thinking' : activityOf(task);
  const working = activity !== 'idle' && activity !== 'done';
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!working) return;
    const timer = window.setInterval(() => setNow(performance.now()), 250);
    return () => window.clearInterval(timer);
  }, [working]);
  const progress = taskProgress(task, now);
  const { step } = currentStep(task);
  const detail = planning
    ? 'Planning with the team'
    : activity === 'done'
      ? task?.title
      : activity === 'waiting'
        ? 'for teammates'
        : (step?.note ?? task?.title);
  // A ring around the avatar: the share of the task done.
  const circumference = 2 * Math.PI * 15;
  return (
    <span className={styles.tag} style={{ '--agent': agent.color } as CSSProperties}>
      <span className={styles.avatar} aria-hidden="true">
        <svg viewBox="0 0 36 36" className={styles.ring}>
          <circle cx="18" cy="18" r="15" className={styles.track} />
          <circle
            cx="18"
            cy="18"
            r="15"
            className={styles.fill}
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
          />
        </svg>
        <span className={styles.initial}>{agent.name.slice(0, 1)}</span>
      </span>
      <span className={styles.text}>
        <span className={styles.name}>{agent.name}</span>
        <span className={styles.status} data-activity={activity}>
          {working && <span className={styles.dot} />}
          {LABEL[activity]}
          {detail && <span className={styles.detail}> · {detail}</span>}
        </span>
      </span>
    </span>
  );
}

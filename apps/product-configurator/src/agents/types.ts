/**
 * AI agents working at the desks of the room: each agent sits at a desk, a mission (a goal for
 * the team) is planned into one task per agent, and each task is worked step by step. The
 * screens, the person at the desk and the tag over it show where each agent is.
 */

export type StepKind = 'research' | 'write' | 'design' | 'analyze' | 'review';

/** An agent: who works at a desk. */
export interface AgentProfile {
  id: string;
  name: string;
  role: string;
  /** Colour of the agent's tag, screens and hand-offs, `#rrggbb`. */
  color: string;
}

export interface Source {
  title: string;
  url: string;
}

/**
 * Where a step is: waiting for the AI (`thinking`), reading its sources, typing out its work
 * (the text appears at a typing pace from `typingSince`), done or failed.
 */
export type StepPhase = 'pending' | 'thinking' | 'reading' | 'typing' | 'done' | 'failed';

export interface AgentStep {
  kind: StepKind;
  title: string;
  /** Words a research step looks up on Wikipedia. */
  search?: string;
  phase: StepPhase;
  /** What the agent is doing, shown over the desk. */
  note?: string;
  /** The step's work, markdown. */
  content?: string;
  sources?: Source[];
  /** When its content started appearing (ms, performance clock). */
  typingSince?: number;
  /** Characters a second it appears at. */
  typingRate?: number;
}

export type TaskStatus = 'waiting' | 'working' | 'done' | 'failed';

export interface AgentTask {
  id: string;
  agentId: string;
  title: string;
  brief: string;
  /** Tasks whose results this one needs; it starts once they are done. */
  dependsOn: string[];
  steps: AgentStep[];
  status: TaskStatus;
  error?: string;
}

export type MissionStatus = 'planning' | 'running' | 'done' | 'failed' | 'stopped';

export interface Mission {
  id: string;
  goal: string;
  summary: string;
  status: MissionStatus;
  tasks: AgentTask[];
  error?: string;
}

/** A task's result handed to a teammate who needs it: a card flies from desk to desk. */
export interface Handoff {
  id: string;
  fromDesk: string;
  toDesk: string;
  color: string;
  /** When it left (ms, performance clock). */
  at: number;
}

export interface LogEntry {
  at: number;
  agentId: string;
  text: string;
}

/**
 * What the person at a desk is doing, from their agent's state: idle, thinking (waiting for
 * the AI), reading sources, typing, waiting for teammates, or done.
 */
export type Activity = 'idle' | 'thinking' | 'reading' | 'typing' | 'waiting' | 'done';

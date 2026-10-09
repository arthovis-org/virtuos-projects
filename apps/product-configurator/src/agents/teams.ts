import type { AgentProfile } from './types';

/** A ready-made team: its agents, each at a desk of the given workspace (its colour and icon). */
export interface TeamPreset {
  id: string;
  label: string;
  description: string;
  /** A goal to start from, shown in the goal box. */
  exampleGoal: string;
  members: (AgentProfile & { workspace: string })[];
}

export const TEAMS: readonly TeamPreset[] = [
  {
    id: 'product-launch',
    label: 'Product launch team',
    description: 'Research, copy, design and numbers for launching a product.',
    exampleGoal: 'Launch our new VIRTUOS smart desk in Europe',
    members: [
      { id: 'ava', name: 'Ava', role: 'Market researcher', color: '#4c8dff', workspace: 'study' },
      { id: 'mia', name: 'Mia', role: 'Brand designer', color: '#e05fb6', workspace: 'designer' },
      { id: 'sam', name: 'Sam', role: 'Data analyst', color: '#2fb47c', workspace: 'finance' },
      { id: 'leo', name: 'Leo', role: 'Copywriter', color: '#f29a2e', workspace: 'office' },
    ],
  },
];

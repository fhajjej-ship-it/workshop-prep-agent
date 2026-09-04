import type { ModelMessage } from 'ai';

export type Brief = {
  audience: string;
  objective: string;
  durationMinutes: number;
  constraints: string;
  format: '' | 'in-person' | 'remote' | 'hybrid';
};

export type WorkshopPack = {
  title: string;
  outcome: string;
  agenda: { title: string; minutes: number; activity: string; sourceIds: string[] }[];
  exercise: { title: string; instructions: string[]; debrief: string[]; sourceIds: string[] };
  facilitatorNotes: string[];
  sources: { id: string; title: string }[];
};

export type ToolEvent = {
  id: string;
  at: string;
  tool: string;
  input: unknown;
  output: unknown;
  status: 'ok' | 'error';
};

export type Validation = { valid: boolean; totalMinutes: number; issues: string[] };
export type CurrentAction = {
  phase: 'model' | 'tool';
  startedAt: string;
  step: number;
  tool?: string;
  sourceId?: string;
};
export type Run = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: 'ready' | 'running' | 'awaiting_input' | 'completed' | 'failed';
  mode: 'test' | 'live';
  model: string | null;
  brief: Brief;
  clarification?: { key: 'format'; question: string };
  pack?: WorkshopPack;
  validation?: Validation;
  events: ToolEvent[];
  currentAction?: CurrentAction | null;
  error?: string;
  steps: number;
  revision: number;
  readSourceIds: string[];
  messages: ModelMessage[];
  version: number;
};

export type PublicRun = Omit<Run, 'messages'>;
export type AppConfig = {
  mode: 'test' | 'live';
  model: string | null;
  storage: 'local' | 'postgres';
  ready: boolean;
  blockers: string[];
};

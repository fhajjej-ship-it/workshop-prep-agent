import type { ModelMessage } from 'ai';

export type Material = {
  id: string;
  title: string;
  content: string;
  kind?: 'example' | 'pdf' | 'text';
  filename?: string;
  pageCount?: number;
};

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
  exercise: {
    title: string; instructions: string[]; debrief: string[]; sourceIds: string[];
    scenario?: string; expectedOutput?: string; sampleResponse?: string; durationMinutes?: number;
    agendaSectionIndex?: number;
  };
  facilitatorNotes: string[];
  sources: { id: string; title: string }[];
  sourceClaims?: { claim: string; sourceId: string; quote: string }[];
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
export type ContentReviewArea = 'goal' | 'audience' | 'constraints' | 'grounding' | 'completeness';
export type ContentReviewChecks = Record<ContentReviewArea, { passed: boolean; reason: string }>;
export type ContentReview = {
  status: 'passed' | 'needs_revision';
  reviewedRevision: number;
  reviewedPackHash?: string;
  mode: 'model' | 'scripted';
  attempt: number;
  checks: ContentReviewChecks;
  issues: { area: ContentReviewArea; message: string }[];
};
export type CurrentAction = {
  phase: 'model' | 'tool' | 'review';
  startedAt: string;
  step: number;
  tool?: string;
  sourceId?: string;
};
export type Run = {
  id: string;
  workshopId?: string;
  displayName?: string;
  copiedFrom?: { runId: string; title: string; updatedAt: string };
  managementHash?: string;
  createdAt: string;
  updatedAt: string;
  status: 'ready' | 'running' | 'awaiting_input' | 'completed' | 'failed';
  mode: 'test' | 'live';
  model: string | null;
  workflowVersion?: 2;
  brief: Brief;
  materials?: Material[];
  clarification?: { key: 'format' | 'detail'; question: string };
  clarificationUsed?: boolean;
  clarificationResponse?: { question: string; answer: string };
  parentRunId?: string;
  revisionContext?: { parentPack: WorkshopPack };
  feedback?: string;
  pack?: WorkshopPack;
  validation?: Validation;
  contentReview?: ContentReview;
  contentReviewCorrections?: number;
  events: ToolEvent[];
  currentAction?: CurrentAction | null;
  error?: string;
  steps: number;
  revision: number;
  readSourceIds: string[];
  messages: ModelMessage[];
  version: number;
};

export type PublicRun = Omit<Run, 'messages' | 'managementHash'>;
export type AppConfig = {
  mode: 'test' | 'live';
  model: string | null;
  storage: 'local' | 'postgres';
  ready: boolean;
  blockers: string[];
};

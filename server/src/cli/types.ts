import { z } from 'zod';

// ── Frontmatter schema (Zod) ─────────────────────────────────────────────────

export const PlanFrontmatterSchema = z.object({
  phase: z.number(),
  plan: z.union([z.number(), z.string()]),
  slug: z.string().min(1),
  type: z.string(),
  wave: z.number().int().min(1),
  depends_on: z.array(z.string()).default([]),
  files_modified: z.array(z.string()).default([]),
  autonomous: z.boolean(),
  requirements: z.array(z.string()).default([]),
  must_haves: z.array(z.string()).default([]),
});

export type PlanFrontmatter = z.infer<typeof PlanFrontmatterSchema>;

// ── Parsed task (extracted from XML block) ───────────────────────────────────

export interface ParsedTask {
  /** Zero-based index of this task within the plan's <tasks> block */
  index: number;
  type: string;
  files: string[];
  action: string;
  verify: string;
  done: string;
  /** The plan-level <context> block, injected with every task */
  context: string;
}

// ── A fully-parsed plan file ─────────────────────────────────────────────────

export interface PlanFile {
  /** Absolute path to the .md file */
  filePath: string;
  frontmatter: PlanFrontmatter;
  /** Raw markdown body (after frontmatter) */
  body: string;
  tasks: ParsedTask[];
}

// ── Build state (tracks progress during a build run) ────────────────────────

export type TaskStatus = 'pending' | 'running' | 'completed' | 'blocked' | 'skipped';

export interface TaskState {
  planSlug: string;
  taskIndex: number;
  status: TaskStatus;
  attempts: number;
  failureReasons: string[];
}

export interface BuildState {
  startedAt: string;
  completedTasks: TaskState[];
  blockedTask: TaskState | null;
  filesModified: string[];
  totalTasks: number;
  doneCount: number;
}

// ── Improve options ──────────────────────────────────────────────────────────

export interface ImproveOptions {
  scope: string[];       // file paths or glob patterns
  maxIterations: number; // default 10
  threshold: number;     // delta threshold, default 0.05
  standalone: boolean;   // true = invoked via `forge improve`, false = auto-pass
}

// ── Stream-json event types from claude subprocess ──────────────────────────

export interface SpawnEventInit {
  type: 'init';
  model: string;
}

export interface SpawnEventAssistant {
  type: 'assistant';
  message: {
    model?: string;
    content: Array<
      | { type: 'text'; text: string }
      | { type: 'tool_use'; name: string; input: Record<string, unknown> }
      | { type: 'tool_result'; content: string }
    >;
    usage?: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
  };
}

export interface SpawnEventResult {
  type: 'result';
  is_error: boolean;
  result?: string;
  duration_ms?: number;
  total_cost_usd?: number;
  usage?: { input_tokens: number; output_tokens: number };
}

export interface SpawnEventError {
  type: 'error';
  error: { message: string };
}

export type SpawnEvent =
  | SpawnEventInit
  | SpawnEventAssistant
  | SpawnEventResult
  | SpawnEventError;

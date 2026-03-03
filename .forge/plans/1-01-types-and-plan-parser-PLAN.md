---
phase: 1
plan: 01
slug: types-and-plan-parser
type: feature
wave: 1
depends_on: []
files_modified:
  - server/src/cli/types.ts
  - server/src/cli/parser.ts
  - server/src/cli/parser.test.ts
autonomous: true
requirements:
  - REQ-008
must_haves:
  - "PlanFile Zod schema validates a well-formed plan frontmatter and rejects malformed input"
  - "parsePlanFiles() reads all *-PLAN.md files from .forge/plans/, returns them sorted by wave then plan number"
  - "extractTask() returns the <task> XML block and its parent <context> for a given task slug"
  - "Tasks with autonomous: false are filtered out and logged as skipped"
  - "All exports are typed — no `any` in the public API"
---

<objective>
Define all shared TypeScript types and the plan file parser. When complete:
- `server/src/cli/types.ts` exports `PlanFile`, `ParsedTask`, `BuildState`, `ImproveOptions`, and `SpawnEvent` interfaces/types
- `server/src/cli/parser.ts` exports `parsePlanFiles()` and `extractTask()` with full Zod validation
- `server/src/cli/parser.test.ts` passes with `pnpm --filter @forge/tools test`
</objective>

<context>
Read these before writing a single line of code:

1. `/Users/dkay/code/forge/server/src/lib/errors.ts` — existing error patterns (makeError, ErrorCategory)
2. `/Users/dkay/code/forge/server/src/lib/runner.ts` — how the codebase handles async subprocess results
3. `/Users/dkay/code/forge/.forge/specs/forge-build-cli-SPEC.md` — REQ-008 describes the plan format in full
4. `/Users/dkay/code/forge/.forge/plans/` — read any existing PLAN.md files to understand the actual frontmatter shape
5. `/Users/dkay/code/forge/server/tsconfig.json` — ESM TypeScript strict mode, `module: Node16`

Key patterns to follow:
- Use Zod for runtime validation of frontmatter (parsed with a YAML parser or simple regex — gray-matter is NOT available, use a hand-rolled frontmatter splitter)
- Use the standard Node.js `fs` module (ESM: `import { readFileSync, readdirSync } from 'node:fs'`)
- All types exported from `types.ts`, all parsing logic in `parser.ts`
- Test file uses vitest (`import { describe, it, expect } from 'vitest'`)

Do NOT:
- Install gray-matter or any YAML parsing library (parse frontmatter manually — it's simple key: value)
- Use `require()` — this is ESM
- Add `chalk` (not available yet — that's plan 1-02)
- Import from tools/ or the MCP server — the CLI is a standalone entry point
</context>

<tasks>
  <task type="auto">
    <files>server/src/cli/types.ts,server/src/cli/parser.test.ts,server/src/cli/parser.ts</files>
    <action>
Step 1 — Write failing tests FIRST (RED phase).

Create `server/src/cli/parser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseFrontmatter, parsePlanFiles, extractTask } from './parser.js';
import { PlanFrontmatterSchema } from './types.js';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

describe('parseFrontmatter', () => {
  it('parses valid frontmatter', () => {
    const md = `---
phase: 1
plan: 01
slug: my-slug
type: feature
wave: 1
depends_on: []
files_modified:
  - server/src/foo.ts
autonomous: true
requirements:
  - REQ-001
must_haves:
  - "some thing"
---

# Content here
`;
    const result = parseFrontmatter(md);
    expect(result.slug).toBe('my-slug');
    expect(result.wave).toBe(1);
    expect(result.autonomous).toBe(true);
    expect(result.files_modified).toEqual(['server/src/foo.ts']);
  });

  it('throws on missing required fields', () => {
    const md = `---
slug: only-slug
---
# body
`;
    expect(() => parseFrontmatter(md)).toThrow();
  });

  it('returns autonomous: false when set', () => {
    const md = `---
phase: 2
plan: 02
slug: manual-task
type: feature
wave: 2
depends_on: []
files_modified: []
autonomous: false
requirements: []
must_haves: []
---
`;
    const result = parseFrontmatter(md);
    expect(result.autonomous).toBe(false);
  });
});

describe('parsePlanFiles', () => {
  it('returns empty array when plans dir does not exist', () => {
    const plans = parsePlanFiles('/nonexistent/path');
    expect(plans).toEqual([]);
  });

  it('sorts by wave then plan number', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-test-'));
    const plan1 = `---
phase: 1
plan: 02
slug: second
type: feature
wave: 1
depends_on: []
files_modified: []
autonomous: true
requirements: []
must_haves: []
---
<tasks><task type="auto"><files>foo.ts</files><action>do it</action><verify>true</verify><done>done</done></task></tasks>
`;
    const plan2 = `---
phase: 1
plan: 01
slug: first
type: feature
wave: 1
depends_on: []
files_modified: []
autonomous: true
requirements: []
must_haves: []
---
<tasks><task type="auto"><files>bar.ts</files><action>do it</action><verify>true</verify><done>done</done></task></tasks>
`;
    fs.writeFileSync(path.join(tmpDir, '1-02-second-PLAN.md'), plan1);
    fs.writeFileSync(path.join(tmpDir, '1-01-first-PLAN.md'), plan2);
    const result = parsePlanFiles(tmpDir);
    expect(result[0]?.frontmatter.slug).toBe('first');
    expect(result[1]?.frontmatter.slug).toBe('second');
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('skips non-PLAN.md files', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-test-'));
    fs.writeFileSync(path.join(tmpDir, 'README.md'), '# ignore me');
    const result = parsePlanFiles(tmpDir);
    expect(result).toEqual([]);
    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe('extractTask', () => {
  it('extracts a single task block with context', () => {
    const content = `---
phase: 1
plan: 01
slug: my-plan
type: feature
wave: 1
depends_on: []
files_modified: []
autonomous: true
requirements: []
must_haves: []
---

<context>
Read the docs.
</context>

<tasks>
  <task type="auto">
    <files>src/foo.ts</files>
    <action>
Do the thing.
    </action>
    <verify>pnpm test</verify>
    <done>Tests pass</done>
  </task>
</tasks>
`;
    const task = extractTask(content, 0);
    expect(task).not.toBeNull();
    expect(task?.action).toContain('Do the thing');
    expect(task?.verify).toBe('pnpm test');
    expect(task?.files).toEqual(['src/foo.ts']);
    expect(task?.context).toContain('Read the docs');
  });

  it('returns null for out-of-range index', () => {
    const content = `---
phase: 1
plan: 01
slug: x
type: feature
wave: 1
depends_on: []
files_modified: []
autonomous: true
requirements: []
must_haves: []
---
<tasks><task type="auto"><files>a.ts</files><action>x</action><verify>true</verify><done>d</done></task></tasks>
`;
    expect(extractTask(content, 5)).toBeNull();
  });
});
```

Run: `cd /Users/dkay/code/forge/server && pnpm test` — tests MUST FAIL (files don't exist yet).

Step 2 — Create `server/src/cli/types.ts`:

```typescript
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
```

Step 3 — Create `server/src/cli/parser.ts`:

```typescript
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { PlanFrontmatterSchema, type PlanFrontmatter, type PlanFile, type ParsedTask } from './types.js';

// ── Frontmatter parsing ──────────────────────────────────────────────────────

/**
 * Hand-rolled YAML frontmatter parser for simple key: value pairs.
 * Supports: scalars, booleans, numbers, and simple block lists (  - item).
 * Does NOT support nested objects — plan frontmatter never needs them.
 */
export function parseFrontmatter(markdown: string): PlanFrontmatter {
  const fmMatch = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch || !fmMatch[1]) {
    throw new Error('No valid YAML frontmatter found');
  }

  const raw: Record<string, unknown> = {};
  const lines = fmMatch[1].split('\n');
  let currentKey: string | null = null;
  let currentList: string[] | null = null;

  for (const line of lines) {
    const listItem = line.match(/^[ \t]+-\s+(.*)/);
    if (listItem && currentKey && currentList) {
      currentList.push(listItem[1]!.trim());
      continue;
    }

    const keyVal = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)/);
    if (!keyVal) continue;

    // Flush previous list
    if (currentKey && currentList) {
      raw[currentKey] = currentList;
    }

    const [, key, value] = keyVal;
    currentKey = key!;
    const v = value!.trim();

    if (v === '' || v === '[]') {
      currentList = [];
      if (v === '[]') { raw[currentKey] = []; currentKey = null; currentList = null; }
    } else if (v === 'true') {
      raw[currentKey] = true; currentList = null; currentKey = null;
    } else if (v === 'false') {
      raw[currentKey] = false; currentList = null; currentKey = null;
    } else if (/^\d+$/.test(v)) {
      raw[currentKey] = parseInt(v, 10); currentList = null; currentKey = null;
    } else {
      raw[currentKey] = v; currentList = null; currentKey = null;
    }
  }

  // Flush any trailing list
  if (currentKey && currentList) {
    raw[currentKey] = currentList;
  }

  return PlanFrontmatterSchema.parse(raw);
}

// ── XML task extraction ──────────────────────────────────────────────────────

function extractBetweenTags(content: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  return content.match(re)?.[1]?.trim() ?? '';
}

function extractContext(body: string): string {
  return extractBetweenTags(body, 'context');
}

/**
 * Extract the Nth <task> block (0-indexed) from plan markdown body.
 * Returns null if no task at that index exists.
 */
export function extractTask(markdown: string, index: number): ParsedTask | null {
  const bodyStart = markdown.indexOf('\n---\n');
  const body = bodyStart >= 0 ? markdown.slice(bodyStart + 5) : markdown;

  const context = extractContext(body);

  // Extract all <task> blocks
  const taskRe = /<task([^>]*)>([\s\S]*?)<\/task>/gi;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = taskRe.exec(body)) !== null) {
    if (i === index) {
      const attrs = match[1] ?? '';
      const inner = match[2] ?? '';
      const typeMatch = attrs.match(/type="([^"]+)"/);
      const taskType = typeMatch?.[1] ?? 'auto';

      const filesRaw = extractBetweenTags(inner, 'files');
      const files = filesRaw
        ? filesRaw.split(',').map(f => f.trim()).filter(Boolean)
        : [];

      return {
        index,
        type: taskType,
        files,
        action: extractBetweenTags(inner, 'action'),
        verify: extractBetweenTags(inner, 'verify'),
        done: extractBetweenTags(inner, 'done'),
        context,
      };
    }
    i++;
  }

  return null;
}

// ── Plan file loading ────────────────────────────────────────────────────────

function parsePlanNumber(filename: string): number {
  // e.g. "1-02-slug-PLAN.md" → wave 1, plan 02 → sort key 102
  const m = filename.match(/^(\d+)-(\d+)-/);
  if (!m) return 9999;
  return parseInt(m[1]!, 10) * 1000 + parseInt(m[2]!, 10);
}

/**
 * Load and parse all *-PLAN.md files from a directory.
 * Returns them sorted by wave then plan number.
 * Returns empty array if the directory does not exist.
 */
export function parsePlanFiles(plansDir: string): PlanFile[] {
  if (!existsSync(plansDir)) return [];

  let files: string[];
  try {
    files = readdirSync(plansDir).filter(f => f.endsWith('-PLAN.md'));
  } catch {
    return [];
  }

  files.sort((a, b) => parsePlanNumber(a) - parsePlanNumber(b));

  const results: PlanFile[] = [];

  for (const filename of files) {
    const filePath = path.join(plansDir, filename);
    let content: string;
    try {
      content = readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }

    let frontmatter: PlanFrontmatter;
    try {
      frontmatter = parseFrontmatter(content);
    } catch {
      // Skip malformed plan files silently (they'll be reported at build time)
      continue;
    }

    // Extract body (after frontmatter)
    const bodyStart = content.indexOf('\n---\n');
    const body = bodyStart >= 0 ? content.slice(bodyStart + 5) : content;

    // Extract all tasks
    const tasks: ParsedTask[] = [];
    let taskIndex = 0;
    let task = extractTask(content, taskIndex);
    while (task !== null) {
      tasks.push(task);
      taskIndex++;
      task = extractTask(content, taskIndex);
    }

    results.push({ filePath, frontmatter, body, tasks });
  }

  return results;
}
```

Step 4 — Run tests again to confirm GREEN:
`cd /Users/dkay/code/forge/server && pnpm test`

Step 5 — Typecheck:
`cd /Users/dkay/code/forge/server && pnpm typecheck`
    </action>
    <verify>cd /Users/dkay/code/forge/server && pnpm test 2>&1 | grep -E "passed|failed"</verify>
    <done>All parser.test.ts tests pass and typecheck exits 0</done>
  </task>
</tasks>

<verification>cd /Users/dkay/code/forge/server && pnpm test && pnpm typecheck</verification>
<success_criteria>
[REQ-008]: PlanFrontmatterSchema validates the wave/plan/autonomous fields used to sort and filter tasks. parsePlanFiles() returns plans sorted by wave then plan number. extractTask() provides the <task> XML block injected into each Claude subprocess prompt.
</success_criteria>

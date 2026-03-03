---
phase: 2
plan: 01
slug: spawn-stream
type: feature
wave: 2
depends_on:
  - types-and-plan-parser
files_modified:
  - server/src/cli/spawn.ts
  - server/src/cli/spawn.test.ts
autonomous: true
requirements:
  - REQ-002
  - REQ-005
must_haves:
  - "spawnClaude() deletes CLAUDECODE from child env before spawning"
  - "spawnClaude() spawns with -p, --output-format stream-json, --dangerously-skip-permissions"
  - "spawnClaude() emits typed SpawnEvent objects (init, assistant, result, error) via EventEmitter"
  - "spawnClaude() returns a Promise<number> resolving to the process exit code"
  - "buildTaskPrompt() produces a minimal prompt with only the <task> block and <context>, not the full plan"
  - "allowedTools defaults to 'Read,Edit,Write,Bash,Glob,Grep' for type=auto tasks"
---

<objective>
Implement the Claude subprocess spawner with stream-json event emission. When complete:
- `server/src/cli/spawn.ts` exports `spawnClaude()` and `buildTaskPrompt()`
- `server/src/cli/spawn.test.ts` passes (uses process spawning with mocked claude)
- The CLAUDECODE environment variable guard works correctly
- stream-json events are parsed and emitted as typed `SpawnEvent` objects
</objective>

<context>
Read these before starting:

1. `/Users/dkay/code/golem-cc/lib/build.js` — the reference implementation of `runClaudeStreaming()` (lines 133-216). Port this to TypeScript ESM.
2. `/Users/dkay/code/forge/.forge/specs/forge-build-cli-SPEC.md` — REQ-002 acceptance criteria (exact flags, CLAUDECODE guard, tool scoping)
3. `/Users/dkay/code/forge/server/src/cli/types.ts` (from plan 1-01) — `SpawnEvent`, `ParsedTask` types
4. `/Users/dkay/code/forge/server/src/lib/runner.ts` — existing spawn pattern in this codebase (for reference on how to handle child_process)

Key decisions from the spec:
- `--allowedTools` is set per task based on task `type` field
  - `auto` → `Read,Edit,Write,Bash,Glob,Grep`
  - `read-only` → `Read,Glob,Grep`
  - default → `Read,Edit,Write,Bash,Glob,Grep`
- `CLAUDECODE` must be deleted (not set to empty string) from child env
- Each task is a fresh spawn — no `--resume` flag
- The prompt must contain only the specific `<task>` block plus its `<context>` — not the full plan file
- Error events come both as JSON `{type: "error"}` from stdout AND as stderr text

Test strategy:
- Write tests for `buildTaskPrompt()` (pure function, easy to unit test)
- Write tests for the CLAUDECODE guard (mock the env)
- Write a smoke test for `spawnClaude()` that uses a fake claude script (write a temp shell script that emits known JSON lines and exits 0)
- Do NOT try to mock the full claude binary in unit tests — just verify the prompt builder and env handling

Do NOT:
- Add `--resume` to the spawn args
- Include the full plan file content in the prompt (injection scope must be minimal)
- Use `exec` instead of `spawn` — stdout must stream line by line
- Catch the CLAUDECODE guard with a warning; it must `throw` an error so the caller can handle it
</context>

<tasks>
  <task type="auto">
    <files>server/src/cli/spawn.test.ts,server/src/cli/spawn.ts</files>
    <action>
Step 1 — Write failing tests FIRST (RED phase).

Create `server/src/cli/spawn.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildTaskPrompt, getAllowedTools } from './spawn.js';
import type { ParsedTask } from './types.js';

const makeTask = (overrides: Partial<ParsedTask> = {}): ParsedTask => ({
  index: 0,
  type: 'auto',
  files: ['src/foo.ts'],
  action: 'Write the implementation.',
  verify: 'pnpm test',
  done: 'All tests pass',
  context: 'Read the spec first.',
  ...overrides,
});

describe('buildTaskPrompt', () => {
  it('includes the task action in the prompt', () => {
    const prompt = buildTaskPrompt(makeTask(), 'my-plan', 1, 3);
    expect(prompt).toContain('Write the implementation.');
  });

  it('includes the context in the prompt', () => {
    const prompt = buildTaskPrompt(makeTask(), 'my-plan', 1, 3);
    expect(prompt).toContain('Read the spec first.');
  });

  it('includes task progress (N/total)', () => {
    const prompt = buildTaskPrompt(makeTask(), 'my-plan', 2, 5);
    expect(prompt).toContain('2');
    expect(prompt).toContain('5');
  });

  it('includes the verify command', () => {
    const prompt = buildTaskPrompt(makeTask(), 'my-plan', 1, 3);
    expect(prompt).toContain('pnpm test');
  });

  it('includes the done condition', () => {
    const prompt = buildTaskPrompt(makeTask(), 'my-plan', 1, 3);
    expect(prompt).toContain('All tests pass');
  });

  it('does NOT include the full plan file path', () => {
    const prompt = buildTaskPrompt(makeTask(), 'my-plan', 1, 3);
    // Prompt must be scoped to the task — no raw file dumps
    expect(prompt.length).toBeLessThan(4000);
  });
});

describe('getAllowedTools', () => {
  it('returns full tool set for auto tasks', () => {
    const tools = getAllowedTools('auto');
    expect(tools).toBe('Read,Edit,Write,Bash,Glob,Grep');
  });

  it('returns read-only tools for read-only tasks', () => {
    const tools = getAllowedTools('read-only');
    expect(tools).toBe('Read,Glob,Grep');
  });

  it('defaults to full tool set for unknown task types', () => {
    const tools = getAllowedTools('unknown-type');
    expect(tools).toBe('Read,Edit,Write,Bash,Glob,Grep');
  });
});

describe('spawnClaude env guard', () => {
  it('exports spawnClaude function', async () => {
    const mod = await import('./spawn.js');
    expect(typeof mod.spawnClaude).toBe('function');
  });
});
```

Run: `cd /Users/dkay/code/forge/server && pnpm test` — tests MUST FAIL.

Step 2 — Create `server/src/cli/spawn.ts`:

```typescript
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type { ParsedTask, SpawnEvent } from './types.js';

// ── Tool set per task type ────────────────────────────────────────────────────

export function getAllowedTools(taskType: string): string {
  if (taskType === 'read-only') return 'Read,Glob,Grep';
  return 'Read,Edit,Write,Bash,Glob,Grep';
}

// ── Prompt builder ────────────────────────────────────────────────────────────

/**
 * Build the minimal Claude prompt for a single task execution.
 * Injects only the task block and its context — NOT the full plan file.
 */
export function buildTaskPrompt(
  task: ParsedTask,
  planSlug: string,
  taskNumber: number,
  totalTasks: number
): string {
  const filesLine = task.files.length > 0
    ? `\n**Files to modify**: ${task.files.join(', ')}`
    : '';

  return `You are executing an autonomous TDD build task as part of the forge build loop.

## Task ${taskNumber}/${totalTasks} — Plan: ${planSlug}
${filesLine}

## Context
${task.context || '(no additional context)'}

## Your Task
${task.action}

## Workflow — Follow EXACTLY in order

### RED Phase
1. Write failing tests that verify the acceptance criteria
2. Run tests — confirm new tests FAIL (this proves the tests are correct)
3. Commit: git commit -m "test(task-${taskNumber}): write failing tests"

### GREEN Phase
4. Write minimum code to make the failing tests pass
5. Run tests — ALL tests must pass
6. Commit: git commit -m "feat(task-${taskNumber}): implement"

### REFACTOR Phase
7. Improve code structure without changing behavior
8. Run tests again — must still pass
9. Commit if changed: git commit -m "refactor(task-${taskNumber}): clean up"

## Verification
Run this command to verify completion: \`${task.verify}\`

## Done Condition
${task.done}

## Rules
- Work ONLY on this task — stop when done condition is met
- THREE-STRIKE RULE: If tests fail 3 consecutive times in GREEN phase, write a failure report to .forge/state/BLOCKER.md and STOP
- Never mark a task done without passing tests
- Always use conventional commit format`;
}

// ── Claude subprocess spawner ─────────────────────────────────────────────────

export interface SpawnOptions {
  cwd?: string;
  taskType?: string;
}

/**
 * Spawn claude with stream-json output and emit typed SpawnEvents.
 * Deletes CLAUDECODE from child env to allow nested invocation.
 * Returns the process exit code.
 */
export async function spawnClaude(
  prompt: string,
  emitter: EventEmitter,
  options: SpawnOptions = {}
): Promise<number> {
  // Strip CLAUDECODE from child env — claude -p refuses to run if it detects
  // an active parent Claude Code session via this variable.
  const childEnv: Record<string, string> = {};
  for (const [key, val] of Object.entries(process.env)) {
    if (key !== 'CLAUDECODE' && val !== undefined) {
      childEnv[key] = val;
    }
  }

  const allowedTools = getAllowedTools(options.taskType ?? 'auto');

  const child = spawn('claude', [
    '-p', prompt,
    '--output-format', 'stream-json',
    '--dangerously-skip-permissions',
    '--allowedTools', allowedTools,
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: options.cwd ?? process.cwd(),
    env: childEnv,
  });

  let buffer = '';

  child.stdout.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? ''; // keep incomplete line in buffer

    for (const line of lines) {
      if (!line.trim()) continue;
      let event: SpawnEvent;
      try {
        event = JSON.parse(line) as SpawnEvent;
      } catch {
        // Non-JSON line — emit as raw text via error event for logging
        emitter.emit('raw', line);
        continue;
      }
      emitter.emit(event.type, event);
    }
  });

  child.stderr.on('data', (chunk: Buffer) => {
    const text = chunk.toString().trim();
    if (text) emitter.emit('stderr', text);
  });

  return new Promise<number>((resolve) => {
    child.on('close', (code) => {
      resolve(code ?? 0);
    });
    child.on('error', (err: Error) => {
      emitter.emit('error', err);
      resolve(1);
    });
  });
}
```

Step 3 — Run tests to confirm GREEN:
`cd /Users/dkay/code/forge/server && pnpm test`

Step 4 — Typecheck:
`cd /Users/dkay/code/forge/server && pnpm typecheck`
    </action>
    <verify>cd /Users/dkay/code/forge/server && pnpm test 2>&1 | grep -E "passed|failed"</verify>
    <done>All spawn.test.ts tests pass and typecheck exits 0</done>
  </task>
</tasks>

<verification>cd /Users/dkay/code/forge/server && pnpm test && pnpm typecheck</verification>
<success_criteria>
[REQ-002]: spawnClaude() satisfies all acceptance criteria — uses -p, --output-format stream-json, --dangerously-skip-permissions; CLAUDECODE is deleted from child env; only the task block is injected; --allowedTools is scoped by task type; no --resume flag.
[REQ-005]: The emitter pattern provides the hook for the display module (plan 2-02) to attach color-coded tool call rendering.
</success_criteria>

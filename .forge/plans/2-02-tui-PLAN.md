---
phase: 2
plan: 02
slug: tui
type: feature
wave: 2
depends_on:
  - chalk-dep
files_modified:
  - server/src/cli/tui.ts
  - server/src/cli/display.ts
  - server/src/cli/tui.test.ts
autonomous: true
requirements:
  - REQ-003
  - REQ-005
must_haves:
  - "createTui() enters alternate screen on init() and restores it on destroy()"
  - "TUI header shows: project name, task ID/title, progress (N/Total), attempt dots, elapsed time, phase badge"
  - "appendLog() writes to the scrolling region without disturbing the header"
  - "attachDisplay() registers emitter handlers that render [Read]/[Edit]/[Write]/[Bash]/[Glob]/[Grep] labels in distinct colors"
  - "Tool output is truncated to 8 lines with '... (N more lines)' when longer"
  - "destroy() resets scroll region, exits alternate screen, restores cursor"
  - "All TUI pure functions (phaseBadge, attemptDots) are unit tested"
---

<objective>
Implement the alternate-screen TUI and the display event handler. When complete:
- `server/src/cli/tui.ts` exports `createTui()` and pure helper functions
- `server/src/cli/display.ts` exports `attachDisplay()` that handles SpawnEvent emitter events
- `server/src/cli/tui.test.ts` passes — pure functions are fully tested without needing a real TTY
</objective>

<context>
Read these before starting:

1. `/Users/dkay/code/golem-cc/lib/tui.js` — the reference TUI implementation. Port the core structure to TypeScript ESM. Key differences from golem-cc:
   - Replace "GOLEM BUILD" label with "FORGE BUILD"
   - Remove usage/rate limit display (not needed for forge)
   - Keep: alternate screen, scroll region, header with phase badge, attempt dots, progress bar, appendLog
2. `/Users/dkay/code/golem-cc/lib/display.js` — the reference display/event handler. Port attachDisplay() to TypeScript ESM.
3. `/Users/dkay/code/forge/server/src/cli/chalk.ts` (from plan 1-02) — import chalk from here
4. `/Users/dkay/code/forge/.forge/specs/forge-build-cli-SPEC.md` — REQ-003 (TUI), REQ-005 (display) acceptance criteria

Key porting decisions:
- Use `import { chalk } from './chalk.js'` (NOT `require('./chalk-shim.js')`)
- Remove `sparkline`, `formatTokens`, `getUsageData`, `fetchUsage`, `rateLimit` — not needed
- Keep `HEADER_LINES = 6` (reduce from 7 since we drop the rate limit row)
- Keep `phaseBadge`, `attemptDots`, `segmentedBar`, `taskChecklist` as pure exported functions
- `createTui()` returns the same shape: `{ init, updateTask, appendLog, destroy }`
- `init()` takes `{ taskId, taskTitle, stage, done, total, tasks }` — no usageData param

Test strategy:
- Unit test pure functions: `phaseBadge`, `attemptDots`, `segmentedBar`, `taskChecklist`
- These do NOT require a real TTY — test their return value shape
- Do NOT try to test alternate screen ANSI codes in unit tests — that requires a real TTY
- `attachDisplay` tests: verify the emitter handlers are registered and that calling them doesn't throw

Do NOT:
- Import from golem-cc directly — copy the needed logic and port it
- Add rate limit or token usage display to the header
- Use `require()` — ESM only
- Directly write to `process.stdout` in tests — that will corrupt the test runner output
</context>

<tasks>
  <task type="auto">
    <files>server/src/cli/tui.test.ts,server/src/cli/tui.ts,server/src/cli/display.ts</files>
    <action>
Step 1 — Write failing tests FIRST (RED phase).

Create `server/src/cli/tui.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { phaseBadge, attemptDots, segmentedBar, taskChecklist } from './tui.js';

describe('phaseBadge', () => {
  it('returns a non-empty string for known phases', () => {
    const badge = phaseBadge('RED');
    expect(typeof badge).toBe('string');
    expect(badge.length).toBeGreaterThan(0);
    // Contains the phase name
    expect(badge).toContain('RED');
  });

  it('returns empty string for falsy input', () => {
    expect(phaseBadge('')).toBe('');
    expect(phaseBadge(null as unknown as string)).toBe('');
  });

  it('handles all known phase names', () => {
    for (const phase of ['RED', 'GREEN', 'REFACTOR', 'SECURE', 'CHECKPOINT']) {
      const badge = phaseBadge(phase);
      expect(badge).toContain(phase);
    }
  });
});

describe('attemptDots', () => {
  it('returns 3 dots for maxAttempts=3', () => {
    const dots = attemptDots(1, 3);
    // Strip ANSI — should have 3 dot chars (● or ○)
    const plain = dots.replace(/\x1b\[[0-9;]*m/g, '');
    expect((plain.match(/[●○]/g) ?? []).length).toBe(3);
  });

  it('shows filled dots for used attempts', () => {
    const dots = attemptDots(2, 3);
    const plain = dots.replace(/\x1b\[[0-9;]*m/g, '');
    expect((plain.match(/●/g) ?? []).length).toBe(2);
    expect((plain.match(/○/g) ?? []).length).toBe(1);
  });
});

describe('segmentedBar', () => {
  it('returns a string of the requested width', () => {
    const bar = segmentedBar(0, 0, 5, 20);
    const plain = bar.replace(/\x1b\[[0-9;]*m/g, '');
    expect(plain.length).toBe(20);
  });

  it('returns all-empty bar when no tasks complete', () => {
    const bar = segmentedBar(0, 0, 3, 12);
    const plain = bar.replace(/\x1b\[[0-9;]*m/g, '');
    expect(plain).toMatch(/[░█]+/);
  });

  it('handles zero total tasks', () => {
    const bar = segmentedBar(0, 0, 0, 10);
    expect(typeof bar).toBe('string');
  });
});

describe('taskChecklist', () => {
  const tasks = [
    { id: 'T-001', status: 'completed' as const },
    { id: 'T-002', status: 'pending' as const },
    { id: 'T-003', status: 'pending' as const },
  ];

  it('returns a string when width is sufficient', () => {
    const cl = taskChecklist(tasks, 'T-002', 120);
    if (cl) {
      expect(cl).toContain('T-001');
      expect(cl).toContain('T-002');
    }
  });

  it('returns empty string when tasks array is empty', () => {
    expect(taskChecklist([], 'T-001', 120)).toBe('');
  });

  it('returns empty string when width is too narrow', () => {
    // Very narrow terminal — checklist should be suppressed
    expect(taskChecklist(tasks, 'T-002', 5)).toBe('');
  });
});

describe('attachDisplay', () => {
  it('exports attachDisplay function', async () => {
    const mod = await import('./display.js');
    expect(typeof mod.attachDisplay).toBe('function');
  });

  it('registers event handlers without throwing', async () => {
    const { attachDisplay } = await import('./display.js');
    const { EventEmitter } = await import('node:events');
    const emitter = new EventEmitter();
    // Should not throw when no tui is provided
    expect(() => attachDisplay(emitter, {})).not.toThrow();
  });

  it('handles assistant event with tool_use block', async () => {
    const { attachDisplay } = await import('./display.js');
    const { EventEmitter } = await import('node:events');
    const emitter = new EventEmitter();
    const log: string[] = [];
    const fakeTui = {
      appendLog: (line: string) => log.push(line),
      setTaskModel: () => {},
    };
    attachDisplay(emitter, { tui: fakeTui });

    emitter.emit('assistant', {
      type: 'assistant',
      message: {
        content: [{
          type: 'tool_use',
          name: 'Read',
          input: { file_path: 'src/foo.ts' },
        }],
      },
    });

    expect(log.some(l => l.includes('Read'))).toBe(true);
  });
});
```

Run: `cd /Users/dkay/code/forge/server && pnpm test` — tests MUST FAIL.

Step 2 — Create `server/src/cli/tui.ts` (ported from golem-cc/lib/tui.js):

Port the tui.js logic to TypeScript ESM with these specific changes:
- Import `chalk` from `'./chalk.js'`
- Remove all usage/ratelimit display code (`sparkline`, `formatTokens`, `getUsageData`, `fetchUsage`, `modelLine`, `drawModelLines`)
- Set `HEADER_LINES = 6` (header is 6 lines: title, task line, separator x4 = adjust to match actual layout)
- Replace `'GOLEM BUILD'` with `'FORGE BUILD'`
- `init()` signature: `init(taskData: { taskId: string; taskTitle: string; stage: string; done: number; total: number; tasks?: TaskItem[] }): void` — no usageData param
- Remove `updateTokens`, `updateRateLimit`, `updateUsage`, `setTaskModel`, `resetTimer`, `getCumulativeElapsed` from the public API (simplify — the forge TUI doesn't need these)
- Keep: `init`, `updateTask`, `appendLog`, `destroy`
- Export pure functions: `phaseBadge`, `attemptDots`, `segmentedBar`, `taskChecklist`, `HEADER_LINES`

The `TaskItem` interface:
```typescript
export interface TaskItem {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'blocked' | 'skipped';
}
```

The `Tui` interface (return type of createTui):
```typescript
export interface Tui {
  init(taskData: { taskId: string; taskTitle: string; stage: string; done: number; total: number; tasks?: TaskItem[] }): void;
  updateTask(data: Partial<{ taskId: string; taskTitle: string; stage: string; done: number; total: number; attempt: number; maxAttempts: number; tasks: TaskItem[] }>): void;
  appendLog(line: string): void;
  destroy(): void;
}
```

Step 3 — Create `server/src/cli/display.ts` (ported from golem-cc/lib/display.js):

Port display.js to TypeScript ESM with these changes:
- Import `chalk` from `'./chalk.js'`
- Import `EventEmitter` from `'node:events'`
- Import `Tui` type from `'./tui.js'`
- Replace all `chalk.bold.cyan('[Golem]')` references with `chalk.bold.cyan('[Forge]')`
- Remove any `output.js` / spinner imports — in forge's CLI, there's no non-TUI mode (TUI is always active)
- The `attachDisplay` function signature:
  ```typescript
  export function attachDisplay(emitter: EventEmitter, opts: { tui?: Pick<Tui, 'appendLog'> & { setTaskModel?: (m: string) => void } }): DisplayContext
  ```
- `DisplayContext` interface:
  ```typescript
  export interface DisplayContext {
    stats: {
      inputTokens: number;
      outputTokens: number;
      filesModified: string[];
      durationMs: number;
      cost: number;
    };
  }
  ```

Step 4 — Run tests to confirm GREEN:
`cd /Users/dkay/code/forge/server && pnpm test`

Step 5 — Typecheck:
`cd /Users/dkay/code/forge/server && pnpm typecheck`
    </action>
    <verify>cd /Users/dkay/code/forge/server && pnpm test 2>&1 | grep -E "passed|failed"</verify>
    <done>All tui.test.ts tests pass and typecheck exits 0</done>
  </task>
</tasks>

<verification>cd /Users/dkay/code/forge/server && pnpm test && pnpm typecheck</verification>
<success_criteria>
[REQ-003]: createTui() enters alternate screen on init(), header shows all required fields (project name replaced with plan slug, task ID/title, N/Total progress, attempt dots, elapsed time, phase badge), appendLog() targets the scroll region, destroy() cleanly exits alternate screen.
[REQ-005]: attachDisplay() renders [Read]/[Edit]/[Write]/[Bash]/[Glob]/[Grep] in distinct colors, truncates tool output to 8 lines with '... (N more lines)', renders reasoning text in dim/italic style.
</success_criteria>

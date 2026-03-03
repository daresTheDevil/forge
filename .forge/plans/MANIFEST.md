# Plan Manifest — forge-build-cli

**Spec**: `.forge/specs/forge-build-cli-SPEC.md`
**Status**: READY
**Date**: 2026-03-02
**Total Plans**: 8
**Total Waves**: 4

---

## Wave Structure

Plans execute in wave order. All plans in Wave N must complete before any plan in Wave N+1 begins.
Within a wave, plans execute sequentially.

---

## Wave 1 — Foundation (no dependencies)

Both plans in Wave 1 are independent and set up the shared infrastructure for all later waves.

| Plan | File | Slug | Type | Autonomous | Requirements |
|------|------|------|------|-----------|--------------|
| 1-01 | `1-01-types-and-plan-parser-PLAN.md` | `types-and-plan-parser` | feature | true | REQ-008 |
| 1-02 | `1-02-chalk-dep-PLAN.md` | `chalk-dep` | chore | true | REQ-003, REQ-005 |

**Wave 1 outcome**: Zod types + plan parser are tested and compiled; chalk is installed and the build compiles cleanly.

---

## Wave 2 — Subprocess and UI (depends on Wave 1)

Wave 2 builds the Claude subprocess spawner and the alternate-screen TUI, both of which depend on the types from Wave 1.

| Plan | File | Slug | Type | Autonomous | Requirements |
|------|------|------|------|-----------|--------------|
| 2-01 | `2-01-spawn-stream-PLAN.md` | `spawn-stream` | feature | true | REQ-002, REQ-005 |
| 2-02 | `2-02-tui-PLAN.md` | `tui` | feature | true | REQ-003, REQ-005 |

**Wave 2 outcome**: `spawnClaude()` emits typed stream-json events; `createTui()` manages the alternate screen with a live header and scrolling log.

---

## Wave 3 — Loop Logic (depends on Wave 2)

Wave 3 implements the orchestration loops that use the spawn and TUI modules.

| Plan | File | Slug | Type | Autonomous | Requirements |
|------|------|------|------|-----------|--------------|
| 3-01 | `3-01-build-loop-PLAN.md` | `build-loop` | feature | true | REQ-001, REQ-003, REQ-004, REQ-008, REQ-009 |
| 3-02 | `3-02-improve-loop-PLAN.md` | `improve-loop` | feature | true | REQ-006, REQ-007 |

**Wave 3 outcome**: `runBuild()` executes tasks in wave order with three-strike retry and BLOCKER.md; `runImprove()` iterates with delta threshold and is also available standalone.

---

## Wave 4 — Entrypoints and Wiring (depends on Wave 3)

Wave 4 wires everything into executable entry points.

| Plan | File | Slug | Type | Autonomous | Requirements |
|------|------|------|------|-----------|--------------|
| 4-01 | `4-01-cli-entry-PLAN.md` | `cli-entry` | feature | true | REQ-001, REQ-007 |
| 4-02 | `4-02-dispatcher-and-install-PLAN.md` | `dispatcher-and-install` | feature | true | REQ-001, REQ-007 |

**Wave 4 outcome**: `server/dist/cli/index.js` is a working CLI; `install.sh` writes a dispatcher that routes `forge build` and `forge improve` to it.

---

## Requirements Coverage

| Requirement | Covered By |
|-------------|-----------|
| REQ-001: `forge build` terminal command is invokable | 3-01, 4-01, 4-02 |
| REQ-002: Headless Claude invocation per task | 2-01 |
| REQ-003: Alternate-screen TUI with live header | 1-02, 2-02, 3-01 |
| REQ-004: Three-strike retry with BLOCKER.md | 3-01 |
| REQ-005: Real-time stream-json tool call rendering | 1-02, 2-01, 2-02 |
| REQ-006: Auto-improve pass after successful build | 3-02 |
| REQ-007: Standalone `forge improve [path]` command | 3-02, 4-01, 4-02 |
| REQ-008: Wave-ordered plan parsing | 1-01, 3-01 |
| REQ-009: Post-build terminal summary | 3-01 |

---

## Files Created Across All Plans

```
server/src/cli/
  types.ts            (1-01) — Zod schemas and TypeScript interfaces
  parser.ts           (1-01) — parsePlanFiles(), extractTask()
  parser.test.ts      (1-01) — Vitest tests for parser
  chalk.ts            (1-02) — canonical chalk re-export
  spawn.ts            (2-01) — spawnClaude(), buildTaskPrompt(), getAllowedTools()
  spawn.test.ts       (2-01) — Vitest tests for spawn
  tui.ts              (2-02) — createTui(), pure helper functions
  display.ts          (2-02) — attachDisplay(), DisplayContext
  tui.test.ts         (2-02) — Vitest tests for TUI pure functions
  build.ts            (3-01) — runBuild(), groupByWave(), formatSummary(), writeBlocker()
  build.test.ts       (3-01) — Vitest tests for build loop
  improve.ts          (3-02) — runImprove(), runImproveCommand(), buildImprovePrompt()
  improve.test.ts     (3-02) — Vitest tests for improve loop
  index.ts            (4-01) — CLI entry point, parseCliArgs()
  index.test.ts       (4-01) — Vitest tests for CLI arg parsing

server/package.json   (1-02) — adds chalk dependency
install.sh            (4-02) — adds build/improve dispatcher routing
```

---

## Build & Test Commands

```bash
# Run all tests (from server/ directory)
cd server && pnpm test

# Typecheck
cd server && pnpm typecheck

# Build
cd server && pnpm build

# Smoke test CLI after build
node server/dist/cli/index.js
node server/dist/cli/index.js build   # (requires .forge/plans/ in cwd)
node server/dist/cli/index.js improve src/foo.ts
```

---

## Key Constraints (from spec)

- **No gray-matter**: Parse YAML frontmatter by hand (key: value pairs only)
- **No commander/yargs**: Parse `process.argv` directly
- **No glob library**: Use `readdirSync` recursion for directory expansion
- **No `--resume`**: Each task is a fresh Claude subprocess
- **ESM only**: No `require()` — the server package uses `"type": "module"`
- **pnpm, not npm**: All package operations use `pnpm`
- **CLAUDECODE guard**: Every subprocess invocation deletes CLAUDECODE from child env
- **Non-fatal improve**: Improve subprocess failures are caught; build success is not invalidated

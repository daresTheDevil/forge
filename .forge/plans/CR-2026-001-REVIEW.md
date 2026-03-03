# Code Review: CR-2026-001
**Reviewer**: forge parallel review team (code-reviewer + security-reviewer + performance-reviewer)
**Date**: 2026-03-02
**Verdict**: CHANGES REQUIRED

## Summary

The implementation is structurally sound: all spec constraints (no gray-matter, no commander/yargs, no glob library, no --resume, ESM-only, CLAUDECODE env deletion) are satisfied. 60 tests pass and typecheck is clean. However, there are **4 HALT-level findings** — three security and one correctness — that must be resolved before merge. Additionally, 14 REVIEW/NOTE-level findings ranging from a broken summary field to a symlink-cycle crash risk in the improve loop.

---

## Requirements Coverage

| REQ | Status | Notes |
|-----|--------|-------|
| REQ-001 | ✓ PASS | CLI routes `forge build` → `runBuild()`, exits with return code |
| REQ-002 | ⚠ PARTIAL | CLAUDECODE deleted from child env ✓; guard fires after TUI init (ordering bug) |
| REQ-003 | ✓ PASS | Alternate-screen TUI with header, scroll region, phase badge, attempt dots |
| REQ-004 | ✓ PASS | Three-strike retry, BLOCKER.md written on third failure, exit code 1 |
| REQ-005 | ✓ PASS | attachDisplay renders [Read]/[Edit]/[Write]/[Bash]/[Glob]/[Grep] with distinct colors, truncates to 8 lines |
| REQ-006 | ✗ FAIL | `improveRan` is never set to true in `build.ts` — summary always reports improve did not run |
| REQ-007 | ⚠ PARTIAL | Standalone `forge improve` works; glob patterns (e.g. `src/**`) silently dropped |
| REQ-008 | ✓ PASS | Plans sorted by wave then plan number, autonomous:false tasks filtered |
| REQ-009 | ⚠ PARTIAL | Summary prints but improve-ran field always wrong (see REQ-006) |

---

## Findings

### [HALT][SEC] verify command executed via `sh -c` — arbitrary shell injection
**File**: `server/src/cli/build.ts:222`
**Issue**: `task.verify` is extracted verbatim from the plan file's `<verify>` block and passed directly to `spawnSync('sh', ['-c', task.verify])`. Every shell operator (`;`, `&&`, `$()`, pipes, redirects) is live. A crafted `<verify>` field can execute arbitrary commands as the developer.
**Recommendation**: Replace `sh -c` with direct argv parsing — split `task.verify` on whitespace (reject shell metacharacters) and pass as `spawnSync(cmd, args, { shell: false })`. This eliminates the shell interpreter entirely.

### [HALT][SEC] Prompt injection via plan file content
**File**: `server/src/cli/spawn.ts:37,57`
**Issue**: `task.action`, `task.context`, `task.verify`, and `task.done` are injected verbatim into the Claude prompt. The spawned agent has `--dangerously-skip-permissions` and `Write,Bash` access. A crafted plan file can inject arbitrary instructions that the agent will execute against the developer's filesystem and credentials.
**Recommendation**: Add a validation pass in `parsePlanFiles()` that rejects task fields containing prompt-injection patterns. Consider eliminating `Bash` from the default allowed-tools set and requiring explicit opt-in per task.

### [HALT][SEC] `install.sh` heredoc embeds `FORGE_DIR` without quoting — path injection
**File**: `install.sh:191-220`
**Issue**: The SHEOF heredoc embeds `$FORGE_DIR` unquoted into the generated dispatcher. If the install path contains shell metacharacters, the generated dispatcher executes injected commands on every `forge build` invocation.
**Recommendation**: Wrap FORGE_DIR in single-quotes in the generated dispatcher using the `'\''` technique, or use `printf %q` to produce a shell-safe representation.

### [HALT][CODE] CLAUDECODE guard fires after TUI initialization — terminal left in broken state
**File**: `server/src/cli/build.ts:121-143`
**Issue**: The CLAUDECODE check at line 134 runs after `createTui()` at line 143 (dryRun path aside, on the real path the TUI is initialized before the guard fires). When the guard triggers, `tui.destroy()` is never called, leaving the terminal in alternate screen / raw stdin mode permanently.
**Recommendation**: Move the CLAUDECODE guard to the top of `runBuild()`, before any file I/O or TUI initialization.

---

### [REVIEW][CODE] `improveRan` never set to true — summary always wrong
**File**: `server/src/cli/build.ts:153`, `index.ts:62-69`
**Issue**: `improveRan` is initialized to `false` in `build.ts` and never mutated. The improve pass is called from `index.ts`, so `formatSummary(buildState, improveRan)` always reports improve did not run. Violates REQ-006/REQ-009.
**Recommendation**: Move the improve invocation into `runBuild()` and thread the result back before calling `formatSummary`.

### [REVIEW][CODE] `buildTaskPrompt` receives per-plan task count, not build-wide total
**File**: `server/src/cli/build.ts:205`
**Issue**: `plan.tasks.length` is the count for the current plan file. Claude's prompt says "Task 1/2" per plan rather than "Task 3/12" across the build. Spec requires overall progress.
**Recommendation**: Pass `buildState.doneCount + 1` and `totalTasks` (build-wide) to `buildTaskPrompt`.

### [REVIEW][CODE] Glob patterns silently dropped in `resolveScope`
**File**: `server/src/cli/improve.ts:63-64`
**Issue**: `existsSync('src/routes/**')` returns false, so glob patterns are silently discarded. `forge improve src/**` does nothing. Spec (REQ-007) documents glob support.
**Recommendation**: Document that only literal paths/directories are currently supported, or implement `**` prefix expansion via `readdirSync` recursion (no library needed).

### [REVIEW][CODE] CLAUDECODE guard in `build.ts` placed after plan parsing
**File**: `server/src/cli/build.ts:110-134`
**Issue**: Plans are parsed (file I/O, XML extraction) before the guard fires. Fail-fast principle: the guard should be the first operation.
**Recommendation**: Move guard before `parsePlanFiles()`.

### [REVIEW][SEC] `resolveScope` follows symlinks — directory traversal + infinite recursion on cycles
**File**: `server/src/cli/improve.ts:50-52`
**Issue**: `statSync` follows symlinks. A symlink pointing outside the project causes out-of-scope files to be improved; a circular symlink causes a stack overflow crash.
**Recommendation**: Use `lstatSync` and skip symlinks, or maintain a `Set<string>` of visited real paths via `realpathSync` to detect cycles.

### [REVIEW][SEC] `taskType` not whitelisted — any plan value grants Bash access
**File**: `server/src/cli/spawn.ts:7-10`
**Issue**: `getAllowedTools()` falls through to full `Read,Edit,Write,Bash,Grep,Glob` for any unknown `type` value. A plan file can set `type="anything"` and get Bash.
**Recommendation**: Change to explicit whitelist: unknown types → most restrictive tool set, with a logged warning.

### [REVIEW][PERF] `spawnSync` for verify blocks the event loop for up to 60 seconds
**File**: `server/src/cli/build.ts:222-226`
**Issue**: `spawnSync` freezes the event loop — TUI timer stops, SIGINT is unresponsive, stdout stalls. With 3 retries × 60s = 3 minutes of blockage for one hanging test.
**Recommendation**: Replace with async `spawn` wrapped in a Promise with `AbortController` timeout.

### [REVIEW][PERF] Circular symlinks crash `walk()` via stack overflow
**File**: `server/src/cli/improve.ts:50-52`
**Issue**: Same as security finding above — also a process crash risk.
**Recommendation**: Use `lstatSync` (fixes both security and performance aspects).

### [AUTO][CODE] `formatSummary` test asserts `toContain('BLOCKER')` but means `toContain('BLOCKED')`
**File**: `server/src/cli/build.test.ts:53`
**Issue**: The assertion passes because `BLOCKER.md` contains `BLOCKER`, masking the intended check for the status word `BLOCKED`.
**Recommendation**: Assert `toContain('BLOCKED')` + separate assertion for the file path.

### [AUTO][CODE] EventEmitter listeners not removed after each task
**File**: `server/src/cli/build.ts:206`, `improve.ts:183`
**Issue**: `attachDisplay` registers 4 persistent listeners per task. None are removed after `spawnClaude` resolves. At 30+ iterations MaxListenersExceededWarning may fire.
**Recommendation**: Call `emitter.removeAllListeners()` immediately after `spawnClaude()` resolves.

### [AUTO][CODE] TUI `removeAllListeners('resize')` and `removeAllListeners('data')` are too broad
**File**: `server/src/cli/tui.ts:395-399`
**Issue**: Removes all listeners on `process.stdout` and `process.stdin`, not just the ones this TUI registered. Breaks test harnesses and any other code using those events.
**Recommendation**: Capture handlers as named function references; use `process.stdout.off('resize', handler)` in `destroy()`.

### [NOTE] Test gaps: CLAUDECODE guard and env deletion untested
**Files**: `build.test.ts`, `improve.test.ts`, `spawn.test.ts`
**Issue**: The CLAUDECODE guard in `runBuild`, guard in `runImproveCommand`, and CLAUDECODE key deletion in `spawnClaude` have zero test coverage.
**Recommendation**: Add tests using `vi.mock('node:child_process')` to inspect env passed to spawn; add guard tests with `process.env['CLAUDECODE'] = '1'`.

---

## Constraints Check

| Constraint | Status |
|------------|--------|
| No gray-matter | ✓ Pass |
| No commander/yargs | ✓ Pass |
| No glob library | ✓ Pass |
| No `--resume` flag | ✓ Pass |
| ESM only — no require() | ✓ Pass |
| CLAUDECODE deleted from child env | ✓ Pass |
| Non-fatal improve | ✓ Pass (index.ts) |
| Improve ran reflected in summary | ✗ Fail (improveRan never true) |
| Glob pattern support | ✗ Undocumented gap |

## Test Coverage

60 tests across 6 test files. Tests are meaningful and use proper fixtures (`makeTask`, `tmpDir` patterns). Key gaps: CLAUDECODE guard paths, CLAUDECODE env deletion verification, improve ran status, glob pattern behavior documentation.

## Verdict

**CHANGES REQUIRED.** The 4 HALT findings (3 security, 1 correctness) must be resolved before PR creation. The `sh -c` verify injection is the most directly exploitable — any plan file can escape it without prompt manipulation. The CLAUDECODE ordering bug leaves the user's terminal permanently broken when running inside Claude Code. The prompt injection finding requires a design decision about trust boundaries for plan file content.

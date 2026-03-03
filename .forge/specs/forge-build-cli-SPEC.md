# Spec: Forge Build CLI Loop
**Status**: APPROVED
**Date**: 2026-03-02T20:15:00Z
**Derived from**: .forge/discuss/forge-build-cli-discuss.md
**Slug**: forge-build-cli

## Overview

`forge build` and `forge improve` are terminal commands that run autonomous Claude Code loops outside of an interactive Claude session. `forge build` reads the current project's approved plan, executes each task as a fresh headless Claude subprocess, auto-runs a code quality pass on completion, and drops back to the terminal with a summary. This keeps the user's interactive Claude session context completely clean while the build runs.

## Requirements

### REQ-001: `forge build` terminal command is invokable
**Description**: The `forge` dispatcher at `~/.local/bin/forge` routes `forge build` to the CLI. Running `forge build` in any project with an approved forge plan starts the build loop.
**Acceptance Criteria**:
- [ ] `forge build` in a project with a valid plan starts the loop without error
- [ ] `forge build` in a project with no `.forge/plans/` directory exits with a clear error message and code 1
- [ ] `forge build` in a project with a plan that has no `autonomous: true` tasks exits with a message indicating there is nothing to run

### REQ-002: Headless Claude invocation per task
**Description**: Each `<task>` block in the plan is executed as a separate, fresh Claude subprocess with minimal injected context and scoped tool permissions.
**Acceptance Criteria**:
- [ ] Each task spawns `claude` with `-p`, `--output-format stream-json`, and `--dangerously-skip-permissions`
- [ ] The `CLAUDECODE` environment variable is deleted from the child process environment before spawn
- [ ] Only the specific `<task>` block (plus its `<context>`) is injected — not the full plan file or spec
- [ ] `--allowedTools` is set per task based on task type (e.g., `Read,Edit,Bash,Glob,Grep` for `auto` tasks)
- [ ] Each task invocation is fully independent — no `--resume` or shared session state

### REQ-003: Alternate-screen TUI with live header
**Description**: During the build, the terminal shows a fixed header with build status and a scrolling log region below. The TUI exits cleanly when the build ends.
**Acceptance Criteria**:
- [ ] Terminal enters alternate screen mode on build start and exits it on completion or failure
- [ ] Header displays: project name, current task ID and title, overall progress (N/Total), current attempt (● ○ ○), elapsed time
- [ ] Header displays phase badge for the current task phase: RED (tests), GREEN (implement), REFACTOR (improve), CHECKPOINT
- [ ] Scrolling log region below the header shows real-time tool call output
- [ ] On exit, the alternate screen is cleared and a plain-text summary is printed to stdout

### REQ-004: Three-strike retry with BLOCKER.md
**Description**: Each task gets three attempts before the build halts. On three consecutive failures, a blocker file is written and the build exits with a non-zero code.
**Acceptance Criteria**:
- [ ] A failing task is retried up to 3 times before the build stops
- [ ] Task success is determined by checking that the task's `<done>` condition is met (not just that Claude exited cleanly)
- [ ] On three failures, `.forge/state/BLOCKER.md` is written with: task ID, failure reason from each attempt, last stdout/stderr excerpt
- [ ] `forge build` exits with code 1 when blocked
- [ ] The terminal summary after TUI exit clearly states which task blocked and where to find the blocker report

### REQ-005: Real-time stream-json tool call rendering
**Description**: Tool uses from the Claude subprocess render live in the scrolling log region with color-coded labels.
**Acceptance Criteria**:
- [ ] `[Read]`, `[Edit]`, `[Write]`, `[Bash]`, `[Glob]`, `[Grep]` labels appear in distinct colors as tools are called
- [ ] Tool output is displayed truncated to 8 lines with `... (N more lines)` if longer
- [ ] Claude's reasoning text (non-tool output) is rendered in a distinct dim/italic style
- [ ] Log region scrolls automatically as new content arrives

### REQ-006: Auto-improve pass after successful build
**Description**: When all tasks complete successfully, an improve pass runs automatically on the files touched by the build before dropping back to the terminal.
**Acceptance Criteria**:
- [ ] The improve pass scope is exactly the union of `files_modified` across all completed plan tasks
- [ ] The improve prompt instructs Claude to refactor at an aggressive quality bar: optimal naming, structure, patterns, clarity — as the best engineer on the team would write it
- [ ] The improve pass never changes behavior — only structure, naming, and clarity
- [ ] The improve pass iterates until the delta between iterations falls below 0.05 or 10 iterations are reached
- [ ] The improve pass runs as a headless Claude subprocess with the same CLAUDECODE guard and token-minimization as build tasks
- [ ] If the improve pass fails, the build is still considered successful — improve failure is non-fatal and logged

### REQ-007: Standalone `forge improve [path]` command
**Description**: `forge improve` can be run independently on any file or glob pattern, using the same quality bar and loop behavior as the auto-pass.
**Acceptance Criteria**:
- [ ] `forge improve src/foo.ts` runs the improve loop on the specified file
- [ ] `forge improve src/routes/**` runs the improve loop on all matched files
- [ ] `forge improve` with no argument reads `files_modified` from the most recently completed plan and runs on those files
- [ ] `forge improve` with no argument and no completed plan exits with a clear error message
- [ ] Improve output shows which files were changed and a summary of what was improved

### REQ-008: Wave-ordered plan parsing
**Description**: The CLI correctly parses forge's XML plan format and executes tasks in wave order.
**Acceptance Criteria**:
- [ ] YAML frontmatter is parsed from each `.forge/plans/*-PLAN.md` file to determine wave assignment
- [ ] All Wave 1 tasks complete before any Wave 2 task begins
- [ ] Within a wave, tasks execute sequentially
- [ ] Tasks with `autonomous: false` are skipped with a logged notice

### REQ-009: Post-build terminal summary
**Description**: After the TUI exits, a plain-text summary is printed so the user can see what happened at a glance.
**Acceptance Criteria**:
- [ ] Summary includes: total tasks completed, total time elapsed, files modified count, whether improve ran
- [ ] Summary lists any blocked tasks with their task ID
- [ ] Summary prints "Next: run /forge:review" on success or "Next: resolve BLOCKER.md and re-run" on failure
- [ ] Exit code is 0 on full success, 1 on any blocked task

---

## Out of Scope
- **Parallel task execution within a wave**: Tasks run sequentially within each wave. Parallel execution is a future optimization.
- **`--resume` session continuity**: Conscious decision from discuss — fresh per task.
- **Interactive roadblock handling**: If the build blocks, it writes BLOCKER.md and exits. The user resolves it manually then re-runs. No mid-build prompting.
- **`forge status` terminal command**: Checking build progress from a second terminal is not in this spec.
- **Gate 2 automation**: PR creation after build remains a manual `/forge:review` step inside Claude Code.

## Decisions (from discuss phase)
- **Language**: Node.js + chalk in `server/` as a second entry point — real TUI possible, install stays one command
- **Session continuity**: Fresh Claude per task — plans are self-contained, token cost stays predictable
- **Context injection**: Minimum viable — `<task>` block only, `--allowedTools` scoped per task type
- **Improve loop**: Auto-chains after build on `files_modified`; aggressive quality bar; also available standalone

## Known Limitations
- **Improve pass is non-fatal**: If the improve subprocess errors, the build result is still reported as successful. This is intentional — improve failure should not invalidate a working build.
- **Sequential within-wave execution**: Parallelism deferred. Multi-task waves take longer than necessary.

## Dependencies
- `claude` CLI must be available in PATH with support for `-p`, `--output-format stream-json`, and `--dangerously-skip-permissions`
- Approved forge plan must exist at `.forge/plans/` with at least one `autonomous: true` task
- `server/` TypeScript build must compile cleanly (`pnpm build` in `server/`)
- `chalk` added as a dependency to `server/package.json`

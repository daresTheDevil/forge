# Discussion: forge build CLI loop
**Date**: 2026-03-02T20:00:00Z
**Task**: Port golem-cc's headless build loop (TUI + three-strike retry + streaming) into forge as terminal `forge build` and `forge improve` commands
**Recon brief**: not available — research conducted via GitHub repo analysis (golem-cc, cc-forge, cc-forge.old)

## Codebase Findings

### Reusable Assets Found
- `golem-cc/lib/build.js` — three-strike retry loop, stream-json parsing, CLAUDECODE env guard, BLOCKER.md on failure
- `golem-cc/lib/tui.js` — alternate-screen TUI: 7-line fixed header, segmented progress bar, phase badges, attempt dots, scrolling log region
- `golem-cc/lib/display.js` — stream-json event renderer: colored tool labels, truncated output, real-time delta display
- `golem-cc/lib/spawn.js` — Claude subprocess spawner with `--dangerously-skip-permissions`, stream-json, CLAUDECODE stripping
- `cc-forge/loops/forge-loop.sh` — improve loop pattern: runs until delta < threshold or max iterations
- `server/` — existing Node.js/TypeScript build setup with pnpm, vitest, tsc

### Integration Points
- `~/.local/bin/forge` dispatcher — new `build` and `improve` subcommands plug in here
- `install.sh` — builds `server/` already; CLI entry points added to same build step
- Forge plan format: XML `<task>` blocks inside markdown files with YAML frontmatter at `.forge/plans/`
- Plan YAML frontmatter contains `files_modified:` — scope source for improve pass

### Potential Issues
- Forge plan format (XML in markdown) is completely different from golem-cc's `### TASK-001:` markdown headers — plan parser must be written from scratch
- `CLAUDECODE` env var must be deleted from child process environment to prevent "nested sessions" error (golem-cc solved this)
- `--dangerously-skip-permissions` required for headless autonomous execution

## Decisions Made

### Language and TUI
**Context**: The terminal UI is the primary user-facing surface during a 10-minute autonomous build. Quality matters — plain scrolling text is usable but worse.
**Options considered**:
  - Node.js with chalk — alternate-screen TUI, live-updating header, phase badges, segmented progress bar
  - Bash — simpler, no build step, but limited to plain printf output, no live refresh
**Decision**: Node.js with chalk, porting golem-cc's TUI directly
**Rationale**: The live-updating header was a core part of what made the old implementations good. Bash cannot replicate this cleanly.

### Package location
**Context**: Adding a second Node.js program to the repo. Options: new `cli/` package (clean separation) or second entry point in existing `server/` package.
**Options considered**:
  - New `cli/` package — clean, but requires second `pnpm build` step and complicates `install.sh`
  - Second entry point in `server/` — one build, install stays one command
**Decision**: Second entry point inside `server/` package
**Rationale**: Install simplicity is non-negotiable. One build step, nothing changes in `install.sh`.

### Session continuity
**Context**: Should the headless Claude invocations share a session (via `--resume`) or spawn fresh per task?
**Options considered**:
  - `--resume SESSION_ID` — Claude remembers earlier tasks; accumulated context debt risk
  - Fresh per task — no context carryover; each task gets only what it needs
**Decision**: Fresh Claude invocation per task. Only the specific `<task>` block is injected — not the whole plan, not the whole spec. `--allowedTools` scoped per task type to minimize token usage.
**Rationale**: Forge plan tasks are self-contained by design — each `<task>` includes full `<context>`. `--resume` is a workaround for under-specified plans. Fresh invocations keep token cost predictable.

### Improve loop — auto vs manual, and scope
**Context**: After a successful build, should a code quality pass run automatically? And how aggressively?
**Options considered**:
  - Auto-chain only — runs automatically after build on `files_modified`, no standalone command
  - Manual only — `forge improve` as separate command, user controls timing
  - Both — auto-chains after build on `files_modified`; also available standalone with arbitrary path/glob
**Decision**: Both. Auto-improve runs on `files_modified` after every successful build. `forge improve [path]` also exists as a standalone command.
**Quality bar**: Aggressive. The improve prompt instructs Claude to refactor as the best engineer would — optimal naming, structure, patterns, and clarity. Not "tidy it up" — "make it exemplary." Never changes behavior, but raises the bar on everything else. Runs iteratively until delta falls below threshold (not just once).
**Rationale**: Auto-scoped to `files_modified` keeps it fast and safe. Aggressive quality bar is the point — if it's going to run anyway, it should matter.

## Known Limitations Accepted
- Improve loop does not change behavior — purely structural/clarity improvements. Any behavior changes must go through a new build cycle.
- `--dangerously-skip-permissions` means the autonomous loop can make file changes without confirmation. This is intentional — gated by Gate 1 (human authorized the plan before build runs).

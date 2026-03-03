# Forge Handoff Workflow

Capture complete session state so the next session — or another developer —
can pick up exactly where this one left off without hunting through chat history.

This workflow is invoked by `/forge:handoff`.

## Step 1: Gather current state

Read the following:
- `.forge/state/current.md`
- `.forge/plans/MANIFEST.md` (if exists)
- All `.forge/plans/*-SUMMARY.md` files (completed plans)
- All `.forge/plans/*-BLOCKED.md` files (blocked plans)
- `git log --oneline -20` for recent activity
- `git diff --stat HEAD` for any uncommitted changes
- `git branch --list 'forge/*'` for active worktrees

If `gh` is available: `gh pr list --json number,title,state,headRefName --jq '.[]'`

## Step 2: Identify uncommitted changes

If `git status --short` shows uncommitted changes:
  Tell the user:
  ```
  You have uncommitted changes:
  [list of changed files]
  ```

  Use the AskUserQuestion tool with:
    - Yes, commit now: Guide the user to commit with an appropriate message before continuing
    - No, leave unstaged: Note the uncommitted changes in the handoff document as "uncommitted changes present"

  If the user selects "Other" and provides an explanation, read it carefully and determine
  whether it represents a conditional yes (e.g. "commit only these specific files"), a
  conditional no, or a request for more context. Adapt accordingly rather than defaulting.

## Step 3: Write the handoff document

Generate the timestamp for the filename: `YYYY-MM-DD-HHMM` (local time)

Write `.forge/state/sessions/[YYYY-MM-DD-HHMM]-handoff.md`:

```markdown
# Session Handoff — [YYYY-MM-DD HH:MM]

**Project**: [from state]
**Task**: [current task from state]
**Phase**: [current phase from state]
**Active CR**: [from state, or "none"]

## What Was Accomplished This Session

[List of things done — pull from SUMMARY.md files and git log]
- [Accomplishment 1]
- [Accomplishment 2]
[If nothing was done: "Session started but no implementation work completed."]

## Current State

[Describe exactly where things stand right now — enough context that a fresh Claude
instance can read this and understand the situation without chat history]

Phase: [phase]
Spec: [.forge/specs/[slug]-SPEC.md — DRAFT|APPROVED, or "none"]
Plans: [N plans total, N complete, N blocked, or "none"]
Worktree: [.claude/worktrees/[CR-ID] on branch forge/[CR-ID], or "none"]
Open PR: [link or "none"]

## Exact Next Action

Run this command to resume:
```
/forge:continue
```

Then: [specific thing to do — e.g., "run /forge:authorize to start the implementation" or
"review and approve the PR at [link]"]

## Decisions Made This Session

[Decisions made during discuss, spec, or planning phases]
- [Decision 1]: [what was decided and why]
- [Decision 2]: [what was decided and why]
[If none: "No new decisions made this session."]

## Open Questions

[Things that are unresolved and will need attention in the next session]
- [Question 1]
- [Question 2]
[If none: "No open questions."]

## Blockers

[If any BLOCKED.md files exist]
[If none: "No blockers."]

## Relevant Files

Files that are relevant context for picking up this work:
- `.forge/specs/[slug]-SPEC.md` — the approved spec
- `.forge/plans/MANIFEST.md` — the plan overview
- [any other critical files]
```

## Step 4: Update .forge/state/current.md

Update:
- **Last action**: session handoff written — [timestamp]
- **Next action**: run /forge:continue to resume
- **Last updated**: [ISO timestamp]

## Step 5: Commit the handoff

Stage and commit the handoff:
```
git add .forge/state/
git commit -m "chore: session handoff [YYYY-MM-DD HH:MM]"
```

## Step 6: Display summary

Tell the user:
```
Handoff complete.

Written: .forge/state/sessions/[YYYY-MM-DD-HHMM]-handoff.md
Committed: chore: session handoff [timestamp]

To resume next session: open Claude Code in this directory and run /forge:continue
The handoff document will provide full context automatically.
```

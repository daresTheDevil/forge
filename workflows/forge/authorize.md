# Forge Authorize Workflow — Gate 1

Authorize the implementation and begin autonomous build in an isolated git worktree.

This workflow is invoked by `/forge:authorize`.

## Step 1: Find and validate the plan

Read `.forge/state/current.md` for the current task slug.

Check `.forge/plans/MANIFEST.md` exists.

If it does not:
  Tell the user:
  ```
  No plan found. Run /forge:plan to create and validate the implementation plan first.
  ```
  Stop.

Read MANIFEST.md and all plan files listed in it.

## Step 2: Show the full authorization prompt — Gate 1

Read the spec from `.forge/specs/[task-slug]-SPEC.md` to get the list of requirements.
Compile the list of all files that will be modified from all plan `files_modified:` fields.
Compile the list of all REQ-NNN IDs covered.

Determine the next CR number: read `.forge/compliance/change-requests/` directory and find
the highest existing `CR-[YYYY]-[NNN]` number. Increment by 1. If none exist, start at 001.
The new CR ID is: `CR-[current year]-[NNN zero-padded to 3 digits]`

Display:
```
BUILD AUTHORIZATION REQUIRED — GATE 1
══════════════════════════════════════════════════

Change Request: [CR-ID]
Task: [current task description]
Requirements: [REQ-001, REQ-002, ...]

This authorization will:
  ✓ Write Change Request [CR-ID] to .forge/compliance/change-requests/[CR-ID].md
    (Authorization record required by NIGC 25 CFR 543.20(g))
  ✓ Create git worktree at .claude/worktrees/[CR-ID]/ on branch forge/[CR-ID]
  ✓ All autonomous changes happen in the worktree — your working directory is untouched
  ✓ Implement [N] plans across [N] waves (TDD: tests written before code)
  ✓ Make atomic commits with requirement IDs in every commit message
  ✓ Create a PR when implementation is complete

Files that will be modified:
[list each file from all plans, one per line with indentation]

Requirements being implemented:
[list each REQ-NNN with its title, one per line]

YOUR WORKING DIRECTORY WILL NOT BE TOUCHED.
All changes happen in the isolated worktree.
To discard the build: run /forge:worktree discard

══════════════════════════════════════════════════
Type 'authorize' to proceed or 'cancel' to abort:
```

## Step 3: Wait for explicit authorization

Wait for user input.

If the user types anything other than exactly 'authorize' (case-insensitive):
  Tell the user: "Build cancelled. No changes were made. Run /forge:authorize when ready."
  Stop.

If the user types 'authorize':
  Tell the user: "Authorized. Creating Change Request and worktree..."
  Proceed.

## Step 4: Write the Change Request document

Write `.forge/compliance/change-requests/[CR-ID].md`:

```markdown
# Change Request: [CR-ID]
**Date**: [ISO timestamp]
**Title**: [task description]
**Requirements**: [REQ-001, REQ-002, ...]
**Description**: [from spec Overview section]
**Requested by**: [user — get from git config user.name if available, else "user"]
**Authorized by**: [same as requested by]
**Authorized at**: [ISO timestamp]
**Implementation plan**: .forge/plans/MANIFEST.md
**Worktree branch**: forge/[CR-ID]
**Status**: AUTHORIZED
```

## Step 5: Update the audit trail

Append to `.forge/compliance/audit-trail.md`:
```
| [ISO timestamp] | build:authorized | [user] | [CR-ID] |
| [ISO timestamp] | worktree:created | forge | forge/[CR-ID] |
```

## Step 6: Create the git worktree

Create a new git worktree for the build:
```
git worktree add .claude/worktrees/[CR-ID] -b forge/[CR-ID]
```

Tell the user: "Worktree created at .claude/worktrees/[CR-ID]/ on branch forge/[CR-ID]"

## Step 7: Execute Wave 1

Read MANIFEST.md to get all Wave 1 plans.

Tell the user:
```
Starting Wave 1: [N] plans running in parallel...
[Plan 01: slug — N tasks]
[Plan 02: slug — N tasks]
```

Spawn one `forge-executor` agent per Wave 1 plan, in parallel.
Pass each agent: the plan file path. The agents are working in the worktree at
`.claude/worktrees/[CR-ID]/`.

Wait for all Wave 1 agents to complete.

For each completed plan, check for:
- `.forge/plans/[plan-id]-SUMMARY.md` → success
- `.forge/plans/[plan-id]-BLOCKED.md` → blocked

### If any Wave 1 plan is blocked:

Tell the user:
```
BLOCKER DETECTED in Wave 1 — [plan-id]

[Read and display the BLOCKED.md contents]

The build is paused. Options:
  a) Provide a solution — I'll relay it to the executor and retry
  b) Skip this plan and continue with remaining plans (not recommended)
  c) Abandon the build and discard the worktree

Choose [a/b/c]:
```

If a: collect user guidance, spawn executor again with the guidance, resume.
If b: mark plan as skipped, note it in CR document, continue to next wave.
If c: run `git worktree remove .claude/worktrees/[CR-ID] --force`, tell user, stop.

### If all Wave 1 plans complete successfully:

Tell the user: "Wave 1 complete. Starting Wave 2..."

## Step 8: Execute Wave 2 (and further waves, if any)

For each subsequent wave, repeat Step 7 logic — but check that Wave N-1 completed
successfully before starting Wave N. Handle blockers the same way.

## Step 9: Build complete — summarize and tell user next step

After all waves complete:

Update `.forge/compliance/change-requests/[CR-ID].md`:
- Change `**Status**:` to `COMPLETE`

Append to `.forge/compliance/audit-trail.md`:
```
| [ISO timestamp] | build:complete | forge | [CR-ID] |
```

Update `.forge/state/current.md`:
- **Current phase**: build-complete
- **Active change request**: [CR-ID]
- **Last action**: build complete — all waves passed
- **Next action**: run /forge:review to review output and create PR
- **Last updated**: [ISO timestamp]

Count total commits: run `git log --oneline forge/[CR-ID] ^main` in the worktree.
Count total tests added: parse SUMMARY.md files for "Tests added:" lines.

Tell the user:
```
Build complete.
  Change Request: [CR-ID]
  Plans implemented: [N]/[N]
  Commits made: [N] (branch forge/[CR-ID])
  Tests added: [N]
  Worktree: .claude/worktrees/[CR-ID]/

Next: run /forge:review to review the output and create the PR.
      This is Gate 2 — your review is required before merge.
```

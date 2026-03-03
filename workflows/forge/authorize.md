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

## Step 7: Hand off to terminal build loop

Update `.forge/state/current.md`:
- **Current phase**: build-authorized
- **Active change request**: [CR-ID]
- **Last action**: build authorized — [CR-ID] created, worktree ready
- **Next action**: run `forge build` from a terminal to execute the build loop
- **Last updated**: [ISO timestamp]

Tell the user:
```
GATE 1 COMPLETE — AUTHORIZED
══════════════════════════════════════════════════
Change Request: [CR-ID]
Worktree: .claude/worktrees/[CR-ID]/ (branch forge/[CR-ID])

Authorization recorded. No code has changed yet.

NOW: open a terminal outside Claude Code and run:

  forge build

The build loop will execute each plan wave autonomously.
This Claude session stays clean while the build runs.

When forge build completes, return here and run /forge:review.
══════════════════════════════════════════════════
```

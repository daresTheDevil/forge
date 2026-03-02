# Forge Quick Workflow

Fast path for trivial tasks. No spec, no plan, no worktree.
Use this for changes that would be over-engineered by the full workflow:
typo fixes, config tweaks, small refactors, documentation updates, dependency bumps.

NOT for: new features, any change that affects multiple services, database migrations,
auth changes, or anything that needs a compliance audit trail beyond a single log entry.

This workflow is invoked by `/forge:quick [task description]`.

Input: `$ARGUMENTS` — the task description.

## Step 1: Validate input

If `$ARGUMENTS` is empty:
  ```
  Usage: /forge:quick [describe the change]

  Examples:
    /forge:quick fix the typo in the export button label
    /forge:quick bump the axios dependency to 1.6.8
    /forge:quick add a missing null check in the date formatter
    /forge:quick update the README with the new dev setup step
  ```
  Stop.

## Step 2: Announce

Tell the user:
```
Quick task: [task description]
Working directly in the current directory. No worktree. No spec.
```

## Step 3: Assess whether this is actually a quick task

Before implementing, evaluate the change:
- If it affects more than 3 files: warn the user and suggest using the full workflow
- If it changes behavior that affects other services: warn and suggest full workflow
- If it touches auth, payments, or data migrations: refuse and route to full workflow

If any of these apply, tell the user:
```
This task may be too large for /forge:quick:
[specific concern]

Consider using the full workflow:
  /forge:recon [task description]

Or confirm this is truly a quick change: "yes, proceed"
```

Wait for confirmation if concerns were raised.

## Step 4: Implement the change

Implement the change directly in the current working directory.

Follow the patterns in `.forge/map/conventions.md` if it exists.

If the project has tests relevant to the changed code, run them:
  Read `.forge/map/stack.md` to determine the test command.
  Run the test command for the affected module only — not the full suite.
  If tests fail: fix them or tell the user.

If the project has a linter, run it on modified files only.
If the project has a type checker (TypeScript), run `tsc --noEmit`.

## Step 5: Commit the change

Make a single commit with message:
```
fix: [task description] (quick)
```

Use the commit type that best fits: fix, chore, docs, style, refactor.
Always include `(quick)` at the end so it's identifiable in git log.

## Step 6: Update audit trail

Append to `.forge/compliance/audit-trail.md` (if it exists):
```
| [ISO timestamp] | quick-task | [user or "forge"] | [task description] |
```

If `.forge/compliance/audit-trail.md` does not exist, skip this step.
Do not create the file for a quick task — only full /forge:map creates the audit trail.

## Step 7: Show what was done

Tell the user:
```
Done.

Changed: [list of files modified]
Commit: [short sha] [commit message]
Tests: [passed / not applicable / N tests run]
```

# Forge Continue Workflow

Reconstruct full context from the last session and route to the appropriate next step.
This workflow is invoked by `/forge:continue`.

## Step 1: Check for active state

Check if `.forge/state.json` exists.

If it does not exist:
  Tell the user:
  ```
  No active forge session found in this project.
  Run /forge:map to initialize this project with forge.
  ```
  Stop.

Read `.forge/state.json` completely. Reference fields: `phase`, `task`, `cr_id`, `last_action`, `next_action`, `updated_at`.

## Step 2: Check for blockers

Look for any file matching `.forge/plans/*-BLOCKED.md`.

If any BLOCKED.md files exist:
  Read each one and display:
  ```
  BLOCKER DETECTED

  [For each blocked plan:]
  Plan: [plan-id]
  Task: [task number]
  Blocker: [summary from BLOCKED.md]

  This blocker must be addressed before work can continue.
  Read .forge/plans/[plan-id]-BLOCKED.md for full details.
  ```
  Flag these in the situation report (Step 5).

## Step 3: Check open worktrees and PRs

Run: `git branch --list 'forge/*'` to find active worktree branches.
For each forge branch found: check if its worktree exists at `.claude/worktrees/[branch-name]/`.

If `gh` is available (check with `which gh`):
  Run: `gh pr list --json number,title,state,headRefName --jq '.[]'`
  Collect any open PRs from forge/* branches.

## Step 4: Get recent git activity

Run: `git log --oneline -10`

## Step 5: Build and display the situation report

Display the full situation report:

```
═══════════════════════════════════════════════════════════
FORGE STATUS — [from state.json task field, or directory name]
═══════════════════════════════════════════════════════════

Current Task   : [task from state.json]
Current Phase  : [phase from state.json]
Last Action    : [last_action from state.json]
Last Updated   : [updated_at from state.json]
Active CR      : [cr_id from state.json, or "none"]

Recent Activity:
  [git log output — 10 commits, one per line]

Active Worktrees:
  [list of forge/* branches with worktree paths, or "none"]

Open PRs:
  [list with PR number, title, branch — or "none"]

Blockers:
  [list with plan-id and summary — or "none"]

═══════════════════════════════════════════════════════════
```

## Step 6: Route to next step

Read the `next_action` field from `.forge/state.json`.
Read the `phase` field from `.forge/state.json`.

Provide specific routing guidance based on the phase:

### Phase: none / initialized
```
This project has been initialized but no task has been started.
Next: run /forge:recon [describe what you want to build] to start a new feature.
```

### Phase: recon
```
Context was gathered for: [current task]
Next: run /forge:discuss to start the structured conversation.
```

### Phase: discuss
```
The discuss phase was in progress for: [current task]
Next: run /forge:discuss to continue or finish the conversation, then run /forge:spec.
```

### Phase: spec
```
[If spec Status is DRAFT:]
  A draft spec exists but hasn't been approved yet.
  Next: run /forge:spec to review and approve it.

[If spec Status is APPROVED:]
  Spec is approved.
  Next: run /forge:plan to create the implementation graph.
```

### Phase: plan
```
The implementation plan is ready.
Next: run /forge:authorize to authorize and begin implementation.
```

### Phase: build / build-in-progress
```
Build is in progress. Active CR: [CR-ID]
Worktree: .claude/worktrees/[CR-ID]/

[If blockers exist:]
  There are blockers — address them before the build can continue.

[If no blockers:]
  The build is running or paused. Check the worktree for current state.
  Next: if all waves are complete, run /forge:review.
```

### Phase: build-complete
```
Build is complete. Active CR: [CR-ID]
Next: run /forge:review to review the output and create the PR (Gate 2).
```

### Phase: review
```
Review is in progress. PR may be open.
[If open PRs exist:]
  Open PR: [PR link]
  Next: review and approve the PR, then run /forge:release.
[If no open PRs:]
  Next: run /forge:review to create the PR.
```

### Phase: released
```
The last task was completed and released.
The project map was updated.
Next: run /forge:recon [new task] to start the next task.
```

### Any other phase
```
Last action: [from state]
Suggested next action: [from state]
```

## Step 7: Offer help

After routing, ask:
```
Need to do something else?
  /forge:status  — just the status, no routing
  /forge:map     — refresh the project map
  /forge:quick   — fast path for a quick task

Or describe what you want to do and I'll help you pick the right command.
```

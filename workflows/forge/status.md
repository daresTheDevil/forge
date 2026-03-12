# Forge Status Workflow

Show the current project state at a glance. Fast. No routing. No subagents.

This workflow is invoked by `/forge:status`.

## Read the following files

1. `.forge/state.json` — current task, phase, cr_id, last_action, next_action
2. `.forge/plans/MANIFEST.md` — plan summary (if exists)
3. Check for any `.forge/plans/*-BLOCKED.md` files
4. Run: `git branch --list 'forge/*'` for active worktrees
5. Run: `git log --oneline -5` for recent commits
6. If `gh` available: `gh pr list --json number,title,state,headRefName --jq '.[]'`

## Display

If `.forge/state.json` does not exist:
  ```
  No forge state found. Run /forge:map to initialize this project.
  ```
  Stop.

Read `.forge/state.json` and reference fields: `phase`, `task`, `cr_id`, `last_action`, `next_action`, `updated_at`.

After reading state.json, check if `.claude/worktrees/` exists with subdirectories. If so, for each
worktree subdirectory, read its `.forge/state.json` for build progress (specifically `build.completed_plans`
and `build.blocked_plan`). Show aggregated status across all worktrees.

Otherwise display:

```
FORGE STATUS — [project name]
Last updated: [updated_at from state.json]

Task    : [task from state.json, or "none"]
Phase   : [phase from state.json, or "none"]
CR      : [cr_id from state.json, or "none"]

Last action : [last_action from state.json]
Next action : [next_action from state.json]

Blockers : [none | list with plan-id]

[If worktrees found:]
Worktrees:
  [worktree name]: [completed_plans count] plans complete[, BLOCKED: [blocked_plan] if set]

Open PRs:
  [PR number]: [title] — [branch] | "none"

Recent commits:
  [5 git log lines]
```

Keep the output compact. No explanation. No routing. Just the facts.
If the user wants context and routing, they should use `/forge:continue`.

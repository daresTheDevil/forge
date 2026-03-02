# Forge Status Workflow

Show the current project state at a glance. Fast. No routing. No subagents.

This workflow is invoked by `/forge:status`.

## Read the following files

1. `.forge/state/current.md` — current task, phase, last action, next action
2. `.forge/plans/MANIFEST.md` — plan summary (if exists)
3. Check for any `.forge/plans/*-BLOCKED.md` files
4. Run: `git branch --list 'forge/*'` for active worktrees
5. Run: `git log --oneline -5` for recent commits
6. If `gh` available: `gh pr list --json number,title,state,headRefName --jq '.[]'`

## Display

If `.forge/state/current.md` does not exist:
  ```
  No forge state found. Run /forge:map to initialize this project.
  ```
  Stop.

Otherwise display:

```
FORGE STATUS — [project name]
Last updated: [from state]

Task    : [current task, or "none"]
Phase   : [current phase, or "none"]
CR      : [active change request, or "none"]

Last action : [last action from state]
Next action : [next action from state]

Blockers : [none | list with plan-id]

Open PRs:
  [PR number]: [title] — [branch] | "none"

Recent commits:
  [5 git log lines]
```

Keep the output compact. No explanation. No routing. Just the facts.
If the user wants context and routing, they should use `/forge:continue`.

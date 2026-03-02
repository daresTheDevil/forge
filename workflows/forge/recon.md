# Forge Recon Workflow

Gather all relevant codebase context before starting work on a task.
This workflow is invoked by `/forge:recon [task description]`.

Input: `$ARGUMENTS` — the task description provided by the user.

## Step 1: Validate input

If `$ARGUMENTS` is empty or not provided:
  Tell the user:
  ```
  Usage: /forge:recon [describe what you want to build or fix]

  Examples:
    /forge:recon add a CSV export for the user management report
    /forge:recon fix the authentication bug when token expires mid-session
    /forge:recon refactor the payment service to use the new Stripe API
  ```
  Stop.

## Step 2: Load project context

Check for `.forge/map/map.md`.

If it does not exist:
  Tell the user:
  ```
  Project map not found. Run /forge:map first to initialize this project.
  Recon needs the project map to know where to look.
  ```
  Stop.

Read `.forge/map/map.md` and `.forge/map/conventions.md` in full.
Read `.forge/map/stack.md` to understand the test runner and package manager.

## Step 3: Tell the user what's happening

Tell the user:
```
Gathering context for: [task description]

Spawning forge-researcher to search the codebase...
This typically takes 30-60 seconds depending on codebase size.
```

## Step 4: Spawn forge-researcher agent

Spawn the `forge-researcher` agent with:
- `$ARGUMENTS` (the task description) as the input
- Pass the contents of map.md and conventions.md as additional context

Wait for the agent to complete and return its context brief.

## Step 5: Display the context brief

Display the full context brief returned by the researcher, formatted clearly.

If the researcher returned an error (e.g., "Project map not found"), surface it
to the user and stop.

## Step 6: Save the context brief

Write the context brief to `.forge/discuss/[task-slug]-recon.md` where `[task-slug]`
is the task description converted to kebab-case (max 40 characters).

Example: "add CSV export for user management report" → `add-csv-export-for-user-management-recon.md`

## Step 7: Update .forge/state/current.md

Update these fields in `.forge/state/current.md`:
- **Current task**: [task description from $ARGUMENTS]
- **Current phase**: recon
- **Last action**: recon completed — [N] relevant files found
- **Next action**: run /forge:discuss to start the structured conversation
- **Last updated**: [ISO timestamp of now]

## Step 8: Tell the user what to do next

Tell the user:
```
Context loaded. [N] relevant files found.

Next: run /forge:discuss to start the structured conversation.
The discuss phase will use this context to surface specific decisions you need to make.
```

## Step 9: Update audit trail

Append to `.forge/compliance/audit-trail.md`:
```
| [ISO timestamp] | recon:completed | forge | [task-slug] |
```

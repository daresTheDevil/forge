# Forge Plan Workflow

Decompose an approved spec into a wave-based implementation graph.
Runs planner + plan-checker in a validation loop (up to 3 rounds).

This workflow is invoked by `/forge:plan`.

## Step 1: Find the approved spec

Read `.forge/state/current.md` for the current task slug.

Look for `.forge/specs/[task-slug]-SPEC.md`.

Read the spec file and check its `**Status**:` field.

If Status is `DRAFT`:
  Tell the user:
  ```
  The spec has not been approved yet. Run /forge:spec to review and approve it first.
  ```
  Stop.

If no spec file is found at all:
  Tell the user:
  ```
  No spec found. Run /forge:spec to create and approve a spec first.
  ```
  Stop.

Tell the user:
```
Planning implementation for: [spec title]
Requirements to implement: [REQ-001, REQ-002, ...]

Spawning forge-planner...
```

## Step 2: Seed the format example file

Before spawning the planner, write this exact content to `.forge/plans/_EXAMPLE-PLAN.md`.
Do not modify it. The planner will read this file and copy its structure.

```
---
phase: 1
plan: 01
slug: user-csv-export
type: feature
wave: 1
depends_on: []
files_modified:
  - src/routes/users/export.ts
  - src/services/csv.service.ts
  - tests/routes/users/export.test.ts
autonomous: true
requirements:
  - REQ-001
  - REQ-002
must_haves:
  - "GET /api/users/export returns a valid CSV file"
  - "Endpoint requires authentication"
---

<context>
Implement the CSV export endpoint for the user management report.
When complete: GET /api/users/export returns a valid CSV file containing all users,
requires a valid JWT, and passes all tests in tests/routes/users/export.test.ts.
</context>

<tasks>
  <task type="auto">
    <files>tests/routes/users/export.test.ts</files>
    <action>
      Create tests/routes/users/export.test.ts. Write tests that verify:
      1. Returns 401 if no auth token present
      2. Returns 200 with Content-Type: text/csv if authenticated
      3. CSV body contains header row: id,name,email,created_at

      Run the tests after writing — they must FAIL (the route does not exist yet).
    </action>
    <verify>pnpm test tests/routes/users/export.test.ts 2>&1 | grep -E "FAIL|Error|✗"</verify>
    <done>All 3 tests exist and fail with route-not-found, not syntax errors</done>
  </task>

  <task type="auto">
    <files>src/routes/users/export.ts, src/routes/users/index.ts</files>
    <action>
      Create src/routes/users/export.ts implementing GET /api/users/export.
      Apply requireAuth middleware from src/middleware/auth.ts.
      Call getAllUsers() from src/services/users.service.ts.
      Convert to CSV with header: id,name,email,created_at.
      Set Content-Type: text/csv and Content-Disposition: attachment headers.
      Register the route in src/routes/users/index.ts.
    </action>
    <verify>pnpm test tests/routes/users/export.test.ts</verify>
    <done>All 3 tests pass with exit code 0</done>
  </task>
</tasks>
```

## Step 3: Spawn forge-planner

Spawn the `forge-planner` agent with the spec file path as its argument.

Wait for the planner to complete. It will write plan files to `.forge/plans/`.

After completion, read `.forge/plans/MANIFEST.md` to confirm plans were created.
If no manifest exists, the planner failed — tell the user the error and stop.

## Step 4: Normalize plan file names

After the planner finishes, rename any plan files that don't match the required pattern.
The build loop only loads files ending in `-PLAN.md`. Run this shell command:

```bash
cd .forge/plans && for f in *.md; do
  [[ "$f" == *"-PLAN.md" ]] && continue
  [[ "$f" == "MANIFEST.md" ]] && continue
  [[ "$f" == "_EXAMPLE-PLAN.md" ]] && continue
  wave=$(grep "^wave:" "$f" | awk '{print $2}')
  plan=$(grep "^plan:" "$f" | awk '{print $2}')
  slug=$(grep "^slug:" "$f" | awk '{print $2}')
  mv "$f" "${wave}-${plan}-${slug}-PLAN.md"
done
```

## Step 5: Spawn forge-plan-checker

Tell the user: "Plans created. Running plan-checker for validation..."

Spawn the `forge-plan-checker` agent with: the paths to all plan files + the spec file path.
Do not include `_EXAMPLE-PLAN.md` in the list passed to the checker.

Wait for the checker to complete and return its validation report.

Read the overall result: PASS or FAIL.

## Step 6: Handle validation result

Track the round number (start at 1).

### If PASS:

Tell the user: "Plan check passed. Displaying plan summary..."
Proceed to Step 5.

### If FAIL and round < 3:

Tell the user:
```
Plan check round [N] — FAIL. Issues found:
[List the numbered issues from the checker report]

Sending feedback to planner for revision...
```

Spawn `forge-planner` again with: the spec file path + the full checker report as additional context.
Wait for revised plans.
Increment round number.
Spawn `forge-plan-checker` again on the revised plans.
Loop back to Step 4.

### If FAIL and round = 3:

Tell the user:
```
The plan failed validation after 3 rounds. Outstanding issues:
[List the numbered issues from the final checker report]

Options:
  a) Provide guidance on how to fix these issues — I'll send it to the planner
  b) Force proceed anyway (the build may produce unexpected results)
  c) Return to /forge:spec and revise the scope

Choose [a/b/c]:
```

If user chooses a:
  Collect their guidance.
  Run one more planner round with the guidance + checker feedback.
  Run checker one more time.
  If still FAIL: show remaining issues. Offer b or c only.

If user chooses b:
  Tell the user: "Proceeding with unvalidated plan. Review carefully before authorizing build."
  Proceed to Step 5.

If user chooses c:
  Tell the user: "OK. Run /forge:spec to revise the requirements."
  Update state: phase = spec, next action = run /forge:spec.
  Stop.

## Step 7: Display the plan summary

Read all plan files from `.forge/plans/` and MANIFEST.md.

Display:
```
Plan verified. Ready for build.

[N] plans across [N] waves:

Wave 1 (runs in parallel):
  Plan 01: [slug] — [type] — [N] tasks
           Files: [comma-separated list of files]
           Requirements: [REQ-IDs]
  Plan 02: [slug] — [type] — [N] tasks
           Files: [comma-separated list]
           Requirements: [REQ-IDs]

Wave 2 (after Wave 1 completes):
  Plan 03: [slug] — [type] — [N] tasks
           Depends on: Plan 01, Plan 02
           Files: [comma-separated list]
           Requirements: [REQ-IDs]

Total: [N] tasks
Requirements covered: [full list of all REQ-NNNs]
```

## Step 8: Clean up and update state

Delete `.forge/plans/_EXAMPLE-PLAN.md` now that planning is complete.

Update `.forge/state/current.md`:
- **Current phase**: plan
- **Last action**: plan validated — [N] plans, [N] waves
- **Next action**: run /forge:authorize to authorize and begin implementation
- **Last updated**: [ISO timestamp]

Append to `.forge/compliance/audit-trail.md`:
```
| [ISO timestamp] | plan:validated | forge | [task-slug]-PLAN |
```

Tell the user:
```
Next: run /forge:authorize to authorize the change and begin autonomous implementation.

When you run /forge:authorize, you will be asked to explicitly authorize the build.
At that point, a Change Request document will be created and a git worktree will
be opened. No code will change before you authorize.
```

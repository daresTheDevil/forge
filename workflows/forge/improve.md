# Forge Improve Workflow

Post-build refactoring pass. Never changes functionality.
This workflow is invoked by `/forge:improve [target]`.

## Mandate

The improve workflow refactors code quality without changing behavior.
It is the gap between "it works" and "it's maintainable."

**Invariants — never violate these:**
- No function signature changes
- No API contract changes (endpoints, request/response shape, event names)
- No test assertion changes
- Every test that was passing before must pass after

## Step 1: Parse arguments

`$ARGUMENTS` contains the target: a file path or directory path to refactor.

If `$ARGUMENTS` is empty:
```
Usage: /forge:improve <file-or-directory>

Examples:
  /forge:improve server/src/tools/compliance.ts
  /forge:improve src/components/

No target specified. Provide a file or directory path to refactor.
```
Stop.

## Step 2: Verify target exists

Check that the target path exists in the project.

If it does not:
```
Target not found: [target]
Check the path and try again.
```
Stop.

If the target is a directory, list the source files in it so the user
knows the scope.

Show:
```
IMPROVE — Refactoring pass
══════════════════════════════════════════════════
Target: [target]
[If file: "1 file"]
[If directory: "N files: [list]"]
══════════════════════════════════════════════════
```

## Step 3: Load project context

Read:
- `.forge/map/conventions.md` — naming and style conventions
- `.forge/map/stack.md` — test runner and lint commands

Extract from stack.md:
- `test_command` — how to run tests (e.g. `pnpm test`, `pytest`, `go test ./...`)
- `lint_command` — linter command if configured (e.g. `pnpm lint`, `biome check .`)
- `typecheck_command` — type checker if applicable (e.g. `pnpm --silent build`, `tsc --noEmit`)

If `.forge/map/stack.md` does not exist, ask the user:
```
Could not find .forge/map/stack.md.
What command runs your tests? (e.g. pnpm test, pytest, go test ./...)
```
Wait for user input. Use the provided command as `test_command`.

## Step 4: Run baseline verification

Run `test_command` scoped to the target path if the test runner supports it.
Capture the output: number of tests passed and failed.

If tests fail before improvement starts:
```
⚠ Baseline tests are failing.

Fix the failing tests before running /forge:improve.
Improving code with pre-existing failures would create false positives.

[paste test output]
```
Stop.

Show the user:
```
Baseline: [N] tests — [N] passed, 0 failed. Ready.
Starting refactoring pass on [target]...
```

## Step 5: Spawn forge-improver agent

Spawn a `forge-improver` subagent. Pass as context:
- Target path
- Project root (current working directory)
- `test_command`
- `lint_command` (may be empty string if not configured)
- `typecheck_command` (may be empty string if not configured)
- Contents of `.forge/map/conventions.md`

The agent:
1. Reads the target file(s) in full before touching anything
2. Identifies and prioritizes improvement opportunities by risk (lowest first)
3. Makes changes in small batches, running tests after each batch
4. Commits atomically with message format `refactor(improve): [what was done]`
5. Skips any change that causes a test failure
6. Writes `.forge/plans/IMPROVE-[target-slug].md` summary

Wait for the agent to complete.

## Step 6: Run final verification

Run `test_command` again.

Compare to the baseline:
- Any test that was passing before must still be passing.
- Newly failing tests = regression = a defect in the improvement pass.

If regression detected:
```
⚠ REGRESSION DETECTED

A test that was passing before the refactor is now failing.
The "no behavior changes" invariant was violated.

[paste test output]

Review refactor commits:
  git log --oneline -20
  git diff HEAD~[N]..HEAD

Revert the offending commit(s) before proceeding.
```
Stop.

If all tests pass:
```
Final verification: [N] tests — all passed. No regressions.
```

## Step 7: Display improvement summary

Read `.forge/plans/IMPROVE-[target-slug].md` and display it to the user.

## Step 8: Update audit trail

Append to `.forge/compliance/audit-trail.md`:
```
| [ISO timestamp] | improve:complete | forge | [target] |
```

Tell the user:
```
IMPROVE COMPLETE
══════════════════════════════════════════════════
Target:  [target]
Commits: [N] refactor commits
Tests:   [N] passing — no regressions
Summary: .forge/plans/IMPROVE-[target-slug].md
══════════════════════════════════════════════════
Ready for /forge:review.
```

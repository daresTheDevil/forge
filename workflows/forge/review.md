# Forge Review Workflow — Gate 2

Code review, test review, and PR creation after a successful build.

This workflow is invoked by `/forge:review`. It is GATE 2 — the mandatory human
review before merge. No code merges without the human reviewing and approving.

## Step 1: Load current state

Read `.forge/state.json`. Extract:
- `phase` — must be `build-complete` (if not, stop and tell user to run `/forge:authorize` first)
- `cr_id` — the CR-ID
- `build.last_build_at` — timestamp of the completed build

If `phase` is not `build-complete`:
```
No completed build found.

Run /forge:authorize to implement the plan first,
then /forge:review to review the output and create the PR.
```
Stop.

## Step 2: Gather build output for review

Using the worktree branch (`forge/[CR-ID]`), gather:

1. **Commit list**: Run `git log --oneline forge/[CR-ID] ^main` in the worktree
2. **Full diff**: Run `git diff main...forge/[CR-ID]` to get all changes vs main
3. **Test results**: Check if `.forge/plans/[cr-id]-SUMMARY.md` exists and read it

Show the user a summary header:
```
GATE 2 — REVIEW REQUIRED
══════════════════════════════════════════════════
Change Request: [CR-ID]
Branch: forge/[CR-ID]
Commits: [N]

Files changed:
[list each changed file with +additions/-deletions]

Running code review...
══════════════════════════════════════════════════
```

## Step 3: Spawn the forge-reviewer agent

Spawn a `forge-reviewer` subagent. Pass:
- Project root
- CR ID
- Worktree path: `.claude/worktrees/[CR-ID]/`
- Worktree branch: `forge/[CR-ID]`
- The full diff

The agent produces a review document at `.forge/plans/[CR-ID]-REVIEW.md`.

Wait for the agent to complete, then read `.forge/plans/[CR-ID]-REVIEW.md`.

## Step 4: Display review findings

Display the full review document content to the user.

Then display:
```
══════════════════════════════════════════════════
GATE 2 — YOUR REVIEW IS REQUIRED

Read the code review above and examine the diff.
The autonomous zone cannot approve its own work —
only you can authorize the merge.

To create the PR: type 'create-pr'
To request changes: type 'changes' and describe what to fix
To abandon the build: type 'abandon'
══════════════════════════════════════════════════
```

## Step 5: Wait for user decision

Wait for user input.

### If 'changes' (request changes):
Ask the user what needs to change. Update state:
- **Current phase**: review-changes-requested
- **Last action**: reviewer requested changes
- **Next action**: re-run /forge:authorize after fixing issues

Tell the user: "Changes noted. Return to the build phase and re-run /forge:authorize with the updated requirements."
Stop.

### If 'abandon':
Ask: "Are you sure you want to abandon CR-[ID] and discard the worktree? Type 'confirm' to proceed."
If confirmed:
- Run `git worktree remove .claude/worktrees/[CR-ID] --force`
- Update `.forge/compliance/change-requests/[CR-ID].md` status to `CANCELLED`
- Append to audit trail: `review:abandoned | [user] | [CR-ID]`
- Update state: Current phase → abandoned
Tell user: "Worktree discarded. Change Request [CR-ID] marked CANCELLED."
Stop.

### If 'create-pr':
Proceed to Step 6.

## Step 6: Record Gate 2 — reviewer identity and timestamp

Get the current git user: `git config user.name`
Get the current ISO timestamp.

Write the four-eyes record to `.forge/compliance/change-requests/[CR-ID]-REVIEW.md`:

```markdown
# Gate 2 Review Record: [CR-ID]
**Date**: [ISO timestamp]
**Change Request**: [CR-ID]
**Reviewed by**: [git user.name]
**Reviewed at**: [ISO timestamp]
**Decision**: APPROVED
**Review artifact**: .forge/plans/[CR-ID]-REVIEW.md

This record satisfies the four-eyes / segregation of duties requirement
(NIGC 25 CFR 543.20(g)) for [CR-ID].
```

Append to audit trail:
```json
[
  { "action": "review:approved", "actor": "[user]", "reference": "[CR-ID]" },
  { "action": "pr:creating", "actor": "forge", "reference": "[CR-ID]" }
]
```

## Step 7: Push the branch and create the PR

1. Push the worktree branch to origin:
   `git push origin forge/[CR-ID]`

2. Create a PR using `gh pr create`:
   ```
   gh pr create \
     --title "[CR-ID]: [title from change request doc]" \
     --body "$(cat <<EOF
   ## Change Request: [CR-ID]

   **Requirements implemented**: [REQ-001, REQ-002, ...]

   **Description**: [from change request doc]

   ## Review Summary

   [Paste key findings from forge-reviewer]

   ## Compliance
   - Gate 1 authorized: [authorized at timestamp]
   - Gate 2 reviewed by: [user] at [timestamp]
   - Change Request: .forge/compliance/change-requests/[CR-ID].md
   - Review record: .forge/compliance/change-requests/[CR-ID]-REVIEW.md
   - Audit trail: .forge/compliance/audit-trail.md
   EOF
   )" \
     --base main \
     --head forge/[CR-ID]
   ```

3. Capture the PR URL from the `gh pr create` output.

Append to audit trail:
```json
[{ "action": "pr:created", "actor": "forge", "reference": "[PR URL]" }]
```

## Step 8: Update state and tell user

Update `.forge/state.json`: set `phase` to `"pr-open"`, set `cr_id` to `"[CR-ID]"`, set `last_action` to `"PR created — [PR URL]"`, set `next_action` to `"Run /forge:secure then /forge:release to deploy — PR: [PR URL]"`, set `updated_at` to `"[ISO timestamp]"`.

Tell the user:
```
GATE 2 COMPLETE — PR CREATED
══════════════════════════════════════════════════
Pull Request: [PR URL]
Branch: forge/[CR-ID] → main
Reviewed by: [user] at [timestamp]
Gate 2 record: .forge/compliance/change-requests/[CR-ID]-REVIEW.md

Next steps:
  1. Run /forge:secure — security audit (required before release)
  2. Review the PR in GitHub if you want a second look
  3. Run /forge:release — Gate 3, deploy approval
══════════════════════════════════════════════════
```

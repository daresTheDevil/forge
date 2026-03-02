# Forge Release Workflow — Gate 3

Approve and execute a deployment. The final compliance gate before production.

This workflow is invoked by `/forge:release`. It is GATE 3 — the explicit human
deployment authorization. No deployment happens without the human typing 'deploy'.

## Step 1: Load state and validate readiness

Read `.forge/state/current.md`. Extract:
- `Current phase` — must be `pr-open` (otherwise tell user what to do next)
- `Active change request` — the CR-ID
- `Open PRs` — the PR URL

If phase is not `pr-open`:
  Show what phase we're in and what the user should do first.
  Stop.

Check the security audit:
- Look for `.forge/compliance/security-audits/` and find the most recent file
  that references this CR-ID (or any audit since the build completed)
- If no recent audit found: warn the user that `/forge:secure` hasn't been run

Check the PR status:
- Run `gh pr view [PR URL] --json state,mergedAt,mergeCommit` (or parse from state)
- If PR is not yet merged: proceed (release will merge it)
- If PR is already merged but release not yet run: proceed

## Step 2: Calculate SemVer bump

Read the commits on `forge/[CR-ID]` branch:
`git log --oneline main..forge/[CR-ID]`

Scan commit messages for:
- `BREAKING CHANGE` or `!:` → major bump
- `feat:` or `feat(`:  → minor bump (if no breaking)
- `fix:`, `chore:`, etc. → patch bump (if no feat/breaking)

Read current version from the project's `package.json` (or `.forge/config.json` `version` field if no package.json).

Calculate next version. If no version found, default to `0.1.0`.

## Step 3: Generate changelog

Using the commits since the last tag (or since main diverged from the branch):
```
git log --pretty=format:"%h %s" main..forge/[CR-ID]
```

Group by type:
```
## v[VERSION] — [date]

### Features
- [hash] [feat message]

### Bug Fixes
- [hash] [fix message]

### Other Changes
- [hash] [other message]
```

## Step 4: Show the Gate 3 authorization prompt

Read:
- The CR document: `.forge/compliance/change-requests/[CR-ID].md`
- The Gate 2 review record: `.forge/compliance/change-requests/[CR-ID]-REVIEW.md`
- The latest security audit findings summary

Display:
```
DEPLOYMENT AUTHORIZATION REQUIRED — GATE 3
══════════════════════════════════════════════════

Version: v[CURRENT] → v[NEXT] ([bump type])
Change Request: [CR-ID]
PR: [PR URL]
Environment: [from .forge/config.json, default: production]
Commit SHA: [sha of tip of forge/[CR-ID]]

Requirements implemented: [REQ-001, REQ-002, ...]

Security audit: [date of last audit] — [N CRITICAL, N HIGH, N MEDIUM]
[If CRITICAL > 0:] ⚠ CRITICAL FINDINGS — resolve before deploying

Gate 2 reviewed by: [user] at [timestamp]

Changelog:
[formatted changelog]

This will:
  ✓ Merge PR forge/[CR-ID] → main
  ✓ Tag release: v[VERSION]
  ✓ Write deployment log to .forge/compliance/deployment-logs/v[VERSION].md
  ✓ Update audit trail

YOUR EXPLICIT AUTHORIZATION IS REQUIRED.
Type 'deploy' to proceed or 'cancel' to abort:
══════════════════════════════════════════════════
```

If CRITICAL security findings exist, show them and block — do not accept 'deploy'
until the user explicitly types 'deploy-override' and acknowledges the risk.

## Step 5: Wait for authorization

Wait for user input.

If anything other than 'deploy' (or 'deploy-override' for CRITICAL override):
  Tell the user: "Deployment cancelled. No changes made."
  Stop.

If 'deploy':
  Tell the user: "Authorized. Merging and tagging..."
  Proceed.

## Step 6: Merge the PR

If PR is not yet merged:
  ```
  gh pr merge [PR URL] --merge --delete-branch
  ```

Get the resulting commit SHA:
  ```
  git rev-parse main
  ```

If merge fails: tell the user about the failure, stop. Do NOT continue to tag.

## Step 7: Tag the release

```
git tag -a v[VERSION] -m "Release v[VERSION] — [CR-ID]" [commit SHA]
git push origin v[VERSION]
```

If this fails: report the error. The merge has happened — record it in audit trail but don't write deployment log yet.

## Step 8: Write the deployment log

Get the Gate 2 reviewer and timestamp from `.forge/compliance/change-requests/[CR-ID]-REVIEW.md`.
Get the current git user: `git config user.name`

Call `mcp__forge-tools__compliance_write_deployment_log` with:
- `projectRoot`: current working directory
- `version`: the new version string
- `changeRequestId`: CR-ID
- `environment`: from config or 'production'
- `commitSha`: merged commit SHA (full)
- `prUrl`: PR URL
- `approvedBy`: current git user (Gate 3 authorizer)
- `approvedAt`: current ISO timestamp
- `reviewedBy`: from Gate 2 review record
- `reviewedAt`: from Gate 2 review record
- `changelog`: the formatted changelog from Step 3
- `verification`: 'PASSED' (update to 'FAILED' if post-deploy checks fail)

## Step 9: Update CR status and audit trail

Call `mcp__forge-tools__compliance_update_cr_status` with status `COMPLETE`.

Call `mcp__forge-tools__compliance_append_audit_trail` with:
```json
[
  { "action": "deploy:authorized", "actor": "[user]", "reference": "[CR-ID]" },
  { "action": "pr:merged", "actor": "forge", "reference": "[PR URL]" },
  { "action": "release:tagged", "actor": "forge", "reference": "v[VERSION]" },
  { "action": "release:complete", "actor": "forge", "reference": "v[VERSION]" }
]
```

## Step 10: Clean up worktree

Remove the worktree (branch was deleted by `--delete-branch` in Step 6):
```
git worktree remove .claude/worktrees/[CR-ID] 2>/dev/null || true
```

## Step 11: Update state and tell user

Update `.forge/state/current.md`:
- **Current phase**: released
- **Current plan**: none
- **Last action**: released v[VERSION] — [CR-ID]
- **Next action**: run /forge:map to update the project map
- **Blockers**: none
- **Open PRs**: none
- **Active change request**: none
- **Last updated**: [ISO timestamp]

Tell the user:
```
RELEASE COMPLETE — Gate 3 Satisfied
══════════════════════════════════════════════════
Version: v[VERSION]
Environment: [environment]
Commit: [short SHA]
PR: [PR URL] (merged)
Tag: v[VERSION] (pushed)

Deployment log: .forge/compliance/deployment-logs/v[VERSION].md
Audit trail: .forge/compliance/audit-trail.md

Change Request [CR-ID]: COMPLETE

Compliance artifacts:
  Gate 1: .forge/compliance/change-requests/[CR-ID].md
  Gate 2: .forge/compliance/change-requests/[CR-ID]-REVIEW.md
  Gate 3: .forge/compliance/deployment-logs/v[VERSION].md
  Trail:  .forge/compliance/audit-trail.md

Run /forge:map to update the project map.
══════════════════════════════════════════════════
```

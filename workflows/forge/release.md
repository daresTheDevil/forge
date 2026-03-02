# Forge Release — Coming in Phase 2

This command is planned for Phase 2 (Compliance Layer).

When implemented, `/forge:release` will:
- Show the calculated SemVer bump based on commit types (feat = minor, fix = patch, BREAKING = major)
- Show the generated changelog
- Show what environment will receive the deployment
- Require explicit user confirmation — this is GATE 3
- Merge the PR branch, tag the release, deploy to the configured environment
- Write a deployment log to `.forge/compliance/deployment-logs/v[VERSION].md`
- Update the project map to mark the feature as released
- Clean up the worktree branch

The deployment log records: version, timestamp, authorizing user identity, commit SHA,
environment, PR link, and verification result. This is the artifact the CNGC auditor
examines during an IT audit.

Current status: Not yet implemented.

Run `/forge:help` to see available commands.

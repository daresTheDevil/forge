import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, appendFileSync } from "fs";
import { join, dirname } from "path";
import { dualOutput } from "../lib/output.js";
import { makeError } from "../lib/errors.js";
import type {
  ComplianceNextCrId,
  ComplianceCrResult,
  ComplianceAuditTrailResult,
  ComplianceSecurityAuditResult,
  ComplianceDeploymentLogResult,
} from "../schemas/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function forgeDir(projectRoot: string): string {
  return join(projectRoot, ".forge");
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

function isoNow(): string {
  return new Date().toISOString();
}

function nextCrId(projectRoot: string): { crId: string; year: number; number: number } {
  const crDir = join(forgeDir(projectRoot), "compliance", "change-requests");
  ensureDir(crDir);

  const year = new Date().getFullYear();
  let maxNum = 0;

  if (existsSync(crDir)) {
    const files = readdirSync(crDir);
    for (const file of files) {
      const m = file.match(/^CR-(\d{4})-(\d{3})\.md$/);
      if (m && parseInt(m[1] ?? "0") === year) {
        const n = parseInt(m[2] ?? "0");
        if (n > maxNum) maxNum = n;
      }
    }
  }

  const num = maxNum + 1;
  const crId = `CR-${year}-${String(num).padStart(3, "0")}`;
  return { crId, year, number: num };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export function registerComplianceTools(server: McpServer): void {
  // -------------------------------------------------------------------------
  // compliance_next_cr_id
  // -------------------------------------------------------------------------
  server.tool(
    "compliance_next_cr_id",
    "Calculate the next available Change Request ID (CR-YYYY-NNN) for a project",
    {
      projectRoot: z.string().describe("Absolute path to the project root"),
    },
    async ({ projectRoot }): Promise<ReturnType<typeof dualOutput>> => {
      try {
        const { crId, year, number } = nextCrId(projectRoot);
        const data: ComplianceNextCrId = { crId, year, number };
        return dualOutput(data, (d) => `Next Change Request ID: ${d.crId}`);
      } catch (err) {
        return makeError(
          "command-failed",
          String(err),
          "Ensure the project root is a valid directory"
        );
      }
    }
  );

  // -------------------------------------------------------------------------
  // compliance_create_change_request
  // -------------------------------------------------------------------------
  server.tool(
    "compliance_create_change_request",
    "Write a NIGC 25 CFR 543.20(g)-compliant Change Request document to .forge/compliance/change-requests/",
    {
      projectRoot: z.string().describe("Absolute path to the project root"),
      crId: z.string().describe("Change Request ID (e.g. CR-2026-001)"),
      title: z.string().describe("Title of the change request"),
      requirements: z.array(z.string()).describe("List of requirement IDs (e.g. ['REQ-001', 'REQ-002'])"),
      description: z.string().describe("Description from the spec"),
      requestedBy: z.string().describe("User name of the requestor"),
      authorizedBy: z.string().describe("User name of the authorizer"),
      authorizedAt: z.string().describe("ISO timestamp of authorization"),
      planPath: z.string().describe("Relative path to the implementation plan manifest"),
      worktreeBranch: z.string().describe("Git branch used for the worktree build"),
    },
    async ({ projectRoot, crId, title, requirements, description, requestedBy, authorizedBy, authorizedAt, planPath, worktreeBranch }) => {
      try {
        const crDir = join(forgeDir(projectRoot), "compliance", "change-requests");
        ensureDir(crDir);

        const filePath = join(crDir, `${crId}.md`);
        const content = [
          `# Change Request: ${crId}`,
          `**Date**: ${isoNow()}`,
          `**Title**: ${title}`,
          `**Requirements**: ${requirements.join(", ")}`,
          `**Description**: ${description}`,
          `**Requested by**: ${requestedBy}`,
          `**Authorized by**: ${authorizedBy}`,
          `**Authorized at**: ${authorizedAt}`,
          `**Implementation plan**: ${planPath}`,
          `**Worktree branch**: ${worktreeBranch}`,
          `**Status**: AUTHORIZED`,
          "",
        ].join("\n");

        writeFileSync(filePath, content, "utf8");

        const data: ComplianceCrResult = {
          crId,
          path: filePath,
          status: "AUTHORIZED",
          written: true,
        };
        return dualOutput(data, (d) => `Change Request written: ${d.path}`);
      } catch (err) {
        return makeError("command-failed", String(err), "Ensure the project root exists and is writable");
      }
    }
  );

  // -------------------------------------------------------------------------
  // compliance_update_cr_status
  // -------------------------------------------------------------------------
  server.tool(
    "compliance_update_cr_status",
    "Update the status field of an existing Change Request document",
    {
      projectRoot: z.string().describe("Absolute path to the project root"),
      crId: z.string().describe("Change Request ID (e.g. CR-2026-001)"),
      status: z.enum(["AUTHORIZED", "COMPLETE", "CANCELLED"]).describe("New status"),
    },
    async ({ projectRoot, crId, status }) => {
      try {
        const filePath = join(forgeDir(projectRoot), "compliance", "change-requests", `${crId}.md`);
        if (!existsSync(filePath)) {
          return makeError("not-found", `Change Request not found: ${filePath}`, "Run compliance_create_change_request first");
        }

        const content = readFileSync(filePath, "utf8");
        const updated = content.replace(/^\*\*Status\*\*: .+$/m, `**Status**: ${status}`);
        writeFileSync(filePath, updated, "utf8");

        const data: ComplianceCrResult = { crId, path: filePath, status, written: true };
        return dualOutput(data, (d) => `${d.crId} status updated to ${d.status}`);
      } catch (err) {
        return makeError("command-failed", String(err), "Ensure the CR file exists");
      }
    }
  );

  // -------------------------------------------------------------------------
  // compliance_append_audit_trail
  // -------------------------------------------------------------------------
  server.tool(
    "compliance_append_audit_trail",
    "Append one or more entries to the append-only compliance audit trail",
    {
      projectRoot: z.string().describe("Absolute path to the project root"),
      entries: z.array(z.object({
        action: z.string().describe("Action identifier (e.g. 'build:authorized', 'pr:created')"),
        actor: z.string().describe("Who performed the action (user name or 'forge')"),
        reference: z.string().describe("CR ID, PR number, version, or other reference"),
      })).describe("Audit trail entries to append"),
    },
    async ({ projectRoot, entries }) => {
      try {
        const complianceDir = join(forgeDir(projectRoot), "compliance");
        ensureDir(complianceDir);

        const filePath = join(complianceDir, "audit-trail.md");

        // Initialize file with header if it doesn't exist
        if (!existsSync(filePath)) {
          const header = [
            "# Audit Trail",
            "",
            "This file is append-only. Do not edit existing entries.",
            "",
            "| Timestamp | Action | Actor | Reference |",
            "|---|---|---|---|",
            "",
          ].join("\n");
          writeFileSync(filePath, header, "utf8");
        }

        const timestamp = isoNow();
        const lines = entries.map(
          (e) => `| ${timestamp} | ${e.action} | ${e.actor} | ${e.reference} |`
        );
        appendFileSync(filePath, lines.join("\n") + "\n", "utf8");

        const data: ComplianceAuditTrailResult = {
          path: filePath,
          appended: entries.length,
          entries: entries.map((e) => ({ ...e, timestamp })),
        };
        return dualOutput(data, (d) => `Audit trail: ${d.appended} ${d.appended === 1 ? "entry" : "entries"} appended to ${d.path}`);
      } catch (err) {
        return makeError("command-failed", String(err), "Ensure the project root is writable");
      }
    }
  );

  // -------------------------------------------------------------------------
  // compliance_write_security_audit
  // -------------------------------------------------------------------------
  server.tool(
    "compliance_write_security_audit",
    "Write a security audit findings document to .forge/compliance/security-audits/",
    {
      projectRoot: z.string().describe("Absolute path to the project root"),
      crId: z.string().optional().describe("Associated Change Request ID (omit for standalone audits)"),
      findings: z.array(z.object({
        severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]),
        category: z.string().describe("e.g. 'Secrets', 'Injection', 'Dependency', 'Config'"),
        title: z.string(),
        description: z.string(),
        file: z.string().optional(),
        line: z.number().optional(),
        recommendation: z.string(),
      })).describe("Security findings (empty array = clean audit)"),
    },
    async ({ projectRoot, crId, findings }) => {
      try {
        const auditDir = join(forgeDir(projectRoot), "compliance", "security-audits");
        ensureDir(auditDir);

        const date = new Date().toISOString().split("T")[0];
        const filename = crId ? `${date}-${crId}.md` : `${date}.md`;
        const filePath = join(auditDir, filename);

        const bySeverity = (sev: string) => findings.filter((f) => f.severity === sev);
        const critical = bySeverity("CRITICAL");
        const high = bySeverity("HIGH");
        const medium = bySeverity("MEDIUM");
        const low = bySeverity("LOW");
        const info = bySeverity("INFO");

        const renderSection = (label: string, items: typeof findings): string => {
          if (items.length === 0) return "";
          const lines = [`## ${label} (${items.length})\n`];
          for (const f of items) {
            lines.push(`### ${f.title}`);
            lines.push(`**Category**: ${f.category}`);
            if (f.file) lines.push(`**File**: \`${f.file}${f.line ? `:${f.line}` : ""}\``);
            lines.push(`**Description**: ${f.description}`);
            lines.push(`**Recommendation**: ${f.recommendation}`);
            lines.push("");
          }
          return lines.join("\n");
        };

        const content = [
          `# Security Audit: ${date}`,
          `**Date**: ${isoNow()}`,
          `**Change Request**: ${crId ?? "standalone"}`,
          `**Project**: ${projectRoot}`,
          `**Summary**: ${critical.length} CRITICAL, ${high.length} HIGH, ${medium.length} MEDIUM, ${low.length} LOW, ${info.length} INFO`,
          "",
          renderSection("CRITICAL", critical),
          renderSection("HIGH", high),
          renderSection("MEDIUM", medium),
          renderSection("LOW", low),
          renderSection("INFO", info),
          findings.length === 0 ? "## No findings — clean audit\n" : "",
          "## Disposition",
          `Release blocked: ${critical.length > 0 ? "YES — resolve all CRITICAL findings before release" : "NO"}`,
          "",
        ].filter(Boolean).join("\n");

        writeFileSync(filePath, content, "utf8");

        const data: ComplianceSecurityAuditResult = {
          path: filePath,
          date: date ?? isoNow().split("T")[0] ?? "",
          criticalCount: critical.length,
          highCount: high.length,
          mediumCount: medium.length,
          lowCount: low.length,
          infoCount: info.length,
          releaseBlocked: critical.length > 0,
        };
        return dualOutput(data, (d) =>
          `Security audit written: ${d.path}\n${d.criticalCount} CRITICAL, ${d.highCount} HIGH, ${d.mediumCount} MEDIUM, ${d.lowCount} LOW, ${d.infoCount} INFO\nRelease blocked: ${d.releaseBlocked ? "YES" : "NO"}`
        );
      } catch (err) {
        return makeError("command-failed", String(err), "Ensure the project root is writable");
      }
    }
  );

  // -------------------------------------------------------------------------
  // compliance_write_deployment_log
  // -------------------------------------------------------------------------
  server.tool(
    "compliance_write_deployment_log",
    "Write a deployment log to .forge/compliance/deployment-logs/ — final record for Gate 3",
    {
      projectRoot: z.string().describe("Absolute path to the project root"),
      version: z.string().describe("SemVer version being deployed (e.g. '1.2.3')"),
      changeRequestId: z.string().describe("Associated CR ID (e.g. 'CR-2026-001')"),
      environment: z.string().describe("Target environment (e.g. 'production', 'staging')"),
      commitSha: z.string().describe("Full git commit SHA being deployed"),
      prUrl: z.string().describe("URL of the merged PR"),
      approvedBy: z.string().describe("User who approved the deployment (Gate 3)"),
      approvedAt: z.string().describe("ISO timestamp of Gate 3 approval"),
      reviewedBy: z.string().describe("User who reviewed the PR (Gate 2)"),
      reviewedAt: z.string().describe("ISO timestamp of Gate 2 review"),
      changelog: z.string().describe("Formatted changelog for this version"),
      verification: z.enum(["PASSED", "FAILED"]).default("PASSED").describe("Post-deploy verification result"),
    },
    async ({ projectRoot, version, changeRequestId, environment, commitSha, prUrl, approvedBy, approvedAt, reviewedBy, reviewedAt, changelog, verification }) => {
      try {
        const logDir = join(forgeDir(projectRoot), "compliance", "deployment-logs");
        ensureDir(logDir);

        const filePath = join(logDir, `v${version}.md`);

        const content = [
          `# Deployment Log: v${version}`,
          `**Date**: ${isoNow()}`,
          `**Version**: ${version}`,
          `**Change Request**: ${changeRequestId}`,
          `**Environment**: ${environment}`,
          `**Commit SHA**: ${commitSha}`,
          `**PR**: ${prUrl}`,
          `**Approved by**: ${approvedBy} at ${approvedAt}`,
          `**Reviewed by**: ${reviewedBy} at ${reviewedAt}`,
          `**Verification**: ${verification}`,
          "",
          "## Changelog",
          "",
          changelog,
          "",
        ].join("\n");

        writeFileSync(filePath, content, "utf8");

        const data: ComplianceDeploymentLogResult = {
          path: filePath,
          version,
          changeRequestId,
          environment,
          verification,
          written: true,
        };
        return dualOutput(data, (d) => `Deployment log written: ${d.path}\nv${d.version} → ${d.environment} [${d.verification}]`);
      } catch (err) {
        return makeError("command-failed", String(err), "Ensure the project root is writable");
      }
    }
  );
}

import { z } from "zod";

// ---------------------------------------------------------------------------
// Git Schemas
// ---------------------------------------------------------------------------

export const GitFileStatusSchema = z.object({
  path: z.string(),
  status: z.string(),
  staged: z.boolean(),
});

export const GitStatusSchema = z.object({
  branch: z.string(),
  upstream: z.string().optional(),
  ahead: z.number(),
  behind: z.number(),
  staged: z.array(GitFileStatusSchema.extend({ staged: z.literal(true) })),
  modified: z.array(GitFileStatusSchema.extend({ staged: z.literal(false) })),
  untracked: z.array(z.string()),
  clean: z.boolean(),
});

export const GitLogEntrySchema = z.object({
  hash: z.string(),
  shortHash: z.string(),
  author: z.string(),
  email: z.string(),
  date: z.string(),
  message: z.string(),
  filesChanged: z.number().optional(),
});

export const GitLogSchema = z.array(GitLogEntrySchema);

export const GitDiffFileSchema = z.object({
  path: z.string(),
  additions: z.number(),
  deletions: z.number(),
  patch: z.string(),
});

export const GitDiffSchema = z.object({
  files: z.array(GitDiffFileSchema),
  totalAdditions: z.number(),
  totalDeletions: z.number(),
});

export const GitCommitResultSchema = z.object({
  hash: z.string(),
  branch: z.string(),
  message: z.string(),
  filesChanged: z.number(),
});

export const GitPushResultSchema = z.object({
  remote: z.string(),
  branch: z.string(),
  success: z.boolean(),
  message: z.string(),
});

export const GitPullResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  filesChanged: z.number(),
  branch: z.string(),
});

export const GitBranchEntrySchema = z.object({
  name: z.string(),
  current: z.boolean(),
  remote: z.string().optional(),
  upstream: z.string().optional(),
  lastCommit: z.string().optional(),
});

export const GitBranchSchema = z.object({
  branches: z.array(GitBranchEntrySchema),
  current: z.string(),
});

export const GitShowSchema = z.object({
  hash: z.string(),
  shortHash: z.string(),
  author: z.string(),
  email: z.string(),
  date: z.string(),
  message: z.string(),
  diff: z.string(),
});

export const GitAddSchema = z.object({
  staged: z.array(z.string()),
  count: z.number(),
});

export const GitCheckoutSchema = z.object({
  branch: z.string(),
  created: z.boolean(),
  message: z.string(),
});

// ---------------------------------------------------------------------------
// Docker Schemas
// ---------------------------------------------------------------------------

export const DockerContainerSchema = z.object({
  id: z.string(),
  name: z.string(),
  image: z.string(),
  status: z.string(),
  state: z.string(),
  ports: z.array(z.string()),
  created: z.string(),
});

export const DockerPsSchema = z.object({
  containers: z.array(DockerContainerSchema),
  total: z.number(),
  running: z.number(),
});

export const DockerBuildSchema = z.object({
  imageId: z.string(),
  tag: z.string().optional(),
  size: z.string().optional(),
  durationMs: z.number(),
});

export const DockerRunSchema = z.object({
  containerId: z.string(),
  name: z.string(),
  image: z.string(),
  status: z.string(),
});

export const DockerLogLineSchema = z.object({
  timestamp: z.string().optional(),
  stream: z.enum(["stdout", "stderr"]),
  text: z.string(),
});

export const DockerLogsSchema = z.object({
  containerId: z.string(),
  lines: z.array(DockerLogLineSchema),
  truncated: z.boolean(),
});

export const DockerStopSchema = z.object({
  containerId: z.string(),
  name: z.string(),
  stopped: z.boolean(),
});

export const DockerImageSchema = z.object({
  id: z.string(),
  repository: z.string(),
  tag: z.string(),
  size: z.string(),
  created: z.string(),
});

export const DockerImagesSchema = z.array(DockerImageSchema);

export const DockerExecSchema = z.object({
  output: z.string(),
  exitCode: z.number(),
});

export const DockerComposeServiceSchema = z.object({
  name: z.string(),
  status: z.string(),
  image: z.string().optional(),
});

export const DockerComposeUpSchema = z.object({
  services: z.array(DockerComposeServiceSchema),
  action: z.literal("up"),
  success: z.boolean(),
});

export const DockerComposeDownServiceSchema = z.object({
  name: z.string(),
});

export const DockerComposeDownSchema = z.object({
  services: z.array(DockerComposeDownServiceSchema),
  action: z.literal("down"),
  success: z.boolean(),
});

// ---------------------------------------------------------------------------
// Kubernetes Schemas
// ---------------------------------------------------------------------------

export const K8sResourceSchema = z.object({
  kind: z.string(),
  name: z.string(),
  namespace: z.string().optional(),
  status: z.string().optional(),
  ready: z.string().optional(),
  age: z.string().optional(),
});

export const K8sGetSchema = z.object({
  kind: z.string(),
  namespace: z.string().optional(),
  items: z.array(K8sResourceSchema),
  total: z.number(),
});

export const K8sApplyActionSchema = z.object({
  kind: z.string(),
  name: z.string(),
  action: z.enum(["created", "configured", "unchanged"]),
});

export const K8sApplySchema = z.object({
  applied: z.array(K8sApplyActionSchema),
  total: z.number(),
});

export const K8sDescribeSchema = z.object({
  kind: z.string(),
  name: z.string(),
  namespace: z.string(),
  raw: z.string(),
});

export const K8sLogLineSchema = z.object({
  timestamp: z.string().optional(),
  text: z.string(),
});

export const K8sLogsSchema = z.object({
  pod: z.string(),
  container: z.string().optional(),
  namespace: z.string(),
  lines: z.array(K8sLogLineSchema),
  truncated: z.boolean(),
});

export const K8sExecSchema = z.object({
  output: z.string(),
  exitCode: z.number(),
});

export const K8sDeletedItemSchema = z.object({
  kind: z.string(),
  name: z.string(),
});

export const K8sDeleteSchema = z.object({
  deleted: z.array(K8sDeletedItemSchema),
  count: z.number(),
});

export const K8sRolloutSchema = z.object({
  name: z.string(),
  kind: z.string(),
  namespace: z.string(),
  ready: z.boolean(),
  message: z.string(),
});

export const K8sContextEntrySchema = z.object({
  name: z.string(),
  cluster: z.string(),
  user: z.string(),
  current: z.boolean(),
});

export const K8sContextSchema = z.object({
  current: z.string(),
  contexts: z.array(K8sContextEntrySchema),
});

export const K8sUseContextSchema = z.object({
  previous: z.string(),
  current: z.string(),
  success: z.boolean(),
});

// ---------------------------------------------------------------------------
// pnpm Schemas
// ---------------------------------------------------------------------------

export const PnpmInstallSchema = z.object({
  packagesInstalled: z.number(),
  packagesUpdated: z.number(),
  durationMs: z.number(),
  lockfileUpdated: z.boolean(),
});

export const PnpmAddedPackageSchema = z.object({
  name: z.string(),
  version: z.string(),
  type: z.enum(["dependency", "devDependency"]),
});

export const PnpmAddSchema = z.object({
  added: z.array(PnpmAddedPackageSchema),
});

export const PnpmRemoveSchema = z.object({
  removed: z.array(z.string()),
  count: z.number(),
});

export const PnpmRunSchema = z.object({
  script: z.string(),
  exitCode: z.number(),
  success: z.boolean(),
  output: z.string(),
  durationMs: z.number(),
});

export const PnpmPackageEntrySchema = z.object({
  name: z.string(),
  version: z.string(),
  type: z.enum(["dependency", "devDependency"]),
});

export const PnpmListSchema = z.object({
  packages: z.array(PnpmPackageEntrySchema),
  total: z.number(),
});

// ---------------------------------------------------------------------------
// Compliance Schemas
// ---------------------------------------------------------------------------

export const ComplianceNextCrIdSchema = z.object({
  crId: z.string(),
  year: z.number(),
  number: z.number(),
});

export const ComplianceCrResultSchema = z.object({
  crId: z.string(),
  path: z.string(),
  status: z.enum(["AUTHORIZED", "COMPLETE", "CANCELLED"]),
  written: z.boolean(),
});

export const ComplianceAuditEntrySchema = z.object({
  action: z.string(),
  actor: z.string(),
  reference: z.string(),
  timestamp: z.string(),
});

export const ComplianceAuditTrailResultSchema = z.object({
  path: z.string(),
  appended: z.number(),
  entries: z.array(ComplianceAuditEntrySchema),
});

export const ComplianceSecurityAuditResultSchema = z.object({
  path: z.string(),
  date: z.string(),
  criticalCount: z.number(),
  highCount: z.number(),
  mediumCount: z.number(),
  lowCount: z.number(),
  infoCount: z.number(),
  releaseBlocked: z.boolean(),
});

export const ComplianceDeploymentLogResultSchema = z.object({
  path: z.string(),
  version: z.string(),
  changeRequestId: z.string(),
  environment: z.string(),
  verification: z.enum(["PASSED", "FAILED"]),
  written: z.boolean(),
});

// ---------------------------------------------------------------------------
// Type exports
// ---------------------------------------------------------------------------

export type GitStatus = z.infer<typeof GitStatusSchema>;
export type GitLog = z.infer<typeof GitLogSchema>;
export type GitDiff = z.infer<typeof GitDiffSchema>;
export type GitCommitResult = z.infer<typeof GitCommitResultSchema>;
export type GitPushResult = z.infer<typeof GitPushResultSchema>;
export type GitPullResult = z.infer<typeof GitPullResultSchema>;
export type GitBranch = z.infer<typeof GitBranchSchema>;
export type GitShow = z.infer<typeof GitShowSchema>;
export type GitAdd = z.infer<typeof GitAddSchema>;
export type GitCheckout = z.infer<typeof GitCheckoutSchema>;

export type DockerPs = z.infer<typeof DockerPsSchema>;
export type DockerBuild = z.infer<typeof DockerBuildSchema>;
export type DockerRun = z.infer<typeof DockerRunSchema>;
export type DockerLogs = z.infer<typeof DockerLogsSchema>;
export type DockerStop = z.infer<typeof DockerStopSchema>;
export type DockerImages = z.infer<typeof DockerImagesSchema>;
export type DockerExec = z.infer<typeof DockerExecSchema>;
export type DockerComposeUp = z.infer<typeof DockerComposeUpSchema>;
export type DockerComposeDown = z.infer<typeof DockerComposeDownSchema>;

export type K8sGet = z.infer<typeof K8sGetSchema>;
export type K8sApply = z.infer<typeof K8sApplySchema>;
export type K8sDescribe = z.infer<typeof K8sDescribeSchema>;
export type K8sLogs = z.infer<typeof K8sLogsSchema>;
export type K8sExec = z.infer<typeof K8sExecSchema>;
export type K8sDelete = z.infer<typeof K8sDeleteSchema>;
export type K8sRollout = z.infer<typeof K8sRolloutSchema>;
export type K8sContext = z.infer<typeof K8sContextSchema>;
export type K8sUseContext = z.infer<typeof K8sUseContextSchema>;

export type PnpmInstall = z.infer<typeof PnpmInstallSchema>;
export type PnpmAdd = z.infer<typeof PnpmAddSchema>;
export type PnpmRemove = z.infer<typeof PnpmRemoveSchema>;
export type PnpmRun = z.infer<typeof PnpmRunSchema>;
export type PnpmList = z.infer<typeof PnpmListSchema>;

export type ComplianceNextCrId = z.infer<typeof ComplianceNextCrIdSchema>;
export type ComplianceCrResult = z.infer<typeof ComplianceCrResultSchema>;
export type ComplianceAuditEntry = z.infer<typeof ComplianceAuditEntrySchema>;
export type ComplianceAuditTrailResult = z.infer<typeof ComplianceAuditTrailResultSchema>;
export type ComplianceSecurityAuditResult = z.infer<typeof ComplianceSecurityAuditResultSchema>;
export type ComplianceDeploymentLogResult = z.infer<typeof ComplianceDeploymentLogResultSchema>;

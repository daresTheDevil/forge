import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export type ErrorCategory =
  | "command-not-found"
  | "permission-denied"
  | "timeout"
  | "invalid-input"
  | "not-found"
  | "command-failed";

export interface ForgeToolError {
  isError: true;
  category: ErrorCategory;
  message: string;
  command?: string;
  exitCode?: number;
  suggestion: string;
  [key: string]: unknown;
}

export function makeError(
  category: ErrorCategory,
  message: string,
  suggestion: string,
  extra: { command?: string; exitCode?: number } = {}
): CallToolResult {
  const structured: ForgeToolError = {
    isError: true,
    category,
    message,
    suggestion,
    ...extra,
  };
  return {
    isError: true,
    structuredContent: structured as Record<string, unknown>,
    content: [
      { type: "text", text: `[${category}] ${message}\nSuggestion: ${suggestion}` },
    ],
  };
}

export function handleRunError(
  e: unknown,
  command: string
): CallToolResult {
  if (e instanceof Error) {
    if (e.message.startsWith("command-not-found:")) {
      const cmd = e.message.split(":")[1] ?? command;
      return makeError(
        "command-not-found",
        `${cmd} not found in PATH`,
        `Install ${cmd} and ensure it is in your PATH`
      );
    }
    if (e.message === "timeout") {
      return makeError(
        "timeout",
        `${command} timed out`,
        "Try increasing the timeout or check if the process is hung"
      );
    }
    if (e.message.includes("EACCES")) {
      return makeError(
        "permission-denied",
        `Permission denied running ${command}`,
        "Check file permissions"
      );
    }
  }
  return makeError(
    "command-failed",
    String(e),
    "Check the command arguments and try again",
    { command }
  );
}

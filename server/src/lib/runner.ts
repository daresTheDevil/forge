import { spawn } from "node:child_process";
import which from "which";
import stripAnsi from "strip-ansi";

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface RunOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;

export async function run(
  command: string,
  args: string[],
  options: RunOptions = {}
): Promise<RunResult> {
  let bin: string;
  try {
    bin = await which(command);
  } catch {
    throw new Error(`command-not-found:${command}`);
  }

  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: options.cwd ?? process.cwd(),
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let totalBytes = 0;

    child.stdout.on("data", (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes <= MAX_OUTPUT_BYTES) stdoutChunks.push(chunk);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });

    let didTimeout = false;
    const timer = options.timeoutMs
      ? setTimeout(() => {
          didTimeout = true;
          child.kill("SIGTERM");
        }, options.timeoutMs)
      : null;

    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (didTimeout) {
        reject(new Error("timeout"));
        return;
      }
      resolve({
        stdout: stripAnsi(Buffer.concat(stdoutChunks).toString("utf8")),
        stderr: stripAnsi(Buffer.concat(stderrChunks).toString("utf8")),
        exitCode: code ?? 1,
      });
    });

    child.on("error", reject);
  });
}

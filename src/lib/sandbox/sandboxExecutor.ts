import { ToolExecutionType } from "@prisma/client";

export interface SandboxInput {
  code: string;
  runtime: ToolExecutionType;
  tenantContext: Record<string, string>;
  args: Record<string, unknown>;
  timeoutMs?: number;
}

export interface SandboxResult {
  success: boolean;
  output: unknown;
  stdout: string;
  stderr: string;
  durationMs: number;
  exitCode: number;
}

interface SandboxProcess {
  write: (payload: string) => Promise<void>;
  waitForExit: () => Promise<{ exitCode: number; stdout: string; stderr: string }>;
  kill: () => Promise<void>;
}

// Vercel Sandbox SDK dynamic import — avoids build errors when SDK is unavailable
async function loadSandboxSDK() {
  try {
    // Dynamic string prevents bundler from statically analyzing this import
    const sdkId = ["@", "vercel", "/", "sandbox"].join("");
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const sdk = await (new Function("id", "return import(id)")(sdkId));
    return sdk as { createSandbox?: (opts: unknown) => Promise<SandboxProcess> } | null;
  } catch {
    return null;
  }
}

const BLOCKED_PATTERNS_NODE = [
  "require('fs')",
  "require(\"fs\")",
  "require('child_process')",
  "require(\"child_process\")",
  "process.env",
  "__dirname",
  "__filename",
  "eval(",
  "Function(",
  "require('net')",
  "require(\"net\")",
];

const BLOCKED_PATTERNS_PYTHON = [
  "import os",
  "import sys",
  "import subprocess",
  "import socket",
  "eval(",
  "exec(",
  "open(",
  "__import__",
  "importlib",
];

function validateCodeSafety(
  code: string,
  runtime: ToolExecutionType
): { safe: boolean; violation?: string } {
  const patterns =
    runtime === "SANDBOX_NODE" ? BLOCKED_PATTERNS_NODE : BLOCKED_PATTERNS_PYTHON;

  for (const pattern of patterns) {
    if (code.includes(pattern)) {
      return { safe: false, violation: `Blocked pattern detected: ${pattern}` };
    }
  }
  return { safe: true };
}

function wrapNodeCode(code: string, args: Record<string, unknown>): string {
  return `
(async () => {
  const args = ${JSON.stringify(args)};
  const console = {
    log: (...a) => process.stdout.write(JSON.stringify({ type: 'log', data: a }) + '\\n'),
    error: (...a) => process.stderr.write(JSON.stringify({ type: 'error', data: a }) + '\\n'),
  };

  let __result;
  try {
    ${code}
    process.stdout.write(JSON.stringify({ type: 'result', data: __result ?? null }) + '\\n');
  } catch(e) {
    process.stderr.write(JSON.stringify({ type: 'error', data: e.message }) + '\\n');
    process.exit(1);
  }
})();
`;
}

function wrapPythonCode(code: string, args: Record<string, unknown>): string {
  return `
import json, sys

args = json.loads('''${JSON.stringify(args)}''')
__stdout_lines = []

class _SafePrint:
    def write(self, s):
        sys.stdout.write(json.dumps({"type": "log", "data": s}) + "\\n")
        sys.stdout.flush()
    def flush(self): pass

_result = None
try:
${code
  .split("\n")
  .map((l) => "    " + l)
  .join("\n")}
    sys.stdout.write(json.dumps({"type": "result", "data": _result}) + "\\n")
except Exception as e:
    sys.stderr.write(json.dumps({"type": "error", "data": str(e)}) + "\\n")
    sys.exit(1)
`;
}

// Fallback local execution for development environments without Vercel Sandbox
async function executeLocally(
  input: SandboxInput
): Promise<SandboxResult> {
  const start = Date.now();
  try {
    if (input.runtime === "SANDBOX_NODE") {
      const { vm } = await import("node:vm");
      const output: unknown[] = [];
      const ctx = vm.createContext({
        args: input.args,
        console: {
          log: (...a: unknown[]) => output.push(a),
          error: (...a: unknown[]) => output.push(a),
        },
        result: undefined,
      });
      vm.runInContext(input.code, ctx, {
        timeout: input.timeoutMs ?? 10000,
        filename: "sandbox.js",
      });
      return {
        success: true,
        output: (ctx as Record<string, unknown>).result ?? null,
        stdout: JSON.stringify(output),
        stderr: "",
        durationMs: Date.now() - start,
        exitCode: 0,
      };
    }
    throw new Error("Python sandbox requires Vercel Sandbox SDK");
  } catch (err) {
    return {
      success: false,
      output: null,
      stdout: "",
      stderr: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
      exitCode: 1,
    };
  }
}

export async function executeInSandbox(
  input: SandboxInput
): Promise<SandboxResult> {
  const start = Date.now();
  const timeout = input.timeoutMs ?? 10000;

  if (input.runtime !== "SANDBOX_NODE" && input.runtime !== "SANDBOX_PYTHON") {
    throw new Error(`Unsupported sandbox runtime: ${input.runtime}`);
  }

  const safetyCheck = validateCodeSafety(input.code, input.runtime);
  if (!safetyCheck.safe) {
    return {
      success: false,
      output: null,
      stdout: "",
      stderr: `Security violation: ${safetyCheck.violation}`,
      durationMs: Date.now() - start,
      exitCode: 126,
    };
  }

  const sdk = await loadSandboxSDK();

  // Use real Vercel Sandbox when SDK is available
  if (sdk?.createSandbox) {
    const isNode = input.runtime === "SANDBOX_NODE";
    const wrappedCode = isNode
      ? wrapNodeCode(input.code, input.args)
      : wrapPythonCode(input.code, input.args);

    const sandbox: SandboxProcess = await sdk.createSandbox({
      runtime: isNode ? "node" : "python",
      env: {
        ...Object.fromEntries(
          Object.entries(input.tenantContext).map(([k, v]) => [
            `TENANT_${k.toUpperCase()}`,
            v,
          ])
        ),
        NODE_ENV: "sandbox",
        DISABLE_NETWORK: "true",
      },
      networkAccess: { allowedHosts: [] },
    });

    const timeoutId = setTimeout(() => sandbox.kill(), timeout);

    try {
      await sandbox.write(wrappedCode);
      const { exitCode, stdout, stderr } = await sandbox.waitForExit();

      clearTimeout(timeoutId);

      let output: unknown = null;
      for (const line of stdout.split("\n")) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line) as { type: string; data: unknown };
          if (parsed.type === "result") output = parsed.data;
        } catch {
          // Non-JSON stdout line — ignore
        }
      }

      return {
        success: exitCode === 0,
        output,
        stdout,
        stderr,
        durationMs: Date.now() - start,
        exitCode,
      };
    } catch (err) {
      clearTimeout(timeoutId);
      return {
        success: false,
        output: null,
        stdout: "",
        stderr: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
        exitCode: 1,
      };
    }
  }

  // Fallback to local VM sandbox (development only)
  return executeLocally(input);
}

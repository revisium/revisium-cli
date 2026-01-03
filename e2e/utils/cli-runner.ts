import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface CliOptions {
  env?: Record<string, string>;
  timeout?: number;
  cwd?: string;
}

export async function runCli(
  args: string[],
  options: CliOptions = {},
): Promise<CliResult> {
  const { env = {}, timeout = 60000, cwd = process.cwd() } = options;

  const isInstrumented = process.env.E2E_INSTRUMENTED === '1';
  const mainPath = isInstrumented
    ? 'dist-instrumented/src/main.js'
    : 'dist/src/main.js';

  const nycOutputDir = path.join(cwd, '.nyc_output');
  if (isInstrumented && !fs.existsSync(nycOutputDir)) {
    fs.mkdirSync(nycOutputDir, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    const child = spawn('node', [mainPath, ...args], {
      cwd,
      env: {
        ...process.env,
        ...env,
        // Pass NYC output dir for coverage collection
        ...(isInstrumented ? { NYC_OUTPUT_DIR: nycOutputDir } : {}),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    const timeoutId = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`CLI timeout after ${timeout}ms`));
    }, timeout);

    child.on('close', (exitCode) => {
      clearTimeout(timeoutId);
      resolve({
        stdout,
        stderr,
        exitCode: exitCode ?? 1,
      });
    });

    child.on('error', (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });
  });
}

export function buildUrl(
  projectName: string,
  options: {
    orgId?: string;
    branch?: string;
    revision?: 'draft' | 'head';
    token?: string;
  } = {},
): string {
  const { orgId = 'admin', branch = 'master', revision, token } = options;

  let url = `revisium://localhost:8082/${orgId}/${projectName}/${branch}`;

  if (revision) {
    url += `:${revision}`;
  }

  if (token) {
    url += `?token=${token}`;
  }

  return url;
}

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
  /** Optional stdin payload written to the CLI process before EOF. */
  stdin?: string;
}

export async function runCli(
  args: string[],
  options: CliOptions = {},
): Promise<CliResult> {
  const { env = {}, timeout = 60000, cwd = process.cwd(), stdin } = options;

  const isInstrumented = process.env.E2E_INSTRUMENTED === '1';
  const projectRoot = process.cwd();
  const mainPath = path.join(
    projectRoot,
    isInstrumented ? 'dist-instrumented/src/main.js' : 'dist/src/main.js',
  );

  const nycOutputDir = path.join(projectRoot, '.nyc_output');
  if (isInstrumented && !fs.existsSync(nycOutputDir)) {
    fs.mkdirSync(nycOutputDir, { recursive: true });
  }

  const { command, commandArgs } = resolveCliInvocation(args, mainPath);

  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd,
      env: {
        ...process.env,
        ...env,
        // Pass NYC output dir for coverage collection
        ...(isInstrumented ? { NYC_OUTPUT_DIR: nycOutputDir } : {}),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (stdin !== undefined) {
      child.stdin?.write(stdin);
      child.stdin?.end();
    } else {
      child.stdin?.end();
    }

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

/**
 * Decide which binary the matrix uses to invoke the CLI.
 *
 * Precedence:
 *  1. `REVISIUM_CLI_PACKAGE=<name>@<version>` — exec via `npx -y --package=<pkg> revisium ...`.
 *     This is what the alpha-matrix script uses to run a published version
 *     (e.g. `revisium@2.5.0-alpha.0`) without polluting the dev environment.
 *  2. `REVISIUM_CLI_BIN=/abs/path/to/main.js` — exec via `node <bin>`. Useful
 *     when you've installed the CLI globally or built it elsewhere.
 *  3. Fall back to the locally-built `dist/src/main.js` (or instrumented copy).
 *
 * Note: instrumented coverage (`E2E_INSTRUMENTED=1`) only works against the
 * local dist. When `REVISIUM_CLI_PACKAGE` / `REVISIUM_CLI_BIN` is set, the
 * NYC output dir is still wired through so the published binary's own NYC
 * setup can pick it up if it's instrumented.
 */
function resolveCliInvocation(
  args: string[],
  defaultMainPath: string,
): { command: string; commandArgs: string[] } {
  const pkg = process.env.REVISIUM_CLI_PACKAGE;
  if (pkg && pkg.length > 0) {
    return {
      command: 'npx',
      commandArgs: ['-y', `--package=${pkg}`, 'revisium', ...args],
    };
  }
  const bin = process.env.REVISIUM_CLI_BIN;
  if (bin && bin.length > 0) {
    return { command: 'node', commandArgs: [bin, ...args] };
  }
  return { command: 'node', commandArgs: [defaultMainPath, ...args] };
}

export function buildUrl(
  projectName: string,
  options: {
    orgId?: string;
    branch?: string;
    revision?: 'draft' | 'head';
    token?: string;
    protocol?: 'http' | 'https';
  } = {},
): string {
  const {
    orgId = 'admin',
    branch = 'master',
    revision,
    token,
    protocol,
  } = options;

  const scheme = protocol ? `revisium+${protocol}` : 'revisium';
  let url = `${scheme}://localhost:8082/${orgId}/${projectName}/${branch}`;

  if (revision) {
    url += `:${revision}`;
  }

  if (token) {
    url += `?token=${token}`;
  }

  return url;
}

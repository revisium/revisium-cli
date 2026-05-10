import { ChildProcess, spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StandaloneApiClient } from './standalone-api';

export interface StartStandaloneOptions {
  /** Enable Revisium auth (default: false). */
  auth?: boolean;
  /**
   * Initial admin password. Required when auth=true; ignored otherwise.
   * Passed via `ADMIN_PASSWORD` env on first run.
   */
  adminPassword?: string;
  /**
   * Override the standalone version pulled by `npx`. Defaults to whatever the
   * pinned dev dependency resolves to via `npm exec @revisium/standalone`.
   */
  version?: string;
  /**
   * Optional environment overrides forwarded to the standalone process.
   */
  env?: Record<string, string>;
  /** Maximum time to wait for the startup banner (ms, default 180s). */
  readinessTimeoutMs?: number;
}

export interface StandaloneInstance {
  /** HTTP base URL, no trailing slash, e.g. `http://localhost:9230`. */
  baseUrl: string;
  /** Bound HTTP port. */
  port: number;
  /** Whether the instance was started with `--auth`. */
  auth: boolean;
  /** Pre-bound REST/GraphQL helper for seeding. */
  api: StandaloneApiClient;
  /**
   * Returns a `revisium://host:port` base URL (used by CLI tests as `--url`).
   * Adds `/org/project/branch[:revision]` segments when arguments are given.
   */
  url: (parts?: {
    organization?: string;
    project?: string;
    branch?: string;
    revision?: string;
  }) => string;
  /** Shut the process down and remove its data directory. */
  stop: () => Promise<void>;
}

/**
 * `@revisium/standalone` since 2.8.x picks the next free HTTP and PostgreSQL
 * ports automatically when neither is supplied — so we let it pick, parse the
 * announced URL from its startup banner, and verify with a single readiness
 * probe. This sidesteps the race where two parallel suites would otherwise
 * "claim" the same preferred port milliseconds apart.
 */
export async function startStandalone(
  options: StartStandaloneOptions = {},
): Promise<StandaloneInstance> {
  const {
    auth = false,
    adminPassword,
    version,
    env: extraEnv = {},
    readinessTimeoutMs = 180_000,
  } = options;

  if (auth && !adminPassword) {
    throw new TypeError(
      'startStandalone: adminPassword is required when auth=true',
    );
  }

  const dataDir = await mkdtemp(join(tmpdir(), 'revisium-standalone-'));

  const args = [
    '--yes',
    version ? `@revisium/standalone@${version}` : '@revisium/standalone',
    '--data',
    dataDir,
  ];
  if (auth) {
    args.push('--auth');
  }

  const child = spawn('npx', args, {
    env: {
      ...process.env,
      ...(adminPassword ? { ADMIN_PASSWORD: adminPassword } : {}),
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Attach the drain immediately so the child never blocks on a full
  // stdout/stderr pipe buffer while we wait on the URL banner or readiness
  // probe. The port-tagged log forwarding upgrades from "<pending>" to the
  // real port once the banner is parsed.
  let resolvedPort: number | null = null;
  attachLogPipes(child, () => resolvedPort);

  let port: number;
  try {
    port = await waitForBanner(child, readinessTimeoutMs);
    resolvedPort = port;
    await waitForReady(`http://localhost:${port}/health/readiness`, 30_000);
  } catch (error) {
    await stopProcess(child, dataDir);
    throw error;
  }

  const baseUrl = `http://localhost:${port}`;
  const api = new StandaloneApiClient(baseUrl);

  let stopped = false;
  return {
    baseUrl,
    port,
    auth,
    api,
    url: (parts) => buildRevisiumUrl(port, parts),
    stop: async () => {
      if (stopped) {
        return;
      }
      stopped = true;
      await stopProcess(child, dataDir);
    },
  };
}

/**
 * Build a `revisium://localhost:<port>[/org/project/branch[:rev]]` URL for the
 * matrix tests. Defaults match the standalone defaults (`admin` org).
 */
function buildRevisiumUrl(
  port: number,
  parts: {
    organization?: string;
    project?: string;
    branch?: string;
    revision?: string;
  } = {},
): string {
  const host = `localhost:${port}`;
  if (!parts.project) {
    return `revisium://${host}`;
  }
  const org = parts.organization ?? 'admin';
  const branch = parts.branch ?? 'master';
  const tail = parts.revision ? `:${parts.revision}` : '';
  return `revisium://${host}/${org}/${parts.project}/${branch}${tail}`;
}

/**
 * Watches the child's stdout until standalone prints its banner with
 * `URL:        http://localhost:NNNN`. Resolves with the parsed port.
 *
 * Both stdout and stderr are sampled because some npm versions route the
 * package's own logs through stderr.
 */
function waitForBanner(
  child: ChildProcess,
  timeoutMs: number,
): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    let buffer = '';
    let settled = false;
    const bannerRegex = /URL:\s+http:\/\/localhost:(\d+)/;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        const tail = buffer.slice(-2_000) || '<no output>';
        reject(
          new Error(
            `Standalone did not announce a URL within ${timeoutMs}ms. Tail: ${tail}`,
          ),
        );
      }
    }, timeoutMs);

    const onData = (chunk: Buffer): void => {
      if (settled) return;
      buffer += chunk.toString();
      const match = bannerRegex.exec(buffer);
      if (match) {
        settled = true;
        cleanup();
        resolve(Number(match[1]));
      }
    };

    const onExit = (code: number | null): void => {
      if (settled) return;
      settled = true;
      cleanup();
      const tail = buffer.slice(-2_000) || '<no output>';
      reject(
        new Error(
          `Standalone exited (code=${code ?? 'null'}) before announcing a URL. Tail: ${tail}`,
        ),
      );
    };

    function cleanup(): void {
      clearTimeout(timer);
      child.stdout?.off('data', onData);
      child.stderr?.off('data', onData);
      child.off('exit', onExit);
    }

    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.once('exit', onExit);
  });
}

async function waitForReady(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  let lastError: unknown;
  const perRequestTimeoutMs = 5_000;
  while (Date.now() - start < timeoutMs) {
    const controller = new AbortController();
    const abortTimer = setTimeout(
      () => controller.abort(),
      perRequestTimeoutMs,
    );
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (response.ok) {
        return;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(abortTimer);
    }
    await sleep(500);
  }
  throw new Error(
    `Standalone readiness check timed out at ${url}: ${formatError(lastError)}`,
  );
}

async function stopProcess(
  child: ChildProcess,
  dataDir: string,
): Promise<void> {
  if (!child.killed && child.exitCode === null) {
    child.kill('SIGTERM');
    try {
      await waitForExit(child, 5_000);
    } catch {
      child.kill('SIGKILL');
      // Wait for the kernel to actually reap the process before deleting its
      // data dir; otherwise embedded PostgreSQL may still be holding files.
      await waitForExit(child, 5_000).catch(() => undefined);
    }
  }
  await rm(dataDir, { recursive: true, force: true });
}

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('standalone exit timeout')),
      timeoutMs,
    );
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function attachLogPipes(
  child: ChildProcess,
  getPort: () => number | null,
): void {
  const tag = (): string => {
    const port = getPort();
    return port === null ? '[standalone:<pending>]' : `[standalone:${port}]`;
  };
  if (process.env.E2E_STANDALONE_LOGS === '1') {
    child.stdout?.on('data', (chunk: Buffer) => {
      process.stderr.write(`${tag()} ${chunk.toString()}`);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      process.stderr.write(`${tag()} ${chunk.toString()}`);
    });
  } else {
    // Drain so the process never blocks on a full pipe buffer. We attach a
    // no-op `data` listener instead of `.resume()` because additional
    // listeners (e.g. `waitForBanner`) attach later and we don't want to flip
    // the stream into flowing mode prematurely.
    child.stdout?.on('data', () => {});
    child.stderr?.on('data', () => {});
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (error === undefined || error === null) {
    return 'unknown error';
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return 'unknown error';
  }
}

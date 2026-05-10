import { ChildProcess, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
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
  /** Maximum time to wait for `/health/readiness` (ms, default 120s). */
  readinessTimeoutMs?: number;
}

export interface StandaloneInstance {
  /** HTTP base URL, no trailing slash, e.g. `http://localhost:9230`. */
  baseUrl: string;
  /** Bound HTTP port. */
  port: number;
  /** Embedded PostgreSQL port. */
  pgPort: number;
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

export async function startStandalone(
  options: StartStandaloneOptions = {},
): Promise<StandaloneInstance> {
  const {
    auth = false,
    adminPassword,
    version,
    env: extraEnv = {},
    readinessTimeoutMs = 120_000,
  } = options;

  if (auth && !adminPassword) {
    throw new TypeError(
      'startStandalone: adminPassword is required when auth=true',
    );
  }

  const dataDir = await mkdtemp(join(tmpdir(), 'revisium-standalone-'));
  const port = await pickFreePort(9222);
  const pgPort = await pickFreePort(5440);

  const args = [
    '--yes',
    version ? `@revisium/standalone@${version}` : '@revisium/standalone',
    '--port',
    String(port),
    '--pg-port',
    String(pgPort),
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

  attachLogPipes(child, port);

  const baseUrl = `http://localhost:${port}`;
  const api = new StandaloneApiClient(baseUrl);

  try {
    await waitForReady(`${baseUrl}/health/readiness`, readinessTimeoutMs);
  } catch (error) {
    await stopProcess(child, dataDir);
    throw error;
  }

  let stopped = false;
  return {
    baseUrl,
    port,
    pgPort,
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

function attachLogPipes(child: ChildProcess, port: number): void {
  if (process.env.E2E_STANDALONE_LOGS === '1') {
    const tag = `[standalone:${port}]`;
    child.stdout?.on('data', (chunk: Buffer) => {
      process.stderr.write(`${tag} ${chunk.toString()}`);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      process.stderr.write(`${tag} ${chunk.toString()}`);
    });
  } else {
    // Drain so the process never blocks on a full pipe buffer.
    child.stdout?.resume();
    child.stderr?.resume();
  }
}

async function pickFreePort(preferred: number): Promise<number> {
  // Best-effort: try preferred first, fall back to a random offset. Standalone
  // handles port collisions internally with `--port`, but reusing a port
  // across two parallel suites in the same Jest run causes flakes.
  const candidates = [preferred, ...randomOffsets(preferred, 16)];
  for (const candidate of candidates) {
    if (await isPortFree(candidate)) {
      return candidate;
    }
  }
  return preferred;
}

function randomOffsets(base: number, count: number): number[] {
  const offsets = new Set<number>();
  while (offsets.size < count) {
    offsets.add(base + (randomBytes(2).readUInt16LE() % 2_000));
  }
  return Array.from(offsets);
}

async function isPortFree(port: number): Promise<boolean> {
  const net = await import('node:net');
  return await new Promise<boolean>((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
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

import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/** Set every `REVISIUM_*` env var the CLI consults to empty so tests start
 *  from a clean slate, then layer in only what each case needs. */
export const CLEAR_REVISIUM_ENV: Record<string, string> = {
  REVISIUM_URL: '',
  REVISIUM_TOKEN: '',
  REVISIUM_API_KEY: '',
  REVISIUM_USERNAME: '',
  REVISIUM_PASSWORD: '',
  REVISIUM_HOST: '',
  REVISIUM_ORG: '',
  REVISIUM_PROJECT: '',
  REVISIUM_BRANCH: '',
  REVISIUM_REVISION: '',
  REVISIUM_SOURCE_URL: '',
  REVISIUM_SOURCE_TOKEN: '',
  REVISIUM_SOURCE_API_KEY: '',
  REVISIUM_SOURCE_USERNAME: '',
  REVISIUM_SOURCE_PASSWORD: '',
  REVISIUM_TARGET_URL: '',
  REVISIUM_TARGET_TOKEN: '',
  REVISIUM_TARGET_API_KEY: '',
  REVISIUM_TARGET_USERNAME: '',
  REVISIUM_TARGET_PASSWORD: '',
};

export interface WorkspaceInstanceConfig {
  baseUrl: string;
  authMode?: 'none' | 'stored';
}

export interface WorkspaceContextConfig {
  instance: string;
  organization?: string;
  project?: string;
  branch?: string;
  revision?: string;
  credential?: string;
}

export interface WorkspaceConfigShape {
  version?: number;
  currentContext?: string;
  instances?: Record<string, WorkspaceInstanceConfig>;
  contexts?: Record<string, WorkspaceContextConfig>;
}

/** Create a brand-new workspace tempdir and return its absolute path. */
export function createWorkspace(
  prefix: string = 'revisium-cli-matrix-',
): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Write `<workspace>/.revisium/revisium-cli.config.json`. */
export function writeWorkspaceConfig(
  workspace: string,
  config: WorkspaceConfigShape,
): string {
  const dir = path.join(workspace, '.revisium');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, 'revisium-cli.config.json');
  fs.writeFileSync(
    filePath,
    JSON.stringify({ version: 1, ...config }, null, 2),
    'utf-8',
  );
  return filePath;
}

/** Returns the absolute path to an arbitrary file in the workspace. */
export function workspaceFile(
  workspace: string,
  ...segments: string[]
): string {
  return path.join(workspace, ...segments);
}

/** Generates a unique credential-store namespace so saved API keys don't
 *  collide between parallel tests or with the developer's real keyring. */
export function uniqueCredentialStoreService(
  prefix: string = 'revisium-cli-e2e',
): string {
  return `${prefix}-${randomBytes(6).toString('hex')}`;
}

/** Best-effort cleanup. Tests should still run inside an `afterAll` that
 *  collects workspaces so a thrown assertion doesn't strand temp dirs. */
export function removeWorkspace(workspace: string): void {
  fs.rmSync(workspace, { recursive: true, force: true });
}

export function writeBootstrapConfigFile(
  workspace: string,
  data: unknown,
  filename: string = 'bootstrap.config.json',
): string {
  const filePath = workspaceFile(workspace, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  return filePath;
}

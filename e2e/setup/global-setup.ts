import * as fs from 'fs';
import * as path from 'path';
import { waitForHealthy } from '../utils/docker-helper';
import { api } from '../utils/api-client';
import { E2E_CONFIG } from '../utils/constants';

const ENV_FILE = path.join(process.cwd(), '.e2e-env.json');

export default async function globalSetup(): Promise<void> {
  console.log('\n========================================');
  console.log('E2E Global Setup');
  console.log('========================================\n');

  console.log('Waiting for Revisium to be ready...');
  await waitForHealthy(`${E2E_CONFIG.API_URL}/health/readiness`);

  console.log('\nLogging in as admin...');
  const token = await api.login();
  console.log('Login successful');

  const envData = {
    E2E_API_URL: E2E_CONFIG.API_URL,
    E2E_ADMIN_TOKEN: token,
  };

  fs.writeFileSync(ENV_FILE, JSON.stringify(envData, null, 2));
  console.log(`\nEnvironment saved to ${ENV_FILE}`);

  console.log('\n========================================');
  console.log('E2E Setup Complete');
  console.log('========================================\n');
}

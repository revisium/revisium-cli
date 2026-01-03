import * as fs from 'fs';
import * as path from 'path';
import { api } from '../utils/api-client';
import { cleanupAllTestProjects } from '../utils/test-project';

const ENV_FILE = path.join(process.cwd(), '.e2e-env.json');

interface E2EEnvData {
  E2E_API_URL: string;
  E2E_ADMIN_TOKEN: string;
}

// Load environment from global setup
beforeAll(() => {
  if (fs.existsSync(ENV_FILE)) {
    const envData: E2EEnvData = JSON.parse(fs.readFileSync(ENV_FILE, 'utf-8'));
    process.env.E2E_API_URL = envData.E2E_API_URL;
    process.env.E2E_ADMIN_TOKEN = envData.E2E_ADMIN_TOKEN;

    // Set token in API client
    api.setToken(envData.E2E_ADMIN_TOKEN);
  } else {
    throw new Error(
      'E2E environment file not found. Did global-setup run correctly?',
    );
  }
});

// Cleanup test projects after each test file
afterAll(async () => {
  await cleanupAllTestProjects();
});
